import React, { useEffect, useState } from 'react';
import { getTagValues, getServerConfig } from '../services/api';
import { Cpu, HardDrive, Activity, Clock, Wifi, Server } from 'lucide-react';
import Sparkline from '../components/Sparkline';
import clsx from 'clsx';

const Dashboard = () => {
    // ... existing state ...

    const [serverStatus, setServerStatus] = useState({
        modbus: false,
        opcua: false,
        iec104: false
    });

    useEffect(() => {
        const fetchServerStatus = async () => {
            try {
                const [modbus, opcua, iec104] = await Promise.all([
                    getServerConfig('MODBUS_SERVER'),
                    getServerConfig('OPC_UA_SERVER'),
                    getServerConfig('IEC104_SERVER')
                ]);

                setServerStatus({
                    modbus: modbus.data.enabled,
                    opcua: opcua.data.enabled,
                    iec104: iec104.data.enabled
                });
            } catch (error) {
                console.error("Failed to fetch server status", error);
            }
        };

        fetchServerStatus();
        const interval = setInterval(fetchServerStatus, 5000); // Check every 5 seconds
        return () => clearInterval(interval);
    }, []);

    // ... existing useEffect for metrics ...

    return (
        <div className="space-y-8">
            {/* ... existing content ... */}

            {/* Additional Info Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ... System Information card ... */}

                <div className="bg-surface/50 backdrop-blur-md border border-surfaceHighlight rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Wifi size={20} className="text-accent" />
                        Server Status
                    </h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-3 bg-surfaceHighlight/20 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className={clsx("w-2 h-2 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.6)]", serverStatus.modbus ? "bg-emerald-400 animate-pulse" : "bg-red-500")} />
                                <span className="text-text-secondary">Modbus Server</span>
                            </div>
                            <span className="text-white font-medium text-sm">Port 5020</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-surfaceHighlight/20 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className={clsx("w-2 h-2 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.6)]", serverStatus.opcua ? "bg-emerald-400 animate-pulse" : "bg-red-500")} />
                                <span className="text-text-secondary">OPC UA Server</span>
                            </div>
                            <span className="text-white font-medium text-sm">Port 4840</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-surfaceHighlight/20 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className={clsx("w-2 h-2 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.6)]", serverStatus.iec104 ? "bg-emerald-400 animate-pulse" : "bg-red-500")} />
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
