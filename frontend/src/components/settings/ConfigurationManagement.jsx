import React, { useState } from 'react';
import { Download, Upload, Trash2, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';

const ConfigurationManagement = () => {
    const [deleteOptions, setDeleteOptions] = useState({
        delete_tags: false,
        delete_devices: false,
        delete_servers: false,
    });
    const [showFactoryResetConfirm, setShowFactoryResetConfirm] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [overwriteMode, setOverwriteMode] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    const API_BASE = 'http://localhost:8000/api/v1';

    // Get auth header (Basic Auth)
    const getAuthHeader = () => {
        // For now, using default admin credentials
        // In production, this should come from a login system
        const credentials = btoa('admin:admin');
        return { Authorization: `Basic ${credentials}` };
    };

    const handleExport = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${API_BASE}/config/export`, {
                headers: getAuthHeader(),
            });

            // Create download link
            const blob = new Blob([JSON.stringify(response.data, null, 2)], {
                type: 'application/json',
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vistaiot-config-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            setMessage({ type: 'success', text: 'Configuration exported successfully' });
        } catch (error) {
            setMessage({ type: 'error', text: `Export failed: ${error.response?.data?.detail || error.message}` });
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (!importFile) {
            setMessage({ type: 'error', text: 'Please select a file to import' });
            return;
        }

        try {
            setLoading(true);
            const fileContent = await importFile.text();
            const configData = JSON.parse(fileContent);

            const response = await axios.post(
                `${API_BASE}/config/import`,
                {
                    data: configData.data,
                    overwrite: overwriteMode,
                },
                {
                    headers: getAuthHeader(),
                }
            );

            setMessage({ type: 'success', text: `Configuration imported: ${JSON.stringify(response.data.imported)}` });
            setShowImportModal(false);
            setImportFile(null);
        } catch (error) {
            setMessage({ type: 'error', text: `Import failed: ${error.response?.data?.detail || error.message}` });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        try {
            setLoading(true);
            const results = [];

            if (deleteOptions.delete_tags) {
                const res = await axios.delete(`${API_BASE}/config/tags`, {
                    headers: getAuthHeader(),
                });
                results.push(res.data.message);
            }

            if (deleteOptions.delete_devices) {
                const res = await axios.delete(`${API_BASE}/config/devices`, {
                    headers: getAuthHeader(),
                });
                results.push(res.data.message);
            }

            if (deleteOptions.delete_servers) {
                const res = await axios.delete(`${API_BASE}/config/servers`, {
                    headers: getAuthHeader(),
                });
                results.push(res.data.message);
            }

            setMessage({ type: 'success', text: results.join(', ') });
            setDeleteOptions({ delete_tags: false, delete_devices: false, delete_servers: false });
        } catch (error) {
            setMessage({ type: 'error', text: `Delete failed: ${error.response?.data?.detail || error.message}` });
        } finally {
            setLoading(false);
        }
    };

    const handleFactoryReset = async () => {
        try {
            setLoading(true);
            const response = await axios.post(`${API_BASE}/config/factory-reset`, {}, {
                headers: getAuthHeader(),
            });

            setMessage({ type: 'success', text: 'Factory reset completed successfully' });
            setShowFactoryResetConfirm(false);
        } catch (error) {
            setMessage({ type: 'error', text: `Factory reset failed: ${error.response?.data?.detail || error.message}` });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Message Display */}
            {message && (
                <div
                    className={`p-4 rounded-xl flex items-center gap-3 border ${message.type === 'success'
                        ? 'bg-green-500/10 border-green-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                        }`}
                >
                    {message.type === 'success' ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className="text-white">{message.text}</span>
                    <button
                        onClick={() => setMessage(null)}
                        className="ml-auto text-text-muted hover:text-white transition-colors"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Export/Import Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30 hover:border-surfaceHighlight/50 transition-all">
                    <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                        <Download className="w-5 h-5 text-blue-400" />
                        Export Configuration
                    </h3>
                    <p className="text-text-secondary text-sm mb-4">
                        Download the complete system configuration as a JSON file.
                    </p>
                    <button
                        onClick={handleExport}
                        disabled={loading}
                        className="w-full bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                    >
                        {loading ? 'Exporting...' : 'Download Configuration'}
                    </button>
                </div>

                <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30 hover:border-surfaceHighlight/50 transition-all">
                    <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                        <Upload className="w-5 h-5 text-cyan-400" />
                        Import Configuration
                    </h3>
                    <p className="text-text-secondary text-sm mb-4">
                        Upload a configuration file to restore or merge settings.
                    </p>
                    <button
                        onClick={() => setShowImportModal(true)}
                        disabled={loading}
                        className="w-full bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                    >
                        Upload Configuration
                    </button>
                </div>
            </div>

            {/* Delete Configuration Section */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-orange-400" />
                    Delete Configuration
                </h3>
                <p className="text-text-secondary text-sm mb-4">
                    Selectively delete parts of the configuration.
                </p>

                <div className="space-y-3 mb-6 bg-surfaceHighlight/5 rounded-xl p-4">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={deleteOptions.delete_tags}
                            onChange={(e) =>
                                setDeleteOptions({ ...deleteOptions, delete_tags: e.target.checked })
                            }
                            className="w-4 h-4 accent-orange-400"
                        />
                        <span className="text-white group-hover:text-orange-400 transition-colors">Delete all IO tags</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={deleteOptions.delete_devices}
                            onChange={(e) =>
                                setDeleteOptions({ ...deleteOptions, delete_devices: e.target.checked })
                            }
                            className="w-4 h-4 accent-orange-400"
                        />
                        <span className="text-white group-hover:text-orange-400 transition-colors">Delete all devices</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={deleteOptions.delete_servers}
                            onChange={(e) =>
                                setDeleteOptions({ ...deleteOptions, delete_servers: e.target.checked })
                            }
                            className="w-4 h-4 accent-orange-400"
                        />
                        <span className="text-white group-hover:text-orange-400 transition-colors">Delete all server configurations</span>
                    </label>
                </div>

                <button
                    onClick={handleDelete}
                    disabled={loading || !Object.values(deleteOptions).some(Boolean)}
                    className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                    {loading ? 'Deleting...' : 'Execute Deletion'}
                </button>
            </div>

            {/* Factory Reset Section */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-red-500/50">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    Factory Reset
                </h3>
                <p className="text-text-secondary text-sm mb-4">
                    <strong className="text-red-400">WARNING:</strong> This will delete ALL configuration data,
                    including tags, devices, server configs, and users (except the current superroot).
                </p>
                <button
                    onClick={() => setShowFactoryResetConfirm(true)}
                    disabled={loading}
                    className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                >
                    Factory Reset
                </button>
            </div>

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-surfaceHighlight/20 backdrop-blur-xl rounded-2xl p-6 max-w-md w-full mx-4 border border-surfaceHighlight/50 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-4">Import Configuration</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">
                                    Select Configuration File
                                </label>
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={(e) => setImportFile(e.target.files[0])}
                                    className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-3 py-2 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-surfaceHighlight/30 file:text-white hover:file:bg-surfaceHighlight/50 file:cursor-pointer"
                                />
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={overwriteMode}
                                    onChange={(e) => setOverwriteMode(e.target.checked)}
                                    className="w-4 h-4 accent-cyan-400"
                                />
                                <span className="text-white group-hover:text-cyan-400 transition-colors">Overwrite existing data</span>
                            </label>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => {
                                        setShowImportModal(false);
                                        setImportFile(null);
                                    }}
                                    className="flex-1 bg-surfaceHighlight/20 hover:bg-surfaceHighlight/30 text-white px-4 py-3 rounded-xl transition-all border border-surfaceHighlight/30"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleImport}
                                    disabled={!importFile || loading}
                                    className="flex-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                                >
                                    {loading ? 'Importing...' : 'Import'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Factory Reset Confirmation Modal */}
            {showFactoryResetConfirm && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-surfaceHighlight/20 backdrop-blur-xl rounded-2xl p-6 max-w-md w-full mx-4 border-2 border-red-500/50 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                            Confirm Factory Reset
                        </h3>

                        <p className="text-white mb-4">
                            Are you absolutely sure you want to perform a factory reset?
                        </p>

                        <p className="text-red-400 text-sm mb-6 bg-red-500/10 p-3 rounded-xl border border-red-500/30">
                            This action cannot be undone. All data will be permanently deleted.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowFactoryResetConfirm(false)}
                                className="flex-1 bg-surfaceHighlight/20 hover:bg-surfaceHighlight/30 text-white px-4 py-3 rounded-xl transition-all border border-surfaceHighlight/30"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleFactoryReset}
                                disabled={loading}
                                className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                            >
                                {loading ? 'Resetting...' : 'Confirm Reset'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConfigurationManagement;
