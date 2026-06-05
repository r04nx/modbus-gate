import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import clsx from 'clsx';

const SearchableSelect = ({
    options = [],
    value,
    onChange,
    placeholder = 'Select option...',
    className,
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const containerRef = useRef(null);

    // Normalize options to [{ value, label }]
    const normalizedOptions = options.map(opt => {
        if (typeof opt === 'object' && opt !== null) {
            return { 
                value: opt.value !== undefined ? opt.value : (opt.id !== undefined ? opt.id : opt.name), 
                label: opt.label !== undefined ? opt.label : (opt.name !== undefined ? opt.name : String(opt.value || opt.id))
            };
        }
        return { value: opt, label: String(opt) };
    });

    const selectedOption = normalizedOptions.find(opt => opt.value === value);

    // Filter options based on search query
    const filteredOptions = normalizedOptions.filter(opt =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Reset search query when opening/closing
    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
        }
    }, [isOpen]);

    return (
        <div ref={containerRef} className={clsx("relative w-full", className)}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={clsx(
                    "w-full flex items-center justify-between bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none transition-all text-left",
                    disabled ? "cursor-not-allowed opacity-50 bg-surfaceHighlight/10" : "focus:border-purple-400 hover:border-surfaceHighlight/80"
                )}
            >
                <span className={clsx("block truncate", !selectedOption && "text-text-secondary")}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown className={clsx("w-4 h-4 text-text-secondary flex-shrink-0 transition-transform duration-200", isOpen && "transform rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-[#1a1b2e] border border-surfaceHighlight rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 border-b border-surfaceHighlight/30 flex items-center gap-2 bg-surfaceHighlight/5">
                        <Search className="w-4 h-4 text-text-secondary flex-shrink-0" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search..."
                            className="w-full bg-transparent text-white text-sm focus:outline-none placeholder-text-muted"
                            autoFocus
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="text-text-secondary hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <div className="max-h-60 overflow-y-auto divide-y divide-surfaceHighlight/10">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                    }}
                                    className={clsx(
                                        "w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-purple-500/10 hover:text-purple-400 text-white",
                                        opt.value === value && "bg-purple-500/20 text-purple-400 font-medium"
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-sm text-text-muted text-center">
                                No options found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;
