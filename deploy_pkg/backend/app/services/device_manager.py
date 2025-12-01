import serial.tools.list_ports
import psutil
from typing import List, Dict

class DeviceManagerService:
    @staticmethod
    def get_serial_ports() -> List[Dict[str, str]]:
        ports = serial.tools.list_ports.comports()
        return [{"device": p.device, "description": p.description} for p in ports]

    @staticmethod
    def get_network_interfaces() -> List[Dict[str, str]]:
        interfaces = []
        addrs = psutil.net_if_addrs()
        for name, snics in addrs.items():
            for snic in snics:
                if snic.family == 2: # AF_INET (IPv4)
                    interfaces.append({
                        "name": name,
                        "address": snic.address,
                        "netmask": snic.netmask
                    })
        return interfaces
