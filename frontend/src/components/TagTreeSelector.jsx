import React, { useState, useEffect } from 'react';
import { getTags, getDevices } from '../services/api';
import { Search, ChevronRight, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

const TagTreeSelector = ({ onSelect, onClose }) => {
    const [tags, setTags] = useState([]);
    const [devices, setDevices] = useState([]);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('IO');
    const [expandedDevices, setExpandedDevices] = useState(new Set());

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [tagsRes, devicesRes] = await Promise.all([
                getTags(),
                getDevices()
            ]);
            setTags(tagsRes.data);
            setDevices(devicesRes.data);
        } catch (error) {
            console.error("Failed to fetch data", error);
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

    const filteredTags = tags.filter(tag => {
        const matchesSearch = search === '' ||
            tag.name.toLowerCase().includes(search.toLowerCase()) ||
            tag.tag_id.toLowerCase().includes(search.toLowerCase());
        const matchesType = activeTab === 'ALL' || tag.type === activeTab;
        return matchesSearch && matchesType;
    });

    // Group IO tags by device, put all others (USER, SYSTEM, CALCULATION) in otherTags
    const tagsByDevice = {};
    const otherTags = [];

    filteredTags.forEach(tag => {
        if (tag.type === 'IO' && tag.device_id && activeTab === 'IO') {
            if (!tagsByDevice[tag.device_id]) {
                tagsByDevice[tag.device_id] = [];
            }
            tagsByDevice[tag.device_id].push(tag);
        } else {
            // Include all non-IO tags or when not in IO tab
            otherTags.push(tag);
        }
    });

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60]">
            <div className="bg-surface border border-surfaceHighlight rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-surfaceHighlight bg-surfaceHighlight/30">
                    <h3 className="text-2xl font-bold text-white mb-4 font-sans">Select Tag</h3>

                    {/* Search */}
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search tags..."
                            className="w-full pl-11 pr-4 py-3 bg-surface border border-surfaceHighlight rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary font-sans text-base"
                        />
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {['ALL', 'IO', 'USER', 'SYSTEM', 'CALCULATION'].map(type => (
                            <button
                                key={type}
                                onClick={() => setActiveTab(type)}
                                className={clsx(
                                    "px-5 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap font-sans",
                                    activeTab === type
                                        ? "bg-primary text-white shadow-lg"
                                        : "bg-surfaceHighlight/50 text-text-secondary hover:text-white hover:bg-surfaceHighlight"
                                )}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tag List */}
                <div className="flex-1 overflow-y-auto p-6 bg-surface/50">
                    {activeTab === 'IO' && Object.keys(tagsByDevice).length > 0 && (
                        <div className="space-y-3">
                            {Object.entries(tagsByDevice).map(([deviceId, deviceTags]) => {
                                const device = devices.find(d => d.id === parseInt(deviceId));
                                const isExpanded = expandedDevices.has(parseInt(deviceId));

                                return (
                                    <div key={deviceId} className="border border-surfaceHighlight rounded-xl overflow-hidden bg-surfaceHighlight/20">
                                        <button
                                            onClick={() => toggleDevice(parseInt(deviceId))}
                                            className="w-full flex items-center justify-between p-4 bg-surfaceHighlight/40 hover:bg-surfaceHighlight/60 transition-colors"
                                        >
                                            <span className="font-semibold text-white font-sans text-base">{device?.name || `Device ${deviceId}`}</span>
                                            {isExpanded ? <ChevronDown size={20} className="text-primary" /> : <ChevronRight size={20} className="text-text-muted" />}
                                        </button>

                                        {isExpanded && (
                                            <div className="p-2 space-y-1 bg-surface/30">
                                                {deviceTags.map(tag => (
                                                    <button
                                                        key={tag.id}
                                                        onClick={() => {
                                                            onSelect(tag);
                                                            onClose();
                                                        }}
                                                        className="w-full text-left p-4 rounded-lg hover:bg-primary/20 hover:border-primary transition-all border border-transparent"
                                                    >
                                                        <div className="font-semibold text-white font-sans">{tag.name}</div>
                                                        <div className="text-sm text-text-muted font-mono mt-1">{tag.tag_id}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {(activeTab !== 'IO' || Object.keys(tagsByDevice).length === 0) && (
                        <div className="space-y-2">
                            {otherTags.map(tag => (
                                <button
                                    key={tag.id}
                                    onClick={() => {
                                        onSelect(tag);
                                        onClose();
                                    }}
                                    className="w-full text-left p-4 rounded-xl hover:bg-primary/20 hover:border-primary transition-all border border-surfaceHighlight bg-surfaceHighlight/20"
                                >
                                    <div className="font-semibold text-white font-sans text-base">{tag.name}</div>
                                    <div className="text-sm text-text-muted font-mono mt-1">{tag.tag_id}</div>
                                    <div className="text-xs text-text-secondary mt-2 font-sans">{tag.type}</div>
                                </button>
                            ))}
                        </div>
                    )}

                    {filteredTags.length === 0 && (
                        <div className="text-center text-text-muted py-12 font-sans">
                            No tags found
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-surfaceHighlight bg-surfaceHighlight/20">
                    <button
                        onClick={onClose}
                        className="w-full px-6 py-3 bg-surfaceHighlight hover:bg-surfaceHighlight/80 text-white rounded-xl transition-colors font-sans font-semibold"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TagTreeSelector;
