import React, { useState, useEffect, useMemo } from 'react';
import { Save, Server, Activity, Settings, RefreshCw, CheckCircle, XCircle, Plus, Trash2, Search, AlertTriangle, Edit2, ChevronRight, ChevronDown, Database, Network, Wifi, Gauge, Tag, Calculator, BarChart3, User, Wand2, Copy } from 'lucide-react';
import axios from 'axios';
import clsx from 'clsx';
import TagMappingSelector from '../components/TagMappingSelector';
import JsonEditor from '../components/JsonEditor';
import { getTags } from '../services/api';

// Use relative URL or window.location to avoid hardcoded localhost
const API_URL = `http://${window.location.hostname}:8000/api/v1`;

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

    // Tag Selector State
    const [showTagSelector, setShowTagSelector] = useState(false);
    const [selectorContext, setSelectorContext] = useState(null); // 'MAPPING' or 'MQTT_PUB'
    const [currentPubId, setCurrentPubId] = useState(null);
    const [availableTags, setAvailableTags] = useState([]);
    const [expandedItems, setExpandedItems] = useState({});

    const toggleItem = (id) => {
        setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const tabs = [
        { id: 'MODBUS_SERVER', label: 'Modbus Server', icon: Server, color: 'text-blue-400' },
        { id: 'OPC_UA_SERVER', label: 'OPC UA Server', icon: Activity, color: 'text-cyan-400' },
        { id: 'IEC104_SERVER', label: 'IEC104 Server', icon: Settings, color: 'text-purple-400' },
        { id: 'MQTT_PUBLISHER', label: 'MQTT Publisher', icon: RefreshCw, color: 'text-emerald-400' },
    ];

    useEffect(() => {
        // Reset config to avoid showing stale data while loading
        setConfig({
            enabled: false,
            config: { mappings: [], brokers: [], publications: [] }
        });
        fetchConfig(activeTab);
        loadTags();
    }, [activeTab]);

    const loadTags = async () => {
        try {
            const tagsRes = await getTags();
            setAvailableTags(tagsRes.data);
        } catch (error) {
            console.error("Failed to load tags", error);
        }
    };

    const fetchConfig = async (type) => {
        setLoading(true);
        try {
            const response = await axios.get(`${API_URL}/servers/${type}`);
            const data = response.data;
            // Ensure arrays exist
            if (!data.config.mappings) data.config.mappings = [];
            if (!data.config.brokers) data.config.brokers = [];
            if (!data.config.publications) data.config.publications = [];
            setConfig(data);
        } catch (error) {
            console.error('Error fetching server config:', error);
            // Ensure config is reset on error
            setConfig({
                enabled: false,
                config: { mappings: [], brokers: [], publications: [] }
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.put(`${API_URL}/servers/${activeTab}`, config);
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
                if (newMappings.find(m => m.tag_id === tag.tag_id)) return;

                let mapping = { tag_id: tag.tag_id, name: tag.name, data_type: tag.data_type || 'INT16' };

                if (activeTab === 'MODBUS_SERVER') {
                    let regType = 'HR';
                    if (tag.data_type === 'BOOL') regType = 'CO';
                    const address = getNextAddress(newMappings, regType, getDataSize(tag.data_type));

                    mapping = { ...mapping, register_type: regType, address, unit_id: 1 };
                } else if (activeTab === 'OPC_UA_SERVER') {
                    mapping = { ...mapping, node_name: tag.name || tag.tag_id };
                } else if (activeTab === 'IEC104_SERVER') {
                    const ioa = getNextIOA(newMappings);
                    let typeId = 'M_ME_NC_1'; // Float
                    if (tag.data_type === 'BOOL') typeId = 'M_SP_NA_1'; // Single Point
                    mapping = { ...mapping, ioa, type_id: typeId };
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
            const grouped = { 'HR': [], 'IR': [], 'CO': [], 'DI': [] };
            mappings.forEach(m => {
                const type = m.register_type || 'HR';
                if (grouped[type]) grouped[type].push(m);
                else grouped['HR'].push(m);
            });

            const newMappings = [];
            Object.keys(grouped).forEach(type => {
                let currentAddr = 1;
                grouped[type].forEach(m => {
                    m.address = currentAddr;
                    currentAddr += getDataSize(m.data_type);
                    newMappings.push(m);
                });
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

    // --- Validation Logic ---
    const validationErrors = useMemo(() => {
        const errors = [];
        const mappings = config.config.mappings || [];

        if (activeTab === 'MODBUS_SERVER') {
            const used = {};
            mappings.forEach((m) => {
                const start = parseInt(m.address);
                const size = getDataSize(m.data_type);
                const end = start + size;
                for (let i = start; i < end; i++) {
                    const key = `${m.register_type}_${i}`;
                    if (used[key]) errors.push(`Overlap: ${m.tag_id} at ${m.register_type} ${i}`);
                    else used[key] = m.tag_id;
                }
            });
        } else if (activeTab === 'IEC104_SERVER') {
            const used = {};
            mappings.forEach(m => {
                if (used[m.ioa]) errors.push(`Duplicate IOA: ${m.ioa}`);
                else used[m.ioa] = true;
            });
        }

        return errors;
    }, [config.config.mappings, activeTab]);

    // --- CSV Import/Export Logic ---

    const exportToCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        let filename = `${activeTab}_config.csv`;

        if (activeTab === 'MODBUS_SERVER') {
            csvContent += "tag_id,register_type,address,data_type,unit_id\n";
            (config.config.mappings || []).forEach(m => {
                csvContent += `${m.tag_id},${m.register_type},${m.address},${m.data_type},${m.unit_id}\n`;
            });
        } else if (activeTab === 'OPC_UA_SERVER') {
            csvContent += "tag_id,node_name,data_type\n";
            (config.config.mappings || []).forEach(m => {
                csvContent += `${m.tag_id},${m.node_name},${m.data_type}\n`;
            });
        } else if (activeTab === 'IEC104_SERVER') {
            csvContent += "tag_id,ioa,type_id\n";
            (config.config.mappings || []).forEach(m => {
                csvContent += `${m.tag_id},${m.ioa},${m.type_id}\n`;
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
            const headers = lines[0].split(',').map(h => h.trim());

            const newMappings = [];
            const newPublications = [];

            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;

                // Simple CSV parser handling quotes for MQTT payload
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
                    if (row.length >= 5) {
                        newMappings.push({
                            tag_id: row[0],
                            register_type: row[1],
                            address: parseInt(row[2]),
                            data_type: row[3],
                            unit_id: parseInt(row[4])
                        });
                    }
                } else if (activeTab === 'OPC_UA_SERVER') {
                    if (row.length >= 3) {
                        newMappings.push({
                            tag_id: row[0],
                            node_name: row[1],
                            data_type: row[2]
                        });
                    }
                } else if (activeTab === 'IEC104_SERVER') {
                    if (row.length >= 3) {
                        newMappings.push({
                            tag_id: row[0],
                            ioa: parseInt(row[1]),
                            type_id: row[2]
                        });
                    }
                } else if (activeTab === 'MQTT_PUBLISHER') {
                    if (row.length >= 5) {
                        newPublications.push({
                            id: Date.now().toString() + i, // Generate unique ID
                            broker_id: row[0],
                            topic: row[1],
                            interval: parseInt(row[2]),
                            payload_template: row[3].replace(/""/g, '"'), // Unescape quotes
                            tags: row[4] ? row[4].split('|') : []
                        });
                    }
                }
            }

            if (activeTab === 'MQTT_PUBLISHER') {
                handleConfigChange('publications', [...config.config.publications, ...newPublications]);
            } else {
                handleConfigChange('mappings', [...(config.config.mappings || []), ...newMappings]);
            }
            alert('Import successful! Please save changes.');
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    };

    // --- Renderers ---

    const renderModbusContent = () => (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
            </div>

            {/* Mappings Table */}
            <div className="bg-surfaceHighlight/10 rounded-2xl border border-surfaceHighlight/30 overflow-hidden">
                <div className="p-6 border-b border-surfaceHighlight/30 flex justify-between items-center">
                    <h4 className="text-lg font-bold text-white flex items-center gap-2">
                        <Activity size={20} className="text-primary" /> Tag Mappings
                    </h4>
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
                    <div className="p-4 bg-warning/10 border-b border-warning/20 flex items-center justify-between">
                        <div className="text-warning text-sm flex items-center gap-2">
                            <AlertTriangle size={14} /> {validationErrors.length} issues found
                        </div>
                        <button onClick={autoAdjustMappings} className="flex items-center gap-2 px-3 py-1.5 bg-warning/20 hover:bg-warning/30 text-warning rounded-lg text-sm font-medium transition-colors border border-warning/30">
                            <Wand2 size={14} /> Auto Adjust
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-surfaceHighlight/20 text-text-secondary font-medium">
                            <tr>
                                <th className="px-6 py-3">Tag ID</th>
                                <th className="px-6 py-3">Register Type</th>
                                <th className="px-6 py-3">Address</th>
                                <th className="px-6 py-3">Data Type</th>
                                <th className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surfaceHighlight/10">
                            {(config.config.mappings || []).map((mapping, idx) => (
                                <tr key={idx} className="hover:bg-surfaceHighlight/5 transition-colors">
                                    <td className="px-6 py-3 text-white font-mono">{mapping.tag_id}</td>
                                    <td className="px-6 py-3">
                                        <select
                                            value={mapping.register_type}
                                            onChange={(e) => updateMapping(idx, 'register_type', e.target.value)}
                                            className="bg-transparent border border-surfaceHighlight/30 rounded px-2 py-1 text-text-secondary focus:text-white focus:border-primary outline-none"
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
                                            className="w-20 bg-transparent border border-surfaceHighlight/30 rounded px-2 py-1 text-text-secondary focus:text-white focus:border-primary outline-none"
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
                            ))}
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
                    <h4 className="text-lg font-bold text-white flex items-center gap-2">
                        <Activity size={20} className="text-primary" /> Node Mappings
                    </h4>
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
                                <th className="px-6 py-3">Tag ID</th>
                                <th className="px-6 py-3">Node Name</th>
                                <th className="px-6 py-3">Node ID</th>
                                <th className="px-6 py-3">Data Type</th>
                                <th className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surfaceHighlight/10">
                            {(config.config.mappings || []).map((mapping, idx) => (
                                <tr key={idx} className="hover:bg-surfaceHighlight/5 transition-colors">
                                    <td className="px-6 py-3 text-white font-mono">{mapping.tag_id}</td>
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
                    <h4 className="text-lg font-bold text-white flex items-center gap-2">
                        <Activity size={20} className="text-primary" /> IOA Mappings
                    </h4>
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
                                <th className="px-6 py-3">Tag ID</th>
                                <th className="px-6 py-3">IOA</th>
                                <th className="px-6 py-3">Type ID</th>
                                <th className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surfaceHighlight/10">
                            {(config.config.mappings || []).map((mapping, idx) => (
                                <tr key={idx} className="hover:bg-surfaceHighlight/5 transition-colors">
                                    <td className="px-6 py-3 text-white font-mono">{mapping.tag_id}</td>
                                    <td className="px-6 py-3">
                                        <input
                                            type="number"
                                            value={mapping.ioa}
                                            onChange={(e) => updateMapping(idx, 'ioa', parseInt(e.target.value))}
                                            className="w-20 bg-transparent border border-surfaceHighlight/30 rounded px-2 py-1 text-text-secondary focus:text-white focus:border-primary outline-none"
                                        />
                                    </td>
                                    <td className="px-6 py-3">
                                        <select
                                            value={mapping.type_id}
                                            onChange={(e) => updateMapping(idx, 'type_id', e.target.value)}
                                            className="bg-transparent border border-surfaceHighlight/30 rounded px-2 py-1 text-text-secondary focus:text-white focus:border-primary outline-none"
                                        >
                                            <option value="M_ME_NC_1">Measured Value (Float)</option>
                                            <option value="M_SP_NA_1">Single Point</option>
                                            <option value="M_DP_NA_1">Double Point</option>
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
                            <div key={broker.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-surfaceHighlight/5 rounded-xl border border-surfaceHighlight/20">
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
                        ))}
                    </div>
                </div>

                {/* Publications Section */}
                <div className="bg-surfaceHighlight/10 rounded-2xl border border-surfaceHighlight/30 overflow-hidden">
                    <div className="p-6 border-b border-surfaceHighlight/30 flex justify-between items-center">
                        <h4 className="text-lg font-bold text-white flex items-center gap-2">
                            <RefreshCw size={20} className="text-primary" /> Publications
                        </h4>
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
                    <div className="divide-y divide-surfaceHighlight/10">
                        {(config.config.publications || []).map((pub, idx) => (
                            <div key={pub.id} className="p-6 space-y-4">
                                <div className="flex justify-between items-center">
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
        if (loading) return <div className="p-12 text-center text-text-muted animate-pulse">Loading configuration...</div>;
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
                                onClick={() => setActiveTab(tab.id)}
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
                        <button
                            onClick={handleSave}
                            disabled={saving || validationErrors.length > 0}
                            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:shadow-none hover:scale-105 active:scale-95"
                        >
                            <Save size={18} />
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                    {renderContent()}
                </div>
            </div>

            <TagMappingSelector
                isOpen={showTagSelector}
                onClose={() => setShowTagSelector(false)}
                onSelect={handleTagsSelected}
                mappedTags={selectorContext === 'MAPPING' ? (config.config.mappings || []).map(m => m.tag_id) : []}
                title={selectorContext === 'MQTT_PUB' ? "Select Tags for Publication" : "Select Tags to Map"}
            />
        </div>
    );
}
