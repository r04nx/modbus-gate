import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Lock, Unlock, Signal, Smartphone, Router } from 'lucide-react';
import clsx from 'clsx';
import api from '../../services/api';

const WifiManager = () => {
    const [networks, setNetworks] = useState([]);
    const [status, setStatus] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [connecting, setConnecting] = useState(false);

    // Connection Modal State
    const [selectedNetwork, setSelectedNetwork] = useState(null);
    const [password, setPassword] = useState('');
    const [showModal, setShowModal] = useState(false);

    // Mode Selection
    const [mode, setMode] = useState('client'); // 'client' | 'ap'

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await api.get('/network/wifi/status');
            setStatus(res.data);
        } catch (e) {
            console.error("Failed to fetch wifi status", e);
        }
    };

    const scanNetworks = async () => {
        try {
            setScanning(true);
            const res = await api.get('/network/wifi/scan');
            setNetworks(res.data);
        } catch (e) {
            console.error("Scan failed", e);
        } finally {
            setScanning(false);
        }
    };

    const handleConnect = async (e) => {
        e.preventDefault();
        if (!selectedNetwork) return;

        try {
            setConnecting(true);
            await api.post('/network/wifi/connect', {
                ssid: selectedNetwork.ssid,
                password: password
            });
            setShowModal(false);
            setPassword('');
            fetchStatus();
            alert(`Connected to ${selectedNetwork.ssid}`);
        } catch (e) {
            alert(`Connection failed: ${e.response?.data?.detail || e.message}`);
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm("Are you sure you want to disconnect?")) return;
        try {
            await api.post('/network/wifi/disconnect');
            fetchStatus();
        } catch (e) {
            console.error("Disconnect failed", e);
        }
    };

    const openConnectModal = (net) => {
        setSelectedNetwork(net);
        setPassword('');
        setShowModal(true);
    };

    const renderSignalIcon = (strength) => {
        if (strength > 75) return <Wifi size={20} className="text-emerald-400" />;
        if (strength > 50) return <Wifi size={20} className="text-yellow-400" />;
        if (strength > 25) return <Wifi size={20} className="text-orange-400" />;
        return <Wifi size={20} className="text-red-400" />;
    };

    return (
        <div className="space-y-6">
            {/* Mode Selection */}
            <div className="flex bg-surfaceHighlight/20 p-1 rounded-xl w-fit">
                <button
                    onClick={() => setMode('client')}
                    className={clsx(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                        mode === 'client' ? "bg-primary text-white shadow-lg" : "text-text-secondary hover:text-white"
                    )}
                >
                    <Smartphone size={16} />
                    Client Mode
                </button>
                <button
                    disabled
                    className="px-4 py-2 rounded-lg text-sm font-medium text-text-muted flex items-center gap-2 cursor-not-allowed opacity-50"
                >
                    <Router size={16} />
                    AP Mode (Coming Soon)
                </button>
            </div>

            {mode === 'client' && (
                <>
                    {/* Current Status Card */}
                    <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-2xl p-6 border border-indigo-500/20">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-sm font-medium text-indigo-300 mb-1">Current Connection</h3>
                                {status?.connected ? (
                                    <div className="flex items-center gap-3">
                                        <div className="bg-emerald-500/20 p-2 rounded-lg">
                                            <Wifi size={24} className="text-emerald-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">{status.ssid}</h2>
                                            <div className="flex gap-4 text-xs text-text-secondary mt-1">
                                                <span>IP: {status.ip_address}</span>
                                                <span>Signal: {status.signal_strength}%</span>
                                                <span>Freq: {status.frequency}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <div className="bg-surfaceHighlight/20 p-2 rounded-lg">
                                            <WifiOff size={24} className="text-text-muted" />
                                        </div>
                                        <span className="text-text-muted font-medium">Not Connected</span>
                                    </div>
                                )}
                            </div>
                            {status?.connected && (
                                <button
                                    onClick={handleDisconnect}
                                    className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
                                >
                                    Disconnect
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Scan Section */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Available Networks</h3>
                            <button
                                onClick={scanNetworks}
                                disabled={scanning}
                                className={clsx(
                                    "px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-all",
                                    scanning
                                        ? "bg-surfaceHighlight/20 text-text-muted cursor-wait"
                                        : "bg-surfaceHighlight/30 text-white hover:bg-primary/20 hover:text-primary border border-surfaceHighlight/50"
                                )}
                            >
                                <RefreshCw size={16} className={clsx(scanning && "animate-spin")} />
                                {scanning ? "Scanning..." : "Scan Networks"}
                            </button>
                        </div>

                        <div className="bg-surfaceHighlight/10 rounded-2xl border border-surfaceHighlight/30 overflow-hidden min-h-[200px]">
                            {networks.length > 0 ? (
                                <div className="divide-y divide-surfaceHighlight/30">
                                    {networks.map((net, i) => (
                                        <div
                                            key={i}
                                            onClick={() => openConnectModal(net)}
                                            className="p-4 flex items-center justify-between hover:bg-surfaceHighlight/20 transition-colors cursor-pointer group"
                                        >
                                            <div className="flex items-center gap-4">
                                                {renderSignalIcon(net.signal)}
                                                <div>
                                                    <p className="font-medium text-white group-hover:text-primary transition-colors">{net.ssid}</p>
                                                    <p className="text-xs text-text-secondary flex items-center gap-2">
                                                        <span>{net.bssid}</span>
                                                        <span className="w-1 h-1 rounded-full bg-text-muted" />
                                                        <span>{net.bars}</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                {net.in_use && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-md">Active</span>}
                                                {net.security ? <Lock size={16} className="text-text-muted" /> : <Unlock size={16} className="text-text-muted" />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                                    <Wifi size={48} className="mb-4 opacity-20" />
                                    <p>No networks found. Try scanning.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Connect Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-surface border border-surfaceHighlight rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-bold text-white mb-4">Connect to {selectedNetwork?.ssid}</h3>
                        <form onSubmit={handleConnect}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-2">Password</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                                        placeholder="Use empty for open networks"
                                        autoFocus
                                    />
                                </div>
                                <div className="flex gap-3 justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        className="px-4 py-2 text-text-secondary hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={connecting}
                                        className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {connecting && <RefreshCw size={16} className="animate-spin" />}
                                        Connect
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WifiManager;
