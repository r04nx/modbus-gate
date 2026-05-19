import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import clsx from 'clsx';
import {
    HardDrive, BarChart2, Settings2, Trash2, Download, RefreshCw,
    Calendar, ChevronDown, ChevronUp, ChevronRight, Power,
    AlertTriangle, Database, Search, Filter, Clock, Info, Loader2,
    CheckCircle, TrendingUp, Activity, X, CheckSquare, Square,
    BarChart, ScatterChart, Layers
} from 'lucide-react';
import {
    getDataStoreConfig, updateDataStoreConfig,
    getDataStoreTags, getDataStoreRecords, getDataStoreStats,
    exportDataStore, deleteDataStoreRecords,
    getDevices, getTags
} from '../services/api';
import { useToast } from '../contexts/ToastContext';

// ─── constants ────────────────────────────────────────────────────────────────

const CHART_COLORS = [
    '#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6',
    '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16', '#f97316'
];

const TIME_RANGES = [
    { value: '15m', label: 'Last 15 min', seconds: 15 * 60 },
    { value: '1h',  label: 'Last 1 hour',  seconds: 3600 },
    { value: '6h',  label: 'Last 6 hours', seconds: 6 * 3600 },
    { value: '24h', label: 'Last 24 hours', seconds: 24 * 3600 },
    { value: '7d',  label: 'Last 7 days',  seconds: 7 * 24 * 3600 },
    { value: 'all', label: 'All time',      seconds: null },
    { value: 'custom', label: 'Custom…',   seconds: null },
];

const CHART_TYPES = [
    { value: 'line',    label: 'Line',      icon: Activity },
    { value: 'area',    label: 'Area',      icon: Layers },
    { value: 'bar',     label: 'Bar',       icon: BarChart },
    { value: 'scatter', label: 'Scatter',   icon: ScatterChart },
];

const fmt = (ts) => ts ? new Date(ts * 1000).toLocaleString() : '—';
const fmtRows = (n) => n?.toLocaleString() ?? '0';

