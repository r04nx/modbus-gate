from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models import models
from app.models.user import User
from app.schemas import schemas
from pymodbus.client import AsyncModbusTcpClient, AsyncModbusSerialClient
from asyncua import Client as OpcUaClient
from pysnmp.hlapi.asyncio import SnmpEngine, CommunityData, UdpTransportTarget, ContextData, ObjectType, ObjectIdentity, getCmd
import c104
import asyncio
import csv
import io
import subprocess

router = APIRouter()

# All possible CSV columns across all device types
CSV_FIELDNAMES = [
    # Common fields
    'name', 'description', 'type', 'enabled', 'polling_interval',
    # MODBUS_TCP + SNMP + IEC104
    'host',
    # MODBUS_TCP, MODBUS_RTU (serial path), SNMP, IEC104
    'port',
    # MODBUS_TCP, MODBUS_RTU
    'slave_id',
    # MODBUS_RTU specific
    'baudrate', 'databits', 'stopbits', 'parity', 'rts', 'dtr',
    'scan_time', 'timeout', 'retry_count', 'auto_recover_time',
    # OPC_UA
    'url',
    # SNMP
    'version', 'community',
    # SNMP v3
    'username', 'security_level', 'auth_protocol', 'auth_password',
    'priv_protocol', 'priv_password',
    # IEC104
    'common_address',
]


def device_to_row(device: models.Device) -> dict:
    """Flatten a Device model into a CSV row dict."""
    p = device.connection_params or {}
    row = {
        'name': device.name,
        'description': device.description or '',
        'type': device.type,
        'enabled': str(device.enabled).lower(),
        'polling_interval': str(device.polling_interval),
        # TCP/SNMP/IEC104
        'host': p.get('host', ''),
        'port': str(p.get('port', '')),
        'slave_id': str(p.get('slave_id', '')),
        # RTU
        'baudrate': str(p.get('baudrate', '')),
        'databits': str(p.get('databits', '')),
        'stopbits': str(p.get('stopbits', '')),
        'parity': p.get('parity', ''),
        'rts': str(p.get('rts', '')).lower() if 'rts' in p else '',
        'dtr': str(p.get('dtr', '')).lower() if 'dtr' in p else '',
        'scan_time': str(p.get('scan_time', '')),
        'timeout': str(p.get('timeout', '')),
        'retry_count': str(p.get('retry_count', '')),
        'auto_recover_time': str(p.get('auto_recover_time', '')),
        # OPC UA
        'url': p.get('url', ''),
        # SNMP
        'version': p.get('version', ''),
        'community': p.get('community', ''),
        'username': p.get('username', ''),
        'security_level': p.get('security_level', ''),
        'auth_protocol': p.get('auth_protocol', ''),
        'auth_password': p.get('auth_password', ''),
        'priv_protocol': p.get('priv_protocol', ''),
        'priv_password': p.get('priv_password', ''),
        # IEC104
        'common_address': str(p.get('common_address', '')),
    }
    return row


