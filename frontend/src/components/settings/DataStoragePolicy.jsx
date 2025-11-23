import React, { useState, useEffect } from 'react';
import { HardDrive, Database } from 'lucide-react';
import axios from 'axios';

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
    const [loading, setLoading] = useState(false);

    const API_BASE = 'http://localhost:8000/api/v1';
    const getAuthHeader = () => ({ Authorization: `Basic ${btoa('admin:admin')}` });

    useEffect(() => {
        fetchPolicy();
        fetchUsage();
    }, []);

    const fetchPolicy = async () => {
        try {
            const res = await axios.get(`${API_BASE}/storage/policy`, { headers: getAuthHeader() });
            setPolicy(res.data);
        } catch (error) {
            console.error('Failed to fetch policy:', error);
        }
    };

    const fetchUsage = async () => {
        try {
            const res = await axios.get(`${API_BASE}/storage/usage`, { headers: getAuthHeader() });
            setUsage(res.data);
        } catch (error) {
            console.error('Failed to fetch usage:', error);
        }
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            await axios.put(`${API_BASE}/storage/policy`, policy, { headers: getAuthHeader() });
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
                        <div className="grid grid-cols-2 gap-4">
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
                                <span className="text-text-secondary text-sm block mb-1">Database Size</span>
                                <span className="text-white font-bold text-lg">{formatBytes(usage.database_size_bytes)}</span>
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
                    Local Data Buffering
                </h3>
                <div className="space-y-6">
                    <label className="flex items-center gap-3 cursor-pointer group bg-surfaceHighlight/5 rounded-xl p-4">
                        <input
                            type="checkbox"
                            checked={policy.enabled}
                            onChange={(e) => setPolicy({ ...policy, enabled: e.target.checked })}
                            className="w-4 h-4 accent-orange-400"
                        />
                        <span className="text-white group-hover:text-orange-400 transition-colors font-medium">Enable Local Buffering</span>
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
        </div>
    );
};

export default DataStoragePolicy;
