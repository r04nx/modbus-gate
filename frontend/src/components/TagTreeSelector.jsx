import React, { useState, useMemo } from 'react';
import { X, Search, ChevronRight, ChevronDown, Tag, Calculator, BarChart3, User, Settings, Database, Wifi, Network, Gauge } from 'lucide-react';
import clsx from 'clsx';

const TagTreeSelector = ({ tags = [], devices = [], onSelect, onClose }) => {
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('ALL');
    const [expandedDevices, setExpandedDevices] = useState(new Set());

    // Get icon for device type
    const getDeviceIcon = (deviceType) => {
        switch (deviceType) {
            case 'MODBUS_TCP':
            case 'MODBUS_RTU':
                return Database;
            case 'OPC_UA':
                return Network;
            case 'SNMP':
                return Wifi;
            case 'IEC104':
                return Gauge;
            default:
                return Database;
        }
    };

    // Filter tags by type and search
    const filteredTags = useMemo(() => {
        return tags.filter(tag => {
            const matchesType = activeTab === 'ALL' || tag.type === activeTab;
            const matchesSearch = search === '' ||
                tag.tag_id?.toLowerCase().includes(search.toLowerCase()) ||
                tag.name?.toLowerCase().includes(search.toLowerCase());
            return matchesType && matchesSearch;
        });
    }, [tags, activeTab, search]);

    // Group tags by device
    const tagsByDevice = useMemo(() => {
        const grouped = {};
        const otherTags = [];

        filteredTags.forEach(tag => {
            if (tag.device_id) {
                if (!grouped[tag.device_id]) {
                    grouped[tag.device_id] = [];
                }
                grouped[tag.device_id].push(tag);
            } else {
                otherTags.push(tag);
            }
        });

        if (otherTags.length > 0) {
            grouped['system'] = otherTags;
        }

        return grouped;
    }, [filteredTags]);

    const toggleDevice = (deviceId) => {
        const newExpanded = new Set(expandedDevices);
        if (newExpanded.has(deviceId)) {
            newExpanded.delete(deviceId);
        } else {
            newExpanded.add(deviceId);
        }
        setExpandedDevices(newExpanded);
    };

    const tabs = [
        { id: 'ALL', label: 'All Tags', icon: Tag },
        { id: 'IO', label: 'IO Tags', icon: Tag },
        { id: 'CALCULATION', label: 'Calculation', icon: Calculator },
        { id: 'STATS', label: 'Stats', icon: BarChart3 },
        { id: 'USER', label: 'User', icon: User },
        { id: 'SYSTEM', label: 'System', icon: Settings },
    ];

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60]" onClick={onClose}>
            <div className="bg-surface rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-surfaceHighlight" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-surfaceHighlight bg-surfaceHighlight/30 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">Select Tags</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-6 pt-3 border-b border-surfaceHighlight bg-surfaceHighlight/20">
                    <div className="flex gap-1 -mb-px overflow-x-auto">
                        {tabs.map(tab => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            const count = tab.id === 'ALL' ? tags.length : tags.filter(t => t.type === tab.id).length;

                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={clsx(
                                        "px-3 py-2 text-sm font-medium rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap",
                                        isActive
                                            ? "bg-surface text-primary border-t-2 border-l border-r border-primary"
                                            : "text-slate-400 hover:text-white hover:bg-surfaceHighlight/40"
                                    )}
                                >
                                    <Icon size={14} />
                                    <span>{tab.label}</span>
                                    {count > 0 && (
                                        <span className={clsx(
                                            "px-1.5 py-0.5 text-xs rounded font-semibold",
                                            isActive ? "bg-primary/20 text-primary" : "bg-slate-700 text-slate-300"
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
                <div className="px-6 py-3 bg-surfaceHighlight/10 border-b border-surfaceHighlight">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search tags..."
                            className="w-full pl-10 pr-4 py-2 bg-surface border border-surfaceHighlight rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4 bg-surface">
                    {Object.keys(tagsByDevice).length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <Tag size={48} className="mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No tags found</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {Object.entries(tagsByDevice).map(([deviceId, deviceTags]) => {
                                const isSystem = deviceId === 'system';
                                const device = isSystem ? null : devices.find(d => d.id === parseInt(deviceId));
                                const isExpanded = expandedDevices.has(deviceId);
                                const DeviceIcon = isSystem ? Settings : getDeviceIcon(device?.type);
                                const deviceName = isSystem ? 'System Tags' : (device?.name || `Device ${deviceId}`);

                                return (
                                    <div key={deviceId} className="border border-surfaceHighlight rounded-lg overflow-hidden bg-surfaceHighlight/10">
                                        <button
                                            type="button"
                                            onClick={() => toggleDevice(deviceId)}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 transition-colors text-left"
                                        >
                                            {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                                            <DeviceIcon size={16} className="text-primary" />
                                            <span className="font-medium text-sm text-white">{deviceName}</span>
                                            <span className="ml-auto text-xs text-slate-400">({deviceTags.length})</span>
                                        </button>

                                        {isExpanded && (
                                            <div className="bg-surface/50">
                                                {deviceTags.map(tag => (
                                                    <button
                                                        key={tag.id}
                                                        type="button"
                                                        onClick={() => {
                                                            onSelect(tag);
                                                            onClose();
                                                        }}
                                                        className="w-full flex items-center gap-2 px-3 py-2.5 pl-10 hover:bg-primary/10 hover:border-l-2 hover:border-primary transition-all text-left border-t border-surfaceHighlight/50 group"
                                                    >
                                                        <Tag size={14} className="text-slate-400 group-hover:text-primary" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-medium text-white truncate">
                                                                {tag.type === 'IO' && tag.device_id ? (
                                                                    <span className="flex items-baseline gap-1">
                                                                        <span className="text-primary font-bold">{deviceName}:</span>
                                                                        <span>{tag.name}</span>
                                                                    </span>
                                                                ) : (
                                                                    tag.name || tag.tag_id
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-slate-400 truncate font-mono"><small>{tag.tag_id}</small></div>
                                                        </div>
                                                        <span className="text-xs text-slate-500 ml-2 font-mono">{tag.data_type}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-surfaceHighlight bg-surfaceHighlight/20 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-300 bg-surfaceHighlight hover:bg-surfaceHighlight/80 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TagTreeSelector;
