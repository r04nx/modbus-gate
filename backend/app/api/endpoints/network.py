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
def get_interfaces() -> List[NetworkInterface]:
    """Get list of network interfaces using ip command."""
    interfaces = []
    
    try:
        # Get interface names and status
        result = subprocess.run(
            ["ip", "-o", "link", "show"],
            capture_output=True,
            text=True,
            check=True
        )
        
        for line in result.stdout.strip().split("\n"):
            # Parse: 2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> ...
            match = re.match(r"\d+:\s+(\S+):\s+<([^>]+)>", line)
            if match:
                iface_name = match.group(1)
                flags = match.group(2)
                
                # Skip loopback
                if iface_name == "lo":
                    continue
                
                is_up = "UP" in flags
                
                # Get MAC address
                mac_match = re.search(r"link/ether\s+([0-9a-f:]+)", line)
                mac_address = mac_match.group(1) if mac_match else None
                
                # Get IP address
                ip_result = subprocess.run(
                    ["ip", "-o", "-4", "addr", "show", iface_name],
                    capture_output=True,
                    text=True
                )
                
                ip_address = None
                netmask = None
                if ip_result.returncode == 0 and ip_result.stdout:
                    # Parse: inet 192.168.1.100/24 ...
                    ip_match = re.search(r"inet\s+(\d+\.\d+\.\d+\.\d+)/(\d+)", ip_result.stdout)
                    if ip_match:
                        ip_address = ip_match.group(1)
                        cidr = int(ip_match.group(2))
                        # Convert CIDR to netmask
                        netmask = socket.inet_ntoa(
                            (0xffffffff << (32 - cidr)).to_bytes(4, 'big')
                        )
                
                # Get gateway (default route)
                gateway = None
                route_result = subprocess.run(
                    ["ip", "route", "show", "default"],
                    capture_output=True,
                    text=True
                )
                if route_result.returncode == 0:
                    gateway_match = re.search(r"default via\s+(\d+\.\d+\.\d+\.\d+)", route_result.stdout)
                    if gateway_match:
                        gateway = gateway_match.group(1)
                
                interfaces.append(NetworkInterface(
                    name=iface_name,
                    mac_address=mac_address,
                    ip_address=ip_address,
                    netmask=netmask,
                    gateway=gateway,
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
