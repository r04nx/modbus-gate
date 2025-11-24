import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { Database, Download, Search, Calendar, RefreshCw, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getTags, getBufferedData, exportBufferedData, clearBufferedData, getBufferedTags } from '../services/api';
import clsx from 'clsx';
import { Trash2 } from 'lucide-react';

const BufferedData = () => {
    const [tags, setTags] = useState([]);
    const [selectedTag, setSelectedTag] = useState('');
    const [timeRange, setTimeRange] = useState('1h');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [clearing, setClearing] = useState(false);

    useEffect(() => {
        fetchTagsList();
    }, []);

    const fetchTagsList = async () => {
        try {
            // Get list of tag IDs that have buffered data
            const { data: bufferedTagIds } = await getBufferedTags();

            // Get all tags to get their names
            const { data: allTags } = await getTags();

            // Create a map of tag ID to tag name
            const tagMap = {};
            allTags.forEach(tag => {
                tagMap[tag.id] = tag.name;
            });

            // Build list of tags with buffered data
            const availableTags = bufferedTagIds.map(tagId => ({
                id: tagId,
                name: tagMap[tagId] || tagId // Use tag name if available, otherwise use ID
            }));

            setTags(availableTags);
            if (availableTags.length > 0) {
                setSelectedTag(availableTags[0].id);
            }
        } catch (error) {
            console.error("Failed to fetch tags", error);
        }
    };

    const handleFetchData = async () => {
        if (!selectedTag) return;

        setLoading(true);
        try {
            const now = Date.now() / 1000;
            let start = now - 3600; // Default 1h
            let end = now;

            if (timeRange === '6h') start = now - 6 * 3600;
            if (timeRange === '24h') start = now - 24 * 3600;
            if (timeRange === '7d') start = now - 7 * 24 * 3600;

            // If 'all' is selected, we don't send start/end times to let backend fetch everything
            const params = {
                tag_id: selectedTag,
                limit: 5000
            };

            if (timeRange !== 'all') {
                params.start_time = start;
                params.end_time = end;
            }

            const { data } = await getBufferedData(params);

            // Format data for chart
            const formattedData = data.map(d => ({
                timestamp: d.timestamp * 1000, // Convert to milliseconds for ECharts
                value: Number(d.value),
                quality: d.quality
            }));

            setData(formattedData);
        } catch (error) {
            console.error("Failed to fetch buffered data", error);
            alert("Failed to fetch data");
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        if (!selectedTag) return;

        setExporting(true);
        try {
            const now = Date.now() / 1000;
            let start = now - 3600;
            let end = now;

            if (timeRange === '6h') start = now - 6 * 3600;
            if (timeRange === '24h') start = now - 24 * 3600;
            if (timeRange === '7d') start = now - 7 * 24 * 3600;

            const params = {
                tag_id: selectedTag
            };

            if (timeRange !== 'all') {
                params.start_time = start;
                params.end_time = end;
            }

            const response = await exportBufferedData(params);

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `buffered_${selectedTag}_${timeRange}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error("Failed to export data", error);
            alert("Failed to export data");
        } finally {
            setExporting(false);
        }
    };

    const handleClearData = async () => {
        if (!confirm("Are you sure you want to delete ALL buffered data? This action cannot be undone.")) return;

        setClearing(true);
        try {
            await clearBufferedData();
            alert("Buffered data cleared successfully");
            setData([]); // Clear chart
        } catch (error) {
            console.error("Failed to clear data", error);
            alert("Failed to clear data");
        } finally {
            setClearing(false);
        }
    };

    // ECharts configuration
    const getChartOption = () => {
        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#1e293b',
                borderColor: '#334155',
                textStyle: {
                    color: '#f8fafc'
                },
                formatter: (params) => {
                    if (params.length > 0) {
                        const date = new Date(params[0].value[0]);
                        return `${date.toLocaleString()}<br/>Value: ${params[0].value[1]}<br/>Quality: ${params[0].data.quality}`;
                    }
                    return '';
                }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '15%',
                top: '10%',
                containLabel: true
            },
            xAxis: {
                type: 'time',
                axisLine: {
                    lineStyle: {
                        color: '#94a3b8'
                    }
                },
                axisLabel: {
                    color: '#94a3b8',
                    fontSize: 12
                }
            },
            yAxis: {
                type: 'value',
                axisLine: {
                    lineStyle: {
                        color: '#94a3b8'
                    }
                },
                axisLabel: {
                    color: '#94a3b8',
                    fontSize: 12
                },
                splitLine: {
                    lineStyle: {
                        color: '#334155',
                        type: 'dashed'
                    }
                }
            },
            dataZoom: [
                {
                    type: 'inside',
                    start: 0,
                    end: 100,
                    zoomOnMouseWheel: true,
                    moveOnMouseMove: true,
                    moveOnMouseWheel: true
                },
                {
                    type: 'slider',
                    start: 0,
                    end: 100,
                    backgroundColor: '#1e293b',
                    fillerColor: 'rgba(236, 72, 153, 0.2)',
                    borderColor: '#334155',
                    handleStyle: {
                        color: '#ec4899'
                    },
                    textStyle: {
                        color: '#94a3b8'
                    }
                }
            ],
            toolbox: {
                feature: {
                    dataZoom: {
                        yAxisIndex: 'none',
                        iconStyle: {
                            borderColor: '#94a3b8'
                        }
                    },
                    restore: {
                        iconStyle: {
                            borderColor: '#94a3b8'
                        }
                    },
                    saveAsImage: {
                        iconStyle: {
                            borderColor: '#94a3b8'
                        },
                        backgroundColor: '#0f172a'
                    }
                },
                iconStyle: {
                    borderColor: '#94a3b8'
                },
                emphasis: {
                    iconStyle: {
                        borderColor: '#ec4899'
                    }
                }
            },
            series: [
                {
                    name: selectedTag,
                    type: 'line',
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 4,
                    lineStyle: {
                        color: '#ec4899',
                        width: 2
                    },
                    itemStyle: {
                        color: '#ec4899'
                    },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                {
                                    offset: 0,
                                    color: 'rgba(236, 72, 153, 0.3)'
                                },
                                {
                                    offset: 1,
                                    color: 'rgba(236, 72, 153, 0.05)'
                                }
                            ]
                        }
                    },
                    data: data.map(d => ({
                        value: [d.timestamp, d.value],
                        quality: d.quality
                    }))
                }
            ]
        };
    };

    return (
        <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link to="/settings" className="p-2 hover:bg-surfaceHighlight/30 rounded-lg transition-colors text-text-secondary hover:text-white">
                        <ArrowLeft size={24} />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Database className="text-pink-400" />
                            Buffered Data Visualization
                        </h1>
                        <p className="text-text-secondary text-sm">Analyze locally buffered data during connection events</p>
                    </div>
                </div>

                <button
                    onClick={handleClearData}
                    disabled={clearing}
                    className="bg-error/10 hover:bg-error/20 text-error border border-error/30 px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2"
                >
                    <Trash2 size={18} />
                    {clearing ? "Clearing..." : "Clear All Data"}
                </button>
            </div>

            {/* Controls */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium text-text-secondary mb-2">Select Tag</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <select
                            value={selectedTag}
                            onChange={(e) => setSelectedTag(e.target.value)}
                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-pink-400 transition-colors appearance-none"
                        >
                            {tags.map(tag => (
                                <option key={tag.id} value={tag.id}>{tag.name} ({tag.id})</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="w-[200px]">
                    <label className="block text-sm font-medium text-text-secondary mb-2">Time Range</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <select
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value)}
                            className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-pink-400 transition-colors appearance-none"
                        >
                            <option value="1h">Last 1 Hour</option>
                            <option value="6h">Last 6 Hours</option>
                            <option value="24h">Last 24 Hours</option>
                            <option value="7d">Last 7 Days</option>
                            <option value="all">All Time (Show Everything)</option>
                        </select>
                    </div>
                </div>

                <button
                    onClick={handleFetchData}
                    disabled={loading || !selectedTag}
                    className="bg-primary hover:bg-primaryHover text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
                >
                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    {loading ? "Loading..." : "Fetch Data"}
                </button>

                <button
                    onClick={handleExport}
                    disabled={exporting || !selectedTag}
                    className="bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white px-6 py-3 rounded-xl font-medium transition-all border border-surfaceHighlight/50 flex items-center gap-2"
                >
                    <Download size={18} className={exporting ? "animate-bounce" : ""} />
                    {exporting ? "Exporting..." : "Export CSV"}
                </button>
            </div>

            {/* Chart Area */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                {data.length > 0 ? (
                    <div className="h-[500px]">
                        <ReactECharts
                            option={getChartOption()}
                            style={{ height: '100%', width: '100%' }}
                            opts={{ renderer: 'canvas' }}
                        />
                    </div>
                ) : (
                    <div className="h-[500px] flex flex-col items-center justify-center text-text-muted">
                        <Database size={48} className="mb-4 opacity-50" />
                        <p className="text-lg">No data to display</p>
                        <p className="text-sm">Select a tag and time range, then click Fetch Data</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BufferedData;
