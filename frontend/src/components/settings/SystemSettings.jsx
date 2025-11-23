import React, { useState, useEffect } from 'react';
import { Server, Upload, Trash2, RefreshCw, GitBranch, Download, CheckCircle, AlertCircle, Terminal, X, Info } from 'lucide-react';
import axios from 'axios';
import { exportConfiguration, importConfiguration } from '../../services/api';

const SystemSettings = () => {
    const [hostname, setHostname] = useState('');
    const [sshEnabled, setSshEnabled] = useState(false);
    const [sshKeys, setSshKeys] = useState([]);
    const [autoUpdate, setAutoUpdate] = useState(false);
    const [autoBranch, setAutoBranch] = useState('production');
    const [repoUrl, setRepoUrl] = useState('');
    const [lastUpdateCheck, setLastUpdateCheck] = useState(null);
    const [lastUpdateStatus, setLastUpdateStatus] = useState(null);
    const [repoInfo, setRepoInfo] = useState(null);
    const [updateCheckResult, setUpdateCheckResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [terminalEnabled, setTerminalEnabled] = useState(false);

    // Configuration Export/Import states
    const [showExportModal, setShowExportModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [exportOptions, setExportOptions] = useState({
        include_devices: true,
        include_tags: true,
        include_servers: true,
        include_storage_policy: true,
        include_system_settings: true,
        include_users: true,
        include_ssh_keys: true,
        include_network: true,
        include_hostname: true
    });
    const [importOptions, setImportOptions] = useState({
        import_devices: true,
        import_tags: true,
        import_servers: true,
        import_storage_policy: true,
        import_system_settings: true,
        import_ssh_keys: true,
        import_network: true,
        import_hostname: true,
        overwrite: false
    });
    const [importFile, setImportFile] = useState(null);
    const [importPreview, setImportPreview] = useState(null);
    const [importWarnings, setImportWarnings] = useState([]);

    // Use dynamic API base URL instead of hardcoded localhost
    const API_HOST = window.location.hostname;
    const API_PORT = '8000';
    const API_BASE = `http://${API_HOST}:${API_PORT}/api/v1`;
    const getAuthHeader = () => ({ Authorization: `Basic ${btoa('admin:admin')}` });

    useEffect(() => {
        fetchSettings();
        fetchRepoInfo();
    }, []);

    const fetchSettings = async () => {
        try {
            const [hostnameRes, sshRes, updateRes, keysRes, terminalRes] = await Promise.all([
                axios.get(`${API_BASE}/system/hostname`, { headers: getAuthHeader() }),
                axios.get(`${API_BASE}/system/ssh`, { headers: getAuthHeader() }),
                axios.get(`${API_BASE}/system/update`, { headers: getAuthHeader() }),
                axios.get(`${API_BASE}/system/ssh/keys`, { headers: getAuthHeader() }),
                axios.get(`${API_BASE}/system/terminal`, { headers: getAuthHeader() })
            ]);
            setHostname(hostnameRes.data.hostname);
            setSshEnabled(sshRes.data.enabled);
            setAutoUpdate(updateRes.data.auto_update_enabled);
            setAutoBranch(updateRes.data.auto_update_branch || 'production');
            setRepoUrl(updateRes.data.repo_url);
            setLastUpdateCheck(updateRes.data.last_update_check);
            setLastUpdateStatus(updateRes.data.last_update_status);
            setSshKeys(keysRes.data);
            setTerminalEnabled(terminalRes.data.enabled);
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        }
    };

    const fetchRepoInfo = async () => {
        try {
            const res = await axios.get(`${API_BASE}/system/update/repository-info`, { headers: getAuthHeader() });
            setRepoInfo(res.data);
        } catch (error) {
            console.error('Failed to fetch repo info:', error);
        }
    };

    const handleCheckForUpdates = async () => {
        try {
            setLoading(true);
            const res = await axios.post(`${API_BASE}/system/update/check`, {}, { headers: getAuthHeader() });
            setUpdateCheckResult(res.data);
            fetchSettings(); // Refresh to get updated last_check time
        } catch (error) {
            alert(`Failed to check for updates: ${error.response?.data?.detail || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleTriggerUpdate = async () => {
        if (!confirm('This will update the system and may restart services. Continue?')) return;

        try {
            setUpdating(true);
            const res = await axios.post(`${API_BASE}/system/update/trigger`, {}, { headers: getAuthHeader() });

            if (res.data.success) {
                alert('Update completed successfully!\n\n' + res.data.message);
            } else {
                alert('Update failed:\n\n' + res.data.message);
            }

            fetchSettings();
            fetchRepoInfo();
        } catch (error) {
            alert(`Failed to trigger update: ${error.response?.data?.detail || error.message}`);
        } finally {
            setUpdating(false);
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
            await axios.put(`${API_BASE}/system/update`, {
                auto_update_enabled: autoUpdate,
                auto_update_branch: autoBranch,
                repo_url: repoUrl
            }, { headers: getAuthHeader() });
            alert('Update settings saved');
            fetchSettings();
        } catch (error) {
            alert(`Failed to save update settings: ${error.response?.data?.detail || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleTerminal = async () => {
        try {
            setLoading(true);
            await axios.put(`${API_BASE}/system/terminal`, { enabled: !terminalEnabled }, { headers: getAuthHeader() });
            setTerminalEnabled(!terminalEnabled);
            alert('Terminal setting updated. Please refresh the page to see changes in navigation.');
        } catch (error) {
            alert(`Failed to toggle terminal: ${error.response?.data?.detail || error.message}`);
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

            {/* Terminal Configuration */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-emerald-400" />
                    Terminal Access
                </h3>
                <div className="space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer group bg-surfaceHighlight/5 rounded-xl p-4">
                        <input
                            type="checkbox"
                            checked={terminalEnabled}
                            onChange={handleToggleTerminal}
                            disabled={loading}
                            className="w-4 h-4 accent-emerald-400"
                        />
                        <span className="text-white group-hover:text-emerald-400 transition-colors font-medium">Enable Web Terminal</span>
                    </label>
                    <p className="text-text-secondary text-sm px-4">
                        <AlertCircle className="w-4 h-4 inline mr-2 text-orange-400" />
                        Enabling this feature provides root shell access via the web interface. Use with caution.
                    </p>
                </div>
            </div>

            {/* System Updates */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-emerald-400" />
                    System Updates
                </h3>
                <div className="space-y-4">
                    {/* Repository Info */}
                    {repoInfo && repoInfo.available && (
                        <div className="bg-surfaceHighlight/5 rounded-xl p-4 border border-surfaceHighlight/20">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-text-secondary">Current Branch:</span>
                                    <span className="text-white ml-2 font-medium">{repoInfo.current_branch}</span>
                                </div>
                                <div>
                                    <span className="text-text-secondary">Commit:</span>
                                    <span className="text-white ml-2 font-mono">{repoInfo.current_commit}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <label className="flex items-center gap-3 cursor-pointer group bg-surfaceHighlight/5 rounded-xl p-4">
                        <input
                            type="checkbox"
                            checked={autoUpdate}
                            onChange={(e) => setAutoUpdate(e.target.checked)}
                            className="w-4 h-4 accent-emerald-400"
                        />
                        <span className="text-white group-hover:text-emerald-400 transition-colors font-medium">Enable Auto-Update on Startup</span>
                    </label>

                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Git Branch</label>
                        <input
                            type="text"
                            value={autoBranch}
                            onChange={(e) => setAutoBranch(e.target.value)}
                            placeholder="production"
                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-400 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Repository URL</label>
                        <input
                            type="text"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-400 transition-colors"
                        />
                    </div>

                    {/* Update Check Result */}
                    {updateCheckResult && (
                        <div className={`bg-surfaceHighlight/5 rounded-xl p-4 border ${updateCheckResult.has_updates ? 'border-emerald-500/30' : 'border-surfaceHighlight/20'} animate-in fade-in slide-in-from-top-2 duration-300`}>
                            <div className="flex items-center gap-2">
                                {updateCheckResult.has_updates ? (
                                    <Download className="w-5 h-5 text-emerald-400" />
                                ) : (
                                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                                )}
                                <span className="text-white font-medium">{updateCheckResult.message}</span>
                            </div>
                        </div>
                    )}

                    {/* Last Update Status */}
                    {lastUpdateStatus && (
                        <div className="bg-surfaceHighlight/5 rounded-xl p-4 border border-surfaceHighlight/20">
                            <p className="text-text-secondary text-sm mb-1">Last Update:</p>
                            <p className="text-white text-sm font-mono whitespace-pre-wrap">{lastUpdateStatus.substring(0, 200)}{lastUpdateStatus.length > 200 ? '...' : ''}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={handleCheckForUpdates}
                            disabled={loading || updating}
                            className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Check for Updates
                        </button>
                        <button
                            onClick={handleTriggerUpdate}
                            disabled={loading || updating}
                            className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                        >
                            <Download className={`w-4 h-4 ${updating ? 'animate-bounce' : ''}`} />
                            {updating ? 'Updating...' : 'Update Now'}
                        </button>
                    </div>

                    <button
                        onClick={handleSaveUpdate}
                        disabled={loading || updating}
                        className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                    >
                        Save Update Settings
                    </button>
                </div>
            </div>
        </div >
    );
};

export default SystemSettings;
