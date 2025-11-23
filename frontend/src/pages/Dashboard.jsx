import React, { useEffect, useState } from 'react';
import { getTagValues } from '../services/api';
import { Cpu, HardDrive, Activity, Clock, Wifi, Server } from 'lucide-react';
import Sparkline from '../components/Sparkline';
import clsx from 'clsx';

const MetricCard = ({ title, value, unit, icon: Icon, color, subtext, history = [] }) => (
    <div className="bg-surface/50 backdrop-blur-md border border-surfaceHighlight rounded-2xl p-6 shadow-card hover:shadow-glow transition-all duration-300 group relative overflow-hidden">
        <div className={clsx("absolute top-0 right-0 w-32 h-32 bg-gradient-to-br opacity-10 rounded-bl-full transition-transform group-hover:scale-110", color)} />

        <div className="flex justify-between items-start mb-4">
            <div className={clsx("p-3 rounded-xl bg-surfaceHighlight/30", color.replace('from-', 'text-').split(' ')[0])}>
                <Icon size={24} className="text-white" />
            </div>
            {unit && <span className="text-xs font-bold px-2 py-1 rounded-full bg-surfaceHighlight/50 text-text-secondary">{unit}</span>}
        </div>

        <h3 className="text-text-secondary text-sm font-medium mb-1">{title}</h3>
        <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-white tracking-tight">{value}</span>
        </div>
        {subtext && <p className="text-xs text-text-muted mt-2">{subtext}</p>}

        {/* Sparkline in bottom right corner */}
        <div className="absolute bottom-4 right-4">
            <Sparkline data={history} width={80} height={30} color={color.includes('primary') ? '#3b82f6' : color.includes('accent') ? '#06b6d4' : color.includes('warning') ? '#f59e0b' : '#10b981'} />
        </div>
    </div>
);

const Dashboard = () => {
    const [metrics, setMetrics] = useState({
        cpu: 0,
        ram: 0,
        disk: 0,
        uptime: 0,
        hostname: '',
        os: '',
        ipAddress: '',
        networkInterfaces: []
    });

    const [history, setHistory] = useState({
        cpu: [],
        ram: [],
        disk: [],
        uptime: []
    });

    const MAX_HISTORY = 20; // Keep last 20 data points

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const { data } = await getTagValues();
                // Extract system tags
                const cpu = data['SYS_CPU_USAGE']?.value || 0;
                const ram = data['SYS_RAM_USAGE']?.value || 0;
                const disk = data['SYS_DISK_USAGE']?.value || 0;
                const uptime = data['SYS_UPTIME']?.value || 0;
                const hostname = data['SYS_HOSTNAME']?.value || 'Unknown';
                const os = data['SYS_OS']?.value || 'Unknown';
                const ipAddress = data['SYS_IP_ADDRESS']?.value || 'N/A';

                // Parse network interfaces JSON
                let networkInterfaces = [];
                try {
                    const interfacesData = data['SYS_NETWORK_INTERFACES']?.value;
                    if (interfacesData) {
                        networkInterfaces = JSON.parse(interfacesData);
                    }
                } catch (e) {
                    console.error("Failed to parse network interfaces", e);
                }

                setMetrics({ cpu, ram, disk, uptime, hostname, os, ipAddress, networkInterfaces });

                // Update history
                setHistory(prev => ({
                    cpu: [...prev.cpu.slice(-MAX_HISTORY + 1), cpu],
                    ram: [...prev.ram.slice(-MAX_HISTORY + 1), ram],
                    disk: [...prev.disk.slice(-MAX_HISTORY + 1), disk],
                    uptime: [...prev.uptime.slice(-MAX_HISTORY + 1), uptime]
                }));
            } catch (error) {
                console.error("Failed to fetch metrics", error);
            }
        };

        fetchMetrics();
        const interval = setInterval(fetchMetrics, 2000);
        return () => clearInterval(interval);
    }, []);

    const formatUptime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">System Overview</h2>
                    <p className="text-text-secondary">Real-time monitoring of your gateway performance.</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-surfaceHighlight/30 rounded-full border border-surfaceHighlight/50">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="text-sm font-medium text-success">Live Updates</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                    title="CPU Usage"
                    value={metrics.cpu}
                    unit="%"
                    icon={Cpu}
                    color="from-primary to-blue-400"
                    subtext="4 Cores Active"
                    history={history.cpu}
                />
                <MetricCard
                    title="RAM Usage"
                    value={metrics.ram}
                    unit="%"
                    icon={Activity}
                    color="from-accent to-cyan-400"
                    subtext="8GB Total Memory"
                    history={history.ram}
                />
                <MetricCard
                    title="Disk Usage"
                    value={metrics.disk}
                    unit="%"
                    icon={HardDrive}
                    color="from-warning to-orange-400"
                    subtext="/dev/sda1"
                    history={history.disk}
                />
                <MetricCard
                    title="System Uptime"
                    value={formatUptime(metrics.uptime)}
                    unit=""
                    icon={Clock}
                    color="from-success to-emerald-400"
                    subtext={`Host: ${metrics.hostname}`}
                    history={history.uptime}
                />
            </div>

            {/* Additional Info Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-surface/50 backdrop-blur-md border border-surfaceHighlight rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Server size={20} className="text-primary" />
                        System Information
                    </h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-3 bg-surfaceHighlight/20 rounded-xl">
                            <span className="text-text-secondary">Hostname</span>
                            <span className="text-white font-medium">{metrics.hostname}</span>
                        </div>
                        {metrics.networkInterfaces.length > 0 ? (
                            metrics.networkInterfaces.map((iface, index) => (
                                <div key={index} className="flex justify-between items-center p-3 bg-surfaceHighlight/20 rounded-xl">
                                    <span className="text-text-secondary">{iface.interface}</span>
                                    <span className="text-white font-medium font-mono text-sm">{iface.ip}</span>
                                </div>
                            ))
                        ) : (
                            <div className="flex justify-between items-center p-3 bg-surfaceHighlight/20 rounded-xl">
                                <span className="text-text-secondary">Network</span>
                                <span className="text-white font-medium">N/A</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-surface/50 backdrop-blur-md border border-surfaceHighlight rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Wifi size={20} className="text-accent" />
                        Network Status
                    </h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-3 bg-surfaceHighlight/20 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
                                <span className="text-text-secondary">Modbus Server</span>
                            </div>
                            <span className="text-white font-medium text-sm">Port 5020</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-surfaceHighlight/20 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
                                <span className="text-text-secondary">OPC UA Server</span>
                            </div>
                            <span className="text-white font-medium text-sm">Port 4840</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-surfaceHighlight/20 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
                                <span className="text-text-secondary">IEC104 Server</span>
                            </div>
                            <span className="text-white font-medium text-sm">Port 2404</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
