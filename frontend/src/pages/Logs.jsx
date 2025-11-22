import React, { useState, useEffect, useRef } from 'react';
import { getLogs, clearLogs } from '../services/api';
import { FileText, RefreshCw, Download, Trash2, Filter } from 'lucide-react';
import clsx from 'clsx';

const Logs = () => {
    const [logs, setLogs] = useState([]);
    const [filter, setFilter] = useState('ALL');
    const [realtime, setRealtime] = useState(true);
    const [showTimestamps, setShowTimestamps] = useState(true);
    const [loading, setLoading] = useState(false);
    const logsEndRef = useRef(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const { data } = await getLogs(filter, 500);
            setLogs(data);
            if (realtime) {
                scrollToBottom();
            }
        } catch (error) {
            console.error("Failed to fetch logs", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        if (realtime) {
            const interval = setInterval(fetchLogs, 2000); // Poll every 2 seconds
            return () => clearInterval(interval);
        }
    }, [filter, realtime]);

    const scrollToBottom = () => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleDownload = () => {
        const logText = logs.map(log => {
            const timestamp = showTimestamps ? `[${new Date(log.timestamp).toLocaleString()}] ` : '';
            return `${timestamp}[${log.level}] ${log.message}`;
        }).join('\n');

        const blob = new Blob([logText], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `logs_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const handleClear = async () => {
        if (window.confirm('Are you sure you want to clear all logs?')) {
            try {
                await clearLogs();
                setLogs([]);
            } catch (error) {
                console.error("Failed to clear logs", error);
            }
        }
    };

    const getLevelColor = (level) => {
        switch (level) {
            case 'ERROR': return 'text-error';
            case 'WARNING': return 'text-warning';
            case 'INFO': return 'text-primary';
            case 'DEBUG': return 'text-text-muted';
            default: return 'text-white';
        }
    };

    const getLevelBg = (level) => {
        switch (level) {
            case 'ERROR': return 'bg-error/10 border-error/30';
            case 'WARNING': return 'bg-warning/10 border-warning/30';
            case 'INFO': return 'bg-primary/10 border-primary/30';
            case 'DEBUG': return 'bg-surfaceHighlight/30 border-surfaceHighlight';
            default: return 'bg-surfaceHighlight/20 border-surfaceHighlight';
        }
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/20 rounded-xl">
                        <FileText size={24} className="text-primary" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">System Logs</h2>
                        <p className="text-sm text-text-secondary">Monitor application events and errors</p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="bg-surface border border-surfaceHighlight rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-4">
                    {/* Filter Dropdown */}
                    <div className="flex items-center gap-2">
                        <Filter size={18} className="text-text-muted" />
                        <select
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="px-4 py-2 bg-surfaceHighlight border border-surfaceHighlight rounded-lg text-white focus:outline-none focus:border-primary"
                        >
                            <option value="ALL">All Levels</option>
                            <option value="ERROR">Error</option>
                            <option value="WARNING">Warning</option>
                            <option value="INFO">Info</option>
                            <option value="DEBUG">Debug</option>
                        </select>
                    </div>

                    {/* Real-time Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={realtime}
                            onChange={(e) => setRealtime(e.target.checked)}
                            className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm text-white font-medium">Real-time</span>
                    </label>

                    {/* Timestamps Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showTimestamps}
                            onChange={(e) => setShowTimestamps(e.target.checked)}
                            className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm text-white font-medium">Timestamps</span>
                    </label>

                    <div className="flex-1"></div>

                    {/* Action Buttons */}
                    <button
                        onClick={fetchLogs}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primaryHover text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>

                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-2 bg-surfaceHighlight hover:bg-surfaceHighlight/80 text-white rounded-lg transition-colors"
                    >
                        <Download size={18} />
                        Download
                    </button>

                    <button
                        onClick={handleClear}
                        className="flex items-center gap-2 px-4 py-2 bg-error/20 hover:bg-error/30 text-error rounded-lg transition-colors border border-error/30"
                    >
                        <Trash2 size={18} />
                        Clear
                    </button>
                </div>
            </div>

            {/* Logs Display */}
            <div className="bg-surface border border-surfaceHighlight rounded-xl overflow-hidden">
                <div className="h-[calc(100vh-320px)] overflow-y-auto p-4 space-y-1 font-mono text-sm">
                    {logs.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-text-muted">
                            No logs available
                        </div>
                    ) : (
                        logs.map((log, index) => (
                            <div
                                key={index}
                                className={clsx(
                                    'p-2 rounded border',
                                    getLevelBg(log.level)
                                )}
                            >
                                {showTimestamps && (
                                    <span className="text-text-muted mr-2">
                                        [{new Date(log.timestamp).toLocaleTimeString()}]
                                    </span>
                                )}
                                <span className={clsx('font-bold mr-2', getLevelColor(log.level))}>
                                    [{log.level}]
                                </span>
                                <span className="text-white">{log.message}</span>
                            </div>
                        ))
                    )}
                    <div ref={logsEndRef} />
                </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-text-secondary">
                <span>Total Logs: {logs.length}</span>
                <span>•</span>
                <span>Filter: {filter}</span>
                {realtime && (
                    <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 bg-success rounded-full animate-pulse"></span>
                            Live
                        </span>
                    </>
                )}
            </div>
        </div>
    );
};

export default Logs;
