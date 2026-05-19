import React, { useState } from 'react';
import { X, AlertTriangle, ArrowRight, Check, Trash2, Edit2, Plus, Info } from 'lucide-react';
import clsx from 'clsx';

// Tooltip helper component
const InfoHover = ({ text }) => (
    <div className="group relative ml-2 inline-flex items-center text-text-muted hover:text-white cursor-help">
        <Info size={14} />
        <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-[120%] left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-gray-900 border border-surfaceHighlight/50 text-xs text-gray-300 rounded shadow-lg z-50 text-center">
            {text}
        </div>
    </div>
);

const TagImportAnalysisModal = ({ analysis, onClose, onConfirm, type }) => {
    const { summary, changes } = analysis;
    const [filter, setFilter] = useState('ALL'); // ALL, NEW, MODIFIED, DELETED

    const filteredChanges = changes.filter(c => {
        if (filter === 'ALL') return true;
        return c.status === filter;
    });

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-surface border border-surfaceHighlight rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-6 border-b border-surfaceHighlight/50 flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-2">Import Analysis</h2>
                        <p className="text-text-secondary">
                            Review changes before applying.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-surfaceHighlight/30 rounded-lg text-text-muted hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Summary Stats */}
                <div className="p-6 grid grid-cols-4 gap-4 bg-surfaceHighlight/10 border-b border-surfaceHighlight/30">
                    <div className="bg-surfaceHighlight/20 rounded-xl p-4 border border-surfaceHighlight/30 flex flex-col items-center">
                        <div className="text-3xl font-bold text-success mb-1">{summary.new}</div>
                        <div className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1">
                            <Plus size={12} /> New Tags
                        </div>
                    </div>
                    <div className="bg-surfaceHighlight/20 rounded-xl p-4 border border-surfaceHighlight/30 flex flex-col items-center">
                        <div className="text-3xl font-bold text-warning mb-1">{summary.modified}</div>
                        <div className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1">
                            <Edit2 size={12} /> Modified
                        </div>
                    </div>
                    <div className="bg-surfaceHighlight/20 rounded-xl p-4 border border-surfaceHighlight/30 flex flex-col items-center relaitve overflow-hidden">
                        <div className="text-3xl font-bold text-error mb-1">{summary.deleted}</div>
                        <div className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1">
                            <Trash2 size={12} /> Missing / Deleted
                        </div>
                        {summary.deleted > 0 && (
                            <div className="absolute top-2 right-2 text-error animate-pulse" title="These will only be deleted if you choose 'Replace'">
                                <AlertTriangle size={16} />
                            </div>
                        )}
                    </div>
                    <div className="bg-surfaceHighlight/20 rounded-xl p-4 border border-surfaceHighlight/30 flex flex-col items-center">
                        <div className="text-3xl font-bold text-text-secondary mb-1">{summary.unchanged}</div>
                        <div className="text-xs font-bold text-text-muted uppercase tracking-wider">Unchanged</div>
                    </div>
                </div>

                {/* Errors Display */}
                {analysis.errors && analysis.errors.length > 0 && (
                    <div className="m-6 mb-2 bg-error/10 border border-error/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-error font-bold mb-2">
                            <AlertTriangle size={18} />
                            <span>Import Errors ({analysis.errors.length})</span>
                        </div>
                        <ul className="list-disc list-inside text-sm text-error/80 max-h-32 overflow-y-auto space-y-1">
                            {analysis.errors.map((err, idx) => (
                                <li key={idx}>{err}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Filter Tabs */}
                <div className="px-6 pt-4 flex gap-2">
                    {['ALL', 'NEW', 'MODIFIED', 'DELETED'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={clsx(
                                "px-4 py-2 rounded-lg text-sm font-bold transition-colors",
                                filter === f
                                    ? "bg-primary text-white"
                                    : "bg-surfaceHighlight/20 text-text-secondary hover:text-white hover:bg-surfaceHighlight/40"
                            )}
                        >
                            {f === 'ALL' ? 'All Changes' : f}
                            <span className="ml-2 opacity-60 text-xs bg-black/20 px-1.5 py-0.5 rounded-full">
                                {f === 'ALL' ? changes.length : summary[f.toLowerCase()]}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Content List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {filteredChanges.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-50">
                            <Info size={48} className="mb-4" />
                            <p>No items to display for this filter.</p>
                        </div>
                    ) : (
                        filteredChanges.map((change, idx) => (
                            <div key={idx} className={clsx(
                                "border rounded-xl p-4 transition-all",
                                change.status === 'NEW' && "bg-success/5 border-success/20",
                                change.status === 'MODIFIED' && "bg-warning/5 border-warning/20",
                                change.status === 'DELETED' && "bg-error/5 border-error/20"
                            )}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={clsx(
                                            "p-1.5 rounded-lg",
                                            change.status === 'NEW' && "bg-success/20 text-success",
                                            change.status === 'MODIFIED' && "bg-warning/20 text-warning",
                                            change.status === 'DELETED' && "bg-error/20 text-error"
                                        )}>
                                            {change.status === 'NEW' && <Plus size={16} />}
                                            {change.status === 'MODIFIED' && <Edit2 size={16} />}
                                            {change.status === 'DELETED' && <Trash2 size={16} />}
                                        </div>
                                        <div>
                                            <div className="font-mono font-bold text-white text-lg">{change.tag_id}</div>
                                            {(change.data?.name || change.changes?.name?.old) && (
                                                <div className="text-sm text-text-secondary">
                                                    {change.status === 'MODIFIED' ? change.changes.name?.old : change.data?.name}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className={clsx(
                                        "text-xs font-bold px-2 py-1 rounded uppercase tracking-wider",
                                        change.status === 'NEW' && "bg-success/20 text-success",
                                        change.status === 'MODIFIED' && "bg-warning/20 text-warning",
                                        change.status === 'DELETED' && "bg-error/20 text-error"
                                    )}>
                                        {change.status}
                                    </div>
                                </div>

                                {/* Render Changes/Data */}
                                <div className="pl-11 text-sm space-y-2">
                                    {change.status === 'NEW' && (
                                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-text-secondary">
                                            {Object.entries(change.data || {})
                                                .filter(([k, v]) => v && k !== 'name' && k !== 'params')
                                                .map(([k, v]) => (
                                                    <div key={k} className="flex justify-between border-b border-surfaceHighlight/10 py-1">
                                                        <span className="capitalize opacity-70">{k.replace('_', ' ')}</span>
                                                        <span className="font-mono text-white">{String(v)}</span>
                                                    </div>
                                                ))}
                                            {change.data?.params && Object.entries(change.data.params).map(([k, v]) => (
                                                <div key={k} className="flex justify-between border-b border-surfaceHighlight/10 py-1">
                                                    <span className="capitalize opacity-70">{k}</span>
                                                    <span className="font-mono text-white">{String(v)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {change.status === 'DELETED' && (
                                        <div className="text-error/70 italic flex items-center gap-2">
                                            <AlertTriangle size={14} />
                                            Tag will be removed if you choose "Replace".
                                        </div>
                                    )}

                                    {change.status === 'MODIFIED' && (
                                        <div className="space-y-2">
                                            {Object.entries(change.changes || {}).map(([field, vals]) => (
                                                <div key={field} className="bg-black/20 rounded p-2 grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
                                                    <div className="text-right">
                                                        <div className="text-[10px] uppercase text-text-muted mb-0.5">Old {field}</div>
                                                        <div className="font-mono text-error/80 line-through decoration-error/50">{vals.old || 'BLANK'}</div>
                                                    </div>
                                                    <ArrowRight size={14} className="text-text-muted opacity-50" />
                                                    <div>
                                                        <div className="text-[10px] uppercase text-text-muted mb-0.5">New {field}</div>
                                                        <div className="font-mono text-success">{vals.new || 'BLANK'}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-surfaceHighlight/50 bg-surfaceHighlight/5 flex justify-between items-center">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 rounded-xl font-medium text-text-secondary hover:bg-surfaceHighlight/20 transition-colors"
                    >
                        Cancel Import
                    </button>

                    <div className="flex gap-4">
                        <div className="flex items-center">
                            <button
                                onClick={() => onConfirm(false)} // replace=false (Merge)
                                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-surfaceHighlight/30 text-white hover:bg-surfaceHighlight/50 hover:text-white transition-all border border-surfaceHighlight/50"
                            >
                                <Plus size={18} />
                                Merge (Keep Existing)
                            </button>
                            <InfoHover text="Pulls specific changes and new lines from CSV without clearing any definitions you established previously that weren't inside the CSV." />
                        </div>

                        <div className="flex items-center">
                            <button
                                onClick={() => onConfirm(true)} // replace=true (Sync)
                                className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold bg-primary hover:bg-primaryHover text-white shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
                            >
                                <Check size={18} />
                                {summary.deleted > 0 ? `Replace & Delete (${summary.deleted})` : 'Import & Replace'}
                            </button>
                            <InfoHover text="Completely wipes the device's currently held mappings, and overwrites them entirely with exactly what the CSV represents." />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default TagImportAnalysisModal;
