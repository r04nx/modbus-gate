import React, { useState } from 'react';
import { Download, Upload, X, AlertTriangle, CheckCircle, Info } from 'lucide-react';
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
    const [importWarnings, setImportWarnings] = useState([]);
    const [showWarnings, setShowWarnings] = useState(false);

    const handleExport = async () => {
        try {
            setLoading(true);
            const { data } = await exportConfiguration(exportOptions);

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `vistaiot-config-${new Date().toISOString().split('T')[0]}.json`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            setShowExportModal(false);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export configuration');
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const config = JSON.parse(e.target.result);
                    setImportFile(file);
                    setImportPreview(config);
                } catch (error) {
                    alert('Invalid configuration file');
                }
            };
            reader.readAsText(file);
        }
    };

    const handleImport = async () => {
        if (!importPreview) return;

        try {
            setLoading(true);
            const { data } = await importConfiguration({
                data: importPreview.data,
                ...importOptions
            });

            if (data.warnings && data.warnings.length > 0) {
                setImportWarnings(data.warnings);
                setShowWarnings(true);
            } else {
                alert('Configuration imported successfully!');
                setShowImportModal(false);
            }

            if (data.new_ip_address) {
                alert(data.reconnect_instructions || `Network changed! Reconnect to: http://${data.new_ip_address}:3000`);
            }
        } catch (error) {
            console.error('Import failed:', error);
            alert('Failed to import configuration: ' + (error.response?.data?.detail || error.message));
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
                                {importFile && (
                                    <p className="mt-2 text-sm text-success flex items-center gap-2">
                                        <CheckCircle size={16} />
                                        {importFile.name} loaded
                                    </p>
                                )}
                            </div>

                            {importPreview && (
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
                                        <Upload size={18} />
                                        {loading ? 'Importing...' : 'Import Configuration'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Warnings Modal */}
            {showWarnings && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-surface/70 backdrop-blur-xl border border-surfaceHighlight/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-surface/90 backdrop-blur-xl border-b border-surfaceHighlight/50 p-6 flex justify-between items-center z-10">
                            <h3 className="text-2xl font-bold text-white">Import Warnings</h3>
                            <button onClick={() => { setShowWarnings(false); setShowImportModal(false); }} className="text-text-muted hover:text-white transition-colors p-2 hover:bg-surfaceHighlight/30 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {importWarnings.map((warning, index) => (
                                <div
                                    key={index}
                                    className={`p-4 rounded-xl border ${warning.severity === 'critical' ? 'bg-error/10 border-error/30' :
                                            warning.severity === 'warning' ? 'bg-warning/10 border-warning/30' :
                                                'bg-info/10 border-info/30'
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        {warning.severity === 'critical' ? (
                                            <AlertTriangle className="text-error flex-shrink-0 mt-1" size={20} />
                                        ) : warning.severity === 'warning' ? (
                                            <AlertTriangle className="text-warning flex-shrink-0 mt-1" size={20} />
                                        ) : (
                                            <Info className="text-info flex-shrink-0 mt-1" size={20} />
                                        )}
                                        <div className="flex-1">
                                            <div className="font-medium text-white capitalize">{warning.type.replace('_', ' ')}</div>
                                            <div className="text-sm text-text-secondary mt-1">{warning.message}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="sticky bottom-0 bg-surface/90 backdrop-blur-xl border-t border-surfaceHighlight/50 p-6">
                            <button
                                onClick={() => { setShowWarnings(false); setShowImportModal(false); }}
                                className="w-full bg-primary hover:bg-primaryHover text-white px-6 py-3 rounded-xl font-medium transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ConfigButtons;
