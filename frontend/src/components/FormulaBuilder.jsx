import React, { useState } from 'react';
import { Calculator, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

const FormulaBuilder = ({ formula, onChange, mappings, onShowOperations }) => {
    const [error, setError] = useState('');

    const quickOps = [
        { label: '+', value: ' + ' },
        { label: '-', value: ' - ' },
        { label: '×', value: ' * ' },
        { label: '÷', value: ' / ' },
        { label: '^', value: ' ** ' },
        { label: '(', value: '(' },
        { label: ')', value: ')' },
    ];

    const insertAtCursor = (text) => {
        const input = document.getElementById('formula-input');
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const newFormula = formula.substring(0, start) + text + formula.substring(end);
        onChange(newFormula);

        // Set cursor position after inserted text
        setTimeout(() => {
            input.focus();
            input.setSelectionRange(start + text.length, start + text.length);
        }, 0);
    };

    const insertVariable = (variable) => {
        if (mappings[variable]) {
            insertAtCursor(variable);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-base font-bold text-white font-sans">Formula</h4>
                <button
                    type="button"
                    onClick={onShowOperations}
                    className="text-sm text-primary hover:text-primaryHover flex items-center gap-1.5 font-sans font-medium"
                >
                    <Calculator size={16} />
                    Operations Library
                </button>
            </div>

            {/* Variable Buttons */}
            <div className="flex gap-2 flex-wrap">
                {['A', 'B', 'C', 'D', 'E', 'F'].map(variable => (
                    <button
                        type="button"
                        key={variable}
                        onClick={() => insertVariable(variable)}
                        disabled={!mappings[variable]}
                        className={clsx(
                            "px-4 py-2 rounded-lg text-sm font-semibold transition-all font-sans",
                            mappings[variable]
                                ? "bg-primary/20 text-primary hover:bg-primary/30 border-2 border-primary"
                                : "bg-surfaceHighlight/20 text-text-muted cursor-not-allowed border border-surfaceHighlight"
                        )}
                        title={mappings[variable] ? `Insert ${variable} (${mappings[variable]})` : `Map ${variable} to a tag first`}
                    >
                        {variable}
                    </button>
                ))}
            </div>

            {/* Quick Operations */}
            <div className="flex gap-2 flex-wrap">
                {quickOps.map(op => (
                    <button
                        type="button"
                        key={op.label}
                        onClick={() => insertAtCursor(op.value)}
                        className="px-4 py-2 bg-slate-700/60 hover:bg-slate-600 text-white rounded-lg text-sm font-semibold transition-all border border-slate-600 font-sans"
                    >
                        {op.label}
                    </button>
                ))}
            </div>

            {/* Formula Input */}
            <div>
                <textarea
                    id="formula-input"
                    value={formula}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Enter formula using variables (e.g., (A + B) / 2)"
                    className="w-full px-4 py-3 bg-slate-700/40 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-primary font-mono text-base resize-none"
                    rows={4}
                />
            </div>

            {/* Error Display */}
            {error && (
                <div className="flex items-start gap-2 p-3 bg-error/10 border border-error/30 rounded-xl">
                    <AlertCircle size={18} className="text-error flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-error font-sans">{error}</div>
                </div>
            )}

            {/* Help Text */}
            <div className="text-sm text-slate-300 font-sans">
                Use variables (A, B, C, etc.) and mathematical operations. Click "Operations Library" for available functions.
            </div>
        </div>
    );
};

export default FormulaBuilder;
