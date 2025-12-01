import React, { useState, useEffect } from 'react';
import { Database, Wifi, WifiOff, Globe, Play, Square, ExternalLink, Activity, HardDrive, FileText, Download, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api, { getBufferingStatus, updateBufferingConfig, setManualBuffering } from '../../services/api';
import clsx from 'clsx';

const BufferingConfiguration = () => {
    // Buffering Service State
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [configLoading, setConfigLoading] = useState(false);

    // Storage Policy State
    const [policy, setPolicy] = useState({
        enabled: false,
        policy_type: 'storage',
        storage_threshold_percent: 80,
        time_value: 7,
        time_unit: 'days',
        northbound_interface: 'MQTT'
    });
    const [bufferedFiles, setBufferedFiles] = useState([]);
    const [policyLoading, setPolicyLoading] = useState(false);

    useEffect(() => {
        fetchStatus();
        fetchPolicy();
        fetchBufferedFiles();
        const interval = setInterval(fetchStatus, 2000);
        return () => clearInterval(interval);
    }, []);

    const fetchStatus = async () => {
        try {
            const { data } = await getBufferingStatus();
            setStatus(data);
        } catch (error) {
            console.error("Failed to fetch buffering status", error);
        }
    };

    const fetchPolicy = async () => {
        try {
            const res = await api.get('/storage/policy');
            setPolicy(res.data);
        } catch (error) {
            console.error('Failed to fetch policy:', error);
        }
    };

    const fetchBufferedFiles = async () => {
        try {
            const res = await api.get('/storage/buffered-files');
            setBufferedFiles(res.data);
        } catch (error) {
            console.error('Failed to fetch buffered files:', error);
        }
    };

    const handleToggleTrigger = async (key) => {
        if (!status) return;
        try {
            setConfigLoading(true);
            const newConfig = { ...status.config, [key]: !status.config[key] };
            const { data } = await updateBufferingConfig(newConfig);
            setStatus(data);
        } catch (error) {
            console.error("Failed to update config", error);
        } finally {
            setConfigLoading(false);
        }
    };

    const handleManualControl = async (action) => {
        try {
            setLoading(true);
            const { data } = await setManualBuffering(action);
            if (data.success) {
                setStatus(data.status);
            }
        } catch (error) {
            console.error("Failed to set manual buffering", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSavePolicy = async () => {
        try {
            setPolicyLoading(true);
            await api.put('/storage/policy', policy);
            alert('Storage policy updated successfully');
        } catch (error) {
            alert(`Failed to update policy: ${error.response?.data?.detail || error.message}`);
        } finally {
            setPolicyLoading(false);
        }
    };

    const handleDownloadFile = async (filename) => {
        try {
            const response = await api.get(
                `/storage/buffered-files/${filename}`,
                {
                    responseType: 'blob'
                }
            );
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            alert(`Failed to download file: ${error.response?.data?.detail || error.message}`);
        }
    };

    const handleDeleteFile = async (filename) => {
        if (!confirm(`Delete buffered file "${filename}"?`)) return;
        try {
            await api.delete(`/storage/buffered-files/${filename}`);
            fetchBufferedFiles();
        } catch (error) {
            alert(`Failed to delete file: ${error.response?.data?.detail || error.message}`);
        }
    };

    if (!status) return <div className="p-6 text-text-secondary">Loading buffering status...</div>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Status Card */}
            <div className={clsx(
                "rounded-2xl p-6 border transition-all duration-300",
                status.active
                    ? "bg-success/10 border-success/30 shadow-[0_0_20px_rgba(34,197,94,0.1)]"
                    : "bg-surfaceHighlight/10 border-surfaceHighlight/30"
            )}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={clsx(
                            "w-12 h-12 rounded-xl flex items-center justify-center",
                            status.active ? "bg-success text-white" : "bg-surfaceHighlight/30 text-text-secondary"
                        )}>
                            <Database size={24} className={status.active ? "animate-pulse" : ""} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Local Data Buffering</h3>
                            <p className={clsx("font-medium", status.active ? "text-success" : "text-text-secondary")}>
                                {status.active ? "Buffering Active - Recording Data" : "Buffering Inactive"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {status.active ? (
                            <button
                                onClick={() => handleManualControl('stop')}
                                disabled={loading}
                                className="flex items-center gap-2 bg-error hover:bg-errorHover text-white px-4 py-2 rounded-xl font-medium transition-all shadow-lg"
                            >
                                <Square size={18} fill="currentColor" />
                                Stop Recording
                            </button>
                        ) : (
                            <button
                                onClick={() => handleManualControl('start')}
                                disabled={loading}
                                className="flex items-center gap-2 bg-primary hover:bg-primaryHover text-white px-4 py-2 rounded-xl font-medium transition-all shadow-lg"
                            >
                                <Play size={18} fill="currentColor" />
                                Start Recording
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Triggers Configuration */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-400" />
                    Automatic Triggers
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Internet Trigger */}
                    <label className={clsx(
                        "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                        status.config.internet_trigger
                            ? "bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20"
                            : "bg-surfaceHighlight/5 border-surfaceHighlight/20 hover:border-surfaceHighlight/40"
                    )}>
                        <input
                            type="checkbox"
                            checked={status.config.internet_trigger}
                            onChange={() => handleToggleTrigger('internet_trigger')}
                            disabled={configLoading}
                            className="mt-1 w-5 h-5 rounded border-surfaceHighlight bg-surfaceHighlight/20 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                        />
                        <div className="flex-1">
                            <div className="flex items-center gap-2 font-medium text-white mb-1">
                                <Globe size={16} className="text-blue-400" />
                                Internet Loss
                            </div>
                            <p className="text-xs text-text-secondary">
                                Trigger when ping to 8.8.8.8 fails.
                            </p>
                            {status.triggers.internet && (
                                <div className="mt-2 text-xs font-bold text-error flex items-center gap-1">
                                    <WifiOff size={12} /> Disconnected
                                </div>
                            )}
                        </div>
                    </label>

                    {/* Gateway Trigger */}
                    <label className={clsx(
                        "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                        status.config.gateway_trigger
                            ? "bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20"
                            : "bg-surfaceHighlight/5 border-surfaceHighlight/20 hover:border-surfaceHighlight/40"
                    )}>
                        <input
                            type="checkbox"
                            checked={status.config.gateway_trigger}
                            onChange={() => handleToggleTrigger('gateway_trigger')}
                            disabled={configLoading}
                            className="mt-1 w-5 h-5 rounded border-surfaceHighlight bg-surfaceHighlight/20 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                        />
                        <div className="flex-1">
                            <div className="flex items-center gap-2 font-medium text-white mb-1">
                                <Wifi size={16} className="text-emerald-400" />
                                Gateway Loss
                            </div>
                            <p className="text-xs text-text-secondary">
                                Trigger when default gateway is unreachable.
                            </p>
                            {status.triggers.gateway && (
                                <div className="mt-2 text-xs font-bold text-error flex items-center gap-1">
                                    <WifiOff size={12} /> Disconnected
                                </div>
                            )}
                        </div>
                    </label>

                    {/* MQTT Trigger */}
                    <label className={clsx(
                        "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                        status.config.mqtt_trigger
                            ? "bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20"
                            : "bg-surfaceHighlight/5 border-surfaceHighlight/20 hover:border-surfaceHighlight/40"
                    )}>
                        <input
                            type="checkbox"
                            checked={status.config.mqtt_trigger}
                            onChange={() => handleToggleTrigger('mqtt_trigger')}
                            disabled={configLoading}
                            className="mt-1 w-5 h-5 rounded border-surfaceHighlight bg-surfaceHighlight/20 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                        />
                        <div className="flex-1">
                            <div className="flex items-center gap-2 font-medium text-white mb-1">
                                <Database size={16} className="text-orange-400" />
                                MQTT Disconnect
                            </div>
                            <p className="text-xs text-text-secondary">
                                Trigger when MQTT broker connection is lost.
                            </p>
                            {status.triggers.mqtt && (
                                <div className="mt-2 text-xs font-bold text-error flex items-center gap-1">
                                    <WifiOff size={12} /> Disconnected
                                </div>
                            )}
                        </div>
                    </label>
                </div>
            </div>

            {/* Storage Policy Configuration (Merged from DataStoragePolicy) */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-orange-400" />
                    Storage & Retention Policy
                </h3>
                <div className="space-y-6">
                    <label className="flex items-center gap-3 cursor-pointer group bg-surfaceHighlight/5 rounded-xl p-4">
                        <input
                            type="checkbox"
                            checked={policy.enabled}
                            onChange={(e) => setPolicy({ ...policy, enabled: e.target.checked })}
                            className="w-4 h-4 accent-orange-400"
                        />
                        <span className="text-white group-hover:text-orange-400 transition-colors font-medium">Enable Local Buffering Policy</span>
                    </label>

                    {policy.enabled && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Policy Type</label>
                                <select
                                    value={policy.policy_type}
                                    onChange={(e) => setPolicy({ ...policy, policy_type: e.target.value })}
                                    className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-400 transition-colors"
                                >
                                    <option value="storage">Storage-based (% full)</option>
                                    <option value="time">Time-based (days/weeks/months)</option>
                                </select>
                            </div>

                            {policy.policy_type === 'storage' && (
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-3">
                                        Storage Threshold ({policy.storage_threshold_percent}%)
                                    </label>
                                    <input
                                        type="range"
                                        min="50"
                                        max="95"
                                        value={policy.storage_threshold_percent}
                                        onChange={(e) => setPolicy({ ...policy, storage_threshold_percent: parseInt(e.target.value) })}
                                        className="w-full accent-orange-400 h-2 bg-surfaceHighlight/20 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <div className="flex justify-between text-xs text-text-muted mt-1">
                                        <span>50%</span>
                                        <span>95%</span>
                                    </div>
                                </div>
                            )}

                            {policy.policy_type === 'time' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Time Value</label>
                                        <input
                                            type="number"
                                            value={policy.time_value}
                                            onChange={(e) => setPolicy({ ...policy, time_value: parseInt(e.target.value) })}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-400 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Time Unit</label>
                                        <select
                                            value={policy.time_unit}
                                            onChange={(e) => setPolicy({ ...policy, time_unit: e.target.value })}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-400 transition-colors"
                                        >
                                            <option value="days">Days</option>
                                            <option value="weeks">Weeks</option>
                                            <option value="months">Months</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Northbound Interface</label>
                                <select
                                    value={policy.northbound_interface}
                                    onChange={(e) => setPolicy({ ...policy, northbound_interface: e.target.value })}
                                    className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-400 transition-colors"
                                >
                                    <option value="MQTT">MQTT</option>
                                    <option value="OPC_UA">OPC UA</option>
                                    <option value="IEC104">IEC 104</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleSavePolicy}
                        disabled={policyLoading}
                        className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                    >
                        {policyLoading ? 'Saving...' : 'Save Policy'}
                    </button>
                </div>
            </div>

            {/* Buffered Data Files */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-orange-400" />
                    Buffered Data Files
                </h3>

                {bufferedFiles.length === 0 ? (
                    <p className="text-text-secondary text-center py-8">No buffered data files</p>
                ) : (
                    <div className="space-y-3">
                        {bufferedFiles.map((file) => (
                            <div
                                key={file.filename}
                                className="flex items-center justify-between bg-surfaceHighlight/5 rounded-xl p-4 border border-surfaceHighlight/20 hover:border-surfaceHighlight/40 transition-all"
                            >
                                <div className="flex-1">
                                    <p className="text-white font-medium">{file.label}</p>
                                    <p className="text-text-secondary text-sm mt-1">
                                        {file.record_count} records • {file.size_mb} MB
                                        {file.is_active && <span className="text-orange-400 ml-2">• ACTIVE</span>}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleDownloadFile(file.filename)}
                                        className="p-2 bg-surfaceHighlight/20 hover:bg-surfaceHighlight/30 text-cyan-400 rounded-lg transition-all"
                                        title="Download CSV"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                    {!file.is_active && (
                                        <button
                                            onClick={() => handleDeleteFile(file.filename)}
                                            className="p-2 bg-surfaceHighlight/20 hover:bg-red-500/20 text-text-muted hover:text-red-400 rounded-lg transition-all"
                                            title="Delete File"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* View Data Link */}
            <div className="flex justify-end">
                <Link
                    to="/buffered-data"
                    className="flex items-center gap-2 text-primary hover:text-white transition-colors font-medium group"
                >
                    View Buffered Data Visualization
                    <ExternalLink size={16} className="group-hover:translate-x-1 transition-transform" />
                </Link>
            </div>
        </div>
    );
};

export default BufferingConfiguration;
