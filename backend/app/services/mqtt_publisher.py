"""
MQTT Northbound Publisher Service
==================================
Supports:
  • Anonymous, username/password, and mutual-TLS authentication
  • Modern TLS (TLS 1.2 / 1.3) with self-signed cert support
  • QoS 0 / 1 / 2 per publication
  • Retained messages per publication
  • Last Will and Testament (LWT) per broker
  • Exponential backoff reconnect (max 60 s)
  • Live per-broker connection status (accessible via API)
"""

import asyncio
import hashlib
import json
import logging
import os
import ssl
import tempfile
import time

import paho.mqtt.client as mqtt

from app.core.store import GlobalDataStore

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared status store — read by the /broker-status API endpoint
# ---------------------------------------------------------------------------
_broker_status: dict[str, dict] = {}  # broker_id -> {state, error, last_connected_at}

def get_broker_statuses() -> dict:
    return dict(_broker_status)


class MQTTPublisherService:
    """Manages MQTT broker connections and periodic tag publications."""

    # Backoff: 2, 4, 8, 16, 32, 60 seconds (capped at 60)
    _BACKOFF = [2, 4, 8, 16, 32, 60]

    def __init__(self):
        self.brokers: dict[str, mqtt.Client] = {}
        self.running = False
        self.last_publish: dict[str, float] = {}
        self.temp_cert_files: dict[str, list[str]] = {}
        self._broker_cfg_hash: dict[str, str] = {}
        self._retry_count: dict[str, int] = {}
        self._retry_after: dict[str, float] = {}  # epoch time when next retry is allowed

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    async def start(self):
        asyncio.create_task(self._run_publisher())

    # ------------------------------------------------------------------
    # Certificate helpers
    # ------------------------------------------------------------------

    def _load_certificates(self, cert_id: int, db) -> dict:
        from app.models import models
        cert = db.query(models.Certificate).filter(
            models.Certificate.id == cert_id
        ).first()
        if not cert:
            raise RuntimeError(f"Certificate id={cert_id} not found in database")
        return {
            "ca_cert":     cert.ca_cert,
            "client_cert": cert.client_cert,
            "client_key":  cert.client_key,
        }

    def _write_temp_cert(self, data: bytes | None, prefix: str = "cert") -> str | None:
        if not data:
            return None
        fd, path = tempfile.mkstemp(prefix=f"mqtt_{prefix}_", suffix=".pem")
        try:
            os.write(fd, data)
            os.close(fd)
            os.chmod(path, 0o400)
            return path
        except Exception:
            try:
                os.close(fd)
            except Exception:
                pass
            if os.path.exists(path):
                os.unlink(path)
            raise

    def _cleanup_temp_certs(self, broker_id: str):
        for path in self.temp_cert_files.pop(broker_id, []):
            try:
                if os.path.exists(path):
                    os.unlink(path)
            except Exception as exc:
                logger.warning("Could not delete temp cert %s: %s", path, exc)

    # ------------------------------------------------------------------
    # Status helpers
    # ------------------------------------------------------------------

    def _set_status(self, b_id: str, state: str, error: str = ""):
        _broker_status[b_id] = {
            "state": state,                     # connected | reconnecting | error | disconnected
            "error": error,
            "last_connected_at": _broker_status.get(b_id, {}).get("last_connected_at"),
        }
        if state == "connected":
            _broker_status[b_id]["last_connected_at"] = time.time()

    # ------------------------------------------------------------------
    # Broker config hash (detect changes → reconnect)
    # ------------------------------------------------------------------

    @staticmethod
    def _cfg_hash(cfg: dict) -> str:
        fields = ["host", "port", "username", "password",
                  "use_tls", "certificate_id", "tls_insecure", "client_id",
                  "lwt_topic", "lwt_payload", "lwt_qos", "lwt_retain"]
        return hashlib.md5(
            json.dumps({k: cfg.get(k) for k in fields}, sort_keys=True).encode()
        ).hexdigest()

    # ------------------------------------------------------------------
    # Broker lifecycle
    # ------------------------------------------------------------------

    def _disconnect_broker(self, b_id: str):
        client = self.brokers.pop(b_id, None)
        if client:
            try:
                client.loop_stop()
                client.disconnect()
            except Exception as exc:
                logger.warning("Error disconnecting broker %s: %s", b_id, exc)
        self._cleanup_temp_certs(b_id)
        self._broker_cfg_hash.pop(b_id, None)
        self._retry_count.pop(b_id, None)
        self._retry_after.pop(b_id, None)
        self._set_status(b_id, "disconnected")

    def _connect_broker(self, cfg: dict, db) -> mqtt.Client:
        """
        Build, configure and connect a paho Client.
        Raises on any failure — caller cleans up.
        """
        b_id      = cfg["id"]
        client_id = cfg.get("client_id") or f"vistaiot_{b_id}"
        use_tls   = cfg.get("use_tls", False)
        username  = cfg.get("username") or ""
        password  = cfg.get("password") or ""

        client = mqtt.Client(client_id=client_id, clean_session=True)

        # --- Paho callbacks for status tracking ---
        def on_connect(c, userdata, flags, rc):
            if rc == 0:
                logger.info("Broker %s connected (rc=0)", b_id)
                self._set_status(b_id, "connected")
                self._retry_count[b_id] = 0
            else:
                msg = mqtt.connack_string(rc)
                logger.error("Broker %s connect refused: %s (rc=%d)", b_id, msg, rc)
                self._set_status(b_id, "error", f"rc={rc}: {msg}")

        def on_disconnect(c, userdata, rc):
            if rc != 0:
                logger.warning("Broker %s unexpected disconnect (rc=%d)", b_id, rc)
                self._set_status(b_id, "reconnecting", f"rc={rc}")
            else:
                self._set_status(b_id, "disconnected")

        client.on_connect    = on_connect
        client.on_disconnect = on_disconnect

        # --- Auth ---
        if username:
            client.username_pw_set(username, password)

        # --- LWT ---
        lwt_topic = cfg.get("lwt_topic") or ""
        if lwt_topic:
            lwt_payload = cfg.get("lwt_payload") or json.dumps({"status": "offline"})
            lwt_qos     = int(cfg.get("lwt_qos", 1))
            lwt_retain  = bool(cfg.get("lwt_retain", True))
            client.will_set(lwt_topic, lwt_payload, qos=lwt_qos, retain=lwt_retain)
            logger.info("LWT set for broker %s → %s (qos=%d, retain=%s)",
                        b_id, lwt_topic, lwt_qos, lwt_retain)

        # --- TLS ---
        if use_tls:
            cert_id      = cfg.get("certificate_id")
            tls_insecure = cfg.get("tls_insecure", False)
            temp_files   = []

            try:
                ca_path = cert_path = key_path = None

                if cert_id:
                    certs     = self._load_certificates(cert_id, db)
                    ca_path   = self._write_temp_cert(certs["ca_cert"],    "ca")
                    cert_path = self._write_temp_cert(certs["client_cert"], "cert")
                    key_path  = self._write_temp_cert(certs["client_key"],  "key")
                    for p in (ca_path, cert_path, key_path):
                        if p:
                            temp_files.append(p)
                else:
                    logger.warning(
                        "Broker %s: TLS enabled but no certificate_id → "
                        "anonymous TLS (hostname verification disabled)", b_id)
                    tls_insecure = True  # must skip verification with no CA

                # Prefer modern protocol; fall back if old Python/OpenSSL
                tls_ver = getattr(ssl, "PROTOCOL_TLS_CLIENT", None) \
                       or getattr(ssl, "PROTOCOL_TLSv1_2")

                client.tls_set(
                    ca_certs  = ca_path,
                    certfile  = cert_path,
                    keyfile   = key_path,
                    tls_version = tls_ver,
                )

                # Always insecure when no CA, or when user explicitly asked
                if tls_insecure or not ca_path:
                    client.tls_insecure_set(True)

                self.temp_cert_files[b_id] = temp_files
                logger.info("TLS configured for broker %s (cert_id=%s, insecure=%s)",
                            b_id, cert_id, tls_insecure or not ca_path)

            except Exception as exc:
                for p in temp_files:
                    try:
                        os.unlink(p)
                    except Exception:
                        pass
                raise RuntimeError(f"TLS setup failed for broker {b_id}: {exc}") from exc

        # --- Connect ---
        default_port = 8883 if use_tls else 1883
        host = cfg.get("host", "localhost")
        port = int(cfg.get("port", default_port))

        client.connect(host, port, keepalive=60)
        client.loop_start()
        logger.info("Connecting to MQTT broker %s @ %s:%d (TLS=%s auth=%s)",
                    b_id, host, port, use_tls, bool(username))
        return client

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _run_publisher(self):
        logger.info("MQTT Publisher service starting")
        self.running = True

        from app.core.database import SessionLocal
        from app.models import models
        import re

        store = GlobalDataStore()

        while True:
            if not self.running:
                await asyncio.sleep(1)
                continue

            try:
                # ---- Reload config -------------------------------------------
                config_data: dict = {}
                db = None
                try:
                    db = SessionLocal()
                    cfg_row = db.query(models.ServerConfig).filter(
                        models.ServerConfig.type == "MQTT_PUBLISHER"
                    ).first()
                    if cfg_row and cfg_row.enabled:
                        config_data = cfg_row.config or {}
                except Exception as exc:
                    logger.error("Error loading MQTT config: %s", exc)
                    if db:
                        db.close()
                    await asyncio.sleep(2)
                    continue

                if not config_data:
                    if db:
                        db.close()
                    await asyncio.sleep(2)
                    continue

                brokers_cfg  = config_data.get("brokers",      []) or []
                publications = config_data.get("publications", []) or []
                now          = time.time()

                # ---- Manage broker connections --------------------------------
                current_ids = {b["id"] for b in brokers_cfg if "id" in b}

                for b_cfg in brokers_cfg:
                    b_id = b_cfg.get("id")
                    if not b_id:
                        continue

                    new_hash = self._cfg_hash(b_cfg)

                    # Reconnect if config changed
                    if b_id in self.brokers and self._broker_cfg_hash.get(b_id) != new_hash:
                        logger.info("Broker %s config changed, reconnecting", b_id)
                        self._disconnect_broker(b_id)

                    # Respect retry backoff
                    if b_id not in self.brokers:
                        if now < self._retry_after.get(b_id, 0):
                            continue  # still in backoff window

                        self._set_status(b_id, "reconnecting")
                        try:
                            client = self._connect_broker(b_cfg, db)
                            self.brokers[b_id]           = client
                            self._broker_cfg_hash[b_id]  = new_hash
                            self._retry_count[b_id]      = 0
                            self._retry_after.pop(b_id, None)
                        except Exception as exc:
                            count = self._retry_count.get(b_id, 0)
                            delay = self._BACKOFF[min(count, len(self._BACKOFF) - 1)]
                            self._retry_count[b_id]  = count + 1
                            self._retry_after[b_id]  = now + delay
                            self._set_status(b_id, "error", str(exc))
                            logger.error(
                                "Broker %s connect failed (retry #%d in %ds): %s",
                                b_id, count + 1, delay, exc)
                            self._cleanup_temp_certs(b_id)

                # Remove brokers no longer in config
                for b_id in list(self.brokers.keys()):
                    if b_id not in current_ids:
                        logger.info("Removing broker %s (no longer in config)", b_id)
                        self._disconnect_broker(b_id)

                if db:
                    db.close()

                # ---- Process publications -------------------------------------
                tags = await store.get_all_tags()

                for pub in publications:
                    pub_id   = pub.get("id")
                    interval = int(pub.get("interval", 5))

                    if now - self.last_publish.get(pub_id, 0) < interval:
                        continue

                    broker_id = pub.get("broker_id")
                    if broker_id not in self.brokers:
                        continue

                    topic    = pub.get("topic",            "")
                    template = pub.get("payload_template", "{}")
                    qos      = int(pub.get("qos",    0))
                    retain   = bool(pub.get("retain", False))

                    try:
                        payload_str = template
                        payload_str = payload_str.replace("{{timestamp}}",    str(int(now)))
                        payload_str = payload_str.replace("{{timestamp_ms}}", str(int(now * 1000)))

                        pub_tags: list[str] = pub.get("tags", []) or []

                        if template.strip() == "{}":
                            data: dict = {}
                            if "timestamp" in (pub.get("options") or []):
                                data["timestamp"] = int(now * 1000)
                            for tag_id in pub_tags:
                                if tag_id in tags:
                                    data[tag_id] = tags[tag_id].value
                            payload_str = json.dumps(data)
                        else:
                            for tag_id in re.findall(r'\{\{([^}]+)\}\}', payload_str):
                                if tag_id in ("timestamp", "timestamp_ms"):
                                    continue
                                val = tags[tag_id].value if tag_id in tags else None
                                if val is None:
                                    val_str = "null"
                                elif isinstance(val, bool):
                                    val_str = "true" if val else "false"
                                elif isinstance(val, (int, float)):
                                    val_str = str(val)
                                elif isinstance(val, str):
                                    val_str = val
                                else:
                                    val_str = json.dumps(val)
                                payload_str = payload_str.replace(f"{{{{{tag_id}}}}}", val_str)

                        rc, _ = self.brokers[broker_id].publish(
                            topic, payload_str, qos=qos, retain=retain
                        )
                        if rc == mqtt.MQTT_ERR_SUCCESS:
                            self.last_publish[pub_id] = now
                            logger.info(
                                "Published %s → %s (qos=%d retain=%s tags=%d bytes=%d)",
                                broker_id, topic, qos, retain,
                                len(pub_tags), len(payload_str))
                        else:
                            logger.warning("Publish failed for %s: rc=%d", pub_id, rc)

                    except Exception as exc:
                        logger.error("Error publishing %s: %s", pub_id, exc)

            except Exception as exc:
                logger.error("MQTT Publisher loop error: %s", exc, exc_info=True)

            await asyncio.sleep(0.5)
