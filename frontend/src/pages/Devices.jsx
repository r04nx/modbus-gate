import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDevices, deleteDevice, createDevice, updateDevice, testDeviceConnection, exportDevices, importDevices, getDevicesHealth } from '../services/api';
import DeviceForm from '../components/DeviceForm';
import TestConnectionModal from '../components/TestConnectionModal';
import DiagnosticsModal from '../components/DiagnosticsModal';
import DeviceImportAnalysisModal from '../components/DeviceImportAnalysisModal';
import { Plus, Trash2, Server, Power, Activity, Loader2, Upload, Download, LayoutGrid, List, CheckSquare, Edit2, Grid3X3, Clock, Tag, AlertTriangle, Terminal } from 'lucide-react';
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
    
    // UX Enhancements
    const [viewMode, setViewMode] = useState('grid');
    const [selectedDeviceIds, setSelectedDeviceIds] = useState(new Set());
    const [deviceStats, setDeviceStats] = useState({});
    const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);

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

    const fetchHealth = async () => {
        try {
            const { data } = await getDevicesHealth();
            setDeviceStats(data);
        } catch (error) {
            console.error('Failed to fetch health status', error);
        }
    };

    useEffect(() => { 
        fetchDevices(); 
        fetchHealth();
        const interval = setInterval(fetchHealth, 5000);
        return () => clearInterval(interval);
    }, []);

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
                setSelectedDeviceIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
                fetchDevices();
                showToast.success('Device deleted successfully');
            } catch (error) {
                console.error('Failed to delete device', error);
            }
        }
    };

    const handleBulkDelete = async () => {
        if (selectedDeviceIds.size === 0) return;
        if (window.confirm(`Are you sure you want to delete ${selectedDeviceIds.size} devices?`)) {
            try {
                // Delete in series or parallel. For safety, parallel is fast.
                await Promise.all(Array.from(selectedDeviceIds).map(id => deleteDevice(id)));
                setSelectedDeviceIds(new Set());
                fetchDevices();
                showToast.success(`${selectedDeviceIds.size} devices deleted successfully`);
            } catch (error) {
                console.error('Failed to perform bulk delete', error);
                showToast.error('Some devices could not be deleted');
                fetchDevices();
            }
        }
    };

    const toggleSelection = (e, id) => {
        e.stopPropagation();
        setSelectedDeviceIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedDeviceIds.size === devices.length && devices.length > 0) {
            setSelectedDeviceIds(new Set());
        } else {
            setSelectedDeviceIds(new Set(devices.map(d => d.id)));
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

    const openDiagnostics = (e, device) => {
        e.stopPropagation();
        setSelectedDevice(device);
        setDiagnosticsModalOpen(true);
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

    const StatusDot = ({ deviceId }) => {
        const stats = deviceStats[deviceId] || { status: 'UNKNOWN' };
        const status = stats.status;
        const lastError = stats.last_error;
        const avgResp = stats.avg_response_time || 0;
        const tagCount = stats.tag_count || 0;

        let color = 'bg-text-muted';
        if (status === 'OK') color = 'bg-success';
        else if (status === 'ERROR') color = 'bg-error';
        else if (status === 'BACKOFF') color = 'bg-warning';

        return (
            <div className="absolute top-3 right-3 z-20 group/status">
                <div className={clsx("w-2.5 h-2.5 rounded-full shadow-lg transition-transform hover:scale-150 cursor-help", color, status !== 'UNKNOWN' && 'animate-pulse')} />
                
                {/* Custom Tooltip - Fully opaque background */}
                <div className="absolute top-0 right-full mr-3 w-64 p-4 bg-[#1e293b] border border-surfaceHighlight rounded-2xl shadow-2xl opacity-0 group-hover/status:opacity-100 pointer-events-none transition-all duration-200 z-[100] translate-x-2 group-hover/status:translate-x-0 border-opacity-100">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Device Health</span>
                        <span className={clsx("px-2 py-0.5 rounded text-[10px] font-bold", 
                            status === 'OK' ? "bg-success/20 text-success" : 
                            status === 'BACKOFF' ? "bg-warning/20 text-warning" : "bg-error/20 text-error"
                        )}>
                            {status}
                        </span>
                    </div>
                    
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-text-muted flex items-center gap-1.5"><Clock size={12}/> Latency</span>
                            <span className="text-white font-medium">{avgResp > 0 ? `${(avgResp * 1000).toFixed(1)}ms` : '---'}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-text-muted flex items-center gap-1.5"><Tag size={12}/> Active Tags</span>
                            <span className="text-white font-medium">{tagCount}</span>
                        </div>
                        {lastError && (
                            <div className="mt-3 pt-3 border-t border-surfaceHighlight/50">
                                <span className="text-[10px] font-bold text-error/80 uppercase block mb-1 flex items-center gap-1">
                                    <AlertTriangle size={10}/> Last Error
                                </span>
                                <p className="text-[11px] text-text-secondary leading-relaxed italic line-clamp-2">
                                    "{lastError}"
                                </p>
                            </div>
                        )}
                    </div>
                    
                    {/* Tooltip Arrow */}
                    <div className="absolute top-3 left-full -translate-y-1/2 border-8 border-transparent border-l-[#1e293b]" />
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Devices</h2>
                    <p className="text-text-secondary">Manage your industrial connections and polling targets.</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Bulk Actions */}
                    {selectedDeviceIds.size > 0 && (
                        <div className="flex items-center gap-2 bg-error/10 border border-error/20 px-3 py-1.5 rounded-xl mr-2 animate-in fade-in slide-in-from-right-4">
                            <span className="text-sm font-medium text-error flex items-center gap-2">
                                <CheckSquare size={16} /> {selectedDeviceIds.size} Selected
                            </span>
                            <button
                                onClick={handleBulkDelete}
                                className="ml-2 text-xs bg-error hover:bg-red-500 text-white px-3 py-1.5 rounded-lg transition-colors font-bold shadow-lg shadow-error/20"
                            >
                                Delete
                            </button>
                            <button
                                onClick={() => setSelectedDeviceIds(new Set())}
                                className="text-xs text-text-muted hover:text-white px-2 py-1.5 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    )}

                    {/* View Toggles */}
                    <div className="flex bg-surfaceHighlight/30 rounded-xl p-1 border border-surfaceHighlight/50 mr-2">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={clsx('p-2 rounded-lg transition-all', viewMode === 'grid' ? 'bg-surfaceHighlight text-white shadow-sm' : 'text-text-muted hover:text-white')}
                            title="Grid View"
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('compact')}
                            className={clsx('p-2 rounded-lg transition-all', viewMode === 'compact' ? 'bg-surfaceHighlight text-white shadow-sm' : 'text-text-muted hover:text-white')}
                            title="Compact View"
                        >
                            <Grid3X3 size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={clsx('p-2 rounded-lg transition-all', viewMode === 'list' ? 'bg-surfaceHighlight text-white shadow-sm' : 'text-text-muted hover:text-white')}
                            title="List View"
                        >
                            <List size={18} />
                        </button>
                    </div>

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
            ) : viewMode === 'grid' ? (
                // GRID VIEW - Compact 4-col layout
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {devices.map(device => (
                        <div
                            key={device.id}
                            onClick={() => navigate(`/tags?deviceId=${device.id}`)}
                            className={clsx(
                                "backdrop-blur-md border rounded-2xl p-4 shadow-card hover:shadow-glow transition-all duration-300 group cursor-pointer relative",
                                selectedDeviceIds.has(device.id) ? "bg-primary/5 border-primary/50 ring-1 ring-primary/30" : "bg-surface/50 border-surfaceHighlight"
                            )}
                        >
                            {/* Status Dot in top-right */}
                            <StatusDot deviceId={device.id} />
                            {/* Checkbox */}
                            <div 
                                onClick={(e) => toggleSelection(e, device.id)}
                                className={clsx(
                                    "absolute top-4 left-4 w-5 h-5 rounded border flex items-center justify-center transition-colors z-10",
                                    selectedDeviceIds.has(device.id) ? "bg-primary border-primary text-white" : "border-surfaceHighlight/50 bg-black/20 text-transparent hover:border-text-secondary"
                                )}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </div>

                            <div className="flex justify-between items-start mb-2 pl-6">
                                <div className="p-2 bg-surfaceHighlight/30 rounded-lg text-accent group-hover:text-white group-hover:bg-accent/20 transition-colors">
                                    <Server size={20} />
                                </div>
                            </div>

                            <h3 className="text-xl font-bold text-white mb-1 pl-8">{device.name}</h3>
                            <div className="flex items-center gap-2 mb-4 pl-8">
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

                            {/* Actions Footer */}
                            <div className="mt-auto pt-3 border-t border-surfaceHighlight/30 flex items-center justify-between">
                                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Actions</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={(e) => handleToggle(e, device)}
                                        className={clsx('p-1.5 rounded-lg transition-colors', device.enabled ? 'text-success bg-success/10 hover:bg-success/20' : 'text-text-muted bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50')}
                                        title={device.enabled ? 'Disable Device' : 'Enable Device'}
                                    >
                                        <Power size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => openDiagnostics(e, device)}
                                        className="text-primary hover:text-white bg-primary/10 hover:bg-primary transition-colors p-1.5 rounded-lg"
                                        title="Diagnostics"
                                    >
                                        <Terminal size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => openTestModal(e, device)}
                                        className="text-accent hover:text-white bg-accent/10 hover:bg-accent transition-colors p-1.5 rounded-lg"
                                        title="Test Connection"
                                    >
                                        <Activity size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setEditingDevice(device); setShowForm(true); }}
                                        className="text-text-muted hover:text-primary transition-colors p-1.5 hover:bg-surfaceHighlight/30 rounded-lg"
                                        title="Edit Device"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(device.id); }}
                                        className="text-text-muted hover:text-error transition-colors p-1.5 hover:bg-surfaceHighlight/30 rounded-lg"
                                        title="Delete Device"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
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
            ) : viewMode === 'compact' ? (
                // COMPACT VIEW
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {devices.map(device => (
                        <div
                            key={device.id}
                            onClick={() => navigate(`/tags?deviceId=${device.id}`)}
                            className={clsx(
                                "backdrop-blur-md border rounded-xl p-3 shadow-sm hover:shadow-glow transition-all duration-200 group cursor-pointer relative flex flex-col items-center text-center",
                                selectedDeviceIds.has(device.id) ? "bg-primary/5 border-primary/40" : "bg-surface/40 border-surfaceHighlight/50 hover:bg-surfaceHighlight/20"
                            )}
                        >
                            <div className="flex justify-between w-full mb-2">
                                <StatusDot deviceId={device.id} />
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => openDiagnostics(e, device)} className="text-primary hover:text-white p-1 rounded hover:bg-primary/20"><Terminal size={12} /></button>
                                    <button onClick={(e) => { e.stopPropagation(); setEditingDevice(device); setShowForm(true); }} className="text-text-muted hover:text-primary p-1 rounded hover:bg-surfaceHighlight/50"><Edit2 size={12} /></button>
                                </div>
                            </div>
                            <Server size={20} className="text-accent mb-2 group-hover:scale-110 transition-transform" />
                            <h4 className="text-xs font-bold text-white truncate w-full">{device.name}</h4>
                            <span className="text-[9px] text-text-muted uppercase tracking-tighter mt-1">{device.type}</span>
                        </div>
                    ))}
                </div>
            ) : (
                // LIST VIEW
                <div className="bg-surfaceHighlight/10 rounded-2xl border border-surfaceHighlight/30 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-surfaceHighlight/20 text-text-secondary font-medium border-b border-surfaceHighlight/30">
                                <tr>
                                    <th className="px-5 py-4 w-12 text-center">
                                        <div 
                                            onClick={handleSelectAll}
                                            className={clsx(
                                                "w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer",
                                                selectedDeviceIds.size === devices.length && devices.length > 0 ? "bg-primary border-primary text-white" : "border-surfaceHighlight/50 bg-black/20 text-transparent hover:border-text-secondary"
                                            )}
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                    </th>
                                    <th className="px-4 py-4">Name</th>
                                    <th className="px-4 py-4">Type</th>
                                    <th className="px-4 py-4">Status</th>
                                    <th className="px-4 py-4">Endpoint/Host</th>
                                    <th className="px-4 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surfaceHighlight/10">
                                {devices.map(device => (
                                    <tr 
                                        key={device.id} 
                                        onClick={() => navigate(`/tags?deviceId=${device.id}`)}
                                        className={clsx(
                                            "hover:bg-surfaceHighlight/5 transition-colors cursor-pointer",
                                            selectedDeviceIds.has(device.id) && "bg-primary/5"
                                        )}
                                    >
                                        <td className="px-5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                            <div 
                                                onClick={(e) => toggleSelection(e, device.id)}
                                                className={clsx(
                                                    "w-5 h-5 mx-auto rounded border flex items-center justify-center transition-colors cursor-pointer",
                                                    selectedDeviceIds.has(device.id) ? "bg-primary border-primary text-white" : "border-surfaceHighlight/50 bg-black/20 text-transparent hover:border-text-secondary"
                                                )}
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-white flex items-center gap-3">
                                            <div className="p-1.5 bg-surfaceHighlight/30 text-accent rounded-md"><Server size={14}/></div>
                                            <StatusDot deviceId={device.id} />
                                            {device.name}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 rounded-md bg-surfaceHighlight/50 text-[11px] font-bold text-text-secondary border border-surfaceHighlight">{device.type}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={clsx('text-[11px] font-bold px-2 py-1 rounded-md', device.enabled ? 'bg-success/10 text-success' : 'bg-surfaceHighlight/30 text-text-muted')}>
                                                {device.enabled ? 'Active' : 'Disabled'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-text-secondary font-mono text-xs">
                                            {device.connection_params.host || device.connection_params.url || 'Serial'}
                                            {device.connection_params.port ? `:${device.connection_params.port}` : ''}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={(e) => handleToggle(e, device)}
                                                    className={clsx('p-1.5 rounded-lg transition-colors', device.enabled ? 'text-success hover:bg-success/10' : 'text-text-muted hover:bg-surfaceHighlight/30')}
                                                    title={device.enabled ? 'Disable Device' : 'Enable Device'}
                                                >
                                                    <Power size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => openDiagnostics(e, device)}
                                                    className="text-primary hover:text-white hover:bg-primary transition-colors p-1.5 rounded-lg"
                                                    title="Diagnostics"
                                                >
                                                    <Terminal size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => openTestModal(e, device)}
                                                    className="text-accent hover:text-white hover:bg-accent transition-colors p-1.5 rounded-lg"
                                                    title="Test Connection"
                                                >
                                                    <Activity size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setEditingDevice(device); setShowForm(true); }}
                                                    className="text-text-muted hover:text-primary transition-colors p-1.5 hover:bg-surfaceHighlight/30 rounded-lg"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(device.id); }}
                                                    className="text-text-muted hover:text-error transition-colors p-1.5 hover:bg-surfaceHighlight/30 rounded-lg"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {devices.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="text-center py-12 text-text-muted">
                                            <Server size={32} className="mx-auto mb-3 opacity-20" />
                                            No devices configured yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
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

            <DiagnosticsModal
                isOpen={diagnosticsModalOpen}
                onClose={() => setDiagnosticsModalOpen(false)}
                device={selectedDevice}
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
