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

from ...core.database import get_db
from ...core.auth import get_current_user, get_current_superroot
from ...models.user import User


router = APIRouter()


# Pydantic models
class NetworkInterface(BaseModel):
    name: str
    mac_address: Optional[str]
    ip_address: Optional[str]
    netmask: Optional[str]
    gateway: Optional[str]
    is_up: bool


class InterfaceConfig(BaseModel):
    dhcp: bool
    ip_address: Optional[str] = None
    netmask: Optional[str] = None
    gateway: Optional[str] = None


class ConnectivityResponse(BaseModel):
    connected: bool
    latency_ms: Optional[float]
    message: str


# Helper functions
import psutil

# ... existing imports ...

def get_interfaces() -> List[NetworkInterface]:
    """Get list of network interfaces using psutil."""
    interfaces = []
    
    try:
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        
        # Get default gateway (Linux specific)
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
            
            interfaces.append(NetworkInterface(
                name=iface_name,
                mac_address=mac_address,
                ip_address=ip_address,
                netmask=netmask,
                gateway=default_gateway, # Simplified: assuming same gateway for all for now
                is_up=is_up
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
            # Try to extract actual latency from ping output
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
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """
    Update network interface configuration (superroot only).
    
    WARNING: This can cause network connectivity loss if misconfigured.
    """
    try:
        # Verify interface exists
        interfaces = get_interfaces()
        if not any(iface.name == interface for iface in interfaces):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Interface '{interface}' not found"
            )
        
        if config.dhcp:
            # Configure for DHCP using nmcli
            try:
                subprocess.run(
                    ["nmcli", "con", "mod", interface, "ipv4.method", "auto"],
                    check=True,
                    capture_output=True
                )
                subprocess.run(
                    ["nmcli", "con", "up", interface],
                    check=True,
                    capture_output=True
                )
            except subprocess.CalledProcessError:
                # Fallback: try using dhclient
                subprocess.run(["dhclient", interface], check=True, capture_output=True)
        else:
            # Configure static IP
            if not config.ip_address or not config.netmask:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="IP address and netmask required for static configuration"
                )
            
            # Convert netmask to CIDR
            netmask_parts = config.netmask.split(".")
            binary = "".join([bin(int(x))[2:].zfill(8) for x in netmask_parts])
            cidr = binary.count("1")
            
            try:
                # Use nmcli for static configuration
                subprocess.run(
                    ["nmcli", "con", "mod", interface, "ipv4.method", "manual"],
                    check=True,
                    capture_output=True
                )
                subprocess.run(
                    ["nmcli", "con", "mod", interface, "ipv4.addresses", f"{config.ip_address}/{cidr}"],
                    check=True,
                    capture_output=True
                )
                
                if config.gateway:
                    subprocess.run(
                        ["nmcli", "con", "mod", interface, "ipv4.gateway", config.gateway],
                        check=True,
                        capture_output=True
                    )
                
                subprocess.run(
                    ["nmcli", "con", "up", interface],
                    check=True,
                    capture_output=True
                )
            except subprocess.CalledProcessError:
                # Fallback: use ip command
                subprocess.run(
                    ["ip", "addr", "flush", "dev", interface],
                    check=True,
                    capture_output=True
                )
                subprocess.run(
                    ["ip", "addr", "add", f"{config.ip_address}/{cidr}", "dev", interface],
                    check=True,
                    capture_output=True
                )
                subprocess.run(
                    ["ip", "link", "set", interface, "up"],
                    check=True,
                    capture_output=True
                )
                
                if config.gateway:
                    subprocess.run(
                        ["ip", "route", "add", "default", "via", config.gateway],
                        check=True,
                        capture_output=True
                    )
        
        # Ensure interface is brought up regardless of method used
        try:
            subprocess.run(
                ["ip", "link", "set", interface, "up"],
                check=True,
                capture_output=True
            )
        except subprocess.CalledProcessError:
            pass # Ignore if already up or failed, as previous commands should have handled it

        return {
            "success": True,
            "message": f"Interface '{interface}' configured successfully",
            "config": config.dict()
        }
        
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to configure interface: {e.stderr.decode() if e.stderr else str(e)}"
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
