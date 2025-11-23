import React, { useState, useEffect } from 'react';
import { Server, Upload, Trash2, RefreshCw } from 'lucide-react';
import axios from 'axios';

const SystemSettings = () => {
    const [hostname, setHostname] = useState('');
    const [sshEnabled, setSshEnabled] = useState(false);
    const [sshKeys, setSshKeys] = useState([]);
    const [autoUpdate, setAutoUpdate] = useState(false);
    const [repoUrl, setRepoUrl] = useState('');
    const [loading, setLoading] = useState(false);

    const API_BASE = 'http://localhost:8000/api/v1';
    const getAuthHeader = () => ({ Authorization: `Basic ${btoa('admin:admin')}` });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const [hostnameRes, sshRes, updateRes, keysRes] = await Promise.all([
                axios.get(`${API_BASE}/system/hostname`, { headers: getAuthHeader() }),
                axios.get(`${API_BASE}/system/ssh`, { headers: getAuthHeader() }),
                axios.get(`${API_BASE}/system/update`, { headers: getAuthHeader() }),
                axios.get(`${API_BASE}/system/ssh/keys`, { headers: getAuthHeader() })
            ]);
            setHostname(hostnameRes.data.hostname);
            setSshEnabled(sshRes.data.enabled);
            setAutoUpdate(updateRes.data.auto_update_enabled);
            setRepoUrl(updateRes.data.repo_url);
            setSshKeys(keysRes.data);
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        }
    };

    const handleSaveHostname = async () => {
        try {
            setLoading(true);
            await axios.put(`${API_BASE}/system/hostname`, { hostname }, { headers: getAuthHeader() });
            alert('Hostname updated successfully');
        } catch (error) {
            alert(`Failed to update hostname: ${error.response?.data?.detail || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleSSH = async () => {
        try {
            setLoading(true);
            await axios.put(`${API_BASE}/system/ssh`, { enabled: !sshEnabled }, { headers: getAuthHeader() });
            setSshEnabled(!sshEnabled);
        } catch (error) {
            alert(`Failed to toggle SSH: ${error.response?.data?.detail || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleUploadKey = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            setLoading(true);
            await axios.post(`${API_BASE}/system/ssh/keys`, formData, { headers: getAuthHeader() });
            fetchSettings();
            alert('SSH key uploaded successfully');
        } catch (error) {
            alert(`Failed to upload key: ${error.response?.data?.detail || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteKey = async (keyName) => {
        if (!confirm(`Delete SSH key "${keyName}"?`)) return;
        try {
            await axios.delete(`${API_BASE}/system/ssh/keys/${keyName}`, { headers: getAuthHeader() });
            fetchSettings();
        } catch (error) {
            alert(`Failed to delete key: ${error.response?.data?.detail || error.message}`);
        }
    };

    const handleSaveUpdate = async () => {
        try {
            setLoading(true);
            await axios.put(`${API_BASE}/system/update`, { auto_update_enabled: autoUpdate, repo_url: repoUrl }, { headers: getAuthHeader() });
            alert('Update settings saved');
        } catch (error) {
            alert(`Failed to save update settings: ${error.response?.data?.detail || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Hostname */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Server className="w-5 h-5 text-emerald-400" />
                    Hostname
                </h3>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={hostname}
                        onChange={(e) => setHostname(e.target.value)}
                        className="flex-1 bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-400 transition-colors"
                    />
                    <button
                        onClick={handleSaveHostname}
                        disabled={loading}
                        className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 px-6 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                    >
                        Save
                    </button>
                </div>
            </div>

            {/* SSH Configuration */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Server className="w-5 h-5 text-emerald-400" />
                    SSH Configuration
                </h3>
                <div className="space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer group bg-surfaceHighlight/5 rounded-xl p-4">
                        <input
                            type="checkbox"
                            checked={sshEnabled}
                            onChange={handleToggleSSH}
                            disabled={loading}
                            className="w-4 h-4 accent-emerald-400"
                        />
                        <span className="text-white group-hover:text-emerald-400 transition-colors font-medium">Enable SSH</span>
                    </label>

                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-3">SSH Keys</label>
                        <div className="space-y-2 mb-4">
                            {sshKeys.map((key) => (
                                <div key={key.name} className="flex items-center justify-between bg-surfaceHighlight/5 rounded-xl p-4 border border-surfaceHighlight/20 hover:border-surfaceHighlight/40 transition-all">
                                    <span className="text-white font-medium">{key.name}</span>
                                    <button
                                        onClick={() => handleDeleteKey(key.name)}
                                        className="text-text-muted hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            {sshKeys.length === 0 && (
                                <p className="text-text-secondary text-sm text-center py-4">No SSH keys uploaded</p>
                            )}
                        </div>
                        <label className="bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white px-4 py-3 rounded-xl cursor-pointer inline-flex items-center gap-2 transition-all">
                            <Upload className="w-4 h-4" />
                            Upload SSH Key
                            <input type="file" onChange={handleUploadKey} className="hidden" />
                        </label>
                    </div>
                </div>
            </div>

            {/* System Updates */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-emerald-400" />
                    System Updates
                </h3>
                <div className="space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer group bg-surfaceHighlight/5 rounded-xl p-4">
                        <input
                            type="checkbox"
                            checked={autoUpdate}
                            onChange={(e) => setAutoUpdate(e.target.checked)}
                            className="w-4 h-4 accent-emerald-400"
                        />
                        <span className="text-white group-hover:text-emerald-400 transition-colors font-medium">Enable Auto-Update</span>
                    </label>

                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Repository URL</label>
                        <input
                            type="text"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-400 transition-colors"
                        />
                    </div>

                    <button
                        onClick={handleSaveUpdate}
                        disabled={loading}
                        className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                    >
                        Save Update Settings
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SystemSettings;
