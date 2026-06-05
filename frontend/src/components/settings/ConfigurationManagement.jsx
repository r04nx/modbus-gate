import React, { useState } from 'react';
import {
    Download, Upload, Trash2, AlertTriangle, CheckCircle,
    XCircle, X, Info, FileJson, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react';
import api, { exportConfiguration, importConfiguration } from '../../services/api';

// ─── Severity badge ────────────────────────────────────────────────────────────
const SeverityBadge = ({ severity }) => {
    const map = {
        critical: 'bg-red-500/20 text-red-400 border-red-500/40',
        warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
        info: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    };
    return (
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium uppercase tracking-wide ${map[severity] || map.info}`}>
            {severity}
        </span>
    );
};

// ─── Inline status banner ──────────────────────────────────────────────────────
const StatusBanner = ({ type, message, onDismiss }) => {
    const styles = {
        success: 'bg-green-500/10 border-green-500/30 text-green-400',
        error: 'bg-red-500/10 border-red-500/30 text-red-400',
        warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    };
    const Icon = type === 'success' ? CheckCircle : type === 'warning' ? AlertTriangle : XCircle;
    return (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${styles[type]}`}>
            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span className="flex-1 text-sm whitespace-pre-wrap">{message}</span>
            {onDismiss && (
                <button onClick={onDismiss} className="opacity-60 hover:opacity-100 transition-opacity">
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};

// ─── Collapsible warning list ──────────────────────────────────────────────────
const WarningList = ({ warnings }) => {
    const [expanded, setExpanded] = useState(true);
    if (!warnings || warnings.length === 0) return null;
    const critCount = warnings.filter(w => w.severity === 'critical').length;
    const warnCount = warnings.filter(w => w.severity === 'warning').length;

    return (
        <div className="border border-surfaceHighlight/30 rounded-xl overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-surfaceHighlight/10 hover:bg-surfaceHighlight/20 transition-colors"
            >
                <span className="text-sm font-medium text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    {warnings.length} notice{warnings.length !== 1 ? 's' : ''}
                    {critCount > 0 && <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">{critCount} critical</span>}
                    {warnCount > 0 && <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">{warnCount} warning</span>}
                </span>
                {expanded ? <ChevronUp className="w-4 h-4 text-text-secondary" /> : <ChevronDown className="w-4 h-4 text-text-secondary" />}
            </button>
            {expanded && (
                <div className="divide-y divide-surfaceHighlight/10 max-h-64 overflow-y-auto">
                    {warnings.map((w, i) => (
                        <div key={i} className="px-4 py-3 flex items-start gap-3">
                            {w.severity === 'critical' ? (
                                <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                            ) : w.severity === 'warning' ? (
                                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                            ) : (
                                <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-medium text-text-secondary capitalize">{w.type?.replace(/_/g, ' ')}</span>
                                    <SeverityBadge severity={w.severity} />
                                </div>
                                <p className="text-sm text-white break-words">{w.message}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Import result summary ─────────────────────────────────────────────────────
const ImportSummary = ({ result, onClose }) => {
    const { imported, message, success, warnings } = result;
    const total = Object.values(imported).reduce((a, b) => a + b, 0);
    return (
        <div className="space-y-4">
            <StatusBanner
                type={success ? 'success' : 'error'}
                message={message}
            />

            {/* Per-category counts */}
            <div className="grid grid-cols-3 gap-3">
                {Object.entries(imported).map(([key, count]) => (
                    <div key={key} className="bg-surfaceHighlight/10 rounded-xl p-3 border border-surfaceHighlight/20 text-center">
                        <div className="text-2xl font-bold text-white">{count}</div>
                        <div className="text-xs text-text-secondary capitalize mt-1">{key.replace(/_/g, ' ')}</div>
                    </div>
                ))}
            </div>

            <WarningList warnings={warnings} />

            <button
                onClick={onClose}
                className="w-full bg-primary hover:bg-primaryHover text-white px-6 py-3 rounded-xl font-medium transition-all"
            >
                Done
            </button>
        </div>
    );
};

// ─── Export Card ───────────────────────────────────────────────────────────────
const ExportCard = () => {
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [exportErrors, setExportErrors] = useState([]);
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

    const exportSections = [
        { key: 'include_devices', label: 'Devices' },
        { key: 'include_tags', label: 'Tags' },
        { key: 'include_servers', label: 'Servers' },
        { key: 'include_storage_policy', label: 'Storage Policy' },
        { key: 'include_system_settings', label: 'System Settings' },
        { key: 'include_users', label: 'Users' },
        { key: 'include_ssh_keys', label: 'SSH Keys' },
        { key: 'include_network', label: 'Network Config' },
        { key: 'include_hostname', label: 'Hostname' }
    ];

    const handleExport = async () => {
        try {
            setLoading(true);
            setExportErrors([]);
            const { data } = await exportConfiguration(exportOptions);

            // Surface any non-fatal export errors
            const errs = data?.data?.metadata?.export_errors || [];
            if (errs.length > 0) setExportErrors(errs);

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `vistaiot-config-${new Date().toISOString().split('T')[0]}.json`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            if (errs.length === 0) setShowModal(false);
        } catch (error) {
            const msg = error.response?.data?.detail || error.message || 'Unknown error';
            setExportErrors([`Export failed: ${msg}`]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30 hover:border-surfaceHighlight/50 transition-all">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Download className="w-5 h-5 text-blue-400" />
                    Export Configuration
                </h3>
                <p className="text-text-secondary text-sm mb-4">
                    Download the complete system configuration as a JSON file.
                </p>
                <button
                    onClick={() => setShowModal(true)}
                    className="w-full bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white px-4 py-3 rounded-xl transition-all font-medium"
                >
                    Download Configuration
                </button>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-surface/70 backdrop-blur-xl border border-surfaceHighlight/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-surface/90 backdrop-blur-xl border-b border-surfaceHighlight/50 p-6 flex justify-between items-center z-10">
                            <h3 className="text-2xl font-bold text-white">Select Sections to Export</h3>
                            <button onClick={() => { setShowModal(false); setExportErrors([]); }} className="text-text-muted hover:text-white transition-colors p-2 hover:bg-surfaceHighlight/30 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {exportErrors.length > 0 && (
                                <div className="space-y-2">
                                    {exportErrors.map((e, i) => (
                                        <StatusBanner key={i} type="warning" message={e} />
                                    ))}
                                    <p className="text-xs text-text-secondary">The file was still downloaded — these are non-fatal issues.</p>
                                </div>
                            )}

                            <p className="text-text-secondary text-sm">Choose which sections to include:</p>

                            <div className="grid grid-cols-2 gap-3">
                                {exportSections.map(section => (
                                    <label key={section.key} className="flex items-center gap-3 p-3 bg-surface/30 rounded-xl border border-surfaceHighlight/30 hover:border-primary/50 cursor-pointer transition-all">
                                        <input
                                            type="checkbox"
                                            checked={exportOptions[section.key]}
                                            onChange={() => setExportOptions(prev => ({ ...prev, [section.key]: !prev[section.key] }))}
                                            className="w-4 h-4 rounded border-surfaceHighlight bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                        />
                                        <span className="text-white text-sm">{section.label}</span>
                                    </label>
                                ))}
                            </div>

                            <button
                                onClick={handleExport}
                                disabled={loading || !Object.values(exportOptions).some(v => v)}
                                className="w-full bg-primary hover:bg-primaryHover text-white px-6 py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
                                {loading ? 'Exporting...' : 'Download Configuration'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// ─── Import Card ───────────────────────────────────────────────────────────────
const ImportCard = () => {
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importPreview, setImportPreview] = useState(null);
    const [parseError, setParseError] = useState(null);
    const [result, setResult] = useState(null);
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

    const importSections = [
        { key: 'import_devices', label: 'Devices' },
        { key: 'import_tags', label: 'Tags' },
        { key: 'import_servers', label: 'Servers' },
        { key: 'import_storage_policy', label: 'Storage Policy' },
        { key: 'import_system_settings', label: 'System Settings' },
        { key: 'import_ssh_keys', label: 'SSH Keys' },
        { key: 'import_network', label: 'Network Config' },
        { key: 'import_hostname', label: 'Hostname' }
    ];

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        setParseError(null);
        setResult(null);
        setImportPreview(null);
        setImportFile(null);

        if (!file) return;

        if (!file.name.endsWith('.json')) {
            setParseError('Invalid file type — please select a .json configuration file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);
                // Validate minimum structure
                if (!config.data || typeof config.data !== 'object') {
                    setParseError('Invalid configuration file — missing "data" section. Please export a fresh copy from another gateway.');
                    return;
                }
                setImportFile(file);
                setImportPreview(config);
            } catch (error) {
                setParseError(`JSON parse error: ${error.message}. The file appears to be corrupted or not a valid JSON file.`);
            }
        };
        reader.readAsText(file);
    };

    const handleImport = async () => {
        if (!importPreview) return;

        try {
            setLoading(true);
            setResult(null);
            const { data } = await importConfiguration({
                data: importPreview.data,
                ...importOptions
            });

            setResult(data);

            if (data.new_ip_address) {
                // Show network change info inline via result warnings — no alert needed
            }
        } catch (error) {
            const rawDetail = error.response?.data?.detail;
            let msg = rawDetail || error.message || 'Unknown error occurred during import.';
            if (typeof msg === 'object') {
                msg = Array.isArray(msg)
                    ? msg.map(e => `${e.loc?.join('.') || ''}: ${e.msg}`).join('\n')
                    : JSON.stringify(msg, null, 2);
            }
            setResult({
                success: false,
                message: msg,
                imported: {},
                warnings: []
            });
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setShowModal(false);
        setImportFile(null);
        setImportPreview(null);
        setParseError(null);
        setResult(null);
    };

    // Metadata preview from file
    const fileMeta = importPreview?.data?.metadata;
    const fileStats = fileMeta?.statistics;

    return (
        <>
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30 hover:border-surfaceHighlight/50 transition-all">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Upload className="w-5 h-5 text-cyan-400" />
                    Import Configuration
                </h3>
                <p className="text-text-secondary text-sm mb-4">
                    Upload a configuration file to restore or merge settings.
                </p>
                <button
                    onClick={() => setShowModal(true)}
                    className="w-full bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white px-4 py-3 rounded-xl transition-all font-medium"
                >
                    Upload Configuration
                </button>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-surface/70 backdrop-blur-xl border border-surfaceHighlight/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-surface/90 backdrop-blur-xl border-b border-surfaceHighlight/50 p-6 flex justify-between items-center z-10">
                            <h3 className="text-2xl font-bold text-white">Import Configuration</h3>
                            <button onClick={handleClose} className="text-text-muted hover:text-white transition-colors p-2 hover:bg-surfaceHighlight/30 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">

                            {/* Show import result */}
                            {result ? (
                                <ImportSummary result={result} onClose={handleClose} />
                            ) : (
                                <>
                                    {/* File picker */}
                                    <div>
                                        <label className="block mb-2 text-sm font-medium text-white">Configuration File</label>
                                        <input
                                            type="file"
                                            accept=".json"
                                            onChange={handleFileSelect}
                                            className="block w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primaryHover cursor-pointer bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl"
                                        />
                                    </div>

                                    {/* Parse error */}
                                    {parseError && (
                                        <StatusBanner type="error" message={parseError} onDismiss={() => setParseError(null)} />
                                    )}

                                    {/* File loaded indicator + metadata */}
                                    {importFile && importPreview && (
                                        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-400" />
                                                <span className="text-sm text-green-400 font-medium">{importFile.name}</span>
                                                <span className="text-xs text-text-secondary ml-auto">v{importPreview.version || '?'}</span>
                                            </div>
                                            {fileMeta && (
                                                <div className="text-xs text-text-secondary space-y-1">
                                                    <div>Exported by <span className="text-white">{fileMeta.export_user || '?'}</span> on <span className="text-white">{fileMeta.export_timestamp?.split('T')[0] || '?'}</span></div>
                                                    {fileStats && (
                                                        <div className="flex flex-wrap gap-2 pt-1">
                                                            {Object.entries(fileStats).map(([k, v]) => (
                                                                <span key={k} className="bg-surfaceHighlight/30 px-2 py-0.5 rounded-full">
                                                                    {k.replace(/_/g, ' ')}: <strong className="text-white">{v}</strong>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {importPreview && (
                                        <>
                                            {/* Section selectors */}
                                            <div>
                                                <p className="text-sm text-text-secondary mb-3">Select sections to import:</p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {importSections.map(section => (
                                                        <label key={section.key} className="flex items-center gap-3 p-3 bg-surface/30 rounded-xl border border-surfaceHighlight/30 hover:border-primary/50 cursor-pointer transition-all">
                                                            <input
                                                                type="checkbox"
                                                                checked={importOptions[section.key]}
                                                                onChange={() => setImportOptions(prev => ({ ...prev, [section.key]: !prev[section.key] }))}
                                                                className="w-4 h-4 rounded border-surfaceHighlight bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                                            />
                                                            <span className="text-white text-sm">{section.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Overwrite toggle */}
                                            <label className="flex items-center gap-3 p-4 bg-yellow-500/10 rounded-xl border border-yellow-500/30 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={importOptions.overwrite}
                                                    onChange={() => setImportOptions(prev => ({ ...prev, overwrite: !prev.overwrite }))}
                                                    className="w-4 h-4 rounded border-yellow-500 bg-yellow-500/20 text-yellow-400 focus:ring-yellow-400 focus:ring-offset-0"
                                                />
                                                <div>
                                                    <div className="font-medium text-white text-sm flex items-center gap-2">
                                                        <AlertTriangle size={14} className="text-yellow-400" />
                                                        Overwrite Existing Data
                                                    </div>
                                                    <p className="text-xs text-text-secondary mt-0.5">
                                                        If unchecked, existing items are skipped (not overwritten).
                                                    </p>
                                                </div>
                                            </label>

                                            <button
                                                onClick={handleImport}
                                                disabled={loading}
                                                className="w-full bg-primary hover:bg-primaryHover text-white px-6 py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                {loading ? <RefreshCw size={18} className="animate-spin" /> : <Upload size={18} />}
                                                {loading ? 'Importing...' : 'Import Configuration'}
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// ─── Main component ────────────────────────────────────────────────────────────
const ConfigurationManagement = () => {
    const [deleteOptions, setDeleteOptions] = useState({
        delete_tags: false,
        delete_devices: false,
        delete_servers: false,
    });
    const [showFactoryResetConfirm, setShowFactoryResetConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [deleteResult, setDeleteResult] = useState(null);

    const handleDelete = async () => {
        try {
            setLoading(true);
            setDeleteResult(null);
            const results = [];
            const errors = [];

            if (deleteOptions.delete_tags) {
                try {
                    const res = await api.delete('/config/tags');
                    results.push(res.data.message);
                } catch (e) {
                    errors.push(`Tags: ${e.response?.data?.detail || e.message}`);
                }
            }

            if (deleteOptions.delete_devices) {
                try {
                    const res = await api.delete('/config/devices');
                    results.push(res.data.message);
                } catch (e) {
                    errors.push(`Devices: ${e.response?.data?.detail || e.message}`);
                }
            }

            if (deleteOptions.delete_servers) {
                try {
                    const res = await api.delete('/config/servers');
                    results.push(res.data.message);
                } catch (e) {
                    errors.push(`Servers: ${e.response?.data?.detail || e.message}`);
                }
            }

            setDeleteResult({ results, errors });
            if (errors.length === 0) {
                setDeleteOptions({ delete_tags: false, delete_devices: false, delete_servers: false });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleFactoryReset = async () => {
        try {
            setLoading(true);
            await api.post('/config/factory-reset');
            setMessage({ type: 'success', text: 'Factory reset completed successfully. All data has been cleared.' });
            setShowFactoryResetConfirm(false);
        } catch (error) {
            setMessage({ type: 'error', text: `Factory reset failed: ${error.response?.data?.detail || error.message}` });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Global message */}
            {message && (
                <StatusBanner
                    type={message.type}
                    message={message.text}
                    onDismiss={() => setMessage(null)}
                />
            )}

            {/* Export / Import */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ExportCard />
                <ImportCard />
            </div>

            {/* Delete Section */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-orange-400" />
                    Delete Configuration
                </h3>
                <p className="text-text-secondary text-sm mb-4">
                    Selectively delete parts of the configuration.
                </p>

                <div className="space-y-3 mb-5 bg-surfaceHighlight/5 rounded-xl p-4">
                    {[
                        { key: 'delete_tags', label: 'Delete all IO tags' },
                        { key: 'delete_devices', label: 'Delete all devices' },
                        { key: 'delete_servers', label: 'Delete all server configurations' },
                    ].map(opt => (
                        <label key={opt.key} className="flex items-center gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={deleteOptions[opt.key]}
                                onChange={(e) => setDeleteOptions({ ...deleteOptions, [opt.key]: e.target.checked })}
                                className="w-4 h-4 accent-orange-400"
                            />
                            <span className="text-white group-hover:text-orange-400 transition-colors">{opt.label}</span>
                        </label>
                    ))}
                </div>

                {/* Delete result */}
                {deleteResult && (
                    <div className="mb-4 space-y-2">
                        {deleteResult.results.map((r, i) => (
                            <StatusBanner key={i} type="success" message={r} />
                        ))}
                        {deleteResult.errors.map((e, i) => (
                            <StatusBanner key={i} type="error" message={e} />
                        ))}
                    </div>
                )}

                <button
                    onClick={handleDelete}
                    disabled={loading || !Object.values(deleteOptions).some(Boolean)}
                    className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                >
                    {loading ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    {loading ? 'Deleting...' : 'Execute Deletion'}
                </button>
            </div>

            {/* Factory Reset */}
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

            {/* Factory Reset Confirmation */}
            {showFactoryResetConfirm && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-surfaceHighlight/20 backdrop-blur-xl rounded-2xl p-6 max-w-md w-full mx-4 border-2 border-red-500/50 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                            Confirm Factory Reset
                        </h3>

                        <p className="text-white mb-3">Are you absolutely sure you want to perform a factory reset?</p>

                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-6 space-y-1">
                            <p className="text-red-400 text-sm font-medium">This action cannot be undone. This will permanently delete:</p>
                            <ul className="text-red-300 text-sm list-disc list-inside space-y-0.5 ml-1">
                                <li>All devices and IO tags</li>
                                <li>All server configurations</li>
                                <li>All users (except you)</li>
                                <li>SSH keys and system settings</li>
                            </ul>
                        </div>

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
                                className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                            >
                                {loading ? <RefreshCw size={16} className="animate-spin" /> : null}
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
