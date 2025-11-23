import React from 'react';
import { Search, X } from 'lucide-react';

const SearchBar = ({
    value,
    onChange,
    onClear,
    placeholder = "Search...",
    className = ""
}) => {
    return (
        <div className={`relative ${className}`}>
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-text-secondary" />
            </div>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl pl-10 pr-10 py-3 text-white placeholder-text-secondary focus:outline-none focus:border-emerald-400 transition-colors"
            />
            {value && (
                <button
                    onClick={onClear}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-secondary hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};

export default SearchBar;
