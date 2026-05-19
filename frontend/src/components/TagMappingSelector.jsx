import React, { useState, useEffect, useMemo } from 'react';
import {
    XCircle, Search, ChevronDown, ChevronRight, CheckCircle,
    Tag, Server, Cpu, Database, Activity, Settings, Layers
} from 'lucide-react';
import clsx from 'clsx';
import { getTags, getDevices } from '../services/api';

const TagMappingSelector = ({ isOpen, onClose, onSelect, mappedTags = [], title = "Select Tags" }) => {
    const [tags, setTags] = useState([]);
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTags, setSelectedTags] = useState([]);
    const [tagSearch, setTagSearch] = useState('');
    const [tagFilterTab, setTagFilterTab] = useState('ALL');
    const [expandedDevices, setExpandedDevices] = useState(new Set());

    useEffect(() => {
        if (isOpen) {
            loadData();
            setSelectedTags([]);
        }
    }, [isOpen]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [tagsRes, devicesRes] = await Promise.all([getTags(), getDevices()]);
            setTags(tagsRes.data);
            setDevices(devicesRes.data);

            // Auto expand all devices initially
            const allDeviceIds = new Set(devicesRes.data.map(d => d.id.toString()));
            allDeviceIds.add('system');
            allDeviceIds.add('user');
            allDeviceIds.add('calc');
            setExpandedDevices(allDeviceIds);
        } catch (error) {
            console.error("Failed to load tags:", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleDevice = (deviceId) => {
        const newExpanded = new Set(expandedDevices);
        if (newExpanded.has(deviceId)) {
            newExpanded.delete(deviceId);
        } else {
            newExpanded.add(deviceId);
        }
        setExpandedDevices(newExpanded);
    };

    const availableTags = useMemo(() => {
        return tags.filter(t => {
            if (tagFilterTab !== 'ALL' && t.type !== tagFilterTab) return false;
            if (tagSearch && !t.name.toLowerCase().includes(tagSearch.toLowerCase()) && !t.tag_id.toLowerCase().includes(tagSearch.toLowerCase())) return false;
            return true;
        });
    }, [tags, tagFilterTab, tagSearch]);

    const tagsByDevice = useMemo(() => {
        const groups = {};
        availableTags.forEach(tag => {
            let key = 'other';
            if (tag.type === 'SYSTEM') key = 'system';
            else if (tag.type === 'USER') key = 'user';
            else if (tag.type === 'CALCULATION') key = 'calc';
            else if (tag.device_id) key = tag.device_id.toString();

            if (!groups[key]) groups[key] = [];
            groups[key].push(tag);
        });
        return groups;
    }, [availableTags]);

    const handleAdd = () => {
        const selectedTagObjects = tags.filter(t => selectedTags.includes(t.tag_id));
        onSelect(selectedTagObjects);
        onClose();
    };

    const getDeviceIcon = (type) => {
        switch (type) {
            case 'MODBUS_TCP': return Server;
            case 'MODBUS_RTU': return Cpu;
            case 'IEC104': return Activity;
            case 'OPC_UA': return Database;
            case 'SNMP': return Layers;
            default: return Server;
        }
    };

    const tagTabs = [
        { id: 'ALL', label: 'All Tags', icon: Tag },
        { id: 'IO', label: 'IO Tags', icon: Cpu },
        { id: 'CALCULATION', label: 'Calculation', icon: Activity },
        { id: 'USER', label: 'User Tags', icon: Layers },
        { id: 'SYSTEM', label: 'System', icon: Settings },
    ];

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-surface/60 backdrop-blur-xl border border-surfaceHighlight rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="p-6 border-b border-surfaceHighlight/50 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">{title}</h3>
                    <button onClick={onClose} className="text-text-muted hover:text-white">
                        <XCircle size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-6 pt-3 border-b border-surfaceHighlight/30 bg-surfaceHighlight/5">
                    <div className="flex gap-1 -mb-px overflow-x-auto">
                        {tagTabs.map(tab => {
                            const Icon = tab.icon;
                            const isActive = tagFilterTab === tab.id;
                            const count = tab.id === 'ALL' ? tags.length : tags.filter(t => t.type === tab.id).length;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setTagFilterTab(tab.id)}
                                    className={clsx(
                                        "px-4 py-3 text-sm font-medium rounded-t-xl transition-all flex items-center gap-2 whitespace-nowrap",
                                        isActive
                                            ? "bg-bg-card text-primary border-t border-l border-r border-surfaceHighlight/50"
                                            : "text-text-muted hover:text-white hover:bg-surfaceHighlight/10"
                                    )}
                                >
                                    <Icon size={16} />
                                    <span>{tab.label}</span>
                                    {count > 0 && (
                                        <span className={clsx(
                                            "px-1.5 py-0.5 text-xs rounded-full font-semibold ml-1",
                                            isActive ? "bg-primary/20 text-primary" : "bg-surfaceHighlight/30 text-text-muted"
                                        )}>
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-surfaceHighlight/30 bg-surfaceHighlight/5">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted" size={18} />
                        <input
                            type="text"
                            placeholder="Search tags..."
                            value={tagSearch}
                            onChange={(e) => setTagSearch(e.target.value)}
                            className="w-full bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:border-primary"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <div className="text-center py-12 text-text-muted">Loading tags...</div>
                    ) : Object.keys(tagsByDevice).length === 0 ? (
                        <div className="text-center py-12 text-text-muted">
                            <Tag size={48} className="mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No tags found</p>
                        </div>
                    ) : (
                        Object.entries(tagsByDevice).map(([deviceId, deviceTags]) => {
                            let deviceName = '';
                            let DeviceIcon = Server;

                            if (deviceId === 'system') {
                                deviceName = 'System Tags';
                                DeviceIcon = Settings;
                            } else if (deviceId === 'user') {
                                deviceName = 'User Tags';
                                DeviceIcon = Layers;
                            } else if (deviceId === 'calc') {
                                deviceName = 'Calculation Tags';
                                DeviceIcon = Activity;
                            } else {
                                const device = devices.find(d => d.id === parseInt(deviceId));
                                deviceName = device?.name || `Device ${deviceId}`;
                                DeviceIcon = getDeviceIcon(device?.type);
                            }

                            const isExpanded = expandedDevices.has(deviceId);
                            const unmappedTags = deviceTags.filter(t => !mappedTags.includes(t.tag_id));
                            const allSelected = unmappedTags.length > 0 && unmappedTags.every(t => selectedTags.includes(t.tag_id));

                            return (
                                <div key={deviceId} className="border border-surfaceHighlight/30 rounded-xl overflow-hidden bg-surfaceHighlight/5">
                                    <div className="w-full flex items-center bg-surfaceHighlight/10 hover:bg-surfaceHighlight/20 transition-colors">
                                        <button
                                            onClick={() => toggleDevice(deviceId)}
                                            className="flex-1 flex items-center gap-2 px-4 py-3 text-left"
                                        >
                                            {isExpanded ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
                                            <DeviceIcon size={18} className="text-primary" />
                                            <span className="font-medium text-white">{deviceName}</span>
                                        </button>
                                        <div className="flex items-center gap-4 px-4">
                                            <span className="text-xs text-text-muted">({deviceTags.length} tags)</span>
                                            {unmappedTags.length > 0 && (
                                                <input
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        const newTagIds = unmappedTags.map(t => t.tag_id);
                                                        
                                                        if (checked) {
                                                            setSelectedTags(prev => {
                                                                const combined = new Set([...prev, ...newTagIds]);
                                                                return Array.from(combined);
                                                            });
                                                        } else {
                                                            setSelectedTags(prev => prev.filter(id => !newTagIds.includes(id)));
                                                        }
                                                    }}
                                                    className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                                                    title={`Select all ${unmappedTags.length} tags in ${deviceName}`}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="bg-black/20 divide-y divide-surfaceHighlight/10">
                                            {deviceTags.map(tag => {
                                                const isSelected = selectedTags.includes(tag.tag_id);
                                                const isAlreadyMapped = mappedTags.some(t => t === tag.tag_id);

                                                return (
                                                    <div
                                                        key={tag.tag_id}
                                                        onClick={() => {
                                                            if (isAlreadyMapped) return;
                                                            if (isSelected) setSelectedTags(prev => prev.filter(id => id !== tag.tag_id));
                                                            else setSelectedTags(prev => [...prev, tag.tag_id]);
                                                        }}
                                                        className={clsx(
                                                            "flex items-center justify-between px-4 py-3 cursor-pointer transition-colors pl-10",
                                                            isAlreadyMapped ? "opacity-50 cursor-not-allowed bg-surfaceHighlight/5" :
                                                                isSelected ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-surfaceHighlight/10 border-l-2 border-transparent"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={clsx(
                                                                "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                                                                isSelected ? "bg-primary border-primary" : "border-text-muted"
                                                            )}>
                                                                {isSelected && <CheckCircle size={14} className="text-white" />}
                                                            </div>
                                                            <div>
                                                                <div className="text-white font-medium text-sm">
                                                                    {tag.type === 'IO' && tag.device_id ? (
                                                                        <span className="flex items-baseline gap-1">
                                                                            <span className="text-primary font-bold">{deviceName}:</span>
                                                                            <span>{tag.name}</span>
                                                                        </span>
                                                                    ) : (
                                                                        tag.name
                                                                    )}
                                                                </div>
                                                                <div className="text-xs text-text-muted font-mono"><small>{tag.tag_id}</small></div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs px-2 py-1 rounded bg-surfaceHighlight/20 text-text-secondary">{tag.data_type}</span>
                                                            {isAlreadyMapped && <span className="text-xs text-success">Mapped</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-surfaceHighlight/50 flex justify-between items-center bg-surfaceHighlight/5">
                    <span className="text-text-muted">{selectedTags.length} tags selected</span>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-text-secondary hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={selectedTags.length === 0}
                            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-primary/20"
                        >
                            Add Selected
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TagMappingSelector;
