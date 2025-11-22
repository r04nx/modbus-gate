import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { getDevices, getTags } from '../services/api';
import TagTreeSelector from './TagTreeSelector';
import VariableMapper from './VariableMapper';
import OperationsLibrary from './OperationsLibrary';
import FormulaBuilder from './FormulaBuilder';

const TagForm = ({ onClose, onSubmit, editTag = null }) => {
    const isEditMode = !!editTag;
    const [type, setType] = useState(editTag?.type || 'IO');
    const [devices, setDevices] = useState([]);
    const [tags, setTags] = useState([]);
    const [formData, setFormData] = useState({
        tag_id: editTag?.tag_id || '',
        name: editTag?.name || '',
        description: editTag?.description || '',
        device_id: editTag?.device_id || '',
        address: editTag?.address || '',
        data_type: editTag?.data_type || 'INT16',
        params: editTag?.params || {},
        initial_value: editTag?.initial_value || '',
        calculation_formula: editTag?.calculation_formula || '',
        variable_mappings: editTag?.variable_mappings || {}
    });

    const [selectedDevice, setSelectedDevice] = useState(null);

    // Calculation builder state
    const [showTagSelector, setShowTagSelector] = useState(false);
    const [showOperations, setShowOperations] = useState(false);
    const [selectedVariable, setSelectedVariable] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [devicesRes, tagsRes] = await Promise.all([
                    getDevices(),
                    getTags()
                ]);
                setDevices(devicesRes.data);
                setTags(tagsRes.data);

                if (isEditMode && editTag?.device_id) {
                    const device = devicesRes.data.find(d => d.id === editTag.device_id);
                    setSelectedDevice(device);
                } else if (devicesRes.data.length > 0) {
                    setFormData(prev => ({ ...prev, device_id: devicesRes.data[0].id }));
                    setSelectedDevice(devicesRes.data[0]);
                }
            } catch (error) {
                console.error("Failed to fetch data", error);
            }
        };
        fetchData();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'device_id') {
            const dev = devices.find(d => d.id === parseInt(value));
            setSelectedDevice(dev);
            setFormData(prev => ({ ...prev, [name]: value }));
        } else if (name.startsWith('params.')) {
            const paramName = name.split('.')[1];
            setFormData(prev => ({
                ...prev,
                params: { ...prev.params, [paramName]: value }
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const tagData = { ...formData, type };

        // Generate unique tag_id if not provided by user
        if (!tagData.tag_id) {
            // Create base from name
            const base = tagData.name.toUpperCase().replace(/\s+/g, '_').substring(0, 20);
            // Add timestamp + random suffix for uniqueness
            const timestamp = Date.now().toString(36);
            const random = Math.random().toString(36).substring(2, 6);
            tagData.tag_id = `${base}_${timestamp}_${random}`.toUpperCase();
        }

        // Check if tag_id already exists in current tags list
        const isDuplicate = tags.some(tag =>
            tag.tag_id === tagData.tag_id && (!editTag || tag.id !== editTag.id)
        );

        if (isDuplicate) {
            alert(`Tag ID "${tagData.tag_id}" already exists. Please use a different Tag ID.`);
            return;
        }

        onSubmit(tagData);
    };

    const renderProtocolFields = () => {
        if (!selectedDevice) return null;

        switch (selectedDevice.type) {
            case 'MODBUS_TCP':
            case 'MODBUS_RTU':
                return (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Register Type</label>
                            <select
                                name="params.register_type"
                                value={formData.params?.register_type || 'HOLDING'}
                                onChange={handleChange}
                                className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                            >
                                <option value="HOLDING">Holding Register (4x)</option>
                                <option value="INPUT">Input Register (3x)</option>
                                <option value="COIL">Coil (0x)</option>
                                <option value="DISCRETE">Discrete Input (1x)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Address (0-65535)</label>
                            <input
                                name="address"
                                value={formData.address}
                                onChange={handleChange}
                                placeholder="e.g. 100"
                                className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Data Type</label>
                            <select
                                name="data_type"
                                value={formData.data_type}
                                onChange={handleChange}
                                className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                            >
                                <option value="INT16">INT16</option>
                                <option value="UINT16">UINT16</option>
                                <option value="FLOAT32">FLOAT32</option>
                                <option value="BOOLEAN">BOOLEAN</option>
                            </select>
                        </div>
                    </div>
                );
            case 'SNMP':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">OID (Object Identifier)</label>
                            <input
                                name="address"
                                value={formData.address}
                                onChange={handleChange}
                                placeholder="e.g. 1.3.6.1.2.1.1.1.0"
                                className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Data Type</label>
                            <select
                                name="data_type"
                                value={formData.data_type}
                                onChange={handleChange}
                                className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                            >
                                <option value="STRING">STRING</option>
                                <option value="INTEGER">INTEGER</option>
                                <option value="COUNTER">COUNTER</option>
                                <option value="GAUGE">GAUGE</option>
                                <option value="TIMETICKS">TIMETICKS</option>
                            </select>
                        </div>
                    </div>
                );
            case 'OPC_UA':
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Node ID</label>
                            <input
                                name="address"
                                value={formData.address}
                                onChange={handleChange}
                                placeholder="e.g. ns=2;i=1001"
                                className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Data Type</label>
                            <select
                                name="data_type"
                                value={formData.data_type}
                                onChange={handleChange}
                                className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                            >
                                <option value="Auto">Auto-detect</option>
                                <option value="Boolean">Boolean</option>
                                <option value="SByte">SByte</option>
                                <option value="Byte">Byte</option>
                                <option value="Int16">Int16</option>
                                <option value="UInt16">UInt16</option>
                                <option value="Int32">Int32</option>
                                <option value="UInt32">UInt32</option>
                                <option value="Float">Float</option>
                                <option value="Double">Double</option>
                                <option value="String">String</option>
                            </select>
                        </div>
                    </div>
                );
            case 'IEC104':
                return (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">IO Address (Information Object Address)</label>
                            <input
                                name="address"
                                value={formData.address}
                                onChange={handleChange}
                                placeholder="e.g. 100"
                                className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Type ID</label>
                            <select
                                name="params.type_id"
                                value={formData.params?.type_id || 'M_SP_NA_1'}
                                onChange={handleChange}
                                className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                            >
                                <option value="M_SP_NA_1">Single Point (M_SP_NA_1)</option>
                                <option value="M_DP_NA_1">Double Point (M_DP_NA_1)</option>
                                <option value="M_ST_NA_1">Step Position (M_ST_NA_1)</option>
                                <option value="M_ME_NA_1">Measured Normalized (M_ME_NA_1)</option>
                                <option value="M_ME_NB_1">Measured Scaled (M_ME_NB_1)</option>
                                <option value="M_ME_NC_1">Measured Short Float (M_ME_NC_1)</option>
                            </select>
                        </div>
                    </div>
                );
            default:
                return (
                    <div>
                        <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Address</label>
                        <input
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                            required
                        />
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className={`bg-secondary p-6 rounded-xl border border-slate-700 max-h-[90vh] overflow-y-auto ${type === 'CALCULATION' ? 'w-full max-w-4xl' : 'w-full max-w-md'}`}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-white">{isEditMode ? 'Edit Tag' : 'Add Tag'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Type</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                        >
                            <option value="IO">IO Tag</option>
                            <option value="USER">User Tag</option>
                            <option value="CALCULATION">Calculation Tag</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Tag Name</label>
                        <input
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Tag ID (Optional)</label>
                        <input
                            name="tag_id"
                            value={formData.tag_id}
                            onChange={handleChange}
                            placeholder="Auto-generated if empty"
                            className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                        />
                    </div>

                    {type === 'IO' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Device</label>
                                <select
                                    name="device_id"
                                    value={formData.device_id}
                                    onChange={handleChange}
                                    className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                >
                                    {devices.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Dynamic Protocol Fields */}
                            {renderProtocolFields()}
                        </>
                    )}

                    {type === 'USER' && (
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1 font-semibold">Initial Value</label>
                            <input
                                name="initial_value"
                                value={formData.initial_value}
                                onChange={handleChange}
                                className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                            />
                        </div>
                    )}

                    {type === 'CALCULATION' && (
                        <div className="space-y-6 p-6 bg-slate-800/50 rounded-xl border border-slate-600">
                            <VariableMapper
                                mappings={formData.variable_mappings}
                                onMappingChange={(newMappings) => setFormData(prev => ({ ...prev, variable_mappings: newMappings }))}
                                onSelectTag={(variable) => {
                                    setSelectedVariable(variable);
                                    setShowTagSelector(true);
                                }}
                            />

                            <FormulaBuilder
                                formula={formData.calculation_formula}
                                onChange={(newFormula) => setFormData(prev => ({ ...prev, calculation_formula: newFormula }))}
                                mappings={formData.variable_mappings}
                                onShowOperations={() => setShowOperations(true)}
                            />
                        </div>
                    )}

                    <button type="submit" className="w-full bg-primary hover:bg-primaryHover text-white font-bold py-3 rounded-xl transition-colors shadow-lg">
                        {isEditMode ? 'Update Tag' : 'Save Tag'}
                    </button>
                </form>
            </div>

            {/* Tag Selector Modal */}
            {showTagSelector && (
                <TagTreeSelector
                    tags={tags}
                    devices={devices}
                    onSelect={(tag) => {
                        if (selectedVariable) {
                            setFormData(prev => ({
                                ...prev,
                                variable_mappings: {
                                    ...prev.variable_mappings,
                                    [selectedVariable]: tag.tag_id
                                }
                            }));
                        }
                        setShowTagSelector(false);
                        setSelectedVariable(null);
                    }}
                    onClose={() => {
                        setShowTagSelector(false);
                        setSelectedVariable(null);
                    }}
                />
            )}

            {/* Operations Library Modal */}
            {showOperations && (
                <OperationsLibrary
                    onInsert={(symbol) => {
                        // Insert at cursor position in formula
                        const currentFormula = formData.calculation_formula;
                        setFormData(prev => ({
                            ...prev,
                            calculation_formula: currentFormula + symbol
                        }));
                    }}
                    onClose={() => setShowOperations(false)}
                />
            )}
        </div>
    );
};

export default TagForm;