def row_to_connection_params(row: dict, device_type: str) -> dict:
    """Build connection_params JSON from a CSV row based on device type, preserving all info."""
    params = {}
    
    # 1. Start with defaults based on device type
    if device_type == 'MODBUS_TCP':
        params = {'host': '127.0.0.1', 'port': 502, 'slave_id': 1}
    elif device_type == 'MODBUS_RTU':
        params = {
            'port': '', 'slave_id': 1, 'baudrate': 9600, 
            'databits': 8, 'stopbits': 1, 'parity': 'N', 
            'rts': False, 'dtr': False
        }
    elif device_type == 'OPC_UA':
        params = {'url': 'opc.tcp://localhost:4840'}
    elif device_type == 'SNMP':
        params = {'host': '127.0.0.1', 'port': 161, 'version': 'v2c', 'community': 'public'}
    elif device_type == 'IEC104':
        params = {'host': '127.0.0.1', 'port': 2404, 'common_address': 1}

    # 2. Field type mapping for robust conversion
    # Map from column name to its expected Python type
    FIELD_TYPES = {
        'port': int, 'slave_id': int, 'baudrate': int, 'databits': int,
        'stopbits': float, 'rts': bool, 'dtr': bool,
        'scan_time': int, 'timeout': int, 'retry_count': int, 'auto_recover_time': int,
        'common_address': int
    }

    # 3. Overlay any non-empty fields from the CSV row that match CSV_FIELDNAMES
    # Metadata fields that go into the main Device model columns, not connection_params
    metadata_fields = {'name', 'description', 'type', 'enabled', 'polling_interval'}

    for key in CSV_FIELDNAMES:
        if key in metadata_fields or key not in row:
            continue
            
        val = row[key].strip()
        if not val:
            continue
            
        # Type conversion with fallback to original string
        try:
            # Special case for 'port' which is a string path in RTU but int in others
            if key == 'port' and device_type == 'MODBUS_RTU':
                params[key] = val
                continue

            target_type = FIELD_TYPES.get(key, str)
            if target_type == bool:
                params[key] = val.lower() in ('true', '1', 'yes')
            elif target_type == int:
                params[key] = int(val)
            elif target_type == float:
                params[key] = float(val)
            else:
                params[key] = val
        except (ValueError, TypeError):
            # If conversion fails, keep the original string or existing default
            if key not in params:
                params[key] = val
            
    return params


def rows_are_equal(device: models.Device, row: dict) -> bool:
    """Check if a CSV row matches the existing device (no change needed)."""
    expected_params = row_to_connection_params(row, device.type)
    enabled_val = row.get('enabled', 'true').strip().lower() in ('true', '1', 'yes')
    try:
        polling_val = int(row.get('polling_interval', '1000').strip() or 1000)
    except ValueError:
        polling_val = 1000

    return (
        device.description == (row.get('description', '').strip() or None) and
        device.enabled == enabled_val and
        device.polling_interval == polling_val and
        device.connection_params == expected_params
    )

