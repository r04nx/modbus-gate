import React, { useState, useEffect } from 'react';
import { HardDrive, Database, Download, Trash2, FileText } from 'lucide-react';
import api from '../../services/api';

const DataStoragePolicy = () => {
    const [policy, setPolicy] = useState({
        enabled: false,
        policy_type: 'storage',
        storage_threshold_percent: 80,
        time_value: 7,
        time_unit: 'days',
        northbound_interface: 'MQTT'
    });
    const [usage, setUsage] = useState(null);
    const [bufferedFiles, setBufferedFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cleanupOptions, setCleanupOptions] = useState({
        journal: true,
        appLogs: true,
        apt: true
    });

    const handleDeepCleanup = async () => {
        if (!confirm("Are you sure you want to run deep system cleanup?")) return;

        try {
            setLoading(true);
            const res = await api.post('/storage/manual-cleanup', {
                clean_journal: cleanupOptions.journal,
                clean_app_logs: cleanupOptions.appLogs,
                clean_apt_cache: cleanupOptions.apt
            });

            // Update usage with result included
            setUsage(prev => ({
                ...prev,
                cleanupResult: res.data // Backend returns result details here
            }));

        } catch (error) {
            alert(`Cleanup failed: ${error.response?.data?.detail || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPolicy();
        fetchUsage();
        fetchBufferedFiles();
    }, []);

    const fetchPolicy = async () => {
        try {
            const res = await api.get('/storage/policy');
            setPolicy(res.data);
        } catch (error) {
            console.error('Failed to fetch policy:', error);
        }
    };

    const fetchUsage = async () => {
        try {
            const res = await api.get('/storage/usage');
            setUsage(res.data);
        } catch (error) {
            console.error('Failed to fetch usage:', error);
        }
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            await api.put('/storage/policy', policy);
            alert('Storage policy updated successfully');
        } catch (error) {
            alert(`Failed to update policy: ${error.response?.data?.detail || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const fetchBufferedFiles = async () => {
        try {
            const res = await api.get('/storage/buffered-files');
            setBufferedFiles(res.data);
        } catch (error) {
            console.error('Failed to fetch buffered files:', error);
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

            // Create download link
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
            fetchBufferedFiles(); // Refresh list
        } catch (error) {
            alert(`Failed to delete file: ${error.response?.data?.detail || error.message}`);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Current Storage Usage */}
            {usage && (
                <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Database className="w-5 h-5 text-orange-400" />
                        Current Storage Usage
                    </h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-surfaceHighlight/5 rounded-xl p-4">
                                <span className="text-text-secondary text-sm block mb-1">Total Space</span>
                                <span className="text-white font-bold text-lg">{formatBytes(usage.total_bytes)}</span>
                            </div>
                            <div className="bg-surfaceHighlight/5 rounded-xl p-4">
                                <span className="text-text-secondary text-sm block mb-1">Used Space</span>
                                <span className="text-white font-bold text-lg">{formatBytes(usage.used_bytes)}</span>
                            </div>
                            <div className="bg-surfaceHighlight/5 rounded-xl p-4">
                                <span className="text-text-secondary text-sm block mb-1">Free Space</span>
                                <span className="text-white font-bold text-lg">{formatBytes(usage.free_bytes)}</span>
                            </div>
                            <div className="bg-surfaceHighlight/5 rounded-xl p-4">
                                <span className="text-text-secondary text-sm block mb-1">Main DB Size</span>
                                <span className="text-white font-bold text-lg">{formatBytes(usage.database_size_bytes)}</span>
                            </div>
                            <div className="bg-surfaceHighlight/5 rounded-xl p-4 border border-pink-500/20">
                                <span className="text-text-secondary text-sm block mb-1">Buffer DB Size</span>
                                <span className="text-pink-400 font-bold text-lg">{formatBytes(usage.buffer_db_size_bytes || 0)}</span>
                            </div>
                        </div>
                        <div className="w-full bg-surfaceHighlight/20 rounded-full h-6 overflow-hidden border border-surfaceHighlight/30">
                            <div
                                className={`h-full transition-all duration-500 ${usage.percent_used > 80 ? 'bg-gradient-to-r from-red-500 to-red-600' : 'bg-gradient-to-r from-orange-500 to-orange-600'
                                    }`}
                                style={{ width: `${usage.percent_used}%` }}
                            />
                        </div>
                        <p className="text-center text-text-secondary text-sm font-medium">{usage.percent_used.toFixed(1)}% Used</p>
                    </div>
                </div>
            )}

            {/* Buffering Policy */}
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
                        onClick={handleSave}
                        disabled={loading}
                        className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                    >
                        {loading ? 'Saving...' : 'Save Policy'}
                    </button>
                </div>
            </div>

            {/* Auto-Cleanup Automation */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-orange-400" />
                    Auto-Cleanup Automation
                </h3>
                <div className="space-y-6">
                    <label className="flex items-center gap-3 cursor-pointer group bg-surfaceHighlight/5 rounded-xl p-4">
                        <input
                            type="checkbox"
                            checked={policy.auto_cleanup_enabled || false}
                            onChange={(e) => setPolicy({ ...policy, auto_cleanup_enabled: e.target.checked })}
                            className="w-4 h-4 accent-orange-400"
                        />
                        <span className="text-white group-hover:text-orange-400 transition-colors font-medium">Enable Automatic Cleanup</span>
                    </label>

                    {policy.auto_cleanup_enabled && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-3">
                                    Cleanup Threshold ({policy.cleanup_threshold || 85}%)
                                </label>
                                <input
                                    type="range"
                                    min="50"
                                    max="95"
                                    value={policy.cleanup_threshold || 85}
                                    onChange={(e) => setPolicy({ ...policy, cleanup_threshold: parseInt(e.target.value) })}
                                    className="w-full accent-orange-400 h-2 bg-surfaceHighlight/20 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-xs text-text-muted mt-1">
                                    <span>Aggressive (50%)</span>
                                    <span>Conservative (95%)</span>
                                </div>
                                <p className="text-xs text-text-muted mt-2">
                                    Cleanup will run if disk usage exceeds this percentage.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Schedule</label>
                                <select
                                    value={policy.cleanup_schedule || 'daily'}
                                    onChange={(e) => setPolicy({ ...policy, cleanup_schedule: e.target.value })}
                                    className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-400 transition-colors"
                                >
                                    <option value="daily">Daily (at 3 AM)</option>
                                    <option value="weekly">Weekly (Sundays at 3 AM)</option>
                                </select>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                    >
                        {loading ? 'Saving...' : 'Save Automation Settings'}
                    </button>
                </div>
            </div>

            {/* Deep System Cleanup (Manual) */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-red-400" />
                    Deep System Cleanup
                </h3>

                {!usage?.cleanupResult ? (
                    <div className="space-y-4">
                        <p className="text-sm text-text-secondary">
                            Select items to clean from the remote device to free up storage space.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <label className="flex items-center gap-3 p-3 bg-surfaceHighlight/5 rounded-xl cursor-pointer hover:bg-surfaceHighlight/10 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={cleanupOptions.journal}
                                    onChange={e => setCleanupOptions({ ...cleanupOptions, journal: e.target.checked })}
                                    className="w-4 h-4 accent-red-400"
                                />
                                <div>
                                    <span className="block text-white font-medium">System Journal</span>
                                    <span className="text-xs text-text-muted">Vacuum logs to 50MB</span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 bg-surfaceHighlight/5 rounded-xl cursor-pointer hover:bg-surfaceHighlight/10 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={cleanupOptions.appLogs}
                                    onChange={e => setCleanupOptions({ ...cleanupOptions, appLogs: e.target.checked })}
                                    className="w-4 h-4 accent-red-400"
                                />
                                <div>
                                    <span className="block text-white font-medium">Application Logs</span>
                                    <span className="text-xs text-text-muted">Truncate large logs</span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 bg-surfaceHighlight/5 rounded-xl cursor-pointer hover:bg-surfaceHighlight/10 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={cleanupOptions.apt}
                                    onChange={e => setCleanupOptions({ ...cleanupOptions, apt: e.target.checked })}
                                    className="w-4 h-4 accent-red-400"
                                />
                                <div>
                                    <span className="block text-white font-medium">Package Cache</span>
                                    <span className="text-xs text-text-muted">APT clean & autoremove</span>
                                </div>
                            </label>
                        </div>

                        <div className="flex gap-4 pt-2">
                            <button
                                onClick={handleDeepCleanup}
                                disabled={loading || (!cleanupOptions.journal && !cleanupOptions.appLogs && !cleanupOptions.apt)}
                                className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-6 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium w-full flex items-center justify-center gap-2"
                            >
                                {loading ? 'Cleaning System...' : (
                                    <>
                                        <Trash2 className="w-4 h-4" />
                                        Run Cleanup
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-surfaceHighlight/5 rounded-xl p-6 border border-surfaceHighlight/20 animate-in fade-in zoom-in duration-300">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 className="w-8 h-8 text-green-400" />
                            </div>
                            <h4 className="text-xl font-bold text-white mb-1">Cleanup Complete!</h4>
                            <p className="text-green-400 font-medium">
                                Successfully freed {formatBytes(usage.cleanupResult.freed_bytes)}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-surfaceHighlight/10 p-3 rounded-lg text-center">
                                <span className="text-xs text-text-muted uppercase tracking-wider">Before</span>
                                <p className="text-white font-bold">{formatBytes(usage.cleanupResult.initial_free_bytes)} Free</p>
                            </div>
                            <div className="bg-surfaceHighlight/10 p-3 rounded-lg text-center border border-green-500/20">
                                <span className="text-xs text-text-muted uppercase tracking-wider">After</span>
                                <p className="text-green-400 font-bold">{formatBytes(usage.cleanupResult.final_free_bytes)} Free</p>
                            </div>
                        </div>

                        <div className="space-y-2 mb-6">
                            <p className="text-sm font-medium text-text-secondary">Actions Taken:</p>
                            <ul className="text-sm text-text-muted space-y-1 list-disc pl-4">
                                {usage.cleanupResult.details.map((detail, i) => (
                                    <li key={i}>{detail}</li>
                                ))}
                            </ul>
                        </div>

                        <button
                            onClick={() => {
                                setUsage({ ...usage, cleanupResult: null });
                                fetchUsage();
                            }}
                            className="w-full bg-surfaceHighlight/20 hover:bg-surfaceHighlight/30 text-white px-4 py-2 rounded-lg transition-all"
                        >
                            Done
                        </button>
                    </div>
                )}
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
        </div>
    );
};

export default DataStoragePolicy;
