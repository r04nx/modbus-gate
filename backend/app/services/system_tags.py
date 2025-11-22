import asyncio
import psutil
import socket
import platform
import time
from app.core.store import GlobalDataStore

class SystemTagService:
    def __init__(self, interval: int = 1):
        self.interval = interval
        self.running = False
        self.store = GlobalDataStore()

    async def start(self):
        self.running = True
        asyncio.create_task(self._loop())

    async def stop(self):
        self.running = False

    async def _loop(self):
        while self.running:
            try:
                # CPU
                cpu_percent = psutil.cpu_percent(interval=None)
                await self.store.update_tag("SYS_CPU_USAGE", cpu_percent)

                # RAM
                mem = psutil.virtual_memory()
                await self.store.update_tag("SYS_RAM_USAGE", mem.percent)
                await self.store.update_tag("SYS_RAM_TOTAL", mem.total)
                await self.store.update_tag("SYS_RAM_AVAILABLE", mem.available)

                # Disk
                disk = psutil.disk_usage('/')
                await self.store.update_tag("SYS_DISK_USAGE", disk.percent)

                # Network
                net_io = psutil.net_io_counters()
                await self.store.update_tag("SYS_NET_BYTES_SENT", net_io.bytes_sent)
                await self.store.update_tag("SYS_NET_BYTES_RECV", net_io.bytes_recv)

                # System Info (Static, but good to ensure they exist)
                await self.store.update_tag("SYS_HOSTNAME", socket.gethostname())
                await self.store.update_tag("SYS_OS", platform.system())
                await self.store.update_tag("SYS_UPTIME", int(time.time() - psutil.boot_time()))
                
                # Network Info - Collect all active interfaces
                try:
                    network_interfaces = []
                    addrs = psutil.net_if_addrs()
                    stats = psutil.net_if_stats()
                    
                    for interface_name, interface_addresses in addrs.items():
                        # Skip loopback
                        if interface_name == 'lo':
                            continue
                        
                        # Check if interface is up
                        if interface_name in stats and stats[interface_name].isup:
                            for address in interface_addresses:
                                # Get IPv4 addresses
                                if str(address.family) == 'AddressFamily.AF_INET':
                                    network_interfaces.append({
                                        'interface': interface_name,
                                        'ip': address.address
                                    })
                                    
                                    # Create individual tag for each interface
                                    # e.g., SYS_ETH0_IP, SYS_ETH1_IP, SYS_WLAN0_IP
                                    tag_name = f"SYS_{interface_name.upper()}_IP"
                                    await self.store.update_tag(tag_name, address.address)
                                    break
                    
                    # Store as JSON for multiple interfaces
                    import json
                    await self.store.update_tag("SYS_NETWORK_INTERFACES", json.dumps(network_interfaces))
                    
                    # Also store primary IP (first active interface)
                    if network_interfaces:
                        await self.store.update_tag("SYS_IP_ADDRESS", network_interfaces[0]['ip'])
                    else:
                        await self.store.update_tag("SYS_IP_ADDRESS", "N/A")
                except Exception as e:
                    await self.store.update_tag("SYS_NETWORK_INTERFACES", "[]")
                    await self.store.update_tag("SYS_IP_ADDRESS", "N/A")

            except Exception as e:
                print(f"Error updating system tags: {e}")
            
            await asyncio.sleep(self.interval)
