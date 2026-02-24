"""
Network Configuration API Endpoints

Provides endpoints for:
- Listing network interfaces
- Getting interface configuration
- Updating interface configuration (DHCP/Static)
- Testing internet connectivity
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import subprocess
import re
import socket
import json
import psutil

from ...core.database import get_db
from ...core.auth import get_current_user, get_current_superroot
from ...models.user import User


router = APIRouter()

# Constants
NMCLI = "/usr/bin/nmcli"
IP_CMD = "/usr/sbin/ip"


# Wifi Models
class WifiNetwork(BaseModel):
    ssid: str
    bssid: str
    signal: int
    security: str
    in_use: bool
    bars: str

class WifiConnectRequest(BaseModel):
    ssid: str
    password: str

class WifiStatusResponse(BaseModel):
    connected: bool
    ssid: Optional[str]
    ip_address: Optional[str]
    signal_strength: Optional[int]
    frequency: Optional[str]
    device: Optional[str]

import logging

logger = logging.getLogger(__name__)

# Wifi Helpers
def get_wifi_status_info():
    """Get current Wifi Connection status."""
    try:
        # 1. Get Active Connection and Device
        result = subprocess.run(
            [NMCLI, "-t", "-f", "TYPE,NAME,DEVICE,STATE", "con", "show", "--active"],
            capture_output=True,
            text=True
        )
        
        wifi_con = None
        device = None
        
        for line in result.stdout.splitlines():
            if line.startswith("802-11-wireless") or line.startswith("wifi"):
                parts = line.split(":")
                # Type:Name:Device:State
                if len(parts) >= 3:
                    wifi_con = parts[1]
                    device = parts[2]
                    break
        
        if not wifi_con:
            return WifiStatusResponse(connected=False, ssid=None, ip_address=None, signal_strength=None, frequency=None, device=None)

        ssid = wifi_con
        ip = None
        signal = None
        freq = None


        status_res = subprocess.run(
            [NMCLI, "-t", "-f", "IP4.ADDRESS", "dev", "show", device],
            capture_output=True,
            text=True
        )
        


        for line in status_res.stdout.splitlines():
            if "IP4.ADDRESS" in line:
                # Split by first colon
                parts = line.split(":", 1)
                if len(parts) == 2:
                    val = parts[1].strip()
                    # Remove CIDR if present
                    ip = val.split("/")[0]
                    break 

        # 3. Get Signal and Frequency from 'dev wifi list' (Using Terse)
        wifi_res = subprocess.run(
            [NMCLI, "-t", "-f", "SIGNAL,FREQ,IN-USE,SSID", "dev", "wifi", "list"],
            capture_output=True,
            text=True
        )
        


        for line in wifi_res.stdout.splitlines():
            # Format: SIGNAL:FREQ:IN-USE:SSID
            # 70:2422 MHz:*:CASGLOBALS
            # Using SSID fallback as well
            parts = line.split(":")
            if len(parts) >= 4:
                s_str = parts[0]
                f_str = parts[1]
                in_use = parts[2]
                row_ssid = parts[3]
                
                # Check for active flag OR matching SSID
                # Note: SSID match is risky if multiple APs with same SSID, but better than nothing.
                if in_use == "*" or (ssid and row_ssid == ssid):
                     if s_str.isdigit():
                         signal = int(s_str)
                     freq = f_str.replace("\\:", ":") 
                     # Prefer the one with '*' if we haven't found it yet, or overwrite?
                     # If we found '*', break. If we found SSID, keep it but continue looking for '*'?
                     if in_use == "*":
                         break
        


        response = WifiStatusResponse(
            connected=True,
            ssid=ssid,
            ip_address=ip,
            signal_strength=signal,
            frequency=freq,
            device=device
        )
        logger.info(f"Wifi Status Return: {response}")
        return response

    except Exception as e:
        logger.error(f"Error getting wifi status: {e}")
        return WifiStatusResponse(connected=False, ssid=None, ip_address=None, signal_strength=None, frequency=None, device=None)

# Wifi Endpoints
@router.get("/wifi/scan", response_model=List[WifiNetwork])
def scan_wifi(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Scan for available Wifi networks."""
    try:
        # Rescan first
        subprocess.run([NMCLI, "dev", "wifi", "rescan"], capture_output=True)
        
        result = subprocess.run(
            [NMCLI, "-t", "-f", "SSID,BSSID,SIGNAL,SECURITY,IN-USE,BARS", "dev", "wifi", "list"],
            capture_output=True,
            text=True
        )
        
        networks = []
        seen_ssids = set()
        
        def parse_terse(line):
            row = []
            curr = ""
            escape = False
            for char in line:
                if escape:
                    curr += char
                    escape = False
                elif char == '\\':
                    escape = True
                elif char == ':':
                    row.append(curr)
                    curr = ""
                else:
                    curr += char
            row.append(curr)
            return row
            
        for line in result.stdout.splitlines():
            row = parse_terse(line)
            if len(row) >= 6:
                ssid = row[0]
                if not ssid: continue # hidden network
                
                # Dedup by SSID, keep strongest
                if ssid in seen_ssids: continue
                seen_ssids.add(ssid)
                
                networks.append(WifiNetwork(
                    ssid=ssid,
                    bssid=row[1],
                    signal=int(row[2]) if row[2].isdigit() else 0,
                    security=row[3],
                    in_use=(row[4] == "*"),
                    bars=row[5]
                ))
                
        return sorted(networks, key=lambda x: x.signal, reverse=True)

    except Exception as e:
        print(f"Wifi scan error: {e}")
        return []

