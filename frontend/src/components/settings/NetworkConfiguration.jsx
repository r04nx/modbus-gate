import React, { useState, useEffect } from 'react';
import { Network, Wifi, WifiOff } from 'lucide-react';
import axios from 'axios';

const NetworkConfiguration = () => {
    const [interfaces, setInterfaces] = useState([]);
    const [selectedInterface, setSelectedInterface] = useState('');
    const [config, setConfig] = useState({ dhcp: true, ip_address: '', netmask: '', gateway: '' });
    const [connectivity, setConnectivity] = useState(null);
    const [loading, setLoading] = useState(false);

    // Use dynamic API base URL instead of hardcoded localhost
    const API_HOST = window.location.hostname;
    const API_PORT = '8000';
    const API_BASE = `http://${API_HOST}:${API_PORT}/api/v1`;
    const getAuthHeader = () => ({ Authorization: `Basic ${btoa('admin:admin')}` });

    useEffect(() => {
        fetchInterfaces();
        testConnectivity();
    }, []);

    const fetchInterfaces = async () => {
        try {
            const res = await axios.get(`${API_BASE}/network/interfaces`, { headers: getAuthHeader() });
            setInterfaces(res.data);
            if (res.data.length > 0) {
                setSelectedInterface(res.data[0].name);
                setConfig({
                    dhcp: !res.data[0].ip_address,
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
            const res = await axios.get(`${API_BASE}/network/connectivity/test`, { headers: getAuthHeader() });
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
                dhcp: !iface.ip_address,
                ip_address: iface.ip_address || '',
                netmask: iface.netmask || '',
                gateway: iface.gateway || ''
            });
        }
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            await axios.put(`${API_BASE}/network/${selectedInterface}`, config, { headers: getAuthHeader() });
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

            {/* Network Configuration */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <Network className="w-5 h-5 text-purple-400" />
                    Interface Configuration
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
        </div>
    );
};

export default NetworkConfiguration;
