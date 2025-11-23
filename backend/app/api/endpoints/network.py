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

# Pydantic models
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
    gateway: Optional[str] = None


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
    db: Session = Depends(get_db)
):
    """List all network interfaces."""
    return get_interfaces()


@router.get("/{interface}", response_model=NetworkInterface)
def get_interface(
    interface: str,
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

        # Get existing connection UUID
        uuid, _ = get_connection_info(interface)
        print(f"[DEBUG] Interface: {interface}, UUID: {uuid}")
        
        # If no connection exists, create a new one
        if not uuid:
            try:
                subprocess.run(
                    [NMCLI, "con", "add", "type", "ethernet", "ifname", interface, "con-name", interface],
                    check=True,
                    capture_output=True
                )
                uuid, _ = get_connection_info(interface) # Refresh
                print(f"[DEBUG] Created new connection, UUID: {uuid}")
            except subprocess.CalledProcessError as e:
                raise HTTPException(status_code=500, detail=f"Failed to create connection: {e.stderr}")

        if not uuid:
             raise HTTPException(status_code=500, detail="Could not determine connection UUID")

        # Modify the specific connection by UUID to avoid ambiguity
        if config.dhcp:
            print(f"[DEBUG] Configuring {uuid} for DHCP")
            subprocess.run(
                [NMCLI, "con", "mod", uuid, "ipv4.method", "auto"],
                check=True,
                capture_output=True
            )
            # Clear any static IP settings just in case
            subprocess.run(
                [NMCLI, "con", "mod", uuid, "ipv4.addresses", "", "ipv4.gateway", ""],
                check=False, # Might fail if already empty, that's fine
                capture_output=True
            )
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
            
            print(f"[DEBUG] Configuring {uuid} for static IP {config.ip_address}/{cidr}")
            subprocess.run(
                [NMCLI, "con", "mod", uuid, "ipv4.method", "manual"],
                check=True,
                capture_output=True
            )
            subprocess.run(
                [NMCLI, "con", "mod", uuid, "ipv4.addresses", f"{config.ip_address}/{cidr}"],
                check=True,
                capture_output=True
            )
            
            if config.gateway:
                subprocess.run(
                    [NMCLI, "con", "mod", uuid, "ipv4.gateway", config.gateway],
                    check=True,
                    capture_output=True
                )
            else:
                # Remove gateway if not provided
                subprocess.run(
                    [NMCLI, "con", "mod", uuid, "ipv4.gateway", ""],
                    check=False,
                    capture_output=True
                )

        # Apply changes
        print(f"[DEBUG] Bringing up connection {uuid}")
        result = subprocess.run(
            [NMCLI, "con", "up", uuid],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            print(f"[ERROR] nmcli con up failed: {result.stderr}")
            raise subprocess.CalledProcessError(result.returncode, result.args, result.stdout, result.stderr)
        
        # Ensure interface is up at link level too
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
    db: Session = Depends(get_db)
):
    """Test internet connectivity by pinging 8.8.8.8."""
    return test_connectivity()
    """Test internet connectivity by pinging 8.8.8.8."""
    return test_connectivity()