@router.get("/wifi/status", response_model=WifiStatusResponse)
def get_wifi_status_endpoint(
    db: Session = Depends(get_db)
):
    return get_wifi_status_info()

@router.post("/wifi/connect")
def connect_wifi(
    connection: WifiConnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Connect to a Wifi network."""
    try:
        # Delete existing connection with same name to avoid duplicates
        subprocess.run([NMCLI, "con", "delete", connection.ssid], capture_output=True)
        
        cmd = [NMCLI, "dev", "wifi", "connect", connection.ssid, "password", connection.password]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"Failed to connect: {result.stderr}")
            
        return {"success": True, "message": f"Connected to {connection.ssid}"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/wifi/disconnect")
def disconnect_wifi(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Disconnect current Wifi."""
    try:
        status = get_wifi_status_info()
        if status.connected and status.device:
            result = subprocess.run([NMCLI, "dev", "disconnect", status.device], capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(result.stderr)
            return {"success": True, "message": "Disconnected"}
        else:
             return {"success": False, "message": "Not connected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class NetworkInterface(BaseModel):
    name: str
    mac_address: Optional[str]
    ip_address: Optional[str]
    netmask: Optional[str]
    gateway: Optional[str]
    is_up: bool
    dhcp: bool = False  # Added field for persistent config status


class InterfaceConfig(BaseModel):
    dhcp: bool
    ip_address: Optional[str] = None
    netmask: Optional[str] = None


class ConnectivityResponse(BaseModel):
    connected: bool
    latency_ms: Optional[float]
    message: str


def get_connection_info(interface: str):
    """Get NetworkManager connection info for an interface."""
    try:
        # Get all connections
        result = subprocess.run(
            [NMCLI, "-t", "-f", "UUID,DEVICE", "con", "show"],
            capture_output=True,
            text=True
        )
        
        active_uuid = None
        candidate_uuids = []
        
        # First pass: find active connection for this device
        for line in result.stdout.splitlines():
            if not line:
                continue
            parts = line.split(":")
            if len(parts) >= 2:
                uuid = parts[0]
                device = parts[1]
                if device == interface:
                    active_uuid = uuid
                    break
        
        # Second pass: if no active connection, find all connections bound to this interface
        if not active_uuid:
            result = subprocess.run(
                [NMCLI, "-t", "-f", "UUID", "con", "show"],
                capture_output=True,
                text=True
            )
            
            for line in result.stdout.splitlines():
                if not line:
                    continue
                uuid = line.strip()
                
                # Check if this connection is bound to our interface
                try:
                    details = subprocess.run(
                        [NMCLI, "-t", "-f", "connection.interface-name", "con", "show", uuid],
                        capture_output=True,
                        text=True
                    )
                    iface_name = details.stdout.strip().split(":")[-1]
                    if iface_name == interface:
                        candidate_uuids.append(uuid)
                except:
                    pass
        
        # Use active connection if found, otherwise use first candidate
        target_uuid = active_uuid or (candidate_uuids[0] if candidate_uuids else None)
        
        dhcp = False
        if target_uuid:
            # Check ipv4.method
            method_res = subprocess.run(
                [NMCLI, "-t", "-f", "ipv4.method", "con", "show", target_uuid],
                capture_output=True,
                text=True
            )
            method = method_res.stdout.strip().split(":")[-1]
            dhcp = (method == "auto")
            return target_uuid, dhcp
            
    except Exception as e:
        print(f"Error getting NM info: {e}")
    
    return None, False


def get_interfaces() -> List[NetworkInterface]:
    """Get list of network interfaces using psutil and nmcli."""
    interfaces = []
    
    try:
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        
        # Get default gateway
        default_gateway = None
        try:
            with open("/proc/net/route") as f:
                for line in f:
                    fields = line.strip().split()
                    if fields[1] != '00000000' or not int(fields[3], 16) & 2:
                        continue
                    default_gateway = socket.inet_ntoa(bytes.fromhex(fields[2])[::-1])
                    break
        except:
            pass

        for iface_name, iface_addrs in addrs.items():
            # Skip loopback
            if iface_name == 'lo':
                continue
                
            is_up = stats[iface_name].isup if iface_name in stats else False
            mac_address = None
            ip_address = None
            netmask = None
            
            for addr in iface_addrs:
                if addr.family == socket.AF_PACKET:
                    mac_address = addr.address
                elif addr.family == socket.AF_INET:
                    ip_address = addr.address
                    netmask = addr.netmask
            
            # Get persistent config status (DHCP vs Static)
            _, dhcp_status = get_connection_info(iface_name)
            
            # If no IP yet but is_up, it might be trying to DHCP
            # If we detected DHCP from NM, trust that.
            
            interfaces.append(NetworkInterface(
                name=iface_name,
                mac_address=mac_address,
                ip_address=ip_address,
                netmask=netmask,
                gateway=default_gateway, 
                is_up=is_up,
                dhcp=dhcp_status
            ))
        
    except Exception as e:
        print(f"Error getting interfaces: {e}")
    
    return interfaces


def test_connectivity(host: str = "8.8.8.8", timeout: int = 5) -> ConnectivityResponse:
    """Test internet connectivity by pinging a host."""
    try:
        import time
        start_time = time.time()
        
        result = subprocess.run(
            ["ping", "-c", "1", "-W", str(timeout), host],
            capture_output=True,
            text=True,
            timeout=timeout + 1
        )
        
        latency = (time.time() - start_time) * 1000  # Convert to ms
        
        if result.returncode == 0:
            match = re.search(r"time=(\d+\.?\d*)\s*ms", result.stdout)
            if match:
                latency = float(match.group(1))
            
            return ConnectivityResponse(
                connected=True,
                latency_ms=round(latency, 2),
                message=f"Connected to {host}"
            )
        else:
            return ConnectivityResponse(
                connected=False,
                latency_ms=None,
                message=f"Failed to reach {host}"
            )
            
    except subprocess.TimeoutExpired:
        return ConnectivityResponse(
            connected=False,
            latency_ms=None,
            message=f"Connection timeout to {host}"
        )
    except Exception as e:
        return ConnectivityResponse(
            connected=False,
            latency_ms=None,
            message=f"Error: {str(e)}"
        )


# API endpoints
@router.get("/interfaces", response_model=List[NetworkInterface])
def list_interfaces(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all network interfaces."""
    return get_interfaces()


@router.get("/{interface}", response_model=NetworkInterface)
def get_interface(
    interface: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get configuration for a specific interface."""
    interfaces = get_interfaces()
    
    for iface in interfaces:
        if iface.name == interface:
            return iface
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Interface '{interface}' not found"
    )


@router.put("/{interface}")
def update_interface(
    interface: str,
    config: InterfaceConfig,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update network interface configuration.
    """
    try:
        # Verify interface exists
        interfaces = get_interfaces()
        if not any(iface.name == interface for iface in interfaces):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Interface '{interface}' not found"
            )

        print(f"[DEBUG] Configuring interface: {interface}")
        
        # Delete any existing connections for this interface to start fresh
        try:
            result = subprocess.run(
                [NMCLI, "-t", "-f", "UUID", "con", "show"],
                capture_output=True,
                text=True
            )
            for line in result.stdout.splitlines():
                if not line:
                    continue
                uuid = line.strip()
                details = subprocess.run(
                    [NMCLI, "-t", "-f", "connection.interface-name", "con", "show", uuid],
                    capture_output=True,
                    text=True
                )
                iface_name = details.stdout.strip().split(":")[-1]
                if iface_name == interface:
                    print(f"[DEBUG] Deleting existing connection {uuid} for {interface}")
                    subprocess.run([NMCLI, "con", "delete", uuid], capture_output=True)
        except Exception as e:
            print(f"[WARN] Error cleaning up connections: {e}")
        
        # Create new connection with all settings
        connection_name = f"{interface}-config"
        
        if config.dhcp:
            print(f"[DEBUG] Creating DHCP connection for {interface}")
            cmd = [
                NMCLI, "con", "add",
                "type", "ethernet",
                "ifname", interface,
                "con-name", connection_name,
                "ipv4.method", "auto"
            ]
        else:
            if not config.ip_address or not config.netmask:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="IP address and netmask required for static configuration"
                )
            
            # Convert netmask to CIDR
            netmask_parts = config.netmask.split(".")
            binary = "".join([bin(int(x))[2:].zfill(8) for x in netmask_parts])
            cidr = binary.count("1")
            
            print(f"[DEBUG] Creating static IP connection for {interface}: {config.ip_address}/{cidr}")
            
            cmd = [
                NMCLI, "con", "add",
                "type", "ethernet",
                "ifname", interface,
                "con-name", connection_name,
                "ipv4.method", "manual",
                "ipv4.addresses", f"{config.ip_address}/{cidr}"
            ]

        
        print(f"[DEBUG] Executing command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"[ERROR] Failed to create connection: {result.stderr}")
            raise subprocess.CalledProcessError(result.returncode, result.args, result.stdout, result.stderr)
        
        # Activate the connection
        print(f"[DEBUG] Activating connection {connection_name}")
        result = subprocess.run(
            [NMCLI, "con", "up", connection_name],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            # Check if it's a "no carrier" or device unavailability error
            error_lower = result.stderr.lower()
            if any(phrase in error_lower for phrase in ["no carrier", "unavailable", "no suitable device", "not available on device"]):
                print(f"[WARN] Connection created but not activated (device unavailable or no carrier on {interface})")
                return {
                    "success": True,
                    "message": f"Interface '{interface}' configured successfully (will activate when cable is connected)",
                    "config": config.dict()
                }
            else:
                print(f"[ERROR] Failed to activate connection: {result.stderr}")
                raise subprocess.CalledProcessError(result.returncode, result.args, result.stdout, result.stderr)
        
        # Ensure interface is up at link level
        try:
            subprocess.run([IP_CMD, "link", "set", interface, "up"], check=True, capture_output=True)
        except:
            pass

        return {
            "success": True,
            "message": f"Interface '{interface}' configured successfully",
            "config": config.dict()
        }
        
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr if e.stderr else str(e)
        print(f"[ERROR] subprocess failed: {error_msg}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to configure interface: {error_msg}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to configure interface: {str(e)}"
        )


@router.get("/connectivity/test", response_model=ConnectivityResponse)
def test_internet_connectivity(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Test internet connectivity by pinging 8.8.8.8."""
    return test_connectivity()
    """Test internet connectivity by pinging 8.8.8.8."""
    return test_connectivity()

@router.post("/wifi/disconnect")
def disconnect_wifi(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Disconnect current Wifi."""
    try:
        status = get_wifi_status_info()
        if status.connected and status.device:
            result = subprocess.run([NMCLI, "dev", "disconnect", status.device], capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(result.stderr)
            return {"success": True, "message": "Disconnected"}
        else:
             return {"success": False, "message": "Not connected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

