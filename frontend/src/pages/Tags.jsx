import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getTags, createTag, updateTag, deleteTag, getTagValues, exportTags, importTags, writeTag, getDevices } from '../services/api';
import TagForm from '../components/TagForm';
import SearchBar from '../components/common/SearchBar';
import { TableSkeleton } from '../components/common/Skeleton';
import { Plus, Tag as TagIcon, Activity, Hash, Filter, RefreshCw, Download, Upload, Edit2, Send } from 'lucide-react';
import clsx from 'clsx';
import Sparkline from '../components/Sparkline';
import PopupChart from '../components/PopupChart';
import { useToast } from '../contexts/ToastContext';

const Tags = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const deviceIdFilter = searchParams.get('deviceId');
    const [tags, setTags] = useState([]);
    const [devices, setDevices] = useState([]);
    const [devicesMap, setDevicesMap] = useState({});
    const [values, setValues] = useState({});
    const [showForm, setShowForm] = useState(false);
    const [filter, setFilter] = useState('IO');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [hoveredTag, setHoveredTag] = useState(null);
    const [hoveredTagPos, setHoveredTagPos] = useState({ x: 0, y: 0 });
    const [historyLimit, setHistoryLimit] = useState(60);

    const [showWriteModal, setShowWriteModal] = useState(false);
    const [writeTagData, setWriteTagData] = useState(null);
    const [writeValue, setWriteValue] = useState('');
    const [writing, setWriting] = useState(false);
    const showToast = useToast();

    // Multi-select State
    const [selectedTags, setSelectedTags] = useState(new Set());

    const toggleSelect = (tagId) => {
        const newSelected = new Set(selectedTags);
        if (newSelected.has(tagId)) newSelected.delete(tagId);
        else newSelected.add(tagId);
        setSelectedTags(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedTags.size === filteredTags.length && filteredTags.length > 0) {
            setSelectedTags(new Set());
        } else {
            const all = new Set(filteredTags.map(t => t.id));
            setSelectedTags(all);
        }
    };

    const deleteSelected = async () => {
        if (window.confirm(`Are you sure you want to delete ${selectedTags.size} tags?`)) {
            setLoading(true);
            let successCount = 0;
            let failCount = 0;

            for (const id of selectedTags) {
                try {
                    await deleteTag(id);
                    successCount++;
                } catch (error) {
                    console.error(`Failed to delete tag ${id}`, error);
                    failCount++;
                }
            }

            setSelectedTags(new Set());
            fetchTags();
            setLoading(false);
            showToast.success(`Deletion complete. Success: ${successCount}, Failed: ${failCount}`);
        }
    };

    const fetchTags = async () => {
        setLoading(true);
        try {
            const [tagsRes, devicesRes] = await Promise.all([getTags(), getDevices()]);
            setTags(tagsRes.data);
            setDevices(devicesRes.data);

            const map = {};
            devicesRes.data.forEach(d => map[d.id] = d.name);
            setDevicesMap(map);
        } catch (error) {
            console.error("Failed to fetch tags or devices", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchValues = async () => {
        try {
            const { data } = await getTagValues(historyLimit);
            setValues(data);
        } catch (error) {
            console.error("Failed to fetch values", error);
        }
    };

    useEffect(() => {
        fetchTags();
        fetchValues(); // Initial fetch
        const interval = setInterval(fetchValues, 1000); // Update every 1 second
        return () => clearInterval(interval);
    }, [historyLimit]);

    const handleCreate = async (tagData, isBulk = false) => {
        try {
            if (isBulk && Array.isArray(tagData)) {
                // Bulk creation: create all tags
                setLoading(true);
                let successCount = 0;
                let failCount = 0;

                for (const tag of tagData) {
                    try {
                        await createTag(tag);
                        successCount++;
                    } catch (error) {
                        console.error(`Failed to create tag ${tag.name}:`, error);
                        failCount++;
                    }
                }

                showToast.success(`Bulk creation complete! Success: ${successCount}, Failed: ${failCount}`);
                setLoading(false);
            } else {
                // Single tag creation
                await createTag(tagData);
                showToast.success('Tag created successfully');
            }

            setShowForm(false);
            fetchTags();
        } catch (error) {
            console.error("Failed to create tag", error);
            // Error handled by global interceptor
        }
    };

    const [editingTag, setEditingTag] = useState(null);

    const handleUpdate = async (tagData) => {
        try {
            await updateTag(editingTag.id, tagData);
            setShowForm(false);
            setEditingTag(null);
            fetchTags();
            showToast.success('Tag updated successfully');
        } catch (error) {
            console.error("Failed to update tag", error);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this tag?")) {
            try {
                await deleteTag(id);
                fetchTags();
                showToast.success('Tag deleted successfully');
            } catch (error) {
                console.error("Failed to delete tag", error);
            }
        }
    };

    const handleExport = async () => {
        if (filter === 'SYSTEM') {
            showToast.warning('Cannot export SYSTEM tags');
            return;
        }

        try {
            const { data } = await exportTags(filter);
            const url = window.URL.createObjectURL(new Blob([data]));
            const link = document.createElement('a');
            link.href = url;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.setAttribute('download', `tags_${filter.toLowerCase()}_${timestamp}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error("Failed to export tags", error);
            // Error handled by global interceptor
        }
    };

    const handleImport = async (event) => {
        if (filter === 'SYSTEM') {
            showToast.warning('Cannot import SYSTEM tags');
            return;
        }

        const file = event.target.files[0];
        if (!file) return;

        try {
            const { data } = await importTags(filter, file);
            showToast.success(`Import complete! Created: ${data.created}`);
            if (data.errors.length > 0) {
                // Show errors as separate toast or log
                console.error("Import errors:", data.errors);
                showToast.warning(`Import finished with ${data.errors.length} errors. Check console for details.`);
            }
            fetchTags();
        } catch (error) {
            console.error("Failed to import tags", error);
            // Error handled by global interceptor
        }

        // Reset file input
        event.target.value = '';
    };

    const handleWriteSubmit = async (e) => {
        e.preventDefault();
        if (!writeTagData) return;

        setWriting(true);
        try {
            await writeTag(writeTagData.tag_id, writeValue);
            showToast.success(`Successfully wrote value to ${writeTagData.name}`);
            setShowWriteModal(false);
            setWriteTagData(null);
            setWriteValue('');
            fetchValues(); // Refresh values immediately
        } catch (error) {
            console.error("Failed to write tag", error);
            // Error handled by global interceptor
        } finally {
            setWriting(false);
        }
    };

    const openWriteModal = (tag) => {
        setWriteTagData(tag);
        setWriteValue(values[tag.tag_id]?.value || '');
        setShowWriteModal(true);
    };

    const systemTags = Object.keys(values)
        .filter(key => key.startsWith('SYS_'))
        .map(key => ({
            id: key,
            tag_id: key,
            name: key.replace('SYS_', '').replace(/_/g, ' '),
            type: 'SYSTEM'
        }));

    let allTags = [...tags];
    if (filter === 'SYSTEM') {
        // Avoid duplicates if any
        const existingIds = new Set(allTags.map(t => t.tag_id));
        const newSysTags = systemTags.filter(t => !existingIds.has(t.tag_id));
        allTags = [...allTags, ...newSysTags];
    }

    if (deviceIdFilter) {
        allTags = allTags.filter(t => t.device_id == deviceIdFilter);
    }

    let filteredTags = allTags.filter(t => t.type === filter);

    // Apply search filter
    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredTags = filteredTags.filter(tag =>
            tag.name?.toLowerCase().includes(query) ||
            tag.tag_id?.toLowerCase().includes(query) ||
            tag.address?.toLowerCase().includes(query) ||
            tag.description?.toLowerCase().includes(query) ||
            tag.device_id?.toString().includes(query)
        );
    }

    const isNumeric = (type) => {
        if (!type) return false;
        const numericTypes = ['INT16', 'UINT16', 'INT32', 'UINT32', 'FLOAT32', 'FLOAT64', 'DOUBLE', 'BOOL', 'BOOLEAN'];
        return numericTypes.includes(type.toUpperCase()) ||
            (type === 'SYSTEM' && ['CPU_USAGE', 'RAM_USAGE', 'DISK_USAGE', 'UPTIME', 'BYTES_SENT', 'BYTES_RECV'].some(k => type.includes(k)));
    };

    // Helper to extract history values for Sparkline (just values)
    const getHistoryValues = (history) => {
        if (!history) return [];
        return history.map(h => h.value);
    };

    const handleMouseEnter = (e, tagId) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setHoveredTagPos({
            x: rect.left + rect.width / 2,
            y: rect.top
        });
        setHoveredTag(tagId);
    };

    return (
        <div className="space-y-8 relative">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Tag Management</h2>
                    <p className="text-text-secondary">Monitor and configure data points.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-surfaceHighlight/30 rounded-xl p-1 border border-surfaceHighlight/50">
                        {['IO', 'CALCULATION', 'USER', 'SYSTEM'].map(type => (
                            <button
                                key={type}
                                onClick={() => setFilter(type)}
                                className={clsx(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    filter === type ? "bg-primary text-white shadow-md" : "text-text-secondary hover:text-white"
                                )}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-3">
                        {selectedTags.size > 0 && (
                            <button
                                onClick={deleteSelected}
                                className="flex items-center gap-2 bg-error/20 hover:bg-error/30 text-error px-4 py-3 rounded-xl font-medium transition-all border border-error/30"
                            >
                                <div className="w-4 h-4"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg></div>
                                Delete {selectedTags.size}
                            </button>
                        )}
                        <button
                            onClick={handleExport}
                            disabled={filter === 'SYSTEM'}
                            className="flex items-center gap-2 bg-surfaceHighlight hover:bg-surfaceHighlight/80 text-white px-4 py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title={filter === 'SYSTEM' ? 'Cannot export system tags' : 'Export tags as CSV'}
                        >
                            <Download size={18} />
                            Export CSV
                        </button>
                        <label className="flex items-center gap-2 bg-surfaceHighlight hover:bg-surfaceHighlight/80 text-white px-4 py-3 rounded-xl font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                            <Upload size={18} />
                            Import CSV
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleImport}
                                className="hidden"
                                disabled={filter === 'ALL' || filter === 'SYSTEM'}
                            />
                        </label>
                        <button
                            onClick={() => {
                                setEditingTag(null);
                                setShowForm(true);
                                // Auto-select tag type based on current filter
                                // This will be picked up by TagForm through editTag prop
                            }}
                            className="flex items-center gap-2 bg-primary hover:bg-primaryHover text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5"
                        >
                            <Plus size={20} />
                            Add Tag
                        </button>
                    </div>
                </div>
            </div>

            {deviceIdFilter && (
                <div className="bg-primary/10 border border-primary/20 text-white px-4 py-3 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Filter size={18} className="text-primary" />
                        <span className="font-medium">Filtering by Device: <span className="font-bold text-primary">{deviceIdFilter}</span></span>
                    </div>
                    <button
                        onClick={() => setSearchParams({})}
                        className="text-sm bg-surfaceHighlight/50 hover:bg-surfaceHighlight text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                        Clear Filter
                    </button>
                </div>
            )}

            {/* Search Bar */}
            <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                onClear={() => setSearchQuery('')}
                placeholder="Search tags by name, ID, address, or device..."
                className="animate-in fade-in slide-in-from-top-2 duration-300"
            />

            <div className="bg-surface/50 backdrop-blur-md border border-surfaceHighlight rounded-2xl overflow-hidden shadow-card">
                {loading ? (
                    <div className="p-6">
                        <TableSkeleton rows={10} columns={6} />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-surfaceHighlight/30 border-b border-surfaceHighlight/50">
                                    <th className="p-4 w-10">
                                        <input
                                            type="checkbox"
                                            checked={selectedTags.size > 0 && selectedTags.size === filteredTags.length}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                        />
                                    </th>
                                    <th className="p-4 text-xs font-bold text-text-muted uppercase tracking-wider">Tag Name</th>
                                    {filter === 'IO' && (
                                        <>
                                            <th className="p-4 text-xs font-bold text-text-muted uppercase tracking-wider">Address</th>
                                            <th className="p-4 text-xs font-bold text-text-muted uppercase tracking-wider">Data Type</th>
                                        </>
                                    )}
                                    {filter === 'CALCULATION' && <th className="p-4 text-xs font-bold text-text-muted uppercase tracking-wider">Formula</th>}
                                    {filter === 'USER' && <th className="p-4 text-xs font-bold text-text-muted uppercase tracking-wider">Initial Value</th>}
                                    {filter === 'SYSTEM' && <th className="p-4 text-xs font-bold text-text-muted uppercase tracking-wider">Description</th>}
                                    {filter === 'SYSTEM' && <th className="p-4 text-xs font-bold text-text-muted uppercase tracking-wider">Description</th>}
                                    <th className="p-4 text-xs font-bold text-text-muted uppercase tracking-wider">
                                        <div className="flex items-center gap-2">
                                            Value
                                            <select
                                                value={historyLimit}
                                                onChange={(e) => setHistoryLimit(Number(e.target.value))}
                                                className="bg-surfaceHighlight/50 border border-surfaceHighlight rounded px-1 py-0.5 text-xs text-white focus:outline-none cursor-pointer hover:bg-surfaceHighlight"
                                                onClick={(e) => e.stopPropagation()}
                                                title="Sparkline Time Window"
                                            >
                                                <option value={60}>1m</option>
                                                <option value={300}>5m</option>
                                                <option value={900}>15m</option>
                                                <option value={3600}>1h</option>
                                            </select>
                                        </div>
                                    </th>
                                    <th className="p-4 text-xs font-bold text-text-muted uppercase tracking-wider">Quality</th>
                                    <th className="p-4 text-xs font-bold text-text-muted uppercase tracking-wider">Last Update</th>
                                    <th className="p-4 text-xs font-bold text-text-muted uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surfaceHighlight/30">
                                {filteredTags.map(tag => {
                                    const val = values[tag.tag_id];
                                    return (
                                        <tr key={tag.id} className={clsx(
                                            "hover:bg-surfaceHighlight/10 transition-colors group",
                                            selectedTags.has(tag.id) && "bg-primary/10"
                                        )}>
                                            <td className="p-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTags.has(tag.id)}
                                                    onChange={() => toggleSelect(tag.id)}
                                                    className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                                />
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-surfaceHighlight/30 rounded-lg text-accent group-hover:text-white transition-colors">
                                                        <TagIcon size={16} />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-white text-lg">
                                                            {tag.type === 'IO' && tag.device_id ? (
                                                                <span className="flex items-baseline gap-1">
                                                                    <span className="text-primary font-bold">{devicesMap[tag.device_id] || 'Unknown'}:</span>
                                                                    <span>{tag.name}</span>
                                                                </span>
                                                            ) : (
                                                                tag.name
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-text-muted font-mono bg-surfaceHighlight/20 px-1.5 py-0.5 rounded inline-block mt-1">
                                                            <small>ID: {tag.tag_id}</small>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            {filter === 'IO' && (
                                                <>
                                                    <td className="p-4 text-sm text-text-secondary font-mono">{tag.address}</td>
                                                    <td className="p-4 text-sm text-text-secondary">{tag.data_type}</td>
                                                </>
                                            )}
                                            {filter === 'CALCULATION' && (
                                                <td className="p-4 text-sm text-text-secondary font-mono">{tag.calculation_formula}</td>
                                            )}
                                            {filter === 'USER' && (
                                                <td className="p-4 text-sm text-text-secondary">{tag.initial_value || '-'}</td>
                                            )}
                                            {filter === 'SYSTEM' && (
                                                <td className="p-4 text-sm text-text-secondary">{tag.description || '-'}</td>
                                            )}
                                            <td className="p-4">
                                                {val?.quality === 'BAD' && val?.error_message ? (
                                                    <div className="relative group/error">
                                                        <div className="flex items-center gap-2 cursor-help">
                                                            <svg className="w-5 h-5 text-error" fill="currentColor" viewBox="0 0 20 20">
                                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                            </svg>
                                                            <span className="text-xs text-error font-semibold">ERROR</span>
                                                        </div>
                                                        <div className="fixed left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-96 max-w-[90vw] p-4 bg-slate-800 border-2 border-error rounded-xl shadow-2xl opacity-0 invisible group-hover/error:opacity-100 group-hover/error:visible transition-all duration-200 z-[100] pointer-events-none">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <svg className="w-5 h-5 text-error flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                                </svg>
                                                                <div className="text-sm font-bold text-error">Error Details</div>
                                                            </div>
                                                            <div className="text-sm text-white leading-relaxed break-words">{val.error_message}</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        className="flex items-center gap-4 relative"
                                                        onMouseEnter={(e) => handleMouseEnter(e, tag.tag_id)}
                                                        onMouseLeave={() => setHoveredTag(null)}
                                                    >
                                                        <span className="text-sm text-white font-mono min-w-[60px]">{val?.value ?? '-'}</span>

                                                        {/* Sparkline for Numeric Tags */}
                                                        {(isNumeric(tag.data_type) || !isNaN(parseFloat(val?.value))) && val?.history && val.history.length > 1 && (
                                                            <div className="w-24 h-8 opacity-70 hover:opacity-100 transition-opacity cursor-crosshair">
                                                                <Sparkline
                                                                    data={getHistoryValues(val.history)}
                                                                    width={96}
                                                                    height={32}
                                                                    color="#3b82f6"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <span className={clsx(
                                                    "text-xs font-bold",
                                                    val?.quality === 'GOOD' ? "text-success" : "text-error"
                                                )}>
                                                    {val?.quality || 'UNKNOWN'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-xs text-text-muted">
                                                {val?.timestamp ? new Date(val.timestamp).toLocaleTimeString() : '-'}
                                            </td>
                                            <td className="p-4">
                                                {tag.type !== 'SYSTEM' && (
                                                    <div className="flex gap-2">
                                                        {tag.type === 'IO' && (
                                                            <button
                                                                onClick={() => openWriteModal(tag)}
                                                                className="text-text-muted hover:text-accent transition-colors p-1"
                                                                title="Write Value"
                                                            >
                                                                <Send size={16} />
                                                            </button>
                                                        )}
                                                        {tag.type === 'USER' && tag.initial_value !== null && (
                                                            <button
                                                                onClick={async () => {
                                                                    if (confirm(`Reset ${tag.name} to initial value (${tag.initial_value})?`)) {
                                                                        try {
                                                                            await writeTag(tag.tag_id, tag.initial_value);
                                                                            fetchValues();
                                                                            showToast.success(`Reset ${tag.name} to initial value`);
                                                                        } catch (e) {
                                                                            // Error handled by global interceptor
                                                                        }
                                                                    }
                                                                }}
                                                                className="text-text-muted hover:text-warning transition-colors p-1"
                                                                title={`Reset to Initial Value (${tag.initial_value})`}
                                                            >
                                                                <RefreshCw size={16} />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                setEditingTag(tag);
                                                                setShowForm(true);
                                                            }}
                                                            className="text-text-muted hover:text-primary transition-colors p-1"
                                                            title="Edit Tag"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(tag.id)}
                                                            className="text-text-muted hover:text-error transition-colors p-1"
                                                            title="Delete Tag"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredTags.length === 0 && (
                                    <tr>
                                        <td colSpan="8" className="p-8 text-center text-text-muted">
                                            No tags found matching your filter.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Global Popup Chart (Fixed Position to avoid clipping) */}
            {hoveredTag && values[hoveredTag]?.history && (
                <div
                    className="fixed z-[100] pointer-events-none animate-in fade-in zoom-in-95 duration-200"
                    style={{
                        left: hoveredTagPos.x,
                        top: hoveredTagPos.y - 10,
                        transform: 'translate(-50%, -100%)'
                    }}
                >
                    <PopupChart
                        data={values[hoveredTag].history}
                        title={tags.find(t => t.tag_id === hoveredTag)?.name || hoveredTag}
                        width={300}
                        height={150}
                    />
                    {/* Arrow */}
                    <div className="absolute left-1/2 -translate-x-1/2 top-full -mt-1 border-8 border-transparent border-t-surfaceHighlight/50 filter drop-shadow-lg"></div>
                </div>
            )}

            {showForm && <TagForm
                onClose={() => {
                    setShowForm(false);
                    setEditingTag(null);
                }}
                onSubmit={editingTag ? handleUpdate : handleCreate}
                editTag={editingTag}
                initialType={!editingTag && filter !== 'ALL' && filter !== 'SYSTEM' ? filter : null}
            />}

            {/* Write Value Modal */}
            {showWriteModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-surface border border-surfaceHighlight rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-white mb-4">Write to Tag</h3>

                        <div className="bg-surfaceHighlight/20 rounded-xl p-4 mb-6 space-y-3">
                            <div>
                                <div className="text-xs text-text-secondary uppercase tracking-wider font-bold mb-1">Tag Details</div>
                                <div className="text-white font-medium text-lg">{writeTagData?.name}</div>
                                <div className="text-xs text-text-muted font-mono">{writeTagData?.tag_id}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-surfaceHighlight/30">
                                <div>
                                    <div className="text-xs text-text-secondary mb-0.5">Device ID</div>
                                    <div className="text-sm text-white font-mono">{writeTagData?.device_id}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-text-secondary mb-0.5">Address</div>
                                    <div className="text-sm text-white font-mono">{writeTagData?.address}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-text-secondary mb-0.5">Data Type</div>
                                    <div className="text-sm text-accent font-mono">{writeTagData?.data_type || 'UNKNOWN'}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-text-secondary mb-0.5">Current Value</div>
                                    <div className="text-sm text-white font-mono">{values[writeTagData?.tag_id]?.value ?? '-'}</div>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleWriteSubmit}>
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-text-secondary mb-3">
                                    New Value
                                </label>

                                {/* Dynamic Input Rendering */}
                                {(writeTagData?.data_type === 'BOOL' ||
                                    writeTagData?.params?.register_type === 'COIL' ||
                                    writeTagData?.data_type === 'BOOLEAN') ? (
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setWriteValue('1')}
                                            className={clsx(
                                                "flex-1 py-3 rounded-xl font-bold transition-all border-2",
                                                writeValue == '1' || writeValue === true || writeValue === 'true'
                                                    ? "bg-success/20 border-success text-success shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                                                    : "bg-surfaceHighlight/30 border-transparent text-text-muted hover:bg-surfaceHighlight/50"
                                            )}
                                        >
                                            ON (1)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setWriteValue('0')}
                                            className={clsx(
                                                "flex-1 py-3 rounded-xl font-bold transition-all border-2",
                                                writeValue == '0' || writeValue === false || writeValue === 'false'
                                                    ? "bg-error/20 border-error text-error shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                                                    : "bg-surfaceHighlight/30 border-transparent text-text-muted hover:bg-surfaceHighlight/50"
                                            )}
                                        >
                                            OFF (0)
                                        </button>
                                    </div>
                                ) : (
                                    <input
                                        type={['INT16', 'UINT16', 'INT32', 'UINT32', 'FLOAT32', 'FLOAT64', 'DOUBLE'].includes(writeTagData?.data_type) ? "number" : "text"}
                                        value={writeValue}
                                        onChange={(e) => setWriteValue(e.target.value)}
                                        className="w-full px-4 py-3 bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors font-mono text-lg"
                                        placeholder="Enter value..."
                                        autoFocus
                                        step="any"
                                    />
                                )}
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowWriteModal(false)}
                                    className="px-4 py-2 text-text-secondary hover:text-white transition-colors"
                                    disabled={writing}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2 bg-primary hover:bg-primaryHover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-primary/20"
                                    disabled={writing}
                                >
                                    {writing ? (
                                        <>
                                            <RefreshCw size={16} className="animate-spin" />
                                            Writing...
                                        </>
                                    ) : (
                                        'Write Value'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Tags;
