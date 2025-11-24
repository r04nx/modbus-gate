import React from 'react';

const PopupChart = ({ data, width = 300, height = 150, color = '#3b82f6', title }) => {
    if (!data || data.length < 2) return <div className="text-xs text-text-muted text-center p-4">Not enough data</div>;

    const padding = 20;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const values = data.map(d => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    // Generate points
    const points = data.map((d, index) => {
        const x = padding + (index / (data.length - 1)) * chartWidth;
        const y = height - padding - ((d.value - min) / range) * chartHeight;
        return `${x},${y}`;
    }).join(' ');

    const startTime = new Date(data[0].timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTime = new Date(data[data.length - 1].timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="bg-surface border border-surfaceHighlight rounded-xl p-3 shadow-2xl z-50 w-max">
            {title && <div className="text-xs font-bold text-white mb-2">{title}</div>}
            <svg width={width} height={height} className="overflow-visible">
                {/* Grid Lines (Horizontal) */}
                {[0, 0.25, 0.5, 0.75, 1].map(t => {
                    const y = height - padding - t * chartHeight;
                    return (
                        <line key={t} x1={padding} y1={y} x2={width - padding} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    );
                })}

                {/* Y Axis Labels */}
                <text x={padding - 5} y={height - padding} textAnchor="end" fill="#9ca3af" fontSize="10">{min.toFixed(1)}</text>
                <text x={padding - 5} y={padding} textAnchor="end" fill="#9ca3af" fontSize="10">{max.toFixed(1)}</text>

                {/* Line */}
                <polyline
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* X Axis Labels */}
                <text x={padding} y={height - 5} textAnchor="start" fill="#9ca3af" fontSize="10">{startTime}</text>
                <text x={width - padding} y={height - 5} textAnchor="end" fill="#9ca3af" fontSize="10">{endTime}</text>
            </svg>
        </div>
    );
};

export default PopupChart;
