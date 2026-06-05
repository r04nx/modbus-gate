import React, { useState, useEffect } from 'react';
import { Signal, RefreshCw, Cpu, Wifi, WifiOff, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import api from '../../services/api';

const CellularManager = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    // Form state
    const [apn, setApn] = useState('');
    const [pin, setPin] = useState('');

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            setLoading(true);
            const res = await api.get('/network/cellular/status');
            setStatus(res.data);
            if (res.data?.apn && res.data.apn !== 'N/A') {
                setApn(res.data.apn);
            }
        } catch (e) {
            console.error("Failed to fetch cellular status", e);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveConfig = async (e) => {
        e.preventDefault();
        if (!apn) {
            alert('APN is required');
            return;
        }

        try {
            setSaving(true);
            const res = await api.post('/network/cellular/config', {
                apn: apn,
                pin: pin || null
            });
            alert(res.data.message || 'Cellular configuration updated successfully.');
            // Wait slightly for network restart before fetching status again
            setTimeout(fetchStatus, 3000);
        } catch (error) {
            alert(`Failed to configure cellular: ${error.response?.data?.detail || error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const getSignalPercentage = (csq) => {
        if (!csq || csq === 99) return 0;
        return Math.min(100, Math.round((csq / 31) * 100));
    };

    const renderSignalBars = (csq) => {
        const percentage = getSignalPercentage(csq);
        let colorClass = "text-red-400";
        if (percentage > 75) colorClass = "text-emerald-400";
        else if (percentage > 50) colorClass = "text-yellow-400";
        else if (percentage > 25) colorClass = "text-orange-400";

        return (
            <div className="flex items-center gap-2">
                <Signal size={20} className={colorClass} />
                <span className={clsx("font-semibold", colorClass)}>{percentage}% ({csq}/31)</span>
            </div>
        );
    };

    const getSimStatusColor = (simStatus) => {
        switch (simStatus) {
            case 'READY':
                return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
            case 'PIN_REQUIRED':
            case 'PUK_REQUIRED':
                return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
            case 'MISSING':
            default:
                return 'bg-red-500/20 text-red-400 border border-red-500/30';
        }
    };

    return (
        <div className="space-y-6">
            {/* Status Header Card */}
            <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-2xl p-6 border border-indigo-500/20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-purple-500/20 p-3 rounded-xl text-purple-400">
                            <Cpu size={24} />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-indigo-300">Modem Status</h3>
                            <h2 className="text-xl font-bold text-white">
                                {status?.device_model || 'Quectel Cellular Modem'}
                            </h2>
                        </div>
                    </div>
                    
                    <button
                        onClick={fetchStatus}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-surfaceHighlight/30 text-white hover:bg-primary/20 hover:text-primary border border-surfaceHighlight/50 rounded-xl transition-all text-sm font-medium w-fit self-start md:self-auto"
                    >
                        <RefreshCw size={16} className={clsx(loading && "animate-spin")} />
                        {loading ? "Refreshing..." : "Refresh"}
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-6 border-t border-surfaceHighlight/20 pt-6">
                    {/* Connection */}
                    <div className="space-y-1">
                        <span className="text-xs text-text-secondary">Network Connection</span>
                        <div className="flex items-center gap-2">
                            {status?.connected ? (
                                <>
                                    <Wifi size={18} className="text-emerald-400" />
                                    <span className="font-semibold text-emerald-400">Connected</span>
                                </>
                            ) : (
                                <>
                                    <WifiOff size={18} className="text-red-400" />
                                    <span className="font-semibold text-red-400">Disconnected</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Operator */}
                    <div className="space-y-1">
                        <span className="text-xs text-text-secondary">Carrier / Operator</span>
                        <p className="font-semibold text-white">{status?.operator || 'N/A'}</p>
                    </div>

                    {/* Signal */}
                    <div className="space-y-1">
                        <span className="text-xs text-text-secondary">Signal Strength</span>
                        {status ? renderSignalBars(status.signal_strength) : <p className="font-semibold text-white">N/A</p>}
                    </div>

                    {/* SIM Status */}
                    <div className="space-y-1">
                        <span className="text-xs text-text-secondary">SIM Card Status</span>
                        <div>
                            <span className={clsx("text-xs font-semibold px-2.5 py-1 rounded-md", getSimStatusColor(status?.sim_status))}>
                                {status?.sim_status || 'UNKNOWN'}
                            </span>
                        </div>
                    </div>

                    {/* IP Address */}
                    <div className="space-y-1">
                        <span className="text-xs text-text-secondary">IP Address</span>
                        <p className="font-semibold text-white">{status?.ip_address || 'N/A'}</p>
                    </div>

                    {/* Interface */}
                    <div className="space-y-1">
                        <span className="text-xs text-text-secondary">Network Interface</span>
                        <p className="font-semibold text-white">{status?.interface || 'N/A'}</p>
                    </div>
                </div>
            </div>

            {/* Config Form Card */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-purple-400" />
                    Cellular Network Configuration
                </h3>

                <form onSubmit={handleSaveConfig} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-2">APN (Access Point Name)</label>
                            <input
                                type="text"
                                value={apn}
                                onChange={(e) => setApn(e.target.value)}
                                className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-400 transition-colors"
                                placeholder="e.g. portalnmcps or internet"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-2">SIM PIN (Optional)</label>
                            <input
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-400 transition-colors"
                                placeholder="Enter PIN if required by SIM"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                    >
                        {saving && <RefreshCw size={16} className="animate-spin" />}
                        {saving ? 'Saving and Reconnecting...' : 'Save & Reconnect'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default CellularManager;
