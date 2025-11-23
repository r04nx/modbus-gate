import React, { useState } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { exportConfiguration, importConfiguration } from '../services/api';

const ConfigManagement = () => {
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
    const [showImportWarnings, setShowImportWarnings] = useState(false);
    const [importWarnings, setImportWarnings] = useState([]);
    const [importResult, setImportResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleExport = async () => {
        try {
            setLoading(true);
            const { data } = await exportConfiguration(exportOptions);

            // Create download
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `vistaiot-config-${new Date().toISOString().split('T')[0]}.json`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
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

            setImportResult(data);

            if (data.warnings && data.warnings.length > 0) {
                setImportWarnings(data.warnings);
                setShowImportWarnings(true);
            }

            // If network changed, show reconnect instructions
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
        { key: 'include_devices', label: 'Devices', description: 'Device configurations and connection parameters' },
        { key: 'include_tags', label: 'Tags', description: 'IO, Calculation, and User tags' },
        { key: 'include_servers', label: 'Servers', description: 'MODBUS, OPC UA, IEC-104, MQTT configurations' },
        { key: 'include_storage_policy', label: 'Storage Policy', description: 'Data retention and northbound settings' },
        { key: 'include_system_settings', label: 'System Settings', description: 'Terminal, updates, and other settings' },
        { key: 'include_users', label: 'Users', description: 'User accounts (passwords excluded)' },
        { key: 'include_ssh_keys', label: 'SSH Keys', description: 'SSH private keys (sensitive!)' },
        { key: 'include_network', label: 'Network Config', description: 'IP addresses, gateway, DHCP settings' },
        { key: 'include_hostname', label: 'Hostname', description: 'System hostname' }
    ];

    const importSections = [
        { key: 'import_devices', label: 'Devices', description: 'Import device configurations' },
        { key: 'import_tags', label: 'Tags', description: 'Import tags' },
        { key: 'import_servers', label: 'Servers', description: 'Import server configurations' },
        { key: 'import_storage_policy', label: 'Storage Policy', description: 'Import storage policy' },
        { key: 'import_system_settings', label: 'System Settings', description: 'Import system settings' },
        { key: 'import_ssh_keys', label: 'SSH Keys', description: 'Import SSH private keys' },
        { key: 'import_network', label: 'Network Config', description: 'Import network configuration (may disconnect!)' },
        { key: 'import_hostname', label: 'Hostname', description: 'Import hostname' }
    ];

    return (
        <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-xl">
                        <Download className="text-primary" size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Configuration Management</h1>
                        <p className="text-text-secondary">Export and import system configuration</p>
                    </div>
                </div>
            </div>

            {/* Export Section */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/50">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Download size={20} />
                    Export Configuration
                </h2>
                <p className="text-text-secondary text-sm mb-4">
                    Select which sections to include in the export. Exported file will be downloaded as JSON.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {exportSections.map(section => (
                        <label
                            key={section.key}
                            className="flex items-start gap-3 p-4 bg-surface/30 rounded-xl border border-surfaceHighlight/30 hover:border-primary/50 cursor-pointer transition-all"
                        >
                            <input
                                type="checkbox"
                                checked={exportOptions[section.key]}
                                onChange={() => toggleExportOption(section.key)}
                                className="mt-1 w-5 h-5 rounded border-surfaceHighlight bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                            />
                            <div className="flex-1">
                                <div className="font-medium text-white">{section.label}</div>
                                <div className="text-xs text-text-muted">{section.description}</div>
                            </div>
                        </label>
                    ))}
                </div>

                <button
                    onClick={handleExport}
                    disabled={loading || !Object.values(exportOptions).some(v => v)}
                    className="flex items-center gap-2 bg-primary hover:bg-primaryHover text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Download size={18} />
                    {loading ? 'Exporting...' : 'Export Configuration'}
                </button>
            </div>

            {/* Import Section */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/50">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Upload size={20} />
                    Import Configuration
                </h2>
                <p className="text-text-secondary text-sm mb-4">
                    Upload a configuration file and select which sections to import.
                </p>

                {/* File Upload */}
                <div className="mb-6">
                    <label className="block mb-2 text-sm font-medium text-white">
                        Configuration File
                    </label>
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

                {/* Import Preview */}
                {importPreview && (
                    <>
                        <div className="mb-6 p-4 bg-surface/30 rounded-xl border border-surfaceHighlight/30">
                            <h3 className="font-medium text-white mb-2">Configuration Preview</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                {importPreview.data.metadata?.statistics && Object.entries(importPreview.data.metadata.statistics).map(([key, value]) => (
                                    <div key={key}>
                                        <div className="text-text-muted capitalize">{key.replace('_', ' ')}</div>
                                        <div className="text-white font-medium">{value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Import Options */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                            {importSections.map(section => (
                                <label
                                    key={section.key}
                                    className="flex items-start gap-3 p-4 bg-surface/30 rounded-xl border border-surfaceHighlight/30 hover:border-primary/50 cursor-pointer transition-all"
                                >
                                    <input
                                        type="checkbox"
                                        checked={importOptions[section.key]}
                                        onChange={() => toggleImportOption(section.key)}
                                        className="mt-1 w-5 h-5 rounded border-surfaceHighlight bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                    />
                                    <div className="flex-1">
                                        <div className="font-medium text-white">{section.label}</div>
                                        <div className="text-xs text-text-muted">{section.description}</div>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {/* Overwrite Option */}
                        <label className="flex items-center gap-3 p-4 bg-warning/10 rounded-xl border border-warning/30 mb-6 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={importOptions.overwrite}
                                onChange={() => toggleImportOption('overwrite')}
                                className="w-5 h-5 rounded border-warning bg-warning/20 text-warning focus:ring-warning focus:ring-offset-0"
                            />
                            <div className="flex-1">
                                <div className="font-medium text-white flex items-center gap-2">
                                    <AlertTriangle size={16} className="text-warning" />
                                    Overwrite Existing Data
                                </div>
                                <div className="text-xs text-text-muted">
                                    If enabled, existing configurations will be replaced. If disabled, only new items will be added.
                                </div>
                            </div>
                        </label>

                        <button
                            onClick={handleImport}
                            disabled={loading || !Object.values(importOptions).slice(0, -1).some(v => v)}
                            className="flex items-center gap-2 bg-primary hover:bg-primaryHover text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Upload size={18} />
                            {loading ? 'Importing...' : 'Import Configuration'}
                        </button>
                    </>
                )}
            </div>

            {/* Import Warnings Modal */}
            {showImportWarnings && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-surface/70 backdrop-blur-xl border border-surfaceHighlight/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-surface/90 backdrop-blur-xl border-b border-surfaceHighlight/50 p-6 flex justify-between items-center z-10">
                            <h3 className="text-2xl font-bold text-white">Import Warnings</h3>
                            <button
                                onClick={() => setShowImportWarnings(false)}
                                className="text-text-muted hover:text-white transition-colors p-2 hover:bg-surfaceHighlight/30 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {importWarnings.map((warning, index) => (
                                <div
                                    key={index}
                                    className={`p-4 rounded-xl border ${warning.severity === 'critical'
                                            ? 'bg-error/10 border-error/30'
                                            : warning.severity === 'warning'
                                                ? 'bg-warning/10 border-warning/30'
                                                : 'bg-info/10 border-info/30'
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

                            {importResult?.reconnect_instructions && (
                                <div className="p-4 bg-error/10 border border-error/30 rounded-xl">
                                    <div className="font-bold text-error mb-2">⚠️ RECONNECTION REQUIRED</div>
                                    <pre className="text-sm text-white whitespace-pre-wrap font-mono">
                                        {importResult.reconnect_instructions}
                                    </pre>
                                </div>
                            )}
                        </div>

                        <div className="sticky bottom-0 bg-surface/90 backdrop-blur-xl border-t border-surfaceHighlight/50 p-6">
                            <button
                                onClick={() => setShowImportWarnings(false)}
                                className="w-full bg-primary hover:bg-primaryHover text-white px-6 py-3 rounded-xl font-medium transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConfigManagement;
