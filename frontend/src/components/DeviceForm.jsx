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
                connection_params: { host: '127.0.0.1', port: 161, version: 'v2c', community: 'public' }
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-surface/70 backdrop-blur-xl border border-surfaceHighlight/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-surface/90 backdrop-blur-xl border-b border-surfaceHighlight/50 p-6 flex justify-between items-center z-10">
                    <h3 className="text-2xl font-bold text-white">{isEditMode ? 'Edit Device' : 'Add Device'}</h3>
                    <button onClick={onClose} className="text-text-muted hover:text-white transition-colors p-2 hover:bg-surfaceHighlight/30 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Device Name</label>
                        <input
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                            placeholder="Enter device name..."
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Protocol Type</label>
                        <select
                            value={type}
                            onChange={handleTypeChange}
                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                        >
                            <option value="MODBUS_TCP">Modbus TCP</option>
                            <option value="MODBUS_RTU">Modbus RTU</option>
                            <option value="OPC_UA">OPC UA</option>
                            <option value="SNMP">SNMP</option>
                            <option value="IEC104">IEC 104</option>
                        </select>
                    </div>

                    {/* Dynamic Fields */}
                    <div className="bg-surfaceHighlight/10 rounded-xl p-4 border border-surfaceHighlight/30 space-y-4">
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Connection Parameters</h4>

                        {type === 'MODBUS_TCP' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-2">IP Address</label>
                                    <input
                                        name="host"
                                        value={formData.connection_params.host}
                                        onChange={handleParamChange}
                                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        placeholder="192.168.1.100"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Port</label>
                                        <input
                                            name="port"
                                            type="number"
                                            value={formData.connection_params.port}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Slave ID</label>
                                        <input
                                            name="slave_id"
                                            type="number"
                                            value={formData.connection_params.slave_id}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {type === 'MODBUS_RTU' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-2">Serial Port</label>
                                    <input
                                        name="port"
                                        value={formData.connection_params.port}
                                        onChange={handleParamChange}
                                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        placeholder="/dev/ttyUSB0"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Baudrate</label>
                                        <input
                                            name="baudrate"
                                            type="number"
                                            value={formData.connection_params.baudrate}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Slave ID</label>
                                        <input
                                            name="slave_id"
                                            type="number"
                                            value={formData.connection_params.slave_id}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {type === 'OPC_UA' && (
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Endpoint URL</label>
                                <input
                                    name="url"
                                    value={formData.connection_params.url}
                                    onChange={handleParamChange}
                                    placeholder="opc.tcp://localhost:4840"
                                    className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                />
                            </div>
                        )}

                        {type === 'SNMP' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-2">Host</label>
                                    <input
                                        name="host"
                                        value={formData.connection_params.host}
                                        onChange={handleParamChange}
                                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        placeholder="192.168.1.100"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Port</label>
                                        <input
                                            name="port"
                                            type="number"
                                            value={formData.connection_params.port}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">SNMP Version</label>
                                        <select
                                            name="version"
                                            value={formData.connection_params.version || 'v2c'}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                                        >
                                            <option value="v1">SNMPv1</option>
                                            <option value="v2c">SNMPv2c</option>
                                            <option value="v3">SNMPv3</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Community-based (v1/v2c) */}
                                {(formData.connection_params.version === 'v1' || formData.connection_params.version === 'v2c' || !formData.connection_params.version) && (
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Community String</label>
                                        <input
                                            name="community"
                                            value={formData.connection_params.community || 'public'}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                            placeholder="public"
                                        />
                                    </div>
                                )}

                                {/* SNMPv3 Authentication */}
                                {formData.connection_params.version === 'v3' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-text-secondary mb-2">Username</label>
                                            <input
                                                name="username"
                                                value={formData.connection_params.username || ''}
                                                onChange={handleParamChange}
                                                className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                                placeholder="snmpuser"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-text-secondary mb-2">Security Level</label>
                                            <select
                                                name="security_level"
                                                value={formData.connection_params.security_level || 'noAuthNoPriv'}
                                                onChange={handleParamChange}
                                                className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                                            >
                                                <option value="noAuthNoPriv">No Auth, No Privacy</option>
                                                <option value="authNoPriv">Auth, No Privacy</option>
                                                <option value="authPriv">Auth + Privacy</option>
                                            </select>
                                        </div>

                                        {/* Authentication fields */}
                                        {(formData.connection_params.security_level === 'authNoPriv' || formData.connection_params.security_level === 'authPriv') && (
                                            <>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-text-secondary mb-2">Auth Protocol</label>
                                                        <select
                                                            name="auth_protocol"
                                                            value={formData.connection_params.auth_protocol || 'SHA'}
                                                            onChange={handleParamChange}
                                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                                                        >
                                                            <option value="MD5">MD5</option>
                                                            <option value="SHA">SHA</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-text-secondary mb-2">Auth Password</label>
                                                        <input
                                                            name="auth_password"
                                                            type="password"
                                                            value={formData.connection_params.auth_password || ''}
                                                            onChange={handleParamChange}
                                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                                            placeholder="••••••••"
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {/* Privacy fields */}
                                        {formData.connection_params.security_level === 'authPriv' && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-text-secondary mb-2">Privacy Protocol</label>
                                                    <select
                                                        name="priv_protocol"
                                                        value={formData.connection_params.priv_protocol || 'AES'}
                                                        onChange={handleParamChange}
                                                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                                                    >
                                                        <option value="DES">DES</option>
                                                        <option value="AES">AES</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-text-secondary mb-2">Privacy Password</label>
                                                    <input
                                                        name="priv_password"
                                                        type="password"
                                                        value={formData.connection_params.priv_password || ''}
                                                        onChange={handleParamChange}
                                                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                                        placeholder="••••••••"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}

                        {type === 'IEC104' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-2">Host</label>
                                    <input
                                        name="host"
                                        value={formData.connection_params.host}
                                        onChange={handleParamChange}
                                        className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        placeholder="192.168.1.100"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Port</label>
                                        <input
                                            name="port"
                                            type="number"
                                            value={formData.connection_params.port}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Common Address</label>
                                        <input
                                            name="common_address"
                                            type="number"
                                            value={formData.connection_params.common_address}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-surfaceHighlight/30">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 text-text-secondary hover:text-white transition-colors rounded-xl hover:bg-surfaceHighlight/30"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-3 bg-primary hover:bg-primaryHover text-white font-medium rounded-xl transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5"
                        >
                            {isEditMode ? 'Update Device' : 'Save Device'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DeviceForm;
