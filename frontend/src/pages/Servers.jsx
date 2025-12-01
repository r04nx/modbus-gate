
import React, { useState, useEffect, useMemo } from 'react';
import { Save, Server, Activity, Settings, RefreshCw, CheckCircle, XCircle, Plus, Trash2, Search, AlertTriangle, Edit2, ChevronRight, ChevronDown, Database, Network, Wifi, Gauge, Tag, Calculator, BarChart3, User, Wand2, Copy, Upload } from 'lucide-react';
import clsx from 'clsx';
import api, { getTags, listCertificates, getDevices } from '../services/api';
import { TableSkeleton, FormSkeleton, Skeleton } from '../components/common/Skeleton';
import TagMappingSelector from '../components/TagMappingSelector';
import JsonEditor from '../components/JsonEditor';
import CertificateUpload from '../components/CertificateUpload';

// Helper to determine data size in registers
const getDataSize = (dataType) => {
    switch (dataType) {
        case 'BOOL': return 1; // Coils/Discrete Inputs take 1 address slot
        case 'INT16':
        case 'UINT16': return 1;
        case 'INT32':
        case 'UINT32':
        case 'FLOAT32': return 2;
        case 'INT64':
        case 'UINT64':
        case 'FLOAT64': return 4;
        default: return 1;
    }
};

