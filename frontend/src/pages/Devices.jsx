import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDevices, deleteDevice, createDevice, updateDevice, testDeviceConnection, exportDevices, importDevices } from '../services/api';
import DeviceForm from '../components/DeviceForm';
import TestConnectionModal from '../components/TestConnectionModal';
import DeviceImportAnalysisModal from '../components/DeviceImportAnalysisModal';
import { Plus, Trash2, Server, Power, Activity, Loader2, Upload, Download } from 'lucide-react';
import clsx from 'clsx';
import { CardSkeleton } from '../components/common/Skeleton';
import { useToast } from '../contexts/ToastContext';

const Devices = () => {
    const navigate = useNavigate();
    const [devices, setDevices] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [importLoading, setImportLoading] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importAnalysis, setImportAnalysis] = useState(null);
    const [importErrors, setImportErrors] = useState([]);
    const importInputRef = useRef(null);
    const [testModalOpen, setTestModalOpen] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [editingDevice, setEditingDevice] = useState(null);
    const showToast = useToast();

    const fetchDevices = async () => {
        setLoading(true);
        try {
            const { data } = await getDevices();
            setDevices(data);
        } catch (error) {
            console.error('Failed to fetch devices', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDevices(); }, []);

    const handleCreate = async (deviceData) => {
        try {
            await createDevice(deviceData);
            setShowForm(false);
            fetchDevices();
            showToast.success('Device created successfully');
        } catch (error) {
            console.error('Failed to create device', error);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this device?')) {
            try {
                await deleteDevice(id);
                fetchDevices();
                showToast.success('Device deleted successfully');
            } catch (error) {
                console.error('Failed to delete device', error);
            }
        }
    };

    const handleToggle = async (e, device) => {
        e.stopPropagation();
        try {
            setDevices(devices.map(d => d.id === device.id ? { ...d, enabled: !d.enabled } : d));
            await updateDevice(device.id, { enabled: !device.enabled });
            showToast.success(`Device ${!device.enabled ? 'enabled' : 'disabled'}`);
        } catch (error) {
            console.error('Failed to update device status', error);
            fetchDevices();
        }
    };

    const handleUpdate = async (deviceData) => {
        try {
            await updateDevice(editingDevice.id, deviceData);
            setShowForm(false);
            setEditingDevice(null);
            fetchDevices();
            showToast.success('Device updated successfully');
        } catch (error) {
            console.error('Failed to update device', error);
        }
    };

    const openTestModal = (e, device) => {
        e.stopPropagation();
        setSelectedDevice(device);
        setTestModalOpen(true);
    };

    // ── CSV Export ────────────────────────────────────────────────────────
    const handleExport = async () => {
        try {
            const { data } = await exportDevices();
            const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'devices.csv';
            a.click();
            URL.revokeObjectURL(url);
            showToast.success('Devices exported successfully');
        } catch (error) {
            console.error('Export failed', error);
            showToast.error('Export failed. Please try again.');
        }
    };

    // ── CSV Import ────────────────────────────────────────────────────────
    const handleImportFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = ''; // allow re-selecting same file

        // Basic client-side validations
        if (!file.name.endsWith('.csv')) {
            showToast.error('Invalid file type. Please upload a .csv file.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast.error('File too large. Maximum allowed size is 5 MB.');
            return;
        }

        setImportFile(file);
        setImportLoading(true);
        try {
            const { data } = await importDevices(file, false, true); // dry_run=true
            if (data.analysis) {
                setImportAnalysis(data.analysis);
                setImportErrors(data.errors || []);
            } else {
                showToast.error('Server returned an unexpected response during analysis.');
                setImportFile(null);
            }
        } catch (error) {
            // Extract meaningful error from response
            const detail = error?.response?.data?.detail;
            let message = 'Failed to analyse CSV file.';
            if (typeof detail === 'string') {
                message = detail;
            } else if (detail?.errors?.length) {
                message = `CSV has ${detail.errors.length} error(s). First: ${detail.errors[0]}`;
            }
            showToast.error(message);
            setImportFile(null);
        } finally {
            setImportLoading(false);
        }
    };

    const handleConfirmImport = async (replace) => {
        if (!importFile) return;
        setImportAnalysis(null);
        setImportLoading(true);
        try {
            const { data } = await importDevices(importFile, replace, false);
            const parts = [`Created: ${data.created}`, `Updated: ${data.updated}`, `Deleted: ${data.deleted || 0}`];
            const msg = `Import complete! ${parts.join(', ')}`;
            if ((data.errors || []).length > 0) {
                showToast.warning(`${msg}. ${data.errors.length} row(s) had errors and were skipped.`);
            } else {
                showToast.success(msg);
            }
            fetchDevices();
        } catch (error) {
            const detail = error?.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : 'Import failed. Please check your CSV and try again.';
            showToast.error(message);
        } finally {
            setImportLoading(false);
            setImportFile(null);
            setImportErrors([]);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Devices</h2>
                    <p className="text-text-secondary">Manage your industrial connections and polling targets.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-text-secondary hover:text-white px-4 py-3 rounded-xl font-medium transition-all border border-surfaceHighlight/50"
                        title="Export all devices as CSV"
                    >
                        <Download size={18} />
                        Export CSV
                    </button>

                    <button
                        onClick={() => importInputRef.current?.click()}
                        disabled={importLoading}
                        className="flex items-center gap-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-text-secondary hover:text-white px-4 py-3 rounded-xl font-medium transition-all border border-surfaceHighlight/50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Import devices from CSV"
                    >
                        {importLoading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                        Import CSV
                    </button>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleImportFileSelect}
                    />

                    <button
                        onClick={() => { setEditingDevice(null); setShowForm(true); }}
                        className="flex items-center gap-2 bg-primary hover:bg-primaryHover text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5"
                    >
                        <Plus size={20} />
                        Add Device
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {devices.map(device => (
                        <div
                            key={device.id}
                            onClick={() => navigate(`/tags?deviceId=${device.id}`)}
                            className="bg-surface/50 backdrop-blur-md border border-surfaceHighlight rounded-2xl p-6 shadow-card hover:shadow-glow transition-all duration-300 group cursor-pointer"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-surfaceHighlight/30 rounded-xl text-accent group-hover:text-white group-hover:bg-accent/20 transition-colors">
                                    <Server size={24} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={(e) => handleToggle(e, device)}
                                        className={clsx('p-2 rounded-lg transition-colors', device.enabled ? 'text-success bg-success/10 hover:bg-success/20' : 'text-text-muted bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50')}
                                        title={device.enabled ? 'Disable Device' : 'Enable Device'}
                                    >
                                        <Power size={18} />
                                    </button>
                                    <button
                                        onClick={(e) => openTestModal(e, device)}
                                        className="text-primary hover:text-white bg-primary/10 hover:bg-primary transition-colors p-2 rounded-lg"
                                        title="Test Connection"
                                    >
                                        <Activity size={18} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setEditingDevice(device); setShowForm(true); }}
                                        className="text-text-muted hover:text-primary transition-colors p-2 hover:bg-surfaceHighlight/30 rounded-lg"
                                        title="Edit Device"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(device.id); }}
                                        className="text-text-muted hover:text-error transition-colors p-2 hover:bg-surfaceHighlight/30 rounded-lg"
                                        title="Delete Device"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            <h3 className="text-xl font-bold text-white mb-1">{device.name}</h3>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="px-2 py-1 rounded-md bg-surfaceHighlight/50 text-xs font-medium text-text-secondary border border-surfaceHighlight">{device.type}</span>
                                <span className={clsx('text-xs font-medium', device.enabled ? 'text-success' : 'text-text-muted')}>{device.enabled ? 'Active' : 'Disabled'}</span>
                            </div>

                            <div className="space-y-2 text-sm text-text-secondary bg-surfaceHighlight/10 p-4 rounded-xl border border-surfaceHighlight/20 mb-4">
                                {device.type === 'MODBUS_TCP' && (<>
                                    <div className="flex justify-between"><span>Host:</span> <span className="text-white">{device.connection_params.host}</span></div>
                                    <div className="flex justify-between"><span>Port:</span> <span className="text-white">{device.connection_params.port}</span></div>
                                    <div className="flex justify-between"><span>Slave ID:</span> <span className="text-white">{device.connection_params.slave_id}</span></div>
                                </>)}
                                {device.type === 'MODBUS_RTU' && (<>
                                    <div className="flex justify-between"><span>Port:</span> <span className="text-white">{device.connection_params.port}</span></div>
                                    <div className="flex justify-between"><span>Baud:</span> <span className="text-white">{device.connection_params.baudrate}</span></div>
                                    <div className="flex justify-between"><span>Slave ID:</span> <span className="text-white">{device.connection_params.slave_id}</span></div>
                                </>)}
                                {device.type === 'OPC_UA' && (
                                    <div className="flex justify-between"><span>URL:</span> <span className="text-white truncate max-w-[150px]">{device.connection_params.url}</span></div>
                                )}
                                {device.type === 'SNMP' && (<>
                                    <div className="flex justify-between"><span>Host:</span> <span className="text-white">{device.connection_params.host}</span></div>
                                    <div className="flex justify-between"><span>Community:</span> <span className="text-white">{device.connection_params.community}</span></div>
                                </>)}
                                {device.type === 'IEC104' && (<>
                                    <div className="flex justify-between"><span>Host:</span> <span className="text-white">{device.connection_params.host}</span></div>
                                    <div className="flex justify-between"><span>Port:</span> <span className="text-white">{device.connection_params.port}</span></div>
                                </>)}
                            </div>
                        </div>
                    ))}

                    {devices.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center h-64 text-text-muted border-2 border-dashed border-surfaceHighlight rounded-2xl">
                            <Server size={48} className="mb-4 opacity-20" />
                            <p>No devices configured yet.</p>
                            <button onClick={() => setShowForm(true)} className="text-primary hover:underline mt-2">Add your first device</button>
                        </div>
                    )}
                </div>
            )}

            {showForm && (
                <DeviceForm
                    onClose={() => { setShowForm(false); setEditingDevice(null); }}
                    onSubmit={editingDevice ? handleUpdate : handleCreate}
                    editDevice={editingDevice}
                />
            )}

            <TestConnectionModal
                isOpen={testModalOpen}
                onClose={() => setTestModalOpen(false)}
                device={selectedDevice}
                testFn={testDeviceConnection}
            />

            {importAnalysis && (
                <DeviceImportAnalysisModal
                    analysis={importAnalysis}
                    errors={importErrors}
                    onClose={() => { setImportAnalysis(null); setImportFile(null); setImportErrors([]); }}
                    onConfirm={handleConfirmImport}
                />
            )}
        </div>
    );
};

export default Devices;
