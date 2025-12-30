import React, { useState, useEffect } from 'react';
import { Network, Wifi, WifiOff } from 'lucide-react';
import clsx from 'clsx';
import api from '../../services/api';
import WifiManager from './WifiManager';

const NetworkConfiguration = () => {
    const [activeTab, setActiveTab] = useState('ethernet'); // 'ethernet' | 'wifi'
    const [interfaces, setInterfaces] = useState([]);
    const [selectedInterface, setSelectedInterface] = useState('');
    const [config, setConfig] = useState({ dhcp: true, ip_address: '', netmask: '', gateway: '' });
    const [connectivity, setConnectivity] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchInterfaces();
        testConnectivity();
    }, []);

    const fetchInterfaces = async () => {
        try {
            const res = await api.get('/network/interfaces');
            setInterfaces(res.data);
            if (res.data.length > 0) {
                setSelectedInterface(res.data[0].name);
                setConfig({
                    dhcp: res.data[0].dhcp || false,
                    ip_address: res.data[0].ip_address || '',
                    netmask: res.data[0].netmask || '',
                    gateway: res.data[0].gateway || ''
                });
            }
        } catch (error) {
            console.error('Failed to fetch interfaces:', error);
        }
    };

    const testConnectivity = async () => {
        try {
            const res = await api.get('/network/connectivity/test');
            setConnectivity(res.data);
        } catch (error) {
            console.error('Failed to test connectivity:', error);
        }
    };

    const handleInterfaceChange = (ifaceName) => {
        const iface = interfaces.find(i => i.name === ifaceName);
        if (iface) {
            setSelectedInterface(ifaceName);
            setConfig({
                dhcp: iface.dhcp || false,
                ip_address: iface.ip_address || '',
                netmask: iface.netmask || '',
                gateway: iface.gateway || ''
            });
        }
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            await api.put(`/network/${selectedInterface}`, config);
            alert('Network configuration updated successfully');
            fetchInterfaces();
        } catch (error) {
            alert(`Failed to update network: ${error.response?.data?.detail || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Connectivity Status */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Network className="w-5 h-5 text-purple-400" />
                        Internet Connectivity
                    </h3>
                    <div className="flex items-center gap-2">
                        {connectivity?.connected ? (
                            <>
                                <Wifi className="w-5 h-5 text-emerald-400" />
                                <span className="text-emerald-400 font-medium">Connected</span>
                                <span className="text-text-secondary text-sm">({connectivity.latency_ms}ms)</span>
                            </>
                        ) : (
                            <>
                                <WifiOff className="w-5 h-5 text-red-400" />
                                <span className="text-red-400 font-medium">Disconnected</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-surfaceHighlight/30 pb-4">
                <button
                    onClick={() => setActiveTab('ethernet')}
                    className={clsx(
                        "px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
                        activeTab === 'ethernet'
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                            : "text-text-secondary hover:text-white hover:bg-surfaceHighlight/10"
                    )}
                >
                    <Network size={18} />
                    Ethernet / IP
                </button>
                <button
                    onClick={() => setActiveTab('wifi')}
                    className={clsx(
                        "px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
                        activeTab === 'wifi'
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                            : "text-text-secondary hover:text-white hover:bg-surfaceHighlight/10"
                    )}
                >
                    <Wifi size={18} />
                    Wi-Fi
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'ethernet' ? (
                <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30 animate-in fade-in duration-300">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Network className="w-5 h-5 text-purple-400" />
                        Ethernet Configuration
                    </h3>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-2">Network Interface</label>
                            <select
                                value={selectedInterface}
                                onChange={(e) => handleInterfaceChange(e.target.value)}
                                className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-400 transition-colors"
                            >
                                {interfaces.map((iface) => (
                                    <option key={iface.name} value={iface.name}>
                                        {iface.name} {iface.is_up ? '(UP)' : '(DOWN)'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-6 bg-surfaceHighlight/5 rounded-xl p-4">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="radio"
                                    checked={config.dhcp}
                                    onChange={() => setConfig({ ...config, dhcp: true })}
                                    className="w-4 h-4 accent-purple-400"
                                />
                                <span className="text-white group-hover:text-purple-400 transition-colors font-medium">DHCP</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="radio"
                                    checked={!config.dhcp}
                                    onChange={() => setConfig({ ...config, dhcp: false })}
                                    className="w-4 h-4 accent-purple-400"
                                />
                                <span className="text-white group-hover:text-purple-400 transition-colors font-medium">Static</span>
                            </label>
                        </div>

                        <div className={clsx("space-y-4 transition-all duration-300", config.dhcp ? "opacity-75" : "opacity-100")}>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">IP Address</label>
                                <input
                                    type="text"
                                    value={config.ip_address}
                                    onChange={(e) => setConfig({ ...config, ip_address: e.target.value })}
                                    placeholder="192.168.1.100"
                                    disabled={config.dhcp}
                                    className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-400 transition-colors disabled:cursor-not-allowed disabled:bg-surfaceHighlight/10"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Netmask</label>
                                <input
                                    type="text"
                                    value={config.netmask}
                                    onChange={(e) => setConfig({ ...config, netmask: e.target.value })}
                                    placeholder="255.255.255.0"
                                    disabled={config.dhcp}
                                    className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-400 transition-colors disabled:cursor-not-allowed disabled:bg-surfaceHighlight/10"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Gateway (Optional)</label>
                                <input
                                    type="text"
                                    value={config.gateway}
                                    onChange={(e) => setConfig({ ...config, gateway: e.target.value })}
                                    placeholder="192.168.1.1"
                                    disabled={config.dhcp}
                                    className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-400 transition-colors disabled:cursor-not-allowed disabled:bg-surfaceHighlight/10"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="w-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                        >
                            {loading ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30 animate-in fade-in duration-300">
                    <WifiManager />
                </div>
            )}
        </div>
    );
};

export default NetworkConfiguration;
