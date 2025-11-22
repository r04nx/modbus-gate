import React, { useState } from 'react';
import { X } from 'lucide-react';

const DeviceForm = ({ onClose, onSubmit, editDevice = null }) => {
    const isEditMode = !!editDevice;
    const [type, setType] = useState(editDevice?.type || 'MODBUS_TCP');
    const [formData, setFormData] = useState({
        name: editDevice?.name || '',
        description: editDevice?.description || '',
        polling_interval: editDevice?.polling_interval || 1000,
        connection_params: editDevice?.connection_params || {
            host: '127.0.0.1',
            port: 502,
            slave_id: 1,
            // OPC UA
            url: 'opc.tcp://localhost:4840',
            // SNMP
            community: 'public'
        }
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleParamChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            connection_params: { ...prev.connection_params, [name]: value }
        }));
    };

    const handleTypeChange = (e) => {
        const newType = e.target.value;
        setType(newType);
        // Reset params based on type
        if (newType === 'MODBUS_TCP') {
            setFormData(prev => ({
                ...prev,
                connection_params: { host: '127.0.0.1', port: 502, slave_id: 1 }
            }));
        } else if (newType === 'MODBUS_RTU') {
            setFormData(prev => ({
                ...prev,
                connection_params: { port: '/dev/ttyUSB0', baudrate: 9600, slave_id: 1 }
            }));
        } else if (newType === 'OPC_UA') {
            setFormData(prev => ({
                ...prev,
                connection_params: { url: 'opc.tcp://localhost:4840' }
            }));
        } else if (newType === 'SNMP') {
            setFormData(prev => ({
                ...prev,
                connection_params: { host: '127.0.0.1', port: 161, community: 'public' }
            }));
        } else if (newType === 'IEC104') {
            setFormData(prev => ({
                ...prev,
                connection_params: { host: '127.0.0.1', port: 2404, common_address: 1 }
            }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ ...formData, type });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-secondary p-6 rounded-xl w-full max-w-md border border-slate-700 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-white">{isEditMode ? 'Edit Device' : 'Add Device'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Device Name</label>
                        <input
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Type</label>
                        <select
                            value={type}
                            onChange={handleTypeChange}
                            className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                        >
                            <option value="MODBUS_TCP">Modbus TCP</option>
                            <option value="MODBUS_RTU">Modbus RTU</option>
                            <option value="OPC_UA">OPC UA</option>
                            <option value="SNMP">SNMP</option>
                            <option value="IEC104">IEC 104</option>
                        </select>
                    </div>

                    {/* Dynamic Fields */}
                    {type === 'MODBUS_TCP' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">IP Address</label>
                                <input
                                    name="host"
                                    value={formData.connection_params.host}
                                    onChange={handleParamChange}
                                    className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Port</label>
                                    <input
                                        name="port"
                                        type="number"
                                        value={formData.connection_params.port}
                                        onChange={handleParamChange}
                                        className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Slave ID</label>
                                    <input
                                        name="slave_id"
                                        type="number"
                                        value={formData.connection_params.slave_id}
                                        onChange={handleParamChange}
                                        className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {type === 'MODBUS_RTU' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Serial Port</label>
                                <input
                                    name="port"
                                    value={formData.connection_params.port}
                                    onChange={handleParamChange}
                                    className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Baudrate</label>
                                    <input
                                        name="baudrate"
                                        type="number"
                                        value={formData.connection_params.baudrate}
                                        onChange={handleParamChange}
                                        className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Slave ID</label>
                                    <input
                                        name="slave_id"
                                        type="number"
                                        value={formData.connection_params.slave_id}
                                        onChange={handleParamChange}
                                        className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {type === 'OPC_UA' && (
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Endpoint URL</label>
                            <input
                                name="url"
                                value={formData.connection_params.url}
                                onChange={handleParamChange}
                                placeholder="opc.tcp://localhost:4840"
                                className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                            />
                        </div>
                    )}

                    {type === 'SNMP' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Host</label>
                                <input
                                    name="host"
                                    value={formData.connection_params.host}
                                    onChange={handleParamChange}
                                    className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Port</label>
                                    <input
                                        name="port"
                                        type="number"
                                        value={formData.connection_params.port}
                                        onChange={handleParamChange}
                                        className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Community</label>
                                    <input
                                        name="community"
                                        value={formData.connection_params.community}
                                        onChange={handleParamChange}
                                        className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {type === 'IEC104' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Host</label>
                                <input
                                    name="host"
                                    value={formData.connection_params.host}
                                    onChange={handleParamChange}
                                    className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Port</label>
                                    <input
                                        name="port"
                                        type="number"
                                        value={formData.connection_params.port}
                                        onChange={handleParamChange}
                                        className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Common Address</label>
                                    <input
                                        name="common_address"
                                        type="number"
                                        value={formData.connection_params.common_address}
                                        onChange={handleParamChange}
                                        className="w-full bg-primary border border-slate-700 rounded px-3 py-2 text-white focus:border-accent outline-none"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    <button type="submit" className="w-full bg-accent text-primary font-bold py-2 rounded hover:bg-accent/90 transition-colors">
                        {isEditMode ? 'Update Device' : 'Save Device'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default DeviceForm;