function fmtYAxis(val) {
    const abs = Math.abs(val);
    if (abs >= 1e9) return (val / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return (val / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return (val / 1e3).toFixed(1) + 'K';
    if (abs < 0.01 && abs > 0) return val.toExponential(2);
    return parseFloat(val.toFixed(4)).toString();
}

function qualityBadge(q) {
    const map = {
        GOOD: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        BAD: 'text-red-400 bg-red-500/10 border-red-500/30',
        UNCERTAIN: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    };
    return map[q] || 'text-slate-400 bg-slate-500/10 border-slate-500/30';
}

// ─── Tag Multi-Select with Search ────────────────────────────────────────────

function TagMultiSelect({ tagIds, tagMeta, selected, onChange, placeholder = 'Search and select tags…' }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = useMemo(() =>
        tagIds.filter(id => {
            const name = tagMeta[id]?.name || id;
            const s = search.toLowerCase();
            return id.toLowerCase().includes(s) || name.toLowerCase().includes(s);
        }).slice(0, 100),
        [tagIds, tagMeta, search]
    );

    const toggleTag = (id) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

    const clearAll  = (e) => { e.stopPropagation(); onChange([]); };
    const selectAll = (e) => { e.stopPropagation(); onChange([...filtered]); };

    return (
        <div ref={ref} className="relative">
            {/* Trigger */}
            <div
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 min-h-[42px] bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-3 py-2 cursor-pointer hover:border-primary/60 transition-colors"
            >
                <Search size={14} className="text-text-muted shrink-0" />
                {selected.length === 0 ? (
                    <span className="text-text-muted text-sm flex-1">{placeholder}</span>
                ) : (
                    <div className="flex flex-wrap gap-1 flex-1">
                        {selected.slice(0, 5).map((id, i) => (
                            <span key={id} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-white"
                                style={{ background: CHART_COLORS[i % CHART_COLORS.length] + 'cc' }}>
                                {tagMeta[id]?.name || id}
                                <button onClick={e => { e.stopPropagation(); toggleTag(id); }} className="hover:opacity-70">
                                    <X size={10} />
                                </button>
                            </span>
                        ))}
                        {selected.length > 5 && (
                            <span className="px-2 py-0.5 rounded-md text-xs bg-surfaceHighlight/40 text-text-secondary">
                                +{selected.length - 5} more
                            </span>
                        )}
                    </div>
                )}
                <div className="flex items-center gap-1 shrink-0 ml-auto">
                    {selected.length > 0 && (
                        <button onClick={clearAll} className="p-0.5 hover:text-error text-text-muted transition-colors rounded" title="Clear all">
                            <X size={14} />
                        </button>
                    )}
                    <ChevronDown size={14} className={clsx('text-text-muted transition-transform', open && 'rotate-180')} />
                </div>
            </div>

            {/* Dropdown */}
            {open && (
                <div className="absolute z-50 top-full mt-1 w-full min-w-[340px] bg-[#1a2235] border border-surfaceHighlight/50 rounded-xl shadow-2xl overflow-hidden">
                    {/* Search input */}
                    <div className="p-2 border-b border-surfaceHighlight/30">
                        <div className="flex items-center gap-2 bg-surfaceHighlight/20 rounded-lg px-3 py-2">
                            <Search size={13} className="text-text-muted" />
                            <input
                                autoFocus
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search tags…"
                                className="bg-transparent text-sm text-white flex-1 focus:outline-none placeholder:text-text-muted"
                            />
                            {search && <button onClick={() => setSearch('')}><X size={12} className="text-text-muted hover:text-white" /></button>}
                        </div>
                    </div>

                    {/* Quick actions */}
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-surfaceHighlight/20 bg-surfaceHighlight/10">
                        <span className="text-xs text-text-muted flex-1">{filtered.length} tags{search ? ` matching "${search}"` : ''}</span>
                        <button onClick={selectAll} className="text-xs text-primary hover:underline">Select visible</button>
                        {selected.length > 0 && <button onClick={clearAll} className="text-xs text-error hover:underline">Clear all</button>}
                    </div>

                    {/* Tag list */}
                    <div className="max-h-56 overflow-y-auto">
                        {filtered.length === 0 && (
                            <p className="text-text-muted text-sm text-center py-4">No tags found</p>
                        )}
                        {filtered.map((id, i) => {
                            const sel = selected.includes(id);
                            const meta = tagMeta[id];
                            const colorIdx = selected.indexOf(id);
                            return (
                                <div
                                    key={id}
                                    onClick={() => toggleTag(id)}
                                    className={clsx(
                                        'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-surfaceHighlight/20',
                                        sel && 'bg-primary/10'
                                    )}
                                >
                                    <div className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all',
                                        sel ? 'border-transparent' : 'border-surfaceHighlight/50')}
                                        style={sel ? { background: CHART_COLORS[colorIdx % CHART_COLORS.length] } : {}}
                                    >
                                        {sel && <CheckCircle size={12} className="text-white" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white truncate">{meta?.name || id}</p>
                                        <p className="text-xs text-text-muted truncate">{id}</p>
                                    </div>
                                    {meta?.data_type && (
                                        <span className="text-xs text-text-muted bg-surfaceHighlight/30 px-1.5 py-0.5 rounded shrink-0">
                                            {meta.data_type}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                        {tagIds.length > 100 && filtered.length >= 100 && (
                            <p className="text-center text-xs text-text-muted py-2">Showing first 100 — refine search to see more</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, description }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div>
                <p className="font-medium text-white">{label}</p>
                {description && <p className="text-sm text-text-secondary mt-0.5">{description}</p>}
            </div>
            <button
                onClick={() => onChange(!checked)}
                className={clsx(
                    'relative flex-shrink-0 w-12 h-6 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent',
                    checked ? 'bg-success focus:ring-success/50' : 'bg-surfaceHighlight/60 focus:ring-surfaceHighlight/50'
                )}
                role="switch"
                aria-checked={checked}
            >
                <span className={clsx(
                    'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300',
                    checked ? 'translate-x-6' : 'translate-x-0'
                )} />
            </button>
        </div>
    );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color = 'text-primary' }) {
    return (
        <div className="bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-xl p-4 flex items-center gap-3">
            <div className={clsx('p-2.5 rounded-xl bg-surfaceHighlight/20', color)}>
                <Icon size={18} />
            </div>
            <div>
                <p className="text-xl font-bold text-white leading-tight">{value}</p>
                <p className="text-xs text-text-secondary">{label}</p>
                {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

// ─── Tag Value Card ───────────────────────────────────────────────────────────

function TagValueCard({ tagId, tagName, records, color }) {
    const [expanded, setExpanded] = useState(false);
    const latest = records[0];
    const sparkData = useMemo(() => {
        return [...records].reverse()
            .map(r => { const v = parseFloat(r.value); return isNaN(v) ? null : [r.timestamp * 1000, v]; })
            .filter(Boolean);
    }, [records]);

    const sparkOption = {
        grid: { left: 0, right: 0, top: 0, bottom: 0 },
        xAxis: { type: 'time', show: false },
        yAxis: { type: 'value', show: false, scale: true },
        series: [{ type: 'line', smooth: true, data: sparkData, lineStyle: { color, width: 2 }, itemStyle: { opacity: 0 }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '55' }, { offset: 1, color: color + '05' }] } } }],
        animation: false,
    };

    return (
        <div className="bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-surfaceHighlight/20 transition-colors" onClick={() => setExpanded(e => !e)}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{tagName || tagId}</p>
                    <p className="text-xs text-text-muted truncate">{tagId}</p>
                </div>
                <div className="flex items-center gap-2 text-right shrink-0">
                    <div>
                        <p className="text-sm font-bold text-white">{latest?.value ?? '—'}</p>
                        {latest && <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border', qualityBadge(latest.quality))}>{latest.quality}</span>}
                    </div>
                    {expanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                </div>
            </div>
            {!expanded && sparkData.length > 1 && (
                <div className="px-3 pb-2 h-10">
                    <ReactECharts option={sparkOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
                </div>
            )}
            {expanded && (
                <div className="border-t border-surfaceHighlight/30 max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#1a2235]">
                            <tr className="text-text-muted">
                                <th className="text-left px-3 py-1.5">Time</th>
                                <th className="text-right px-3 py-1.5">Value</th>
                                <th className="text-right px-3 py-1.5">Quality</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surfaceHighlight/20">
                            {records.map(r => (
                                <tr key={r.id} className="hover:bg-surfaceHighlight/10">
                                    <td className="px-3 py-1.5 text-text-secondary">{fmt(r.timestamp)}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-white">{r.value ?? '—'}</td>
                                    <td className="px-3 py-1.5 text-right">
                                        <span className={clsx('px-1.5 py-0.5 rounded border text-[10px]', qualityBadge(r.quality))}>{r.quality}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Visualise Tab ────────────────────────────────────────────────────────────

function VisualiseTab({ devices, allTags, storedTagIds }) {
    const toast = useToast();
    const [selectedTagIds, setSelectedTagIds] = useState([]);
    const [timeRange, setTimeRange] = useState('1h');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [records, setRecords] = useState({});
    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState('chart');
    const [chartType, setChartType] = useState('line');

    const tagMeta = useMemo(() => {
        const map = {};
        allTags.forEach(t => { map[t.tag_id] = t; });
        return map;
    }, [allTags]);

    const buildTimeParams = () => {
        const now = Date.now() / 1000;
        const range = TIME_RANGES.find(r => r.value === timeRange);
        if (timeRange === 'custom') {
            return {
                start_time: customStart ? new Date(customStart).getTime() / 1000 : undefined,
                end_time: customEnd ? new Date(customEnd).getTime() / 1000 : undefined,
            };
        }
        if (!range?.seconds) return {};
        return { start_time: now - range.seconds, end_time: now };
    };

    const fetchData = async () => {
        if (selectedTagIds.length === 0) { toast.warn('Select at least one tag.'); return; }
        setLoading(true);
        try {
            const timeParams = buildTimeParams();
            const newRecords = {};
            await Promise.all(selectedTagIds.map(async (tagId) => {
                const { data } = await getDataStoreRecords({ ...timeParams, 'tag_ids[]': tagId, limit: 2000 });
                newRecords[tagId] = data;
            }));
            setRecords(newRecords);
        } catch (err) {
            toast.error('Failed to fetch: ' + (err.response?.data?.detail || err.message));
        } finally {
            setLoading(false);
        }
    };

    const chartOption = useMemo(() => {
        const series = selectedTagIds.map((tagId, i) => {
            const raw = records[tagId] || [];
            const data = raw
                .map(r => { const v = parseFloat(r.value); return isNaN(v) ? null : { value: [r.timestamp * 1000, v], quality: r.quality }; })
                .filter(Boolean);
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const isArea = chartType === 'area';
            const isBar  = chartType === 'bar';
            const isScatter = chartType === 'scatter';

            return {
                name: tagMeta[tagId]?.name || tagId,
                type: isBar ? 'bar' : isScatter ? 'scatter' : 'line',
                smooth: !isBar && !isScatter,
                symbol: isScatter ? 'circle' : 'none',
                symbolSize: 5,
                lineStyle: { color, width: 2 },
                itemStyle: { color },
                areaStyle: (isArea || chartType === 'line') ? {
                    color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + (isArea ? '55' : '20') }, { offset: 1, color: color + '03' }] }
                } : undefined,
                barMaxWidth: 8,
                data,
            };
        });

        return {
            backgroundColor: 'transparent',
            legend: {
                textStyle: { color: '#94a3b8', fontSize: 12 },
                inactiveColor: '#475569',
                padding: [4, 8],
                itemGap: 16,
            },
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#0f1729',
                borderColor: '#334155',
                borderWidth: 1,
                padding: [8, 12],
                textStyle: { color: '#f1f5f9', fontSize: 12 },
                formatter: (params) => {
                    if (!params.length) return '';
                    const dt = new Date(params[0].value[0]).toLocaleString();
                    const rows = params.map(p => `<div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="width:10px;height:10px;border-radius:50%;background:${p.color};display:inline-block"></span><span style="color:#94a3b8">${p.seriesName}</span><b style="margin-left:auto">${fmtYAxis(p.value[1])}</b></div>`).join('');
                    return `<div style="font-size:11px;color:#64748b;margin-bottom:4px">${dt}</div>${rows}`;
                },
            },
            grid: { left: 10, right: 16, bottom: 56, top: 40, containLabel: true },
            xAxis: {
                type: 'time',
                axisLine: { lineStyle: { color: '#2d3f5a' } },
                axisTick: { lineStyle: { color: '#2d3f5a' } },
                axisLabel: { color: '#64748b', fontSize: 11 },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: '#64748b', fontSize: 11, formatter: fmtYAxis },
                splitLine: { lineStyle: { color: '#1e2d42', type: 'dashed' } },
            },
            dataZoom: [
                { type: 'inside', start: 0, end: 100, zoomOnMouseWheel: true },
                {
                    type: 'slider', start: 0, end: 100, height: 24, bottom: 4,
                    backgroundColor: '#0f1729',
                    fillerColor: 'rgba(99,102,241,0.15)',
                    borderColor: '#2d3f5a',
                    handleStyle: { color: '#6366f1', borderColor: '#6366f1' },
                    textStyle: { color: '#64748b', fontSize: 10 },
                    moveHandleStyle: { color: '#6366f1' },
                },
            ],
            series,
        };
    }, [records, selectedTagIds, tagMeta, chartType]);

    const hasData = selectedTagIds.some(id => (records[id] || []).length > 0);

    return (
        <div className="space-y-4">
            {/* Controls card */}
            <div className="bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-2xl p-4 space-y-3">
                {/* Row 1: Tag selector */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                            <TrendingUp size={12} /> Tags to Visualise
                            <span className="text-text-muted">({storedTagIds.length} with stored data)</span>
                        </label>
                        {selectedTagIds.length > 0 && (
                            <button onClick={() => setSelectedTagIds([])} className="text-xs text-error hover:underline flex items-center gap-1">
                                <X size=  {11} /> Clear ({selectedTagIds.length})
                            </button>
                        )}
                    </div>
                    <TagMultiSelect
                        tagIds={storedTagIds}
                        tagMeta={Object.fromEntries(allTags.map(t => [t.tag_id, t]))}
                        selected={selectedTagIds}
                        onChange={setSelectedTagIds}
                        placeholder={storedTagIds.length === 0 ? 'No stored data — enable Local Mode first' : `Search ${storedTagIds.length} tags…`}
                    />
                </div>

                {/* Row 2: Time range + chart type + buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Time range */}
                    <select
                        value={timeRange}
                        onChange={e => setTimeRange(e.target.value)}
                        className="bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-lg px-2.5 py-2 text-white text-sm focus:outline-none focus:border-primary"
                    >
                        {TIME_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>

                    {timeRange === 'custom' && (
                        <div className="flex gap-2">
                            <input type="datetime-local" value={customStart} onChange={e => setCustomStart(e.target.value)}
                                className="bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-primary" />
                            <span className="text-text-muted self-center text-xs">→</span>
                            <input type="datetime-local" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                                className="bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-primary" />
                        </div>
                    )}

                    {/* Chart type selector */}
                    <div className="flex rounded-lg overflow-hidden border border-surfaceHighlight/40">
                        {CHART_TYPES.map(ct => {
                            const Icon = ct.icon;
                            return (
                                <button key={ct.value} onClick={() => { setChartType(ct.value); setViewMode('chart'); }}
                                    title={ct.label}
                                    className={clsx('px-2.5 py-2 text-sm transition-colors', chartType === ct.value && viewMode === 'chart' ? 'bg-primary text-white' : 'bg-surfaceHighlight/20 text-text-secondary hover:text-white hover:bg-surfaceHighlight/40')}>
                                    <Icon size={14} />
                                </button>
                            );
                        })}
                        {/* Cards view */}
                        <button onClick={() => setViewMode('cards')} title="Value Cards"
                            className={clsx('px-2.5 py-2 text-sm transition-colors border-l border-surfaceHighlight/40', viewMode === 'cards' ? 'bg-accent/30 text-accent' : 'bg-surfaceHighlight/20 text-text-secondary hover:text-white')}>
                            <Activity size={14} />
                        </button>
                    </div>

                    <button onClick={fetchData} disabled={loading}
                        className="flex items-center gap-1.5 bg-primary hover:bg-primary/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ml-auto">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        {loading ? 'Loading…' : 'Fetch Data'}
                    </button>
                </div>
            </div>

            {/* Chart / Cards */}
            {viewMode !== 'cards' ? (
                <div className="bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-2xl overflow-hidden">
                    {hasData ? (
                        <ReactECharts
                            option={chartOption}
                            style={{ height: 440 }}
                            opts={{ renderer: 'canvas' }}
                        />
                    ) : (
                        <div className="h-64 flex flex-col items-center justify-center text-text-muted gap-3">
                            <BarChart2 size={40} className="opacity-30" />
                            <div className="text-center">
                                <p className="text-sm">No data to display</p>
                                <p className="text-xs text-text-muted mt-1">Select tags and click Fetch Data</p>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {selectedTagIds.length === 0 && (
                        <p className="text-text-muted text-sm col-span-full text-center py-10">Select tags above then fetch data to see value cards.</p>
                    )}
                    {selectedTagIds.map((tagId, i) => (
                        <TagValueCard key={tagId} tagId={tagId}
                            tagName={Object.fromEntries(allTags.map(t => [t.tag_id, t]))[tagId]?.name}
                            records={records[tagId] || []}
                            color={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Configuration Tab ────────────────────────────────────────────────────────

function ConfigurationTab({ config, setConfig, devices, allTags, onSave, saving }) {
    const [openDevices, setOpenDevices] = useState({});

    const ioTagsPerDevice = useMemo(() => {
        const map = {};
        allTags.filter(t => t.type === 'IO').forEach(t => {
            if (!map[t.device_id]) map[t.device_id] = [];
            map[t.device_id].push(t);
        });
        return map;
    }, [allTags]);

    const allIoTagIds = useMemo(() => allTags.filter(t => t.type === 'IO').map(t => t.tag_id), [allTags]);
    const included = config.included_tags || [];
    const allSelected = allIoTagIds.length > 0 && allIoTagIds.every(id => included.includes(id));

    const updateIncluded = (ids) => setConfig(c => ({ ...c, included_tags: ids }));
    const toggleSingleTag = (tagId) => {
        updateIncluded(included.includes(tagId) ? included.filter(id => id !== tagId) : [...included, tagId]);
    };
    const toggleDeviceTags = (devId) => {
        const devTagIds = (ioTagsPerDevice[devId] || []).map(t => t.tag_id);
        const allDevSel = devTagIds.every(id => included.includes(id));
        updateIncluded(allDevSel ? included.filter(id => !devTagIds.includes(id)) : Array.from(new Set([...included, ...devTagIds])));
    };

    const INTERVALS = [
        { v: 1, l: '1s' }, { v: 2, l: '2s' }, { v: 5, l: '5s' },
        { v: 10, l: '10s' }, { v: 30, l: '30s' }, { v: 60, l: '1 min' },
    ];

    return (
        <div className="space-y-4">
            {/* Local Mode */}
            <div className="bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-2xl p-5">
                <Toggle
                    checked={config.enabled}
                    onChange={(v) => setConfig(c => ({ ...c, enabled: v }))}
                    label="Local Mode"
                    description={config.enabled ? 'Recording IO tag values to local storage' : 'Disabled — no values are being stored'}
                />
                {/* Sample interval */}
                <div className="mt-4 pt-4 border-t border-surfaceHighlight/30">
                    <label className="text-sm text-text-secondary mb-2 flex items-center gap-1.5">
                        <Clock size={13} /> Sampling Interval
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {INTERVALS.map(({ v, l }) => (
                            <button key={v} onClick={() => setConfig(c => ({ ...c, sample_interval: v }))}
                                className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                                    config.sample_interval === v ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-surfaceHighlight/20 border-surfaceHighlight/40 text-text-secondary hover:text-white')}>
                                {l}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tag Selection */}
            <div className="bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="font-medium text-white text-sm">Tags to Record</h3>
                        <p className="text-xs text-text-secondary mt-0.5">
                            {included.length === 0 ? 'All enabled IO tags (default)' : `${included.length} / ${allIoTagIds.length} IO tags selected`}
                        </p>
                    </div>
                    <button onClick={() => updateIncluded(allSelected ? [] : [...allIoTagIds])}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
                        {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                        {allSelected ? 'Deselect All' : 'Select All'}
                    </button>
                </div>

                {included.length === 0 && (
                    <div className="flex items-start gap-2 mb-3 p-2.5 bg-primary/10 border border-primary/20 rounded-lg text-xs text-primary">
                        <Info size={13} className="shrink-0 mt-0.5" />
                        No specific tags selected — all IO tags will be recorded. Select below to limit storage usage.
                    </div>
                )}

                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {devices.map(dev => {
                        const devTags = ioTagsPerDevice[dev.id] || [];
                        if (!devTags.length) return null;
                        const devTagIds = devTags.map(t => t.tag_id);
                        const allDevSel = devTagIds.every(id => included.includes(id));
                        const open = openDevices[dev.id];
                        return (
                            <div key={dev.id} className="border border-surfaceHighlight/30 rounded-xl overflow-hidden">
                                <div className="flex items-center gap-2.5 px-3 py-2.5 bg-surfaceHighlight/10 hover:bg-surfaceHighlight/20 cursor-pointer"
                                    onClick={() => setOpenDevices(p => ({ ...p, [dev.id]: !p[dev.id] }))}>
                                    <button onClick={e => { e.stopPropagation(); toggleDeviceTags(dev.id); }}
                                        className={clsx('transition-colors shrink-0', allDevSel ? 'text-primary' : 'text-text-muted hover:text-text-secondary')}>
                                        {allDevSel ? <CheckSquare size={14} /> : <Square size={14} />}
                                    </button>
                                    <span className="font-medium text-white text-sm">{dev.name}</span>
                                    <span className="text-xs text-text-muted bg-surfaceHighlight/30 px-1.5 py-0.5 rounded-full ml-auto">{devTags.length} tags</span>
                                    {open ? <ChevronUp size={13} className="text-text-muted" /> : <ChevronDown size={13} className="text-text-muted" />}
                                </div>
                                {open && (
                                    <div className="divide-y divide-surfaceHighlight/20">
                                        {devTags.map(tag => (
                                            <label key={tag.id} className="flex items-center gap-3 px-5 py-2 hover:bg-surfaceHighlight/10 cursor-pointer">
                                                <input type="checkbox" checked={included.includes(tag.tag_id)} onChange={() => toggleSingleTag(tag.tag_id)} className="accent-primary" />
                                                <span className="text-sm text-white flex-1">{tag.name}</span>
                                                <span className="text-xs text-text-muted">{tag.tag_id}</span>
                                                <span className="text-xs text-text-muted bg-surfaceHighlight/20 px-1.5 py-0.5 rounded">{tag.data_type}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="flex justify-end">
                <button onClick={onSave} disabled={saving}
                    className="flex items-center gap-2 bg-primary hover:bg-primary/80 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    {saving ? 'Saving…' : 'Save Configuration'}
                </button>
            </div>
        </div>
    );
}

// ─── Manage Tab ───────────────────────────────────────────────────────────────

function ManageTab({ stats, onStatsRefresh, allTags, storedTagIds }) {
    const toast = useToast();
    const [filterTagIds, setFilterTagIds] = useState([]);
    const [filterStart, setFilterStart] = useState('');
    const [filterEnd, setFilterEnd] = useState('');
    const [exporting, setExporting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const tagMeta = useMemo(() => {
        const map = {};
        allTags.forEach(t => { map[t.tag_id] = t; });
        return map;
    }, [allTags]);

    const noFilters = filterTagIds.length === 0 && !filterStart && !filterEnd;

    const buildParams = () => {
        const p = {};
        if (filterTagIds.length > 0) p['tag_ids[]'] = filterTagIds;
        if (filterStart) p.start_time = new Date(filterStart).getTime() / 1000;
        if (filterEnd) p.end_time = new Date(filterEnd).getTime() / 1000;
        return p;
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await exportDataStore(buildParams());
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `datastore_${new Date().toISOString().slice(0,10)}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('Export downloaded.');
        } catch (err) {
            toast.error('Export failed: ' + (err.response?.data?.detail || err.message));
        } finally {
            setExporting(false);
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) { setConfirmDelete(true); return; }
        setDeleting(true);
        try {
            const { data } = await deleteDataStoreRecords(buildParams());
            toast.success(data.message);
            setConfirmDelete(false);
            setRefreshing(true);
            await onStatsRefresh();
            setRefreshing(false);
        } catch (err) {
            toast.error('Delete failed: ' + (err.response?.data?.detail || err.message));
        } finally {
            setDeleting(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await onStatsRefresh();
        setRefreshing(false);
    };

    return (
        <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Records" value={fmtRows(stats?.total_rows)} icon={Database} color="text-primary" />
                <StatCard label="Unique Tags" value={fmtRows(stats?.tag_count)} icon={TrendingUp} color="text-accent" />
                <StatCard label="Oldest" value={stats?.oldest_timestamp ? new Date(stats.oldest_timestamp * 1000).toLocaleDateString() : '—'} sub={stats?.oldest_timestamp ? new Date(stats.oldest_timestamp * 1000).toLocaleTimeString() : ''} icon={Calendar} color="text-warning" />
                <StatCard label="Newest" value={stats?.newest_timestamp ? new Date(stats.newest_timestamp * 1000).toLocaleDateString() : '—'} sub={stats?.newest_timestamp ? new Date(stats.newest_timestamp * 1000).toLocaleTimeString() : ''} icon={Clock} color="text-success" />
            </div>

            {/* Filter panel */}
            <div className="bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Filter size={15} className="text-primary" />
                    <h3 className="font-medium text-white text-sm">Filter Records</h3>
                    <span className="text-xs text-text-muted ml-1">— applied to both Export and Delete</span>
                    {!noFilters && (
                        <button onClick={() => { setFilterTagIds([]); setFilterStart(''); setFilterEnd(''); }}
                            className="ml-auto text-xs text-error hover:underline flex items-center gap-1">
                            <X size={11} /> Clear filters
                        </button>
                    )}
                </div>

                <div className="space-y-3">
                    {/* Tag filter */}
                    <div>
                        <label className="block text-xs text-text-secondary mb-1.5">Tags <span className="text-text-muted">(empty = all tags)</span></label>
                        <TagMultiSelect
                            tagIds={storedTagIds}
                            tagMeta={tagMeta}
                            selected={filterTagIds}
                            onChange={setFilterTagIds}
                            placeholder={`Filter by tags (${storedTagIds.length} with data)…`}
                        />
                    </div>

                    {/* Time range */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-text-secondary mb-1.5 flex items-center gap-1"><Clock size={11} /> From <span className="text-text-muted">(optional)</span></label>
                            <input type="datetime-local" value={filterStart} onChange={e => setFilterStart(e.target.value)}
                                className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary" />
                        </div>
                        <div>
                            <label className="block text-xs text-text-secondary mb-1.5 flex items-center gap-1"><Clock size={11} /> To <span className="text-text-muted">(optional)</span></label>
                            <input type="datetime-local" value={filterEnd} onChange={e => setFilterEnd(e.target.value)}
                                className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary" />
                        </div>
                    </div>

                    {/* Active filter summary */}
                    {!noFilters && (
                        <div className="bg-surfaceHighlight/20 rounded-lg px-3 py-2 text-xs text-text-secondary flex flex-wrap gap-x-3 gap-y-1">
                            {filterTagIds.length > 0 && <span>📌 {filterTagIds.length} tag(s)</span>}
                            {filterStart && <span>📅 From: {new Date(filterStart).toLocaleString()}</span>}
                            {filterEnd && <span>📅 To: {new Date(filterEnd).toLocaleString()}</span>}
                        </div>
                    )}
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleExport} disabled={exporting}
                    className="flex items-center gap-2 bg-success/10 hover:bg-success/20 text-success border border-success/30 px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                    <Download size={14} className={exporting ? 'animate-bounce' : ''} />
                    {exporting ? 'Exporting…' : noFilters ? 'Export All as CSV' : 'Export Filtered CSV'}
                </button>

                <div className="flex items-center gap-2">
                    <button onClick={handleDelete} disabled={deleting}
                        className={clsx('flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-all disabled:opacity-50',
                            confirmDelete ? 'bg-error text-white border-error' : 'bg-error/10 hover:bg-error/20 text-error border-error/30')}>
                        {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        {deleting ? 'Deleting…' : confirmDelete ? '⚠ Confirm Delete' : noFilters ? 'Delete All' : 'Delete Filtered'}
                    </button>
                    {confirmDelete && (
                        <button onClick={() => setConfirmDelete(false)} className="text-xs text-text-muted hover:text-white px-2 py-2">
                            Cancel
                        </button>
                    )}
                </div>

                <button onClick={handleRefresh} disabled={refreshing}
                    className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary hover:text-white border border-surfaceHighlight/30 hover:border-surfaceHighlight/60 px-3 py-2.5 rounded-xl transition-all">
                    <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh Stats'}
                </button>
            </div>

            {noFilters && (
                <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/20 rounded-xl text-xs text-warning">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    No filters active — Export / Delete will affect <strong>all {fmtRows(stats?.total_rows)} records</strong>. Apply a tag or time filter above to target specific data.
                </div>
            )}
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
    { id: 'visualise',     label: 'Visualise',     icon: BarChart2 },
    { id: 'configuration', label: 'Configuration', icon: Settings2 },
    { id: 'manage',        label: 'Manage',        icon: Database },
];

export default function DataStore() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState('visualise');
    const [config, setConfig] = useState({ enabled: false, included_tags: [], sample_interval: 1 });
    const [storedTagIds, setStoredTagIds] = useState([]);
    const [stats, setStats] = useState(null);
    const [devices, setDevices] = useState([]);
    const [allTags, setAllTags] = useState([]);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                const [cfgRes, tagsRes, devsRes, allTagsRes, statsRes] = await Promise.all([
                    getDataStoreConfig(), getDataStoreTags(),
                    getDevices(), getTags(), getDataStoreStats(),
                ]);
                setConfig(cfgRes.data);
                setStoredTagIds(tagsRes.data);
                setDevices(devsRes.data);
                setAllTags(allTagsRes.data);
                setStats(statsRes.data);
            } catch (err) {
                toast.error('Failed to initialise DataStore: ' + (err.response?.data?.detail || err.message));
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const refreshStats = useCallback(async () => {
        try {
            const [tagsRes, statsRes] = await Promise.all([getDataStoreTags(), getDataStoreStats()]);
            setStoredTagIds(tagsRes.data);
            setStats(statsRes.data);
        } catch (err) {
            toast.error('Refresh failed: ' + (err.response?.data?.detail || err.message));
        }
    }, []);

    const saveConfig = async () => {
        setSaving(true);
        try {
            const { data } = await updateDataStoreConfig(config);
            setConfig(data);
            toast.success('Configuration saved.');
        } catch (err) {
            toast.error('Save failed: ' + (err.response?.data?.detail || err.message));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-80 gap-4 text-text-muted">
                <Loader2 size={36} className="animate-spin text-primary" />
                <p className="text-sm">Initialising DataStore…</p>
            </div>
        );
    }

    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
                        <HardDrive size={22} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white">DataStore</h1>
                        <p className="text-text-secondary text-xs">Local real-time tag history</p>
                    </div>
                </div>
                <div className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium',
                    config.enabled ? 'bg-success/10 border-success/30 text-success' : 'bg-surfaceHighlight/20 border-surfaceHighlight/40 text-text-muted')}>
                    <span className={clsx('w-1.5 h-1.5 rounded-full', config.enabled ? 'bg-success animate-pulse' : 'bg-text-muted')} />
                    {config.enabled ? `Recording · ${config.sample_interval}s · ${fmtRows(stats?.total_rows)} rows` : 'Local Mode Off'}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-xl p-1">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={clsx('flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                                activeTab === tab.id ? 'bg-primary text-white shadow' : 'text-text-secondary hover:text-white hover:bg-surfaceHighlight/30')}>
                            <Icon size={14} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'visualise' && <VisualiseTab devices={devices} allTags={allTags} storedTagIds={storedTagIds} />}
            {activeTab === 'configuration' && <ConfigurationTab config={config} setConfig={setConfig} devices={devices} allTags={allTags} onSave={saveConfig} saving={saving} />}
            {activeTab === 'manage' && <ManageTab stats={stats} onStatsRefresh={refreshStats} allTags={allTags} storedTagIds={storedTagIds} />}
        </div>
    );
}
