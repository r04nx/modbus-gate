import React, { useState } from 'react';
import { X, Plus, RefreshCw, Trash2, CheckCircle, AlertCircle, ChevronDown, ChevronRight, FileWarning } from 'lucide-react';
import clsx from 'clsx';

const STATUS_STYLES = {
    NEW: { bg: 'bg-success/10', border: 'border-success/30', text: 'text-success', dot: 'bg-success' },
    MODIFIED: { bg: 'bg-warning/10', border: 'border-warning/30', text: 'text-warning', dot: 'bg-warning' },
    DELETED: { bg: 'bg-error/10', border: 'border-error/30', text: 'text-error', dot: 'bg-error' },
    UNCHANGED: { bg: 'bg-surfaceHighlight/10', border: 'border-surfaceHighlight/30', text: 'text-text-muted', dot: 'bg-text-muted' },
};

const STATUS_ICONS = {
    NEW: <Plus size={13} />,
    MODIFIED: <RefreshCw size={13} />,
    DELETED: <Trash2 size={13} />,
    UNCHANGED: <CheckCircle size={13} />,
};

const ChangeRow = ({ item }) => {
    const [expanded, setExpanded] = useState(false);
    const style = STATUS_STYLES[item.status] || STATUS_STYLES.UNCHANGED;
    const hasChanges = item.status === 'MODIFIED' && Object.keys(item.changes || {}).length > 0;

    return (
        <div className={clsx('rounded-xl border p-3 transition-all', style.bg, style.border)}>
            <div
                className={clsx('flex items-center justify-between', hasChanges && 'cursor-pointer select-none')}
                onClick={() => hasChanges && setExpanded(e => !e)}
            >
                <div className="flex items-center gap-2">
                    <span className={clsx('flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border', style.text, style.border, style.bg)}>
                        {STATUS_ICONS[item.status]}
                        {item.status}
                    </span>
                    <span className="text-white font-mono text-sm">{item.name}</span>
                </div>
                {hasChanges && (
                    <span className={clsx('transition-transform', style.text)}>
                        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </span>
                )}
            </div>

            {expanded && hasChanges && (
                <div className="mt-3 space-y-2 pl-4 border-l-2 border-surfaceHighlight/40">
                    {Object.entries(item.changes).map(([field, { old: oldVal, new: newVal }]) => (
                        <div key={field} className="text-xs">
                            <span className="text-text-muted font-medium">{field}:</span>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                                <div className="bg-error/10 border border-error/20 rounded-lg px-2 py-1.5">
                                    <span className="text-error/70 block text-[10px] mb-0.5 font-semibold tracking-wide uppercase">Old</span>
                                    <span className="text-white font-mono break-all text-[11px]">
                                        {typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal ?? '—')}
                                    </span>
                                </div>
                                <div className="bg-success/10 border border-success/20 rounded-lg px-2 py-1.5">
                                    <span className="text-success/70 block text-[10px] mb-0.5 font-semibold tracking-wide uppercase">New</span>
                                    <span className="text-white font-mono break-all text-[11px]">
                                        {typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal ?? '—')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/** Structured error panel — groups errors by row for readability */
const ErrorPanel = ({ errors }) => {
    const [expanded, setExpanded] = useState(true);
    if (!errors || errors.length === 0) return null;

    return (
        <div className="mx-6 mt-4 rounded-xl border border-error/30 bg-error/5 overflow-hidden">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-error hover:bg-error/10 transition-colors"
            >
                <span className="flex items-center gap-2">
                    <FileWarning size={16} />
                    {errors.length} row error{errors.length > 1 ? 's' : ''} — these rows were skipped
                </span>
                {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>

            {expanded && (
                <div className="max-h-48 overflow-y-auto divide-y divide-error/10">
                    {errors.map((err, i) => {
                        // Try to separate the "Row N (name, type=T):" prefix from the rest
                        const match = err.match(/^(Row \d+[^:]*:)\s*(.*)/s);
                        const prefix = match ? match[1] : null;
                        const body = match ? match[2] : err;
                        // Body may be "|"-separated sub-errors
                        const parts = body.split(' | ').map(s => s.trim()).filter(Boolean);

                        return (
                            <div key={i} className="px-4 py-3 text-xs">
                                {prefix && (
                                    <p className="font-mono font-semibold text-error/90 mb-1">{prefix}</p>
                                )}
                                {parts.length > 1 ? (
                                    <ul className="list-disc list-inside space-y-0.5 text-text-secondary pl-1">
                                        {parts.map((p, j) => <li key={j}>{p}</li>)}
                                    </ul>
                                ) : (
                                    <p className="text-text-secondary">{parts[0] || err}</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const DeviceImportAnalysisModal = ({ analysis, errors = [], onClose, onConfirm }) => {
    const [filter, setFilter] = useState('ALL');
    const { summary, changes } = analysis;

    const filteredChanges = filter === 'ALL' ? changes : changes.filter(c => c.status === filter);

    const FILTERS = [
        { key: 'ALL', label: 'All', count: changes.length },
        { key: 'NEW', label: 'New', count: summary.new, style: 'text-success border-success/30 bg-success/10' },
        { key: 'MODIFIED', label: 'Modified', count: summary.modified, style: 'text-warning border-warning/30 bg-warning/10' },
        { key: 'DELETED', label: 'To Delete', count: summary.deleted, style: 'text-error border-error/30 bg-error/10' },
        { key: 'UNCHANGED', label: 'Unchanged', count: summary.unchanged, style: 'text-text-muted border-surfaceHighlight/30' },
        ...(errors.length > 0 ? [{ key: 'ERRORS', label: 'Errors', count: errors.length, style: 'text-error border-error/30 bg-error/10' }] : []),
    ];

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-surface/70 backdrop-blur-xl border border-surfaceHighlight/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-surfaceHighlight/50">
                    <div>
                        <h3 className="text-xl font-bold text-white">Import Preview</h3>
                        <p className="text-sm text-text-secondary mt-0.5">Review changes before applying</p>
                    </div>
                    <button onClick={onClose} className="text-text-muted hover:text-white p-2 rounded-lg hover:bg-surfaceHighlight/30 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-4 gap-3 p-6 border-b border-surfaceHighlight/30">
                    {[
                        { label: 'New', value: summary.new, color: 'text-success' },
                        { label: 'Modified', value: summary.modified, color: 'text-warning' },
                        { label: 'Deleted', value: summary.deleted, color: 'text-error' },
                        { label: 'Unchanged', value: summary.unchanged, color: 'text-text-muted' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-xl p-3 text-center">
                            <div className={clsx('text-2xl font-bold', color)}>{value}</div>
                            <div className="text-xs text-text-muted mt-1">{label}</div>
                        </div>
                    ))}
                </div>

                {/* Error panel */}
                <ErrorPanel errors={errors} />

                {/* Filter tabs */}
                <div className="flex gap-2 px-6 pt-4 pb-2 flex-wrap">
                    {FILTERS.filter(f => f.key !== 'ERRORS').map(({ key, label, count, style }) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={clsx(
                                'px-3 py-1 rounded-lg text-xs font-medium border transition-all',
                                filter === key
                                    ? (style || 'text-white border-primary/50 bg-primary/20')
                                    : 'text-text-muted border-surfaceHighlight/30 hover:border-surfaceHighlight'
                            )}
                        >
                            {label} <span className="opacity-70">({count})</span>
                        </button>
                    ))}
                </div>

                {/* Change list */}
                <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2 min-h-0">
                    {filteredChanges.length === 0 ? (
                        <div className="text-center text-text-muted py-8 text-sm">No items to show for this filter</div>
                    ) : (
                        filteredChanges.map((item, i) => <ChangeRow key={i} item={item} />)
                    )}
                </div>

                {/* Action buttons */}
                <div className="p-6 border-t border-surfaceHighlight/50 bg-surfaceHighlight/5 flex justify-between items-center">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-text-secondary hover:text-white transition-colors rounded-xl hover:bg-surfaceHighlight/30"
                    >
                        Cancel
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={() => onConfirm(false)}
                            disabled={summary.new === 0 && summary.modified === 0}
                            className="px-5 py-2.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 font-medium rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Add new devices and update existing ones — does not delete anything"
                        >
                            Merge (Add / Update)
                        </button>
                        <button
                            onClick={() => onConfirm(true)}
                            className={clsx(
                                'px-5 py-2.5 font-medium rounded-xl transition-all',
                                summary.deleted > 0
                                    ? 'bg-error hover:bg-error/80 text-white shadow-lg shadow-error/20'
                                    : 'bg-primary hover:bg-primaryHover text-white shadow-lg shadow-primary/20'
                            )}
                            title="Add / update from CSV and delete any devices not in the file"
                        >
                            {summary.deleted > 0
                                ? `Replace & Delete ${summary.deleted} device(s)`
                                : 'Import & Replace'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DeviceImportAnalysisModal;
