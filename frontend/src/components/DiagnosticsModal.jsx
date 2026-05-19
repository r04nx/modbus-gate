import React, { useState, useEffect } from 'react';
import { X, Terminal, Search, Globe, Activity, Loader2, Copy, Check, AlertCircle, Settings } from 'lucide-react';
import clsx from 'clsx';
import { diagnoseDevice } from '../services/api';

const DiagnosticsModal = ({ isOpen, onClose, device }) => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [activeTool, setActiveTool] = useState(null);
    const [copied, setCopied] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');
    const [nmapOptions, setNmapOptions] = useState(['-p-', '-T4', '-sV', '--open']);
    const [showNmapOptions, setShowNmapOptions] = useState(false);

    const NMAP_AVAILABLE_FLAGS = [
        { id: '-p-', label: 'All Ports', desc: 'Scan all 65,535 ports' },
        { id: '-sV', label: 'Service Detection', desc: 'Probe open ports to determine service/version info' },
        { id: '-O', label: 'OS Detection', desc: 'Attempt to identify the operating system' },
        { id: '-A', label: 'Aggressive', desc: 'Enable OS, version, script scanning & traceroute' },
        { id: '-Pn', label: 'No Ping', desc: 'Treat all hosts as online (skip discovery)' },
        { id: '-F', label: 'Fast Scan', desc: 'Scan fewer ports (1,000 common)' },
        { id: '-sC', label: 'Default Scripts', desc: 'Run common Nmap scripts' },
        { id: '--open', label: 'Open Only', desc: 'Only show ports with "open" status' },
    ];

    useEffect(() => {
        let interval;
        let messageInterval;
        if (loading) {
            setProgress(0);
            const messages = {
                ping: ['Initializing network probe...', 'Measuring latency...', 'Calculating packet loss...'],
                nmap: ['Initializing full port scan...', 'Probing 65,535 ports...', 'Identifying active services...', 'Detecting versions...', 'Analyzing security banners Layer 7...'],
                traceroute: ['Starting hop discovery...', 'Mapping network path...', 'Testing node reachability...']
            };
            const currentMessages = messages[activeTool] || ['Processing...'];
            setStatusMessage(currentMessages[0]);

            let step = 0;
            messageInterval = setInterval(() => {
                step = (step + 1) % currentMessages.length;
                setStatusMessage(currentMessages[step]);
            }, 6000);

            // Simulate progress (non-linear, asymptotic towards 98%)
            let currentProgress = 0;
            interval = setInterval(() => {
                currentProgress += (98 - currentProgress) * 0.03;
                setProgress(currentProgress);
            }, 1500);
        } else {
            setProgress(100);
        }
        return () => {
            clearInterval(interval);
            clearInterval(messageInterval);
        };
    }, [loading, activeTool]);

    useEffect(() => {
        if (!isOpen) {
            setResult(null);
            setActiveTool(null);
        }
    }, [isOpen]);

    const runTool = async (tool) => {
        setLoading(true);
        setActiveTool(tool);
        setResult(null);
        try {
            const { data } = await diagnoseDevice(device.id, tool, tool === 'nmap' ? nmapOptions : []);
            setResult(data);
        } catch (error) {
            console.error(`Diagnostic tool ${tool} failed`, error);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (result?.output) {
            navigator.clipboard.writeText(result.output);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!isOpen) return null;

    const tools = [
        { id: 'ping', name: 'Ping', icon: Activity, desc: 'Check network reachability and latency.' },
        { id: 'nmap', name: 'Nmap Scan', icon: Search, desc: 'Scan for open ports and services.' },
        { id: 'traceroute', name: 'Traceroute', icon: Globe, desc: 'Trace the path to the device.' }
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface border border-surfaceHighlight rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-surfaceHighlight flex justify-between items-center bg-surfaceHighlight/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/20 text-primary rounded-xl">
                            <Terminal size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white leading-tight">Device Diagnostics</h3>
                            <p className="text-sm text-text-muted">Troubleshoot <span className="text-white font-medium">{device?.name}</span></p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-text-muted hover:text-white p-2 hover:bg-surfaceHighlight rounded-xl transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Tool Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {tools.map((tool) => (
                            <button
                                key={tool.id}
                                onClick={() => runTool(tool.id)}
                                disabled={loading}
                                className={clsx(
                                    "flex flex-col items-start p-4 rounded-2xl border transition-all text-left group",
                                    activeTool === tool.id 
                                        ? "bg-primary border-primary shadow-lg shadow-primary/20" 
                                        : "bg-surfaceHighlight/20 border-surfaceHighlight/50 hover:border-primary/50 hover:bg-surfaceHighlight/30"
                                )}
                            >
                                <div className={clsx(
                                    "p-2 rounded-lg mb-3 mb-2 transition-colors",
                                    activeTool === tool.id ? "bg-white/20 text-white" : "bg-primary/10 text-primary group-hover:bg-primary/20"
                                )}>
                                    <tool.icon size={20} />
                                </div>
                                <span className={clsx("font-bold mb-1", activeTool === tool.id ? "text-white" : "text-white/90")}>{tool.name}</span>
                                <span className={clsx("text-xs", activeTool === tool.id ? "text-white/70" : "text-text-muted")}>{tool.desc}</span>
                            </button>
                        ))}
                    </div>

                    {/* Nmap Granular Options */}
                    {activeTool === 'nmap' && !loading && (
                        <div className="bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-2xl p-4 animate-in slide-in-from-top-2 duration-300">
                            <button 
                                onClick={() => setShowNmapOptions(!showNmapOptions)}
                                className="flex items-center gap-2 text-sm font-bold text-white mb-2 hover:text-primary transition-colors"
                            >
                                <Settings size={16} className={clsx("transition-transform duration-300", showNmapOptions && "rotate-90")} />
                                Granular Scan Options
                                <span className={clsx(
                                    "px-1.5 py-0.5 rounded-md text-[10px] ml-2",
                                    nmapOptions.length > 0 ? "bg-primary/20 text-primary" : "bg-white/10 text-white/50"
                                )}>
                                    {nmapOptions.length} active
                                </span>
                            </button>
                            
                            {showNmapOptions && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 animate-in fade-in duration-300">
                                    {NMAP_AVAILABLE_FLAGS.map((flag) => {
                                        const isSelected = nmapOptions.includes(flag.id);
                                        return (
                                            <label 
                                                key={flag.id}
                                                className={clsx(
                                                    "flex items-start gap-2 p-2 rounded-xl border cursor-pointer transition-all hover:bg-white/5",
                                                    isSelected ? "bg-primary/10 border-primary/50" : "bg-transparent border-transparent"
                                                )}
                                            >
                                                <input 
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {
                                                        if (isSelected) setNmapOptions(nmapOptions.filter(o => o !== flag.id));
                                                        else setNmapOptions([...nmapOptions, flag.id]);
                                                    }}
                                                    className="mt-0.5 w-4 h-4 rounded border-white/20 bg-black/20 text-primary focus:ring-primary"
                                                />
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-white">{flag.label}</span>
                                                    <span className="text-[10px] text-text-muted">{flag.desc}</span>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Output Area */}
                    <div className="flex-1 min-h-[300px] flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                                <Activity size={12} /> Diagnostic Output
                            </span>
                            {result?.output && (
                                <button
                                    onClick={handleCopy}
                                    className="flex items-center gap-1.5 text-xs text-text-muted hover:text-white transition-colors"
                                >
                                    {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                                    {copied ? 'Copied!' : 'Copy Result'}
                                </button>
                            )}
                        </div>

                        <div className="flex-1 bg-black/40 rounded-2xl border border-surfaceHighlight/50 overflow-hidden relative group">
                            {loading ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-30 animate-in fade-in duration-300">
                                    <div className="w-full max-w-md px-8 text-center">
                                        <div className="relative inline-block mb-8">
                                            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full animate-pulse"></div>
                                            <Loader2 size={56} className="text-primary animate-spin relative z-10" />
                                        </div>
                                        
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-end mb-1">
                                                <span className="text-white font-bold text-lg">{statusMessage}</span>
                                                <span className="text-primary font-mono text-sm">{Math.round(progress)}%</span>
                                            </div>
                                            
                                            {/* Premium Progress Bar */}
                                            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden border border-white/5 ring-4 ring-primary/5">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-primary via-accent to-primary shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all duration-700 ease-out relative"
                                                    style={{ width: `${progress}%` }}
                                                >
                                                    <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[progress-shimmer_2s_linear_infinite]"></div>
                                                </div>
                                            </div>
                                            
                                            <p className="text-text-muted text-xs animate-pulse tracking-wide uppercase font-medium">
                                                {activeTool === 'nmap' 
                                                    ? (nmapOptions.includes('-p-') ? "Scanning all 65,535 ports - this may take up to 5 minutes" : "Scanning common ports...") 
                                                    : "Executing diagnostic probe..."}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {!result && !loading ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted p-8 text-center">
                                    <div className="w-16 h-16 rounded-full bg-surfaceHighlight/20 flex items-center justify-center mb-4">
                                        <Terminal size={32} className="opacity-20" />
                                    </div>
                                    <p className="max-w-[280px]">Select a diagnostic tool above to start troubleshooting the connection path and ports.</p>
                                </div>
                            ) : (
                                <div className="p-4 font-mono text-sm overflow-auto h-full scrollbar-thin scrollbar-thumb-surfaceHighlight scrollbar-track-transparent">
                                    {result?.status === 'error' ? (
                                        <div className="flex items-start gap-3 p-4 bg-error/10 border border-error/20 rounded-xl text-error font-sans">
                                            <AlertCircle size={20} className="shrink-0" />
                                            <div>
                                                <p className="font-bold mb-1">Execution Failed</p>
                                                <p className="text-xs opacity-90">{result.message}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {result?.command && (
                                                <div className="bg-white/5 p-3 rounded-lg border border-white/10 flex items-center gap-2">
                                                    <span className="text-primary/70 mr-2">$</span>
                                                    <span className="text-white/90 truncate">{result.command}</span>
                                                </div>
                                            )}

                                            {/* Structured Nmap Result */}
                                            {result?.parsed?.ports ? (
                                                <div className="overflow-hidden rounded-xl border border-white/10 font-sans">
                                                    <table className="w-full text-left border-collapse">
                                                        <thead>
                                                            <tr className="bg-white/5 text-[10px] uppercase tracking-wider text-text-muted">
                                                                <th className="px-4 py-3 font-bold">Port/Proto</th>
                                                                <th className="px-4 py-3 font-bold">State</th>
                                                                <th className="px-4 py-3 font-bold">Service</th>
                                                                <th className="px-4 py-3 font-bold">Version</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white/5">
                                                            {result.parsed.ports.map((p, idx) => (
                                                                <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                                    <td className="px-4 py-3 text-white font-mono">{p.port}</td>
                                                                    <td className="px-4 py-3">
                                                                        <span className={clsx(
                                                                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                                            p.state === 'open' ? "bg-success/20 text-success" : "bg-error/20 text-error"
                                                                        )}>
                                                                            {p.state}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-text-secondary">{p.service}</td>
                                                                    <td className="px-4 py-3 text-text-muted text-xs">{p.version || '-'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : result?.parsed?.loss !== undefined ? (
                                                /* Structured Ping Result */
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-sans">
                                                    {[
                                                        { label: 'Sent', value: result.parsed.transmitted, icon: Activity },
                                                        { label: 'Received', value: result.parsed.received, icon: Check },
                                                        { label: 'Packet Loss', value: `${result.parsed.loss}%`, icon: AlertCircle, color: result.parsed.loss > 0 ? 'text-error' : 'text-success' },
                                                        { label: 'Avg Latency', value: result.parsed.avg_latency ? `${result.parsed.avg_latency}ms` : '-', icon: Loader2 }
                                                    ].map((stat, i) => (
                                                        <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                                                            <stat.icon size={16} className={clsx("mb-2 opacity-50", stat.color)} />
                                                            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">{stat.label}</span>
                                                            <span className={clsx("text-lg font-bold text-white", stat.color)}>{stat.value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : result?.parsed?.hops ? (
                                                /* Structured Traceroute Result */
                                                <div className="overflow-hidden rounded-xl border border-white/10 font-sans">
                                                    <table className="w-full text-left border-collapse">
                                                        <thead>
                                                            <tr className="bg-white/5 text-[10px] uppercase tracking-wider text-text-muted">
                                                                <th className="px-4 py-3 font-bold w-16">Hop</th>
                                                                <th className="px-4 py-3 font-bold">Node Details / Latency</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white/5">
                                                            {result.parsed.hops.map((h, idx) => (
                                                                <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                                    <td className="px-4 py-3 text-primary font-bold">#{h.hop}</td>
                                                                    <td className="px-4 py-3 text-text-secondary font-mono text-xs">{h.detail}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : result?.output ? (
                                                <pre className="text-text-secondary leading-relaxed whitespace-pre-wrap">
                                                    {result.output}
                                                </pre>
                                            ) : (
                                                <p className="text-text-muted italic font-sans">No output received from command.</p>
                                            )}

                                            {result?.error && (
                                                <div className="p-3 bg-error/5 text-error/80 border border-error/10 rounded-lg text-xs whitespace-pre-wrap font-sans">
                                                    {result.error}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-surfaceHighlight/5 border-t border-surfaceHighlight flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-xl font-bold transition-all"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DiagnosticsModal;