export default function Servers() {
    const [activeTab, setActiveTab] = useState('MODBUS_SERVER');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState({
        enabled: false,
        config: { mappings: [], brokers: [], publications: [] }
    });
    const [initialConfig, setInitialConfig] = useState(null);

    // Tag Selector State
    const [showTagSelector, setShowTagSelector] = useState(false);
    const [selectorContext, setSelectorContext] = useState(null); // 'MAPPING' or 'MQTT_PUB'
    const [currentPubId, setCurrentPubId] = useState(null);
    const [availableTags, setAvailableTags] = useState([]);
    const [devicesMap, setDevicesMap] = useState({});
    const [expandedItems, setExpandedItems] = useState({});

    // Certificate State
    const [certificates, setCertificates] = useState([]);
    const [showCertUpload, setShowCertUpload] = useState(false);

    const toggleItem = (id) => {
        setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Load certificates
    const loadCertificates = async () => {
        try {
            const response = await listCertificates();
            // Ensure we always set an array, even if response.data is undefined or not an array
            const certData = response?.data;
            setCertificates(Array.isArray(certData) ? certData : []);
        } catch (error) {
            console.error('Failed to load certificates:', error);
            // Set empty array on error to prevent crashes
            setCertificates([]);
        }
    };

    const tabs = [
        { id: 'MODBUS_SERVER', label: 'Modbus Server', icon: Server, color: 'text-blue-400' },
        { id: 'OPC_UA_SERVER', label: 'OPC UA Server', icon: Activity, color: 'text-cyan-400' },
        { id: 'IEC104_SERVER', label: 'IEC104 Server', icon: Settings, color: 'text-purple-400' },
        { id: 'MQTT_PUBLISHER', label: 'MQTT Publisher', icon: RefreshCw, color: 'text-emerald-400' },
    ];

    // Check for unsaved changes
    const isDirty = useMemo(() => {
        if (!initialConfig || !config) return false;
        return JSON.stringify(config) !== JSON.stringify(initialConfig);
    }, [config, initialConfig]);

    // Warn on browser close/refresh
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    // Handle Tab Switching with Dirty Check
    const handleTabChange = (newTabId) => {
        if (activeTab === newTabId) return;

        if (isDirty) {
            if (window.confirm('You have unsaved changes. Are you sure you want to switch tabs? Your changes will be lost.')) {
                setActiveTab(newTabId);
            }
        } else {
            setActiveTab(newTabId);
        }
    };

    useEffect(() => {
        // Reset config to avoid showing stale data while loading
        setConfig({
            enabled: false,
            config: { mappings: [], brokers: [], publications: [] }
        });
        setInitialConfig(null); // Reset initial config
        fetchConfig(activeTab);
        loadTags();
        loadCertificates(); // Load certificates for MQTT TLS
    }, [activeTab]);

    const loadTags = async () => {
        try {
            const [tagsRes, devicesRes] = await Promise.all([getTags(), getDevices()]);
            setAvailableTags(tagsRes.data);

            const map = {};
            devicesRes.data.forEach(d => map[d.id] = d.name);
            setDevicesMap(map);
        } catch (error) {
            console.error("Failed to load tags or devices", error);
        }
    };

    const fetchConfig = async (type) => {
        setLoading(true);
        try {
            const response = await api.get(`/servers/${type}`);
            const data = response.data;
            // Ensure config object exists
            if (!data.config) data.config = {};
            // Ensure arrays exist
            if (!data.config.mappings) data.config.mappings = [];
            if (!data.config.brokers) data.config.brokers = [];
            if (!data.config.publications) data.config.publications = [];

            setConfig(data);
            setInitialConfig(JSON.parse(JSON.stringify(data))); // Deep copy for initial state
        } catch (error) {
            console.error('Error fetching server config:', error);
            // Ensure config is reset on error
            const emptyConfig = {
                enabled: false,
                config: { mappings: [], brokers: [], publications: [] }
            };
            setConfig(emptyConfig);
            setInitialConfig(emptyConfig);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put(`/servers/${activeTab}`, config);
            setInitialConfig(JSON.parse(JSON.stringify(config))); // Update initial config to match saved
            alert('Configuration saved successfully!');
            setExpandedItems({}); // Collapse all items after save
            // setExpandedSections({}); // Removed section auto-collapse as per user request
        } catch (error) {
            alert('Error saving configuration: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleConfigChange = (key, value) => {
        setConfig(prev => ({
            ...prev,
            config: {
                ...prev.config,
                [key]: value
            }
        }));
    };

    // --- Smart Mapping Logic ---

    const getNextAddress = (mappings, regType, size) => {
        const typeMappings = mappings.filter(m => m.register_type === regType);
        if (typeMappings.length === 0) return 1;
        let maxEnd = 0;
        typeMappings.forEach(m => {
            const end = parseInt(m.address) + getDataSize(m.data_type);
            if (end > maxEnd) maxEnd = end;
        });
        return maxEnd;
    };

    const getNextIOA = (mappings) => {
        if (mappings.length === 0) return 1;
        const maxIOA = Math.max(...mappings.map(m => parseInt(m.ioa || 0)));
        return maxIOA + 1;
    };

    const inferTypeIdFromDataType = (dataType) => {
        if (dataType === 'BOOL') return 'M_SP_NA_1'; // Single Point
        if (dataType?.includes('FLOAT')) return 'M_ME_NC_1'; // Float
        if (dataType?.includes('INT')) return 'M_ME_NB_1'; // Scaled Value
        return 'M_ME_NC_1'; // Default to Float
    };

    const handleTagsSelected = (selectedTagObjects) => {
        if (selectorContext === 'MQTT_PUB') {
            // Add tags to specific publication
            const newPubs = [...config.config.publications];
            const pubIndex = newPubs.findIndex(p => p.id === currentPubId);
            if (pubIndex >= 0) {
                const currentTags = newPubs[pubIndex].tags || [];
                const newTags = selectedTagObjects.map(t => t.tag_id).filter(id => !currentTags.includes(id));
                newPubs[pubIndex].tags = [...currentTags, ...newTags];
                handleConfigChange('publications', newPubs);
            }
        } else {
            // Add mappings
            const newMappings = [...(config.config.mappings || [])];

            selectedTagObjects.forEach(tag => {
                // Allow duplicates - removed check for existing tag_id

                let mapping = { tag_id: tag.tag_id, name: tag.name, data_type: tag.data_type || 'INT16' };

                if (activeTab === 'MODBUS_SERVER') {
                    let regType = 'HR';
                    if (tag.data_type === 'BOOL') regType = 'CO';

                    // Default to next available address to avoid immediate conflict, 
                    // but user can change it later to cause conflict if they want (and we will flag it)
                    const address = getNextAddress(newMappings, regType, getDataSize(tag.data_type));

                    mapping = { ...mapping, register_type: regType, address, unit_id: 1 };
                } else if (activeTab === 'OPC_UA_SERVER') {
                    mapping = { ...mapping, node_name: tag.name || tag.tag_id };
                } else if (activeTab === 'IEC104_SERVER') {
                    const tagParams = tag.params || {};

                    // Smart assignment: use tag's IEC104 params if available
                    let ioa_offset, base_value, type_id, soe;

                    if (tag.protocol === 'IEC104' && tagParams.address !== undefined) {
                        // Tag has IEC104 configuration - use it
                        ioa_offset = parseInt(tagParams.address) || 0;
                        base_value = parseInt(tagParams.base_value) || 0;
                        type_id = tagParams.type_id || inferTypeIdFromDataType(tag.data_type);
                        soe = tagParams.soe || false;
                    } else {
                        // No IEC104 config - auto-assign
                        const nextIOA = getNextIOA(newMappings);
                        ioa_offset = nextIOA;
                        base_value = 0;
                        type_id = inferTypeIdFromDataType(tag.data_type);
                        soe = false;
                    }

                    mapping = {
                        ...mapping,
                        ioa: ioa_offset,
                        base_value: base_value,
                        type_id: type_id,
                        soe: soe,
                        cot: 'SPONTANEOUS'
                    };
                }

                newMappings.push(mapping);
            });
            handleConfigChange('mappings', newMappings);
        }
    };

    const updateMapping = (index, field, value) => {
        const newMappings = [...config.config.mappings];
        newMappings[index] = { ...newMappings[index], [field]: value };
        handleConfigChange('mappings', newMappings);
    };

    const removeMapping = (index) => {
        const newMappings = config.config.mappings.filter((_, i) => i !== index);
        handleConfigChange('mappings', newMappings);
    };

    const autoAdjustMappings = () => {
        const mappings = [...(config.config.mappings || [])];

        if (activeTab === 'MODBUS_SERVER') {
            // Group by Slave ID AND Register Type
            const grouped = {};
            mappings.forEach(m => {
                const slaveId = m.slave_id !== undefined ? m.slave_id : (config.config.slave_id || 1);
                const type = m.register_type || 'HR';
                const key = `${slaveId}_${type}`;

                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(m);
            });

            const newMappings = [];
            // Re-assign addresses sequentially for each group
            Object.keys(grouped).forEach(key => {
                let currentAddr = 1;
                grouped[key].forEach(m => {
                    m.address = currentAddr;
                    currentAddr += getDataSize(m.data_type);
                    newMappings.push(m);
                });
            });

            // Sort to keep them somewhat organized (optional, but good for UX)
            newMappings.sort((a, b) => {
                const slaveA = a.slave_id || 1;
                const slaveB = b.slave_id || 1;
                if (slaveA !== slaveB) return slaveA - slaveB;
                if (a.register_type !== b.register_type) return a.register_type.localeCompare(b.register_type);
                return a.address - b.address;
            });

            handleConfigChange('mappings', newMappings);
        } else if (activeTab === 'IEC104_SERVER') {
            let currentIOA = 1;
            const newMappings = mappings.map(m => {
                m.ioa = currentIOA++;
                return m;
            });
            handleConfigChange('mappings', newMappings);
        }
    };

    const deleteOrphanedMappings = () => {
        if (window.confirm("Are you sure you want to delete all orphaned mappings?")) {
            const newMappings = (config.config.mappings || []).filter(m => availableTags.some(t => t.tag_id === m.tag_id));
            handleConfigChange('mappings', newMappings);
        }
    };

    // --- Selection Logic ---
    const [selectedIndices, setSelectedIndices] = useState(new Set());

    const toggleSelect = (idx) => {
        const newSelected = new Set(selectedIndices);
        if (newSelected.has(idx)) newSelected.delete(idx);
        else newSelected.add(idx);
        setSelectedIndices(newSelected);
    };

    const toggleSelectAll = () => {
        const mappings = config.config.mappings || [];
        if (selectedIndices.size === mappings.length && mappings.length > 0) {
            setSelectedIndices(new Set());
        } else {
            const all = new Set(mappings.map((_, i) => i));
            setSelectedIndices(all);
        }
    };

    const deleteSelected = () => {
        if (window.confirm(`Are you sure you want to delete ${selectedIndices.size} items?`)) {
            if (activeTab === 'MQTT_PUBLISHER') {
                // For MQTT, we are likely deleting publications
                // Note: If we wanted to support broker deletion too, we'd need a different context or separate selection state.
                // Assuming selection is for the main list (Publications) as it's the most common "many items" list.
                // However, MQTT render has two lists. Let's assume we are targeting Publications for now as that's the "mapping" equivalent.
                const newPubs = (config.config.publications || []).filter((_, i) => !selectedIndices.has(i));
                handleConfigChange('publications', newPubs);
            } else {
                const newMappings = (config.config.mappings || []).filter((_, i) => !selectedIndices.has(i));
                handleConfigChange('mappings', newMappings);
            }
            setSelectedIndices(new Set());
        }
    };

    // --- Validation Logic ---
    const validationResult = useMemo(() => {
        const errors = [];
        const conflictIndices = new Set();
        const mappings = config.config.mappings || [];

        // Helper to get source tag type
        const getSourceType = (tagId) => {
            const tag = availableTags.find(t => t.tag_id === tagId);
            return tag ? tag.data_type : null;
        };

        if (activeTab === 'MODBUS_SERVER') {
            // Check for Address Overlaps
            // Key: slave_id:register_type:address
            const occupied = {}; // Map key -> { index, tag_id }

            mappings.forEach((m, idx) => {
                // Check for Orphaned Tags
                if (!availableTags.some(t => t.tag_id === m.tag_id)) {
                    errors.push({
                        type: 'ORPHAN_TAG',
                        tag: m.tag_id,
                        message: `Orphaned Tag: '${m.tag_id}' does not exist in the system.`,
                        index: idx
                    });
                    conflictIndices.add(idx);
                }

                const slaveId = m.slave_id !== undefined ? m.slave_id : (config.config.slave_id || 1);
                const regType = m.register_type || 'HR';
                const start = parseInt(m.address);
                const size = getDataSize(m.data_type);
                const end = start + size;

                for (let i = start; i < end; i++) {
                    const key = `${slaveId}:${regType}:${i}`;
                    if (occupied[key]) {
                        // Conflict found!
                        const conflict = occupied[key];
                        // Avoid duplicate error messages for the same pair overlap
                        // We can check if we already reported this pair at this location, but simple push is fine for now
                        // We'll filter duplicates in display if needed, or just show all
                        errors.push({
                            type: 'OVERLAP',
                            tag1: m.tag_id,
                            tag2: conflict.tag_id,
                            location: `Slave ${slaveId} ${regType} ${i}`,
                            index1: idx,
                            index2: conflict.index
                        });
                        conflictIndices.add(idx);
                        conflictIndices.add(conflict.index);
                    } else {
                        occupied[key] = { index: idx, tag_id: m.tag_id };
                    }
                }

                // Type Validation
                const sourceType = getSourceType(m.tag_id);
                if (sourceType) {
                    if (sourceType === 'STRING' && m.data_type !== 'STRING') {
                        errors.push({
                            type: 'TYPE_MISMATCH',
                            tag: m.tag_id,
                            expected: 'STRING',
                            actual: m.data_type,
                            message: `Type Conflict: Tag '${m.tag_id}' is STRING but mapped as ${m.data_type}.`
                        });
                        conflictIndices.add(idx);
                    }
                }
            });
        } else if (activeTab === 'IEC104_SERVER') {
            const used = {};
            mappings.forEach((m, idx) => {
                // Check for Orphaned Tags
                if (!availableTags.some(t => t.tag_id === m.tag_id)) {
                    errors.push({
                        type: 'ORPHAN_TAG',
                        tag: m.tag_id,
                        message: `Orphaned Tag: '${m.tag_id}' does not exist in the system.`,
                        index: idx
                    });
                    conflictIndices.add(idx);
                }

                const base = parseInt(m.base_value || 0);
                const offset = parseInt(m.ioa || 0);
                const ioa = base + offset;

                if (used[ioa]) {
                    errors.push({
                        type: 'DUPLICATE_IOA',
                        ioa: ioa,
                        tag1: m.tag_id,
                        tag2: used[ioa].tag_id,
                        message: `Duplicate IOA: ${ioa} (Tags: ${m.tag_id} & ${used[ioa].tag_id})`
                    });
                    conflictIndices.add(idx);
                    conflictIndices.add(used[ioa].index);
                } else {
                    used[ioa] = { index: idx, tag_id: m.tag_id };
                }
            });
        } else if (activeTab === 'OPC_UA_SERVER') {
            mappings.forEach((m, idx) => {
                // Check for Orphaned Tags
                if (!availableTags.some(t => t.tag_id === m.tag_id)) {
                    errors.push({
                        type: 'ORPHAN_TAG',
                        tag: m.tag_id,
                        message: `Orphaned Tag: '${m.tag_id}' does not exist in the system.`,
                        index: idx
                    });
                    conflictIndices.add(idx);
                }
            });
        }

        return { errors, conflictIndices };
    }, [config.config.mappings, activeTab, availableTags, config.config.slave_id]);

    const validationErrors = validationResult.errors;
    const conflictIndices = validationResult.conflictIndices;

    // --- CSV Import/Export Logic ---

    const exportToCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let filename = `${activeTab}_config_${timestamp}.csv`;

        if (activeTab === 'MODBUS_SERVER') {
            csvContent += "tag_id,slave_id,register_type,address,data_type\n";
            (config.config.mappings || []).forEach(m => {
                csvContent += `${m.tag_id},${m.slave_id || 1},${m.register_type},${m.address},${m.data_type}\n`;
            });
        } else if (activeTab === 'OPC_UA_SERVER') {
            csvContent += "tag_id,node_name,data_type\n";
            (config.config.mappings || []).forEach(m => {
                csvContent += `${m.tag_id},${m.node_name},${m.data_type}\n`;
            });
        } else if (activeTab === 'IEC104_SERVER') {
            csvContent += "tag_id,base_value,ioa,type_id,soe,cot\n";
            (config.config.mappings || []).forEach(m => {
                csvContent += `${m.tag_id},${m.base_value || 0},${m.ioa},${m.type_id},${m.soe || false},${m.cot || 'SPONTANEOUS'}\n`;
            });
        } else if (activeTab === 'MQTT_PUBLISHER') {
            csvContent += "broker_id,topic,interval,payload_template,tags\n";
            (config.config.publications || []).forEach(p => {
                // Escape payload template if it contains commas or quotes
                const payload = p.payload_template.replace(/"/g, '""');
                const tags = (p.tags || []).join('|');
                csvContent += `${p.broker_id},${p.topic},${p.interval},"${payload}",${tags}\n`;
            });
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const importFromCSV = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split('\n');
            if (lines.length < 2) return;

            // Parse headers
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const colIdx = {};
            headers.forEach((h, i) => colIdx[h] = i);

            const newMappings = [];
            const newPublications = [];

            const errors = [];

            // Helper to get value by column name(s)
            const getVal = (row, ...colNames) => {
                for (const name of colNames) {
                    const idx = colIdx[name];
                    if (idx !== undefined && row[idx] !== undefined) {
                        return row[idx].trim();
                    }
                }
                return null;
            };

            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;

                // CSV Row Parser
                let row = [];
                let inQuotes = false;
                let currentValue = '';
                for (let char of lines[i]) {
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        row.push(currentValue);
                        currentValue = '';
                    } else {
                        currentValue += char;
                    }
                }
                row.push(currentValue);

                if (activeTab === 'MODBUS_SERVER') {
                    // Smart Resolution for Modbus
                    let tagId = getVal(row, 'tag_id');

                    if (tagId) {
                        if (availableTags.some(t => t.tag_id === tagId)) {
                            newMappings.push({
                                tag_id: tagId,
                                slave_id: parseInt(getVal(row, 'slave_id') || (config.config.slave_id || 1)),
                                register_type: getVal(row, 'register_type') || 'HR',
                                address: parseInt(getVal(row, 'address') || 1),
                                data_type: getVal(row, 'data_type') || 'INT16'
                            });
                        } else {
                            errors.push(`Row ${i + 1}: Tag ID '${tagId}' not found.`);
                        }
                    }
                } else if (activeTab === 'OPC_UA_SERVER') {
                    const tagId = getVal(row, 'tag_id') || row[0];
                    const nodeName = getVal(row, 'node_name') || row[1];
                    const dataType = getVal(row, 'data_type') || row[2];

                    if (tagId) {
                        newMappings.push({
                            tag_id: tagId,
                            node_name: nodeName,
                            data_type: dataType || 'INT16'
                        });
                    }
                } else if (activeTab === 'IEC104_SERVER') {
                    const tagId = getVal(row, 'tag_id') || row[0];
                    if (tagId) {
                        newMappings.push({
                            tag_id: tagId,
                            base_value: parseInt(getVal(row, 'base_value') || row[1] || 0),
                            ioa: parseInt(getVal(row, 'ioa') || row[2] || 0),
                            type_id: getVal(row, 'type_id') || row[3] || 'M_ME_NC_1',
                            soe: (getVal(row, 'soe') || row[4]) === 'true',
                            cot: getVal(row, 'cot') || row[5] || 'SPONTANEOUS'
                        });
                    }
                } else if (activeTab === 'MQTT_PUBLISHER') {
                    const brokerId = getVal(row, 'broker_id') || row[0];
                    if (brokerId) {
                        const payload = (getVal(row, 'payload_template') || row[3] || '{}').replace(/""/g, '"');
                        const tagsStr = getVal(row, 'tags') || row[4] || '';
                        newPublications.push({
                            id: Date.now().toString() + i,
                            broker_id: brokerId,
                            topic: getVal(row, 'topic') || row[1] || '',
                            interval: parseInt(getVal(row, 'interval') || row[2] || 10),
                            payload_template: payload,
                            tags: tagsStr ? tagsStr.split('|') : []
                        });
                    }
                }
            }

            if (newMappings.length > 0) {
                handleConfigChange('mappings', [...(config.config.mappings || []), ...newMappings]);
                let msg = `Imported ${newMappings.length} mappings successfully.`;
                if (errors.length > 0) {
                    msg += `\n\nWarnings:\n${errors.join('\n')}`;
                }
                alert(msg);
            } else if (errors.length > 0) {
                alert(`No valid mappings imported.\n\nErrors:\n${errors.join('\n')}`);
            } else if (newPublications.length > 0) {
                handleConfigChange('publications', [...(config.config.publications || []), ...newPublications]);
                alert(`Imported ${newPublications.length} publications successfully.`);
            } else {
                alert('No valid entries found to import.');
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    };

    // --- Renderers ---

    const TagBadge = ({ tagId }) => {
        const tag = availableTags.find(t => t.tag_id === tagId);
        if (tag && tag.type === 'IO' && tag.device_id) {
            return (
                <span className="inline-flex items-baseline gap-1 font-mono text-xs bg-surfaceHighlight/30 px-1.5 py-0.5 rounded border border-surfaceHighlight/50">
                    <span className="text-primary font-bold">{devicesMap[tag.device_id] || 'Unknown'}:</span>
                    <span className="text-white">{tag.name}</span>
                </span>
            );
        }
        return <span className="font-mono text-xs bg-surfaceHighlight/30 px-1.5 py-0.5 rounded border border-surfaceHighlight/50 text-white">{tag?.name || tagId}</span>;
    };

    const renderModbusContent = () => (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="group">
                    <label className="block text-sm font-medium text-text-secondary mb-2">Port</label>
                    <input
                        type="number"
                        value={config.config.port || 5020}
                        onChange={(e) => handleConfigChange('port', parseInt(e.target.value))}
                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary"
                    />
                </div>
                <div className="group">
                    <label className="block text-sm font-medium text-text-secondary mb-2">Default Slave ID</label>
                    <input
                        type="number"
                        value={config.config.slave_id || 1}
                        onChange={(e) => handleConfigChange('slave_id', parseInt(e.target.value))}
                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary"
                    />
                </div>
                <div className="group flex items-end pb-3">
                    <label className="relative inline-flex items-center cursor-pointer group">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={config.config.reset_on_change || false}
                            onChange={(e) => handleConfigChange('reset_on_change', e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-surfaceHighlight/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                        <span className="ml-3 text-sm font-medium text-text-secondary group-hover:text-white transition-colors">
                            Reset Memory on Change
                        </span>
                    </label>
                </div>
            </div>

            {/* Mappings Table */}
            <div className="bg-surfaceHighlight/10 rounded-2xl border border-surfaceHighlight/30 overflow-hidden">
                <div className="p-6 border-b border-surfaceHighlight/30 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <h4 className="text-lg font-bold text-white flex items-center gap-2">
                            <Activity size={20} className="text-primary" /> Tag Mappings
                        </h4>
                        {selectedIndices.size > 0 && (
                            <button
                                onClick={deleteSelected}
                                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors border border-red-500/30"
                            >
                                <Trash2 size={14} /> Delete {selectedIndices.size} Selected
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={exportToCSV} className="flex items-center gap-2 px-3 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors text-sm">
                            <Copy size={14} /> Export CSV
                        </button>
                        <label className="flex items-center gap-2 px-3 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors text-sm cursor-pointer">
                            <Database size={14} /> Import CSV
                            <input type="file" accept=".csv" onChange={importFromCSV} className="hidden" />
                        </label>
                        <button
                            onClick={() => { setSelectorContext('MAPPING'); setShowTagSelector(true); }}
                            className="flex items-center gap-2 px-4 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors"
                        >
                            <Plus size={16} /> Add Tags
                        </button>
                    </div>
                </div>

                {validationErrors.length > 0 && (
                    <div className="p-4 bg-warning/10 border-b border-warning/20 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="text-warning text-sm flex items-center gap-2 font-semibold">
                                <AlertTriangle size={16} /> {validationErrors.length} issues found
                            </div>
                            <button onClick={autoAdjustMappings} className="flex items-center gap-2 px-3 py-1.5 bg-warning/20 hover:bg-warning/30 text-warning rounded-lg text-sm font-medium transition-colors border border-warning/30">
                                <Wand2 size={14} /> Auto Fix All
                            </button>
                            {validationErrors.some(e => e.type === 'ORPHAN_TAG') && (
                                <button onClick={deleteOrphanedMappings} className="flex items-center gap-2 px-3 py-1.5 bg-error/20 hover:bg-error/30 text-error rounded-lg text-sm font-medium transition-colors border border-error/30">
                                    <Trash2 size={14} /> Delete Orphans
                                </button>
                            )}
                        </div>
                        <div className="max-h-32 overflow-y-auto text-xs text-warning/80 space-y-1 pl-6">
                            {validationErrors.map((err, i) => (
                                <div key={i} className="flex items-center gap-1">
                                    <span>•</span>
                                    {err.type === 'OVERLAP' ? (
                                        <span>
                                            Address Conflict: <TagBadge tagId={err.tag1} /> overlaps with <TagBadge tagId={err.tag2} /> at {err.location}
                                        </span>
                                    ) : (
                                        <span>{err.message}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-surfaceHighlight/20 text-text-secondary font-medium">
                            <tr>
                                <th className="px-6 py-3 w-10">
                                    <input
                                        type="checkbox"
                                        checked={selectedIndices.size > 0 && selectedIndices.size === (config.config.mappings || []).length}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                    />
                                </th>
                                <th className="px-6 py-3">Tag ID</th>
                                <th className="px-6 py-3">Slave ID</th>
                                <th className="px-6 py-3">Register Type</th>
                                <th className="px-6 py-3">Address</th>
                                <th className="px-6 py-3">Data Type</th>
                                <th className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surfaceHighlight/10">
                            {(config.config.mappings || []).map((mapping, idx) => {
                                const hasError = conflictIndices.has(idx);
                                return (
                                    <tr key={idx} className={clsx(
                                        "transition-colors",
                                        hasError ? "bg-red-500/10 hover:bg-red-500/20" : "hover:bg-surfaceHighlight/5",
                                        selectedIndices.has(idx) && "bg-primary/10"
                                    )}>
                                        <td className="px-6 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedIndices.has(idx)}
                                                onChange={() => toggleSelect(idx)}
                                                className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="font-medium text-white">
                                                {(() => {
                                                    const tag = availableTags.find(t => t.tag_id === mapping.tag_id);
                                                    if (tag && tag.type === 'IO' && tag.device_id) {
                                                        return (
                                                            <span className="flex items-baseline gap-1">
                                                                <span className="text-primary font-bold">{devicesMap[tag.device_id] || 'Unknown'}:</span>
                                                                <span>{tag.name}</span>
                                                            </span>
                                                        );
                                                    }
                                                    return tag?.name || mapping.tag_id;
                                                })()}
                                            </div>
                                            <div className="text-xs text-text-muted font-mono"><small>{mapping.tag_id}</small></div>
                                            {hasError && (
                                                <div className="text-[10px] text-red-400 font-semibold mt-1">
                                                    {validationErrors.find(e => e.index === idx)?.type === 'ORPHAN_TAG' ? 'Orphaned Tag' : 'Conflict Detected'}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-3">
                                            <input
                                                type="number"
                                                value={mapping.slave_id !== undefined ? mapping.slave_id : (config.config.slave_id || 1)}
                                                onChange={(e) => updateMapping(idx, 'slave_id', parseInt(e.target.value))}
                                                className={clsx(
                                                    "w-16 bg-transparent border rounded px-2 py-1 text-text-secondary focus:text-white outline-none",
                                                    hasError ? "border-red-500/50 focus:border-red-500" : "border-surfaceHighlight/30 focus:border-primary"
                                                )}
                                                min="1"
                                                max="247"
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <select
                                                value={mapping.register_type}
                                                onChange={(e) => updateMapping(idx, 'register_type', e.target.value)}
                                                className={clsx(
                                                    "bg-transparent border rounded px-2 py-1 text-text-secondary focus:text-white outline-none",
                                                    hasError ? "border-red-500/50 focus:border-red-500" : "border-surfaceHighlight/30 focus:border-primary"
                                                )}
                                            >
                                                <option value="HR">Holding Register</option>
                                                <option value="IR">Input Register</option>
                                                <option value="CO">Coil</option>
                                                <option value="DI">Discrete Input</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-3">
                                            <input
                                                type="number"
                                                value={mapping.address}
                                                onChange={(e) => updateMapping(idx, 'address', parseInt(e.target.value))}
                                                className={clsx(
                                                    "w-20 bg-transparent border rounded px-2 py-1 text-text-secondary focus:text-white outline-none",
                                                    hasError ? "border-red-500/50 focus:border-red-500" : "border-surfaceHighlight/30 focus:border-primary"
                                                )}
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <select
                                                value={mapping.data_type}
                                                onChange={(e) => updateMapping(idx, 'data_type', e.target.value)}
                                                className="bg-transparent border border-surfaceHighlight/30 rounded px-2 py-1 text-text-secondary focus:text-white focus:border-primary outline-none"
                                            >
                                                <option value="INT16">INT16</option>
                                                <option value="UINT16">UINT16</option>
                                                <option value="INT32">INT32</option>
                                                <option value="UINT32">UINT32</option>
                                                <option value="FLOAT32">FLOAT32</option>
                                                <option value="FLOAT64">FLOAT64</option>
                                                <option value="BOOLEAN">BOOLEAN</option>
                                                <option value="STRING">STRING</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-3">
                                            <button onClick={() => removeMapping(idx)} className="text-text-muted hover:text-warning transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderOpcUaContent = () => (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="group">
                    <label className="block text-sm font-medium text-text-secondary mb-2">Port</label>
                    <input
                        type="number"
                        value={config.config.port || 4840}
                        onChange={(e) => handleConfigChange('port', parseInt(e.target.value))}
                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary"
                    />
                </div>
                <div className="group">
                    <label className="block text-sm font-medium text-text-secondary mb-2">Endpoint URL</label>
                    <input
                        value={config.config.endpoint || `opc.tcp://0.0.0.0:${config.config.port || 4840}/freeopcua/server/`}
                        onChange={(e) => handleConfigChange('endpoint', e.target.value)}
                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary"
                    />
                </div>
            </div>

            <div className="bg-surfaceHighlight/10 rounded-2xl border border-surfaceHighlight/30 overflow-hidden">
                <div className="p-6 border-b border-surfaceHighlight/30 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <h4 className="text-lg font-bold text-white flex items-center gap-2">
                            <Activity size={20} className="text-primary" /> Node Mappings
                        </h4>
                        {selectedIndices.size > 0 && (
                            <button
                                onClick={deleteSelected}
                                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors border border-red-500/30"
                            >
                                <Trash2 size={14} /> Delete {selectedIndices.size} Selected
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={exportToCSV} className="flex items-center gap-2 px-3 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors text-sm">
                            <Copy size={14} /> Export CSV
                        </button>
                        <label className="flex items-center gap-2 px-3 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors text-sm cursor-pointer">
                            <Database size={14} /> Import CSV
                            <input type="file" accept=".csv" onChange={importFromCSV} className="hidden" />
                        </label>
                        <button
                            onClick={() => { setSelectorContext('MAPPING'); setShowTagSelector(true); }}
                            className="flex items-center gap-2 px-4 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors"
                        >
                            <Plus size={16} /> Add Tags
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-surfaceHighlight/20 text-text-secondary font-medium">
                            <tr>
                                <th className="px-6 py-3 w-10">
                                    <input
                                        type="checkbox"
                                        checked={selectedIndices.size > 0 && selectedIndices.size === (config.config.mappings || []).length}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                    />
                                </th>
                                <th className="px-6 py-3">Tag ID</th>
                                <th className="px-6 py-3">Node Name</th>
                                <th className="px-6 py-3">Node ID</th>
                                <th className="px-6 py-3">Data Type</th>
                                <th className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surfaceHighlight/10">
                            {(config.config.mappings || []).map((mapping, idx) => (
                                <tr key={idx} className={clsx(
                                    "hover:bg-surfaceHighlight/5 transition-colors",
                                    selectedIndices.has(idx) && "bg-primary/10"
                                )}>
                                    <td className="px-6 py-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedIndices.has(idx)}
                                            onChange={() => toggleSelect(idx)}
                                            className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                        />
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="font-medium text-white">
                                            {(() => {
                                                const tag = availableTags.find(t => t.tag_id === mapping.tag_id);
                                                if (tag && tag.type === 'IO' && tag.device_id) {
                                                    return (
                                                        <span className="flex items-baseline gap-1">
                                                            <span className="text-primary font-bold">{devicesMap[tag.device_id] || 'Unknown'}:</span>
                                                            <span>{tag.name}</span>
                                                        </span>
                                                    );
                                                }
                                                return tag?.name || mapping.tag_id;
                                            })()}
                                        </div>
                                        <div className="text-xs text-text-muted font-mono"><small>{mapping.tag_id}</small></div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <input
                                            value={mapping.node_name}
                                            onChange={(e) => updateMapping(idx, 'node_name', e.target.value)}
                                            className="w-full bg-transparent border border-surfaceHighlight/30 rounded px-2 py-1 text-text-secondary focus:text-white focus:border-primary outline-none"
                                        />
                                    </td>
                                    <td className="px-6 py-3 text-text-muted font-mono text-xs">
                                        ns=2;s={mapping.node_name || mapping.tag_id}
                                    </td>
                                    <td className="px-6 py-3">
                                        <select
                                            value={mapping.data_type}
                                            onChange={(e) => updateMapping(idx, 'data_type', e.target.value)}
                                            className="bg-transparent border border-surfaceHighlight/30 rounded px-2 py-1 text-text-secondary focus:text-white focus:border-primary outline-none"
                                        >
                                            <option value="INT16">INT16</option>
                                            <option value="UINT16">UINT16</option>
                                            <option value="INT32">INT32</option>
                                            <option value="UINT32">UINT32</option>
                                            <option value="FLOAT32">FLOAT32</option>
                                            <option value="FLOAT64">FLOAT64</option>
                                            <option value="BOOLEAN">BOOLEAN</option>
                                            <option value="STRING">STRING</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-3">
                                        <button onClick={() => removeMapping(idx)} className="text-text-muted hover:text-warning transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderIec104Content = () => (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="group">
                    <label className="block text-sm font-medium text-text-secondary mb-2">Port</label>
                    <input
                        type="number"
                        value={config.config.port || 2404}
                        onChange={(e) => handleConfigChange('port', parseInt(e.target.value))}
                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary"
                    />
                </div>
                <div className="group">
                    <label className="block text-sm font-medium text-text-secondary mb-2">Common Address (ASDU)</label>
                    <input
                        type="number"
                        value={config.config.common_address || 1}
                        onChange={(e) => handleConfigChange('common_address', parseInt(e.target.value))}
                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary"
                    />
                </div>
            </div>

            <div className="bg-surfaceHighlight/10 rounded-2xl border border-surfaceHighlight/30 overflow-hidden">
                <div className="p-6 border-b border-surfaceHighlight/30 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <h4 className="text-lg font-bold text-white flex items-center gap-2">
                            <Activity size={20} className="text-primary" /> IOA Mappings
                        </h4>
                        {selectedIndices.size > 0 && (
                            <button
                                onClick={deleteSelected}
                                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors border border-red-500/30"
                            >
                                <Trash2 size={14} /> Delete {selectedIndices.size} Selected
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={exportToCSV} className="flex items-center gap-2 px-3 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors text-sm">
                            <Copy size={14} /> Export CSV
                        </button>
                        <label className="flex items-center gap-2 px-3 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors text-sm cursor-pointer">
                            <Database size={14} /> Import CSV
                            <input type="file" accept=".csv" onChange={importFromCSV} className="hidden" />
                        </label>
                        {validationErrors.length > 0 && (
                            <button onClick={autoAdjustMappings} className="flex items-center gap-2 px-3 py-2 bg-warning/20 hover:bg-warning/30 text-warning rounded-lg text-sm font-medium transition-colors border border-warning/30">
                                <Wand2 size={14} /> Auto Adjust
                            </button>
                        )}
                        <button
                            onClick={() => { setSelectorContext('MAPPING'); setShowTagSelector(true); }}
                            className="flex items-center gap-2 px-4 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors"
                        >
                            <Plus size={16} /> Add Tags
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-surfaceHighlight/20 text-text-secondary font-medium">
                            <tr>
                                <th className="px-6 py-3 w-10">
                                    <input
                                        type="checkbox"
                                        checked={selectedIndices.size > 0 && selectedIndices.size === (config.config.mappings || []).length}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                    />
                                </th>
                                <th className="px-6 py-3">Tag ID</th>
                                <th className="px-6 py-3">Base Value</th>
                                <th className="px-6 py-3">IOA Offset</th>
                                <th className="px-6 py-3">Computed IOA</th>
                                <th className="px-6 py-3">Type ID</th>
                                <th className="px-6 py-3">SOE</th>
                                <th className="px-6 py-3">CoT</th>
                                <th className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surfaceHighlight/10">
                            {(config.config.mappings || []).map((mapping, idx) => {
                                const baseValue = parseInt(mapping.base_value || 0);
                                const ioaOffset = parseInt(mapping.ioa || 0);
                                const computedIOA = baseValue + ioaOffset;

                                return (
                                    <tr key={idx} className={clsx(
                                        "hover:bg-surfaceHighlight/5 transition-colors",
                                        selectedIndices.has(idx) && "bg-primary/10"
                                    )}>
                                        <td className="px-6 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedIndices.has(idx)}
                                                onChange={() => toggleSelect(idx)}
                                                className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="font-medium text-white">
                                                {(() => {
                                                    const tag = availableTags.find(t => t.tag_id === mapping.tag_id);
                                                    if (tag && tag.type === 'IO' && tag.device_id) {
                                                        return (
                                                            <span className="flex items-baseline gap-1">
                                                                <span className="text-primary font-bold">{devicesMap[tag.device_id] || 'Unknown'}:</span>
                                                                <span>{tag.name}</span>
                                                            </span>
                                                        );
                                                    }
                                                    return tag?.name || mapping.tag_id;
                                                })()}
                                            </div>
                                            <div className="text-xs text-text-muted font-mono"><small>{mapping.tag_id}</small></div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <input
                                                type="number"
                                                value={mapping.base_value || 0}
                                                onChange={(e) => updateMapping(idx, 'base_value', parseInt(e.target.value) || 0)}
                                                className="w-24 bg-transparent border border-surfaceHighlight/30 rounded px-2 py-1 text-text-secondary focus:text-white focus:border-primary outline-none"
                                                title="Base offset for IOA calculation"
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <input
                                                type="number"
                                                value={mapping.ioa || 0}
                                                onChange={(e) => updateMapping(idx, 'ioa', parseInt(e.target.value) || 0)}
                                                className="w-20 bg-transparent border border-surfaceHighlight/30 rounded px-2 py-1 text-text-secondary focus:text-white focus:border-primary outline-none"
                                                title="IOA offset (added to base value)"
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className="text-primary font-mono font-bold">{computedIOA}</span>
                                        </td>
                                        <td className="px-6 py-3">
                                            <select
                                                value={mapping.type_id || 'M_ME_NC_1'}
                                                onChange={(e) => updateMapping(idx, 'type_id', e.target.value)}
                                                className="bg-transparent border border-surfaceHighlight/30 rounded px-2 py-1 text-text-secondary focus:text-white focus:border-primary outline-none text-sm"
                                                title="Select IEC 104 Type ID"
                                            >
                                                <optgroup label="Analog Values">
                                                    <option value="M_ME_NC_1">M_ME_NC_1 - Float (IEEE 754)</option>
                                                    <option value="M_ME_NA_1">M_ME_NA_1 - Normalized (-1.0 to +1.0)</option>
                                                    <option value="M_ME_NB_1">M_ME_NB_1 - Scaled (-32768 to +32767)</option>
                                                    <option value="M_ME_ND_1">M_ME_ND_1 - Normalized (No Quality)</option>
                                                </optgroup>
                                                <optgroup label="Digital Values">
                                                    <option value="M_SP_NA_1">M_SP_NA_1 - Single Point (Boolean)</option>
                                                    <option value="M_DP_NA_1">M_DP_NA_1 - Double Point (0-3)</option>
                                                    <option value="M_ST_NA_1">M_ST_NA_1 - Step Position (-64 to +63)</option>
                                                </optgroup>
                                                <optgroup label="Other">
                                                    <option value="M_BO_NA_1">M_BO_NA_1 - Bitstring (32 bits)</option>
                                                </optgroup>
                                            </select>
                                        </td>
                                        <td className="px-6 py-3">
                                            <input
                                                type="checkbox"
                                                checked={mapping.soe || false}
                                                onChange={(e) => updateMapping(idx, 'soe', e.target.checked)}
                                                className="w-4 h-4 accent-primary cursor-pointer"
                                                title="Sequence of Events"
                                            />
                                        </td>
                                        <td className="px-6 py-3">
                                            <select
                                                value={mapping.cot || 'SPONTANEOUS'}
                                                onChange={(e) => updateMapping(idx, 'cot', e.target.value)}
                                                className="bg-transparent border border-surfaceHighlight/30 rounded px-2 py-1 text-text-secondary focus:text-white focus:border-primary outline-none text-xs"
                                                title="Cause of Transmission"
                                            >
                                                <option value="SPONTANEOUS">SPONTANEOUS</option>
                                                <option value="PERIODIC">PERIODIC</option>
                                                <option value="INTERROGATED">INTERROGATED</option>
                                                <option value="REQUEST">REQUEST</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-3">
                                            <button onClick={() => removeMapping(idx)} className="text-text-muted hover:text-warning transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderMqttContent = () => {
        const addBroker = () => {
            const newBrokers = [...config.config.brokers, { id: Date.now().toString(), host: 'localhost', port: 1883 }];
            handleConfigChange('brokers', newBrokers);
        };

        const updateBroker = (index, field, value) => {
            const newBrokers = [...config.config.brokers];
            newBrokers[index] = { ...newBrokers[index], [field]: value };
            handleConfigChange('brokers', newBrokers);
        };

        const removeBroker = (index) => {
            const newBrokers = config.config.brokers.filter((_, i) => i !== index);
            handleConfigChange('brokers', newBrokers);
        };

        const addPublication = () => {
            const newPubs = [...config.config.publications, {
                id: Date.now().toString(),
                broker_id: config.config.brokers[0]?.id,
                topic: 'vistaiot/data',
                interval: 5,
                payload_template: '{}',
                tags: []
            }];
            handleConfigChange('publications', newPubs);
        };

        const updatePublication = (index, field, value) => {
            const newPubs = [...config.config.publications];
            newPubs[index] = { ...newPubs[index], [field]: value };
            handleConfigChange('publications', newPubs);
        };

        const removePublication = (index) => {
            const newPubs = config.config.publications.filter((_, i) => i !== index);
            handleConfigChange('publications', newPubs);
        };

        return (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Brokers Section */}
                <div className="bg-surfaceHighlight/10 rounded-2xl border border-surfaceHighlight/30 overflow-hidden">
                    <div className="p-6 border-b border-surfaceHighlight/30 flex justify-between items-center">
                        <h4 className="text-lg font-bold text-white flex items-center gap-2">
                            <Network size={20} className="text-primary" /> Brokers
                        </h4>
                        <button onClick={addBroker} className="flex items-center gap-2 px-4 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors">
                            <Plus size={16} /> Add Broker
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        {(config.config.brokers || []).map((broker, idx) => (
                            <div key={broker.id} className="p-4 bg-surfaceHighlight/5 rounded-xl border border-surfaceHighlight/20 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="text-xs text-text-muted block mb-1">Host</label>
                                        <input value={broker.host} onChange={(e) => updateBroker(idx, 'host', e.target.value)} className="w-full bg-bg-card border border-surfaceHighlight/30 rounded px-3 py-2 text-sm text-white" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-muted block mb-1">Port</label>
                                        <input type="number" value={broker.port} onChange={(e) => updateBroker(idx, 'port', parseInt(e.target.value))} className="w-full bg-bg-card border border-surfaceHighlight/30 rounded px-3 py-2 text-sm text-white" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-muted block mb-1">Client ID</label>
                                        <input value={broker.client_id} onChange={(e) => updateBroker(idx, 'client_id', e.target.value)} className="w-full bg-bg-card border border-surfaceHighlight/30 rounded px-3 py-2 text-sm text-white" />
                                    </div>
                                    <div className="flex items-end justify-end">
                                        <button onClick={() => removeBroker(idx)} className="p-2 text-text-muted hover:text-warning transition-colors"><Trash2 size={18} /></button>
                                    </div>
                                </div>

                                {/* Username/Password */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-text-muted block mb-1">Username (optional)</label>
                                        <input value={broker.username || ''} onChange={(e) => updateBroker(idx, 'username', e.target.value)} className="w-full bg-bg-card border border-surfaceHighlight/30 rounded px-3 py-2 text-sm text-white" placeholder="Leave empty if not required" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-muted block mb-1">Password (optional)</label>
                                        <input type="password" value={broker.password || ''} onChange={(e) => updateBroker(idx, 'password', e.target.value)} className="w-full bg-bg-card border border-surfaceHighlight/30 rounded px-3 py-2 text-sm text-white" placeholder="Leave empty if not required" />
                                    </div>
                                </div>

                                {/* TLS/SSL Configuration */}
                                <div className="border-t border-surfaceHighlight/20 pt-4">
                                    <div className="flex items-center gap-3 mb-3">
                                        <input
                                            type="checkbox"
                                            id={`tls-${broker.id}`}
                                            checked={broker.use_tls || false}
                                            onChange={(e) => updateBroker(idx, 'use_tls', e.target.checked)}
                                            className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                        />
                                        <label htmlFor={`tls-${broker.id}`} className="text-sm font-medium text-white cursor-pointer">
                                            Use TLS/SSL (Port 8883)
                                        </label>
                                    </div>

                                    {broker.use_tls && (
                                        <div className="space-y-3 pl-7">
                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <label className="text-xs text-text-muted">Certificate</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowCertUpload(true)}
                                                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                                                    >
                                                        <Upload size={12} />
                                                        Upload New
                                                    </button>
                                                </div>
                                                <select
                                                    value={broker.certificate_id || ''}
                                                    onChange={(e) => updateBroker(idx, 'certificate_id', e.target.value ? parseInt(e.target.value) : null)}
                                                    className="w-full bg-bg-card border border-surfaceHighlight/30 rounded px-3 py-2 text-sm text-white"
                                                >
                                                    <option value="">No certificate (server validation only)</option>
                                                    {certificates.map(cert => (
                                                        <option key={cert.id} value={cert.id}>
                                                            {cert.name} {cert.description ? `- ${cert.description}` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                                {certificates.length === 0 && (
                                                    <p className="text-xs text-text-muted mt-1">
                                                        No certificates uploaded. Click "Upload New" to add one.
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    id={`tls-insecure-${broker.id}`}
                                                    checked={broker.tls_insecure || false}
                                                    onChange={(e) => updateBroker(idx, 'tls_insecure', e.target.checked)}
                                                    className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                                                />
                                                <label htmlFor={`tls-insecure-${broker.id}`} className="text-xs text-text-muted cursor-pointer">
                                                    Skip certificate verification (insecure, for self-signed certs)
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Publications Section */}
                <div className="bg-surfaceHighlight/10 rounded-2xl border border-surfaceHighlight/30 overflow-hidden">
                    <div className="p-6 border-b border-surfaceHighlight/30 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <h4 className="text-lg font-bold text-white flex items-center gap-2">
                                <RefreshCw size={20} className="text-primary" /> Publications
                            </h4>
                            {selectedIndices.size > 0 && (
                                <button
                                    onClick={deleteSelected}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors border border-red-500/30"
                                >
                                    <Trash2 size={14} /> Delete {selectedIndices.size} Selected
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={exportToCSV} className="flex items-center gap-2 px-3 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors text-sm">
                                <Copy size={14} /> Export CSV
                            </button>
                            <label className="flex items-center gap-2 px-3 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors text-sm cursor-pointer">
                                <Database size={14} /> Import CSV
                                <input type="file" accept=".csv" onChange={importFromCSV} className="hidden" />
                            </label>
                            <button onClick={addPublication} className="flex items-center gap-2 px-4 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-lg transition-colors">
                                <Plus size={16} /> Add Publication
                            </button>
                        </div>
                    </div>

                    {/* Select All for Publications */}
                    {(config.config.publications || []).length > 0 && (
                        <div className="px-6 py-2 bg-surfaceHighlight/20 border-b border-surfaceHighlight/30 flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={selectedIndices.size > 0 && selectedIndices.size === (config.config.publications || []).length}
                                onChange={() => {
                                    const pubs = config.config.publications || [];
                                    if (selectedIndices.size === pubs.length) {
                                        setSelectedIndices(new Set());
                                    } else {
                                        setSelectedIndices(new Set(pubs.map((_, i) => i)));
                                    }
                                }}
                                className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0"
                            />
                            <span className="text-xs text-text-secondary font-medium uppercase tracking-wider">Select All</span>
                        </div>
                    )}

                    <div className="divide-y divide-surfaceHighlight/10">
                        {(config.config.publications || []).map((pub, idx) => (
                            <div key={pub.id} className={clsx(
                                "p-6 space-y-4 transition-colors",
                                selectedIndices.has(idx) ? "bg-primary/10" : ""
                            )}>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-4 flex-1">
                                        <input
                                            type="checkbox"
                                            checked={selectedIndices.has(idx)}
                                            onChange={() => toggleSelect(idx)}
                                            className="w-4 h-4 rounded border-surfaceHighlight/50 bg-surfaceHighlight/20 text-primary focus:ring-primary focus:ring-offset-0 mr-2"
                                        />
                                        <div
                                            className="flex items-center gap-4 flex-1 cursor-pointer"
                                            onClick={() => toggleItem(pub.id)}
                                        >
                                            {expandedItems[pub.id] ? <ChevronDown size={18} className="text-text-secondary" /> : <ChevronRight size={18} className="text-text-secondary" />}
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-white">{pub.topic || 'New Publication'}</span>
                                                <span className="text-xs text-text-muted">
                                                    {config.config.brokers.find(b => b.id === pub.broker_id)?.host || 'Unknown Broker'} • {pub.interval}s
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => removePublication(idx)} className="text-text-muted hover:text-warning transition-colors p-2">
                                        <Trash2 size={18} />
                                    </button>
                                </div>

                                {expandedItems[pub.id] && (
                                    <div className="pl-8 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="text-xs text-text-muted block mb-1">Broker</label>
                                                <select
                                                    value={pub.broker_id}
                                                    onChange={(e) => updatePublication(idx, 'broker_id', e.target.value)}
                                                    className="w-full bg-bg-card border border-surfaceHighlight/30 rounded px-3 py-2 text-sm text-white"
                                                >
                                                    {config.config.brokers.map(b => <option key={b.id} value={b.id}>{b.host}:{b.port}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs text-text-muted block mb-1">Topic</label>
                                                <input value={pub.topic} onChange={(e) => updatePublication(idx, 'topic', e.target.value)} className="w-full bg-bg-card border border-surfaceHighlight/30 rounded px-3 py-2 text-sm text-white" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-text-muted block mb-1">Interval (s)</label>
                                                <input type="number" value={pub.interval} onChange={(e) => updatePublication(idx, 'interval', parseInt(e.target.value))} className="w-full bg-bg-card border border-surfaceHighlight/30 rounded px-3 py-2 text-sm text-white" />
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="text-xs text-text-muted">Payload Template</label>
                                                <button
                                                    onClick={() => { setCurrentPubId(pub.id); setSelectorContext('MQTT_PUB'); setShowTagSelector(true); }}
                                                    className="text-xs text-primary hover:text-primary-hover flex items-center gap-1"
                                                >
                                                    <Plus size={12} /> Add Tags to List
                                                </button>
                                            </div>
                                            <JsonEditor
                                                value={pub.payload_template}
                                                onChange={(val) => updatePublication(idx, 'payload_template', val)}
                                                availableTags={availableTags}
                                                devicesMap={devicesMap}
                                            />
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {(pub.tags || []).map(tagId => (
                                                    <span key={tagId} className="px-2 py-1 bg-surfaceHighlight/20 rounded text-xs text-text-secondary flex items-center gap-1">
                                                        {tagId}
                                                        <button
                                                            onClick={() => {
                                                                const newTags = pub.tags.filter(t => t !== tagId);
                                                                updatePublication(idx, 'tags', newTags);
                                                            }}
                                                            className="hover:text-white"
                                                        >
                                                            <XCircle size={10} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                </div>
            </div>
        );
    };

    const renderContent = () => {
        if (loading) {
            return (
                <div className="space-y-8 animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-12 w-full rounded-xl" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-12 w-full rounded-xl" />
                        </div>
                    </div>
                    <div className="bg-surfaceHighlight/10 rounded-2xl border border-surfaceHighlight/30 overflow-hidden p-6 space-y-4">
                        <div className="flex justify-between items-center mb-6">
                            <Skeleton className="h-8 w-48" />
                            <div className="flex gap-2">
                                <Skeleton className="h-9 w-24 rounded-lg" />
                                <Skeleton className="h-9 w-24 rounded-lg" />
                                <Skeleton className="h-9 w-24 rounded-lg" />
                            </div>
                        </div>
                        <div className="space-y-4">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="flex gap-4">
                                    <Skeleton className="h-10 flex-1 rounded-lg" />
                                    <Skeleton className="h-10 w-32 rounded-lg" />
                                    <Skeleton className="h-10 w-24 rounded-lg" />
                                    <Skeleton className="h-10 w-12 rounded-lg" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }
        switch (activeTab) {
            case 'MODBUS_SERVER': return renderModbusContent();
            case 'OPC_UA_SERVER': return renderOpcUaContent();
            case 'IEC104_SERVER': return renderIec104Content();
            case 'MQTT_PUBLISHER': return renderMqttContent();
            default: return null;
        }
    };

    return (
        <div className="space-y-8 relative">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Server Configuration</h1>
                    <p className="text-text-secondary">Configure Northbound interfaces (Modbus, OPC UA, MQTT)</p>
                </div>
            </div>

            <div className="bg-surface/50 backdrop-blur-md border border-surfaceHighlight rounded-2xl overflow-hidden shadow-card">
                <div className="flex border-b border-surfaceHighlight/50 overflow-x-auto">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                className={clsx(
                                    'flex items-center gap-3 px-8 py-5 text-sm font-medium transition-all duration-300 relative whitespace-nowrap',
                                    isActive ? 'text-white bg-surfaceHighlight/10' : 'text-text-muted hover:text-white hover:bg-surfaceHighlight/5'
                                )}
                            >
                                <Icon size={18} className={clsx("transition-colors", isActive ? tab.color : "text-text-muted")} />
                                {tab.label}
                                {isActive && <div className={clsx("absolute bottom-0 left-0 w-full h-0.5 shadow-[0_0_10px_currentColor]", tab.color.replace('text-', 'bg-'))} />}
                            </button>
                        );
                    })}
                </div>

                <div className="p-8">
                    <div className="flex items-center justify-between mb-8 bg-surfaceHighlight/10 p-4 rounded-xl border border-surfaceHighlight/30">
                        <div className="flex items-center gap-4">
                            <label className="relative inline-flex items-center cursor-pointer group">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={config.enabled}
                                    onChange={(e) => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                                />
                                <div className="w-14 h-7 bg-surfaceHighlight/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-success shadow-inner"></div>
                                <span className={clsx("ml-3 text-sm font-medium transition-colors", config.enabled ? "text-white" : "text-text-muted")}>
                                    {config.enabled ? 'Server Enabled' : 'Server Disabled'}
                                </span>
                            </label>
                            {config.enabled && (
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-success/10 border border-success/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                                    <span className="text-xs font-medium text-success">Running</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            {isDirty && (
                                <span className="text-warning text-sm font-medium animate-pulse flex items-center gap-2">
                                    <AlertTriangle size={16} />
                                    Unsaved Changes
                                </span>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={saving || validationErrors.length > 0}
                                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:shadow-none hover:scale-105 active:scale-95"
                            >
                                <Save size={18} />
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                    {renderContent()}
                </div>
            </div>

            <TagMappingSelector
                isOpen={showTagSelector}
                onClose={() => setShowTagSelector(false)}
                onSelect={handleTagsSelected}
                mappedTags={[]} // Allow duplicate mappings - same tag can be mapped multiple times
                title={selectorContext === 'MQTT_PUB' ? "Select Tags for Publication" : "Select Tags to Map"}
            />

            {/* Certificate Upload Modal */}
            {showCertUpload && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-surface/90 backdrop-blur-xl border border-surfaceHighlight/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-surface/90 backdrop-blur-xl border-b border-surfaceHighlight/50 p-6 flex justify-between items-center z-10">
                            <h3 className="text-2xl font-bold text-white">Upload TLS Certificate</h3>
                            <button
                                onClick={() => setShowCertUpload(false)}
                                className="text-text-muted hover:text-white transition-colors p-2 hover:bg-surfaceHighlight/30 rounded-lg"
                            >
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="p-6">
                            <CertificateUpload
                                onUploadSuccess={() => {
                                    setShowCertUpload(false);
                                    loadCertificates(); // Reload certificates after upload
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