@router.get("/export")
def export_devices(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Export all devices as a unified CSV file.
    All device types share the same columns; type-specific fields are blank for other types.
    """
    devices = db.query(models.Device).all()

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_FIELDNAMES)
    writer.writeheader()
    for device in devices:
        writer.writerow(device_to_row(device))

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=devices.csv"}
    )


@router.post("/import")
async def import_devices(
    replace: bool = False,
    dry_run: bool = False,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Import devices from a unified CSV file.

    Args:
        replace: If True, delete devices not present in CSV (only if they have no tags).
        dry_run: If True, analyse and return a preview without making DB changes.
    """
    VALID_TYPES = {'MODBUS_TCP', 'MODBUS_RTU', 'OPC_UA', 'SNMP', 'IEC104'}
    VALID_PARITY = {'N', 'E', 'O', 'M', 'S'}
    VALID_SNMP_VERSIONS = {'v1', 'v2c', 'v3'}
    VALID_SECURITY_LEVELS = {'noAuthNoPriv', 'authNoPriv', 'authPriv'}
    VALID_AUTH_PROTOS = {'MD5', 'SHA'}
    VALID_PRIV_PROTOS = {'DES', 'AES'}

    def _validate_ip(val: str, field: str, row_num: int) -> str | None:
        """Return error string if val doesn't look like a host/IP."""
        if not val or not val.strip():
            return f"Row {row_num}: '{field}' is required for this device type (got empty)."
        import re
        # Accept bare IP or hostname; reject clearly bad values
        if re.search(r'[\s,;\t]', val):
            return f"Row {row_num}: '{field}' = '{val}' contains whitespace which is not allowed."
        return None

    def _validate_int(val: str, field: str, row_num: int, min_v: int | None = None, max_v: int | None = None) -> str | None:
        if not val or not val.strip():
            return f"Row {row_num}: '{field}' is required and must be an integer (got empty)."
        try:
            n = int(val.strip())
            if min_v is not None and n < min_v:
                return f"Row {row_num}: '{field}' = {n} is below minimum ({min_v})."
            if max_v is not None and n > max_v:
                return f"Row {row_num}: '{field}' = {n} exceeds maximum ({max_v})."
        except ValueError:
            return f"Row {row_num}: '{field}' = '{val}' is not a valid integer."
        return None

    def _validate_optional_int(val: str, field: str, row_num: int, min_v: int | None = None, max_v: int | None = None) -> str | None:
        if not val or not val.strip():
            return None  # optional – blank is fine
        try:
            n = int(val.strip())
            if min_v is not None and n < min_v:
                return f"Row {row_num}: '{field}' = {n} is below minimum ({min_v})."
            if max_v is not None and n > max_v:
                return f"Row {row_num}: '{field}' = {n} exceeds maximum ({max_v})."
        except ValueError:
            return f"Row {row_num}: '{field}' = '{val}' is not a valid integer."
        return None

    # Try decoding – catch encoding errors early
    try:
        content = await file.read()
        text = content.decode('utf-8-sig')  # handle BOM
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="File encoding error: the CSV must be saved in UTF-8 encoding. "
                   "Please re-save the file as UTF-8 and try again."
        )

    if not text.strip():
        raise HTTPException(status_code=400, detail="The uploaded CSV file is empty.")

    try:
        reader = csv.DictReader(io.StringIO(text))
        # Validate that the header row contains required columns
        if reader.fieldnames is None:
            raise HTTPException(status_code=400, detail="Could not parse CSV headers. Ensure the file is valid CSV with a header row.")
        required_headers = {'name', 'type'}
        missing_headers = required_headers - {h.strip().lower() for h in reader.fieldnames}
        if missing_headers:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required CSV column(s): {sorted(missing_headers)}. "
                       f"The CSV must include at minimum: 'name' and 'type'. "
                       f"Found columns: {list(reader.fieldnames)}"
            )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

    rows = []
    errors = []

    # --- Validate & parse rows ---
    seen_names: set = set()
    for i, row in enumerate(reader, start=2):  # row 1 = header
        name = row.get('name', '').strip()
        device_type = row.get('type', '').strip().upper()
        row_errors = []

        # ── required fields ──────────────────────────────
        if not name:
            errors.append(f"Row {i}: 'name' is required.")
            continue
        if not device_type:
            errors.append(f"Row {i} ({name}): 'type' is required.")
            continue
        if device_type not in VALID_TYPES:
            errors.append(
                f"Row {i} ({name}): Invalid type '{device_type}'. "
                f"Allowed values: {', '.join(sorted(VALID_TYPES))}."
            )
            continue
        if name in seen_names:
            errors.append(f"Row {i}: Duplicate device name '{name}' in CSV — each name must be unique.")
            continue
        if ' ' in name:
            row_errors.append(f"'name' must not contain spaces (got '{name}').")
        if ':' in name:
            row_errors.append(f"'name' must not contain colons (got '{name}').")

        # Check polling_interval
        pi_err = _validate_optional_int(row.get('polling_interval', ''), 'polling_interval', i, min_v=50, max_v=3600000)
        if pi_err:
            row_errors.append(pi_err.split(f"Row {i}: ", 1)[-1])  # strip prefix, added below

        # ── type-specific validation ──────────────────────
        if device_type == 'MODBUS_TCP':
            e = _validate_ip(row.get('host', ''), 'host', i)
            if e: row_errors.append(e.split(f"Row {i}: ", 1)[-1])
            e = _validate_int(row.get('port', ''), 'port', i, min_v=1, max_v=65535)
            if e: row_errors.append(e.split(f"Row {i}: ", 1)[-1])
            e = _validate_int(row.get('slave_id', ''), 'slave_id', i, min_v=0, max_v=247)
            if e: row_errors.append(e.split(f"Row {i}: ", 1)[-1])

        elif device_type == 'MODBUS_RTU':
            port_val = row.get('port', '').strip()
            if not port_val:
                row_errors.append("'port' (serial device path, e.g. /dev/ttyUSB0) is required.")
            e = _validate_int(row.get('slave_id', ''), 'slave_id', i, min_v=0, max_v=247)
            if e: row_errors.append(e.split(f"Row {i}: ", 1)[-1])
            e = _validate_optional_int(row.get('baudrate', ''), 'baudrate', i, min_v=110, max_v=921600)
            if e: row_errors.append(e.split(f"Row {i}: ", 1)[-1])
            e = _validate_optional_int(row.get('databits', ''), 'databits', i, min_v=5, max_v=8)
            if e: row_errors.append(e.split(f"Row {i}: ", 1)[-1])
            parity = row.get('parity', '').strip().upper()
            if parity and parity not in VALID_PARITY:
                row_errors.append(f"'parity' = '{parity}' is invalid. Allowed: {', '.join(sorted(VALID_PARITY))}.")
            stopbits = row.get('stopbits', '').strip()
            if stopbits:
                try:
                    sb = float(stopbits)
                    if sb not in (1, 1.5, 2):
                        row_errors.append(f"'stopbits' = '{stopbits}' is invalid. Allowed: 1, 1.5, 2.")
                except ValueError:
                    row_errors.append(f"'stopbits' = '{stopbits}' is not a valid number.")

        elif device_type == 'OPC_UA':
            url_val = row.get('url', '').strip()
            if not url_val:
                row_errors.append("'url' is required for OPC_UA (e.g. opc.tcp://host:4840).")
            elif not url_val.startswith('opc.tcp://') and not url_val.startswith('opc.https://'):
                row_errors.append(f"'url' = '{url_val}' looks invalid. Expected opc.tcp:// or opc.https:// scheme.")

        elif device_type == 'SNMP':
            e = _validate_ip(row.get('host', ''), 'host', i)
            if e: row_errors.append(e.split(f"Row {i}: ", 1)[-1])
            e = _validate_optional_int(row.get('port', ''), 'port', i, min_v=1, max_v=65535)
            if e: row_errors.append(e.split(f"Row {i}: ", 1)[-1])
            version = row.get('version', 'v2c').strip().lower() or 'v2c'
            if version not in VALID_SNMP_VERSIONS:
                row_errors.append(f"'version' = '{version}' is invalid. Allowed: {', '.join(VALID_SNMP_VERSIONS)}.")
            elif version in ('v1', 'v2c'):
                if not row.get('community', '').strip():
                    row_errors.append("'community' is required for SNMPv1/v2c and must not be empty.")
            elif version == 'v3':
                if not row.get('username', '').strip():
                    row_errors.append("'username' is required for SNMPv3.")
                sec_level = row.get('security_level', 'noAuthNoPriv').strip() or 'noAuthNoPriv'
                if sec_level not in VALID_SECURITY_LEVELS:
                    row_errors.append(f"'security_level' = '{sec_level}' is invalid. Allowed: {', '.join(VALID_SECURITY_LEVELS)}.")
                elif sec_level in ('authNoPriv', 'authPriv'):
                    auth_proto = row.get('auth_protocol', '').strip()
                    if auth_proto and auth_proto not in VALID_AUTH_PROTOS:
                        row_errors.append(f"'auth_protocol' = '{auth_proto}' is invalid. Allowed: {', '.join(VALID_AUTH_PROTOS)}.")
                    if not row.get('auth_password', '').strip():
                        row_errors.append("'auth_password' is required when security_level is 'authNoPriv' or 'authPriv'.")
                if sec_level == 'authPriv':
                    priv_proto = row.get('priv_protocol', '').strip()
                    if priv_proto and priv_proto not in VALID_PRIV_PROTOS:
                        row_errors.append(f"'priv_protocol' = '{priv_proto}' is invalid. Allowed: {', '.join(VALID_PRIV_PROTOS)}.")
                    if not row.get('priv_password', '').strip():
                        row_errors.append("'priv_password' is required when security_level is 'authPriv'.")

        elif device_type == 'IEC104':
            e = _validate_ip(row.get('host', ''), 'host', i)
            if e: row_errors.append(e.split(f"Row {i}: ", 1)[-1])
            e = _validate_optional_int(row.get('port', ''), 'port', i, min_v=1, max_v=65535)
            if e: row_errors.append(e.split(f"Row {i}: ", 1)[-1])
            e = _validate_optional_int(row.get('common_address', ''), 'common_address', i, min_v=1, max_v=65534)
            if e: row_errors.append(e.split(f"Row {i}: ", 1)[-1])

        if row_errors:
            prefix = f"Row {i} ({name}, type={device_type}):"
            errors.append(f"{prefix} " + " | ".join(row_errors))
            continue  # skip invalid rows — don't add to rows list

        seen_names.add(name)
        row['type'] = device_type  # normalise to uppercase
        rows.append(row)

    if errors and not rows:
        raise HTTPException(
            status_code=400,
            detail={
                "message": f"All {len(errors)} row(s) in the CSV failed validation. No changes were made.",
                "errors": errors,
            }
        )

    # --- Load existing devices ---
    existing_devices = {d.name: d for d in db.query(models.Device).all()}
    csv_names = {r['name'] for r in rows}

    new_devices = []
    modified_devices = []
    deleted_devices = []
    unchanged_devices = []

    for row in rows:
        name = row['name']
        if name in existing_devices:
            device = existing_devices[name]
            if rows_are_equal(device, row):
                unchanged_devices.append(name)
            else:
                # Build change detail for analysis
                new_params = row_to_connection_params(row, row['type'])
                changes = {}
                if device.description != (row.get('description', '').strip() or None):
                    changes['description'] = {'old': device.description, 'new': row.get('description', '').strip() or None}
                try:
                    new_polling = int(row.get('polling_interval', '1000').strip() or 1000)
                except ValueError:
                    new_polling = 1000
                if device.polling_interval != new_polling:
                    changes['polling_interval'] = {'old': device.polling_interval, 'new': new_polling}
                enabled_val = row.get('enabled', 'true').strip().lower() in ('true', '1', 'yes')
                if device.enabled != enabled_val:
                    changes['enabled'] = {'old': device.enabled, 'new': enabled_val}
                if device.connection_params != new_params:
                    changes['connection_params'] = {'old': device.connection_params, 'new': new_params}
                modified_devices.append({'name': name, 'changes': changes})
        else:
            new_devices.append(name)

    if replace:
        for name, device in existing_devices.items():
            if name not in csv_names:
                if device.tags:
                    tag_ids = [t.tag_id for t in device.tags]
                    errors.append(f"Cannot delete '{name}': used by tags {', '.join(tag_ids)}.")
                else:
                    deleted_devices.append(name)

    analysis = {
        'summary': {
            'new': len(new_devices),
            'modified': len(modified_devices),
            'deleted': len(deleted_devices),
            'unchanged': len(unchanged_devices),
            'errors': len(errors),
        },
        'changes': (
            [{'name': n, 'status': 'NEW', 'changes': {}} for n in new_devices] +
            [{'name': m['name'], 'status': 'MODIFIED', 'changes': m['changes']} for m in modified_devices] +
            [{'name': n, 'status': 'DELETED', 'changes': {}} for n in deleted_devices] +
            [{'name': n, 'status': 'UNCHANGED', 'changes': {}} for n in unchanged_devices]
        ),
    }

    if dry_run:
        return {'dry_run': True, 'analysis': analysis, 'errors': errors}

    # --- Apply changes ---
    created_count = 0
    updated_count = 0
    deleted_count = 0

    try:
        # Deletions (replace mode)
        if replace:
            for name in deleted_devices:
                device = existing_devices.get(name)
                if device:
                    db.delete(device)
                    deleted_count += 1

        # Create / update
        for row in rows:
            name = row['name']
            device_type = row['type']
            description = row.get('description', '').strip() or None
            enabled_val = row.get('enabled', 'true').strip().lower() in ('true', '1', 'yes')
            try:
                polling_val = int(row.get('polling_interval', '1000').strip() or 1000)
            except ValueError:
                polling_val = 1000
            conn_params = row_to_connection_params(row, device_type)

            existing = existing_devices.get(name)
            if existing:
                existing.description = description
                existing.type = device_type
                existing.enabled = enabled_val
                existing.polling_interval = polling_val
                existing.connection_params = conn_params
                updated_count += 1
            else:
                db_device = models.Device(
                    name=name,
                    description=description,
                    type=device_type,
                    enabled=enabled_val,
                    polling_interval=polling_val,
                    connection_params=conn_params,
                )
                db.add(db_device)
                created_count += 1

        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

    return {
        'dry_run': False,
        'created': created_count,
        'updated': updated_count,
        'deleted': deleted_count,
        'errors': errors,
        'analysis': analysis,
    }


