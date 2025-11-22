import React, { useState, useEffect } from 'react';
import { getOperations } from '../services/api';
import { Search, X } from 'lucide-react';
import clsx from 'clsx';

const OperationsLibrary = ({ onInsert, onClose }) => {
    const [operations, setOperations] = useState([]);
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');

    useEffect(() => {
        fetchOperations();
    }, []);

    const fetchOperations = async () => {
        try {
            const { data } = await getOperations();
            setOperations(data);
        } catch (error) {
            console.error("Failed to fetch operations", error);
        }
    };

    const categories = ['All', ...new Set(operations.map(op => op.category))];

    const filteredOps = operations.filter(op => {
        const matchesSearch = search === '' ||
            op.name.toLowerCase().includes(search.toLowerCase()) ||
            op.description.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = activeCategory === 'All' || op.category === activeCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60]">
            <div className="bg-surface border border-surfaceHighlight rounded-2xl shadow-2xl w-full max-w-6xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-surfaceHighlight bg-surfaceHighlight/30">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-2xl font-bold text-white font-sans">Mathematical Operations</h3>
                        <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
                            <X size={28} />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search operations..."
                            className="w-full pl-11 pr-4 py-3 bg-surface border border-surfaceHighlight rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary font-sans text-base"
                        />
                    </div>

                    {/* Categories */}
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {categories.map(category => (
                            <button
                                key={category}
                                onClick={() => setActiveCategory(category)}
                                className={clsx(
                                    "px-5 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap font-sans",
                                    activeCategory === category
                                        ? "bg-primary text-white shadow-lg"
                                        : "bg-surfaceHighlight/50 text-text-secondary hover:text-white hover:bg-surfaceHighlight"
                                )}
                            >
                                {category}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Operations List */}
                <div className="flex-1 overflow-y-auto p-6 bg-surface/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredOps.map((op, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    onInsert(op.symbol);
                                    onClose();
                                }}
                                className="text-left p-5 bg-surfaceHighlight/30 hover:bg-primary/20 hover:border-primary border border-surfaceHighlight rounded-xl transition-all"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <code className="text-primary font-bold text-lg font-mono">{op.symbol}</code>
                                    <span className="text-xs text-text-muted font-sans px-2 py-1 bg-surfaceHighlight/50 rounded">{op.category}</span>
                                </div>
                                <div className="text-sm text-white mb-2 font-sans">{op.description}</div>
                                <code className="text-xs text-text-muted font-mono">Ex: {op.example}</code>
                            </button>
                        ))}
                    </div>

                    {filteredOps.length === 0 && (
                        <div className="text-center text-text-muted py-12 font-sans">
                            No operations found
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OperationsLibrary;
