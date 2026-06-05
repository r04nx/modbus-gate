import React, { useState } from 'react';
import { Download, Upload, X, AlertTriangle, CheckCircle, Info, XCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { exportConfiguration, importConfiguration } from '../../services/api';

const ConfigButtons = () => {
    const [showExportModal, setShowExportModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [loading, setLoading] = useState(false);

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
    const [importResult, setImportResult] = useState(null);
    const [parseError, setParseError] = useState(null);
    const [exportErrors, setExportErrors] = useState([]);

    const handleExport = async () => {
        try {
            setLoading(true);
            setExportErrors([]);
            const { data } = await exportConfiguration(exportOptions);

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

            if (errs.length === 0) setShowExportModal(false);
        } catch (error) {
            setExportErrors([`Export failed: ${error.response?.data?.detail || error.message}`]);
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        setParseError(null);
        setImportResult(null);
        setImportPreview(null);
        setImportFile(null);
        if (!file) return;
        if (!file.name.endsWith('.json')) {
            setParseError('Please select a .json configuration file.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);
                if (!config.data || typeof config.data !== 'object') {
                    setParseError('Invalid configuration file — missing "data" section.');
                    return;
                }
                setImportFile(file);
                setImportPreview(config);
            } catch (error) {
                setParseError(`JSON parse error: ${error.message}`);
            }
        };
        reader.readAsText(file);
    };

    const handleImport = async () => {
        if (!importPreview) return;
        try {
            setLoading(true);
            setImportResult(null);
            const { data } = await importConfiguration({
                data: importPreview.data,
                ...importOptions
            });
            setImportResult(data);
        } catch (error) {
            const rawDetail = error.response?.data?.detail;
            let msg = rawDetail || error.message || 'Unknown error';
            if (typeof msg === 'object') msg = JSON.stringify(msg, null, 2);
            setImportResult({ success: false, message: msg, imported: {}, warnings: [] });
        } finally {
            setLoading(false);
        }
    };

    const toggleExportOption = (key) => {
        setExportOptions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleImportOption = (key) => {
        setImportOptions(prev => ({ ...prev, [key]: !prev[key] }));
    };

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

    return (
        <>
            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => setShowExportModal(true)}
                    className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 px-4 py-3 rounded-xl transition-all font-medium flex items-center justify-center gap-2"
                >
                    <Download className="w-4 h-4" />
                    Download Config
                </button>
                <button
                    onClick={() => setShowImportModal(true)}
                    className="bg-accent/20 hover:bg-accent/30 text-accent border border-accent/30 px-4 py-3 rounded-xl transition-all font-medium flex items-center justify-center gap-2"
                >
                    <Upload className="w-4 h-4" />
                    Upload Config
                </button>
            </div>

            {/* Export Modal */}
            {showExportModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-surface/70 backdrop-blur-xl border border-surfaceHighlight/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-surface/90 backdrop-blur-xl border-b border-surfaceHighlight/50 p-6 flex justify-between items-center z-10">
                            <h3 className="text-2xl font-bold text-white">Download Configuration</h3>
                            <button onClick={() => setShowExportModal(false)} className="text-text-muted hover:text-white transition-colors p-2 hover:bg-surfaceHighlight/30 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <p className="text-text-secondary text-sm">Select which sections to include in the export:</p>

                            {exportErrors.length > 0 && (
                                <div className="space-y-2">
                                    {exportErrors.map((e, i) => (
                                        <div key={i} className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-sm text-yellow-400">
                                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                            <span>{e}</span>
                                        </div>
                                    ))}
                                    <p className="text-xs text-text-secondary">File was still downloaded — these are non-fatal issues.</p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                {exportSections.map(section => (
                                    <label key={section.key} className="flex items-center gap-3 p-3 bg-surface/30 rounded-xl border border-surfaceHighlight/30 hover:border-primary/50 cursor-pointer transition-all">
                                        <input
                                            type="checkbox"
                                            checked={exportOptions[section.key]}
                                            onChange={() => toggleExportOption(section.key)}
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
                                <Download size={18} />
                                {loading ? 'Exporting...' : 'Download Configuration'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-surface/70 backdrop-blur-xl border border-surfaceHighlight/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-surface/90 backdrop-blur-xl border-b border-surfaceHighlight/50 p-6 flex justify-between items-center z-10">
                            <h3 className="text-2xl font-bold text-white">Upload Configuration</h3>
                            <button onClick={() => setShowImportModal(false)} className="text-text-muted hover:text-white transition-colors p-2 hover:bg-surfaceHighlight/30 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block mb-2 text-sm font-medium text-white">Configuration File</label>
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileSelect}
                                    className="block w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primaryHover cursor-pointer bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl"
                                />
                            </div>

                            {parseError && (
                                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
                                    <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>{parseError}</span>
                                </div>
                            )}

                            {importFile && importPreview && !importResult && (
                                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-sm text-green-400">
                                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>{importFile.name} — v{importPreview.version || '?'}, exported {importPreview.data?.metadata?.export_timestamp?.split('T')[0] || '?'}</span>
                                </div>
                            )}

                            {/* Import result summary */}
                            {importResult && (
                                <div className={`p-4 rounded-xl border space-y-3 ${importResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                                    <div className="flex items-center gap-2">
                                        {importResult.success
                                            ? <CheckCircle className="w-5 h-5 text-green-400" />
                                            : <XCircle className="w-5 h-5 text-red-400" />}
                                        <span className="text-white font-medium text-sm">{importResult.message}</span>
                                    </div>
                                    {importResult.imported && Object.keys(importResult.imported).length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(importResult.imported).map(([k, v]) => (
                                                <span key={k} className="text-xs bg-surfaceHighlight/30 px-2 py-1 rounded-full text-white">
                                                    {k.replace(/_/g, ' ')}: <strong>{v}</strong>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {importResult.warnings?.length > 0 && (
                                        <div className="max-h-48 overflow-y-auto space-y-1">
                                            {importResult.warnings.map((w, i) => (
                                                <div key={i} className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
                                                    w.severity === 'critical' ? 'bg-red-500/10 text-red-300' :
                                                    w.severity === 'warning' ? 'bg-yellow-500/10 text-yellow-300' : 'bg-blue-500/10 text-blue-300'
                                                }`}>
                                                    {w.severity === 'critical' ? <XCircle className="w-3 h-3 flex-shrink-0 mt-0.5" /> :
                                                     w.severity === 'warning' ? <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> :
                                                     <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />}
                                                    <span>{w.message}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <button onClick={() => setShowImportModal(false)} className="w-full bg-primary hover:bg-primaryHover text-white px-4 py-2 rounded-lg text-sm font-medium transition-all">
                                        Done
                                    </button>
                                </div>
                            )}

                            {importPreview && !importResult && (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        {importSections.map(section => (
                                            <label key={section.key} className="flex items-center gap-3 p-3 bg-surface/30 rounded-xl border border-surfaceHighlight/30 hover:border-primary/50 cursor-pointer transition-all">
                                                <input
                                                    type="checkbox"
                                                    checked={importOptions[section.key]}
                                                    onChange={() => toggleImportOption(section.key)}
                                                    className="w-4 h-4 rounded border-surfaceHighlight bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                                />
                                                <span className="text-white text-sm">{section.label}</span>
                                            </label>
                                        ))}
                                    </div>

                                    <label className="flex items-center gap-3 p-3 bg-warning/10 rounded-xl border border-warning/30 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={importOptions.overwrite}
                                            onChange={() => toggleImportOption('overwrite')}
                                            className="w-4 h-4 rounded border-warning bg-warning/20 text-warning focus:ring-warning focus:ring-offset-0"
                                        />
                                        <div>
                                            <div className="font-medium text-white text-sm flex items-center gap-2">
                                                <AlertTriangle size={14} className="text-warning" />
                                                Overwrite Existing Data
                                            </div>
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
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ConfigButtons;