@router.get("/", response_model=List[schemas.Device])
def read_devices(skip: int = 0, limit: int = 100, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    devices = db.query(models.Device).offset(skip).limit(limit).all()
    return devices

@router.post("/", response_model=schemas.Device)
def create_device(device: schemas.DeviceCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_device = models.Device(**device.model_dump())
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    return db_device

@router.delete("/{device_id}")
def delete_device(device_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    # Check for dependent tags
    if db_device.tags:
        tag_ids = [t.tag_id for t in db_device.tags]
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete device '{db_device.name}' because it is used by the following tags: {', '.join(tag_ids)}. Please delete these tags first."
        )

    db.delete(db_device)
    db.commit()
    return {"ok": True}

@router.patch("/{device_id}", response_model=schemas.Device)
def update_device(device_id: int, device_update: schemas.DeviceUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    update_data = device_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_device, key, value)
    
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    return db_device

@router.post("/{device_id}/test")
async def test_connection(device_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    try:
        if device.type == "MODBUS_TCP":
            params = device.connection_params
            host = params.get("host")
            port = params.get("port", 502)
            
            try:
                client = AsyncModbusTcpClient(host, port=port, timeout=3)
                await client.connect()
                if client.connected:
                    client.close()
                    return {
                        "status": "success", 
                        "code": "CONN_OK",
                        "message": "Connection Successful",
                        "detail": f"Successfully established TCP connection to {host}:{port} and verified Modbus handshake."
                    }
                else:
                    return {
                        "status": "error", 
                        "code": "ERR_CONN_REFUSED",
                        "message": "Connection Refused",
                        "detail": f"Target {host}:{port} rejected the connection. Check if the device is online and the port is open."
                    }
            except asyncio.TimeoutError:
                return {
                    "status": "error", 
                    "code": "ERR_TIMEOUT",
                    "message": "Connection Timed Out",
                    "detail": f"Timed out waiting for response from {host}:{port}. Check network reachability."
                }
            except Exception as e:
                 return {
                    "status": "error", 
                    "code": "ERR_MODBUS_PROTOCOL",
                    "message": "Protocol Error",
                    "detail": str(e)
                }
                
        elif device.type == "MODBUS_RTU":
            params = device.connection_params
            port = params.get("port")
            try:
                client = AsyncModbusSerialClient(
                    port, 
                    baudrate=params.get("baudrate", 9600),
                    bytesize=params.get("bytesize", 8),
                    parity=params.get("parity", "N"),
                    stopbits=params.get("stopbits", 1),
                    timeout=3
                )
                await client.connect()
                if client.connected:
                    client.close()
                    return {
                        "status": "success", 
                        "code": "CONN_OK",
                        "message": "Port Opened",
                        "detail": f"Successfully opened serial port {port} with specified parameters."
                    }
                else:
                    return {
                        "status": "error", 
                        "code": "ERR_SERIAL_OPEN",
                        "message": "Port Open Failed",
                        "detail": f"Could not open serial port {port}. Check if the device is connected and permissions are correct. If the device is enabled, try disabling it first to stop the polling engine from holding the port."
                    }
            except Exception as e:
                return {
                    "status": "error", 
                    "code": "ERR_SERIAL_GENERIC",
                    "message": "Serial Error",
                    "detail": str(e)
                }

        elif device.type == "OPC_UA":
            params = device.connection_params
            url = params.get("url")
            try:
                async with OpcUaClient(url=url, timeout=3) as client:
                    # Just connecting is enough validation
                    pass
                return {
                    "status": "success", 
                    "code": "CONN_OK",
                    "message": "Session Established",
                    "detail": f"Successfully connected to OPC UA server at {url} and established a session."
                }
            except ConnectionRefusedError:
                 return {
                    "status": "error", 
                    "code": "ERR_CONN_REFUSED",
                    "message": "Connection Refused",
                    "detail": f"Could not connect to {url}. Server might be down or unreachable."
                }
            except Exception as e:
                 return {
                    "status": "error", 
                    "code": "ERR_OPCUA_GENERIC",
                    "message": "OPC UA Error",
                    "detail": str(e)
                }

        elif device.type == "SNMP":
            params = device.connection_params
            host = params.get("host")
            port = params.get("port", 161)
            community = params.get("community", "public")
            
            # Test by getting sysDescr (1.3.6.1.2.1.1.1.0)
            try:
                errorIndication, errorStatus, errorIndex, varBinds = await getCmd(
                    SnmpEngine(),
                    CommunityData(community),
                    UdpTransportTarget((host, port), timeout=2, retries=1),
                    ContextData(),
                    ObjectType(ObjectIdentity('1.3.6.1.2.1.1.1.0'))
                )
                if errorIndication:
                    return {
                        "status": "error", 
                        "code": "ERR_SNMP_TIMEOUT" if "No response" in str(errorIndication) else "ERR_SNMP_GENERIC",
                        "message": "SNMP Error",
                        "detail": str(errorIndication)
                    }
                elif errorStatus:
                    return {
                        "status": "error", 
                        "code": f"ERR_SNMP_{errorStatus.prettyPrint()}",
                        "message": "SNMP Error Status",
                        "detail": errorStatus.prettyPrint()
                    }
                else:
                    return {
                        "status": "success", 
                        "code": "CONN_OK",
                        "message": "Agent Responded",
                        "detail": f"Successfully queried sysDescr from SNMP agent at {host}."
                    }
            except Exception as e:
                return {
                    "status": "error", 
                    "code": "ERR_SNMP_EXCEPTION",
                    "message": "SNMP Exception",
                    "detail": str(e)
                }

        elif device.type == "IEC104":
            params = device.connection_params
            host = params.get("host")
            port = params.get("port", 2404)
            
            try:
                # Let's try a simple socket connect for IEC104 to verify reachability
                reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=3)
                writer.close()
                await writer.wait_closed()
                return {
                    "status": "success", 
                    "code": "CONN_OK",
                    "message": "Port Reachable",
                    "detail": f"Successfully established TCP connection to IEC104 server at {host}:{port}."
                }
            except (asyncio.TimeoutError, TimeoutError):
                return {
                    "status": "error", 
                    "code": "ERR_TIMEOUT",
                    "message": "Connection Timed Out",
                    "detail": f"Timed out connecting to {host}:{port}."
                }
            except ConnectionRefusedError:
                return {
                    "status": "error", 
                    "code": "ERR_CONN_REFUSED",
                    "message": "Connection Refused",
                    "detail": f"Target {host}:{port} rejected the connection."
                }
            except Exception as e:
                return {
                    "status": "error", 
                    "code": "ERR_IEC104_GENERIC",
                    "message": "Connection Error",
                    "detail": str(e)
                }

        return {
            "status": "error", 
            "code": "ERR_UNKNOWN_TYPE",
            "message": "Unknown Device Type",
            "detail": f"Device type '{device.type}' is not supported for testing."
        }

    except Exception as e:
        return {
            "status": "error", 
            "code": "ERR_INTERNAL",
            "message": "Internal Error",
            "detail": str(e)
        }

@router.get("/health")
def get_devices_health(current_user: User = Depends(get_current_user)):
    """Get real-time health status from the Polling Engine"""
    from app.services.polling import PollingEngine
    engine = PollingEngine.get_instance()
    return engine.get_health_status()

@router.post("/{device_id}/diagnose/{tool}")
async def diagnose_device(
    device_id: int, 
    tool: str, 
    payload: dict = Body({}),
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Run diagnostic tools (ping, nmap, traceroute) against a device host"""
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    params = device.connection_params
    host = params.get("host") or params.get("url")
    
    if not host:
        raise HTTPException(status_code=400, detail="Device does not have a host or URL configured")
    
    import os
    from urllib.parse import urlparse
    # Strip protocols from URL if needed
    if "://" in host:
        host = urlparse(host).hostname
    
    if tool not in ["ping", "nmap", "traceroute"]:
        raise HTTPException(status_code=400, detail=f"Unsupported diagnostic tool: {tool}")
    
    # Construct command securely
    cmd = []
    if tool == "ping":
        cmd = ["ping", "-c", "4", host] if os.name != 'nt' else ["ping", "-n", "4", host]
    elif tool == "nmap":
        # Whitelist of allowed flags for security
        ALLOWED_FLAGS = {
            "-p-", "-sV", "-O", "-A", "-Pn", "-T4", "--open", "-F", "-sC", "-sS", "-sU", "-T1", "-T2", "-T3", "-T5"
        }
        
        user_options = payload.get("options", [])
        validated_options = [opt for opt in user_options if opt in ALLOWED_FLAGS]
        
        # If no valid options provided, use a reasonable default
        if not validated_options:
            validated_options = ["-p-", "-T4", "-sV", "--open"]
            
        cmd = ["nmap"] + validated_options + [host]
    elif tool == "traceroute":
        cmd = ["traceroute", host] if os.name != 'nt' else ["tracert", host]
        
    try:
        # Run process with timeout (increased for full scan)
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        # Nmap -p- with -sV on an IoT board can take several minutes
        timeout = 300 if tool == "nmap" else (60 if tool == "traceroute" else 30)
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
        
        output_str = stdout.decode() if stdout else ""
        error_str = stderr.decode() if stderr else ""

        # Parse results into structured JSON for better UI
        parsed_result = None
        
        if tool == "ping":
            import re
            # Match: 4 tablets transmitted, 4 received, 0% packet loss, time 3004ms
            # rtt min/avg/max/mdev = 0.041/0.052/0.065/0.011 ms
            stats_match = re.search(r'(\d+) packets transmitted, (\d+) received, ([\d.]+)% packet loss', output_str)
            rtt_match = re.search(r'rtt min/avg/max/mdev = ([\d.]+)/([\d.]+)/([\d.]+)/', output_str)
            
            if stats_match:
                parsed_result = {
                    "transmitted": int(stats_match.group(1)),
                    "received": int(stats_match.group(2)),
                    "loss": float(stats_match.group(3)),
                    "avg_latency": float(rtt_match.group(2)) if rtt_match else None
                }

        elif tool == "nmap" and "PORT" in output_str:
            import re
            ports = []
            for line in output_str.splitlines():
                match = re.match(r'^(\d+/\w+)\s+(\w+)\s+(.+)$', line.strip())
                if match:
                    p_info = match.group(3).split(maxsplit=1)
                    service = p_info[0] if len(p_info) > 0 else "unknown"
                    version = p_info[1] if len(p_info) > 1 else ""
                    ports.append({
                        "port": match.group(1),
                        "state": match.group(2),
                        "service": service,
                        "version": version
                    })
            if ports:
                parsed_result = {"ports": ports}

        elif tool == "traceroute":
            import re
            hops = []
            # Match:  1  10.0.0.1 (10.0.0.1)  1.234 ms
            for line in output_str.splitlines():
                match = re.search(r'^\s*(\d+)\s+([\d.]+.*ms)', line.strip())
                if match:
                    hops.append({
                        "hop": int(match.group(1)),
                        "detail": match.group(2).strip()
                    })
            if hops:
                parsed_result = {"hops": hops}

        return {
            "status": "success",
            "command": " ".join(cmd),
            "output": output_str,
            "parsed": parsed_result,
            "error": error_str
        }
    except asyncio.TimeoutError:
        return {
            "status": "error",
            "message": f"Diagnostic tool '{tool}' timed out after {timeout} seconds"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Execution failed: {str(e)}"
        }
