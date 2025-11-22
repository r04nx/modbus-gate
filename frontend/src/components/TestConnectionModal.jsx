import React, { useEffect, useState } from 'react';
import { X, CheckCircle, XCircle, Loader2, Terminal, AlertTriangle, ShieldCheck, Wifi } from 'lucide-react';
import clsx from 'clsx';

const TestConnectionModal = ({ isOpen, onClose, device, testFn }) => {
    const [step, setStep] = useState('idle'); // idle, connecting, verifying, success, error
    const [result, setResult] = useState(null);
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        if (isOpen && device) {
            startTest();
        } else {
            // Reset state on close
            setStep('idle');
            setResult(null);
            setLogs([]);
        }
    }, [isOpen, device]);

    const addLog = (msg) => setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg }]);

    const startTest = async () => {
        setStep('connecting');
        setLogs([]);
        addLog(`Initializing connection test for ${device.name}...`);
        addLog(`Target: ${device.type}`);

        // Simulate some steps for better UX
        await new Promise(r => setTimeout(r, 600));
        addLog("Resolving host...");

        await new Promise(r => setTimeout(r, 600));
        addLog("Initiating handshake...");
        setStep('verifying');

        try {
            const { data } = await testFn(device.id);
            setResult(data);
            if (data.status === 'success') {
                setStep('success');
                addLog("Connection established successfully.");
                addLog(`Server responded: ${data.message}`);
            } else {
                setStep('error');
                addLog(`Connection failed: ${data.message}`);
                addLog(`Error Code: ${data.code}`);
                addLog(`Detail: ${data.detail}`);
            }
        } catch (error) {
            setStep('error');
            const errData = error.response?.data || { message: "Network Error", code: "ERR_NETWORK", detail: error.message };
            setResult({ status: 'error', ...errData });
            addLog(`Critical failure: ${errData.message}`);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface border border-surfaceHighlight rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-surfaceHighlight bg-surfaceHighlight/10">
                    <div className="flex items-center gap-2">
                        <div className={clsx("p-2 rounded-lg",
                            step === 'success' ? "bg-success/20 text-success" :
                                step === 'error' ? "bg-error/20 text-error" :
                                    "bg-primary/20 text-primary"
                        )}>
                            <Wifi size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white">Connection Test</h3>
                            <p className="text-xs text-text-secondary">{device?.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Status Animation */}
                    <div className="flex flex-col items-center justify-center py-4">
                        <div className="relative">
                            {step === 'connecting' || step === 'verifying' ? (
                                <div className="relative">
                                    <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
                                    <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Loader2 size={24} className="text-primary animate-pulse" />
                                    </div>
                                </div>
                            ) : step === 'success' ? (
                                <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center animate-in zoom-in duration-300">
                                    <CheckCircle size={32} className="text-success" />
                                </div>
                            ) : (
                                <div className="w-16 h-16 rounded-full bg-error/20 flex items-center justify-center animate-in zoom-in duration-300">
                                    <XCircle size={32} className="text-error" />
                                </div>
                            )}
                        </div>
                        <h4 className="mt-4 text-lg font-medium text-white">
                            {step === 'connecting' && "Connecting..."}
                            {step === 'verifying' && "Verifying Protocol..."}
                            {step === 'success' && "Connection Successful"}
                            {step === 'error' && "Connection Failed"}
                        </h4>
                        <p className="text-sm text-text-secondary text-center mt-1 max-w-[80%]">
                            {result?.message || "Please wait while we establish a connection to the device."}
                        </p>
                    </div>

                    {/* Detailed Result Box */}
                    {result && (
                        <div className={clsx(
                            "rounded-xl p-4 border text-sm",
                            result.status === 'success'
                                ? "bg-success/5 border-success/20"
                                : "bg-error/5 border-error/20"
                        )}>
                            <div className="flex items-start gap-3">
                                {result.status === 'success'
                                    ? <ShieldCheck size={18} className="text-success shrink-0 mt-0.5" />
                                    : <AlertTriangle size={18} className="text-error shrink-0 mt-0.5" />
                                }
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className={clsx("font-bold", result.status === 'success' ? "text-success" : "text-error")}>
                                            {result.code || "UNKNOWN"}
                                        </span>
                                    </div>
                                    <p className="text-text-secondary leading-relaxed">
                                        {result.detail}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Logs Terminal */}
                    <div className="bg-black/40 rounded-xl border border-surfaceHighlight/50 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-surfaceHighlight/20 border-b border-surfaceHighlight/30">
                            <Terminal size={12} className="text-text-muted" />
                            <span className="text-xs font-mono text-text-muted">Verbose Log</span>
                        </div>
                        <div className="p-3 font-mono text-xs space-y-1 max-h-32 overflow-y-auto text-text-secondary">
                            {logs.map((log, i) => (
                                <div key={i} className="flex gap-2">
                                    <span className="text-text-muted opacity-50">[{log.time}]</span>
                                    <span>{log.msg}</span>
                                </div>
                            ))}
                            {(step === 'connecting' || step === 'verifying') && (
                                <div className="animate-pulse">_</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-surfaceHighlight bg-surfaceHighlight/5 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-surfaceHighlight hover:bg-surfaceHighlight/80 text-white text-sm font-medium transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TestConnectionModal;
