import React, { useState, useEffect } from 'react';
import { X, Lock, AlertCircle } from 'lucide-react';
import { getComPorts } from '../services/api';

// Helper function to convert device path to friendly COM port name
const getPortDisplayName = (devicePath) => {
    if (!devicePath) return '';

    // Extract port number from common patterns
    // /dev/ttyUSB0 -> COM 1, /dev/ttyUSB1 -> COM 2
    // /dev/ttyAS0 -> COM 1, /dev/ttyAS1 -> COM 2
    // /dev/ttyS0 -> COM 1, /dev/ttyS1 -> COM 2
    const match = devicePath.match(/tty(?:USB|AS|S|ACM)(\d+)/);
    if (match) {
        const portNum = parseInt(match[1]) + 1; // 0-indexed to 1-indexed
        return `COM ${portNum}`;
    }

    // Fallback to showing the device name
    return devicePath.split('/').pop();
};

const DeviceForm = ({ onClose, onSubmit, editDevice = null }) => {
    const isEditMode = !!editDevice;
    const [type, setType] = useState(editDevice?.type || 'MODBUS_TCP');
    const [availablePorts, setAvailablePorts] = useState([]);
    const [lockedPort, setLockedPort] = useState(null);
    const [formData, setFormData] = useState({
        name: editDevice?.name || '',
        description: editDevice?.description || '',
        polling_interval: editDevice?.polling_interval || 1000,
        connection_params: editDevice?.connection_params || {
            host: '127.0.0.1',
            port: 502,
            slave_id: 1,
            // Modbus RTU defaults
            baudrate: 9600,
            databits: 8,
            stopbits: 1,
            parity: 'N',
            rts: false,
            dtr: false,
            scan_time: 1000,
            timeout: 1000,
            retry_count: 3,
            auto_recover_time: 60,
            // OPC UA
            url: 'opc.tcp://localhost:4840',
            // SNMP
            community: 'public'
        }
    });

    useEffect(() => {
        if (type === 'MODBUS_RTU') {
            fetchPorts();
        }
    }, [type]);

    const fetchPorts = async () => {
        try {
            const { data } = await getComPorts();
            setAvailablePorts(data);
            // Check if current port is locked
            if (formData.connection_params.port) {
                const portInfo = data.find(p => p.device === formData.connection_params.port);
                if (portInfo && portInfo.locked && portInfo.locked_by !== editDevice?.name) {
                    setLockedPort(portInfo);
                } else {
                    setLockedPort(null);
                }
            }
        } catch (error) {
            console.error("Failed to fetch COM ports", error);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleParamChange = (e) => {
        const { name, value, type: inputType, checked } = e.target;
        const val = inputType === 'checkbox' ? checked : value;

        // If changing port, check for lock
        if (name === 'port') {
            const portInfo = availablePorts.find(p => p.device === value);
            if (portInfo && portInfo.locked && portInfo.locked_by !== editDevice?.name) {
                setLockedPort(portInfo);
                // Inherit settings
                setFormData(prev => ({
                    ...prev,
                    connection_params: { ...prev.connection_params, port: value, ...portInfo.params }
                }));
                return;
            } else {
                setLockedPort(null);
            }
        }

        if (lockedPort && name !== 'port' && name !== 'slave_id') {
            // Prevent editing locked parameters
            return;
        }

        setFormData(prev => ({
            ...prev,
            connection_params: { ...prev.connection_params, [name]: val }
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
                connection_params: {
                    port: '',
                    baudrate: 9600,
                    slave_id: 1,
                    databits: 8,
                    stopbits: 1,
                    parity: 'N',
                    rts: false,
                    dtr: false
                }
            }));
            fetchPorts();
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
        // Validation
        if (/\s|:/.test(formData.name)) {
            alert("Device Name must not contain spaces or colons.");
            return;
        }
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
                                    <div className="relative">
                                        <select
                                            name="port"
                                            value={formData.connection_params.port}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors appearance-none"
                                        >
                                            <option value="">Select Port</option>
                                            {availablePorts.map(p => (
                                                <option key={p.device} value={p.device}>
                                                    {getPortDisplayName(p.device)} {p.locked ? `(Locked by ${p.locked_by})` : ''} - {p.device}
                                                </option>
                                            ))}
                                        </select>
                                        {lockedPort && (
                                            <div className="absolute right-3 top-3 text-warning" title={`Locked by ${lockedPort.locked_by}`}>
                                                <Lock size={20} />
                                            </div>
                                        )}
                                    </div>
                                    {lockedPort && (
                                        <div className="flex items-center gap-2 mt-2 text-warning text-sm bg-warning/10 p-2 rounded-lg">
                                            <AlertCircle size={16} />
                                            <span>Settings inherited from {lockedPort.locked_by}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Baudrate</label>
                                        <input
                                            name="baudrate"
                                            type="number"
                                            value={formData.connection_params.baudrate}
                                            onChange={handleParamChange}
                                            disabled={!!lockedPort}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Data Bits</label>
                                        <select
                                            name="databits"
                                            value={formData.connection_params.databits}
                                            onChange={handleParamChange}
                                            disabled={!!lockedPort}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                                        >
                                            {[5, 6, 7, 8].map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Stop Bits</label>
                                        <select
                                            name="stopbits"
                                            value={formData.connection_params.stopbits}
                                            onChange={handleParamChange}
                                            disabled={!!lockedPort}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                                        >
                                            {[1, 1.5, 2].map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Parity</label>
                                        <select
                                            name="parity"
                                            value={formData.connection_params.parity}
                                            onChange={handleParamChange}
                                            disabled={!!lockedPort}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                                        >
                                            <option value="N">None</option>
                                            <option value="E">Even</option>
                                            <option value="O">Odd</option>
                                            <option value="M">Mark</option>
                                            <option value="S">Space</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer bg-surfaceHighlight/10 p-3 rounded-xl border border-surfaceHighlight/30">
                                        <input
                                            type="checkbox"
                                            name="rts"
                                            checked={formData.connection_params.rts}
                                            onChange={handleParamChange}
                                            disabled={!!lockedPort}
                                            className="w-5 h-5 rounded border-surfaceHighlight bg-surfaceHighlight/20 text-primary focus:ring-primary"
                                        />
                                        <span className="text-sm font-medium text-white">RTS Control</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer bg-surfaceHighlight/10 p-3 rounded-xl border border-surfaceHighlight/30">
                                        <input
                                            type="checkbox"
                                            name="dtr"
                                            checked={formData.connection_params.dtr}
                                            onChange={handleParamChange}
                                            disabled={!!lockedPort}
                                            className="w-5 h-5 rounded border-surfaceHighlight bg-surfaceHighlight/20 text-primary focus:ring-primary"
                                        />
                                        <span className="text-sm font-medium text-white">DTR Control</span>
                                    </label>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Scan Time (ms)</label>
                                        <input
                                            name="scan_time"
                                            type="number"
                                            value={formData.connection_params.scan_time || 1000}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Timeout (ms)</label>
                                        <input
                                            name="timeout"
                                            type="number"
                                            value={formData.connection_params.timeout || 1000}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Retry Count</label>
                                        <input
                                            name="retry_count"
                                            type="number"
                                            value={formData.connection_params.retry_count || 3}
                                            onChange={handleParamChange}
                                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight rounded-xl px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-2">Auto Recover (s)</label>
                                        <input
                                            name="auto_recover_time"
                                            type="number"
                                            value={formData.connection_params.auto_recover_time || 60}
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
