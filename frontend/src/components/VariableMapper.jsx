import React from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

const VariableMapper = ({ mappings, onMappingChange, onSelectTag }) => {
    const variables = ['A', 'B', 'C', 'D', 'E', 'F'];

    const removeMapping = (variable) => {
        const newMappings = { ...mappings };
        delete newMappings[variable];
        onMappingChange(newMappings);
    };

    return (
        <div className="space-y-4">
            <h4 className="text-base font-bold text-white mb-3 font-sans">Variable Mappings</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {variables.map(variable => {
                    const tagId = mappings[variable];

                    return (
                        <div key={variable} className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg bg-primary/20 border-2 border-primary flex items-center justify-center">
                                <span className="text-primary font-bold text-lg font-sans">{variable}</span>
                            </div>

                            {tagId ? (
                                <div className="flex-1 flex items-center justify-between p-3 bg-slate-700/60 rounded-lg border border-slate-600">
                                    <span className="text-sm text-white font-mono truncate font-sans">{tagId}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeMapping(variable)}
                                        className="text-slate-400 hover:text-error transition-colors ml-2"
                                        title="Remove mapping"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onSelectTag(variable)}
                                    className="flex-1 p-3 bg-slate-700/40 hover:bg-slate-700/60 border border-dashed border-slate-500 rounded-lg text-slate-300 hover:text-white text-sm transition-all font-sans"
                                >
                                    Click to select tag
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {Object.keys(mappings).length === 0 && (
                <div className="text-sm text-slate-300 text-center py-3 font-sans">
                    Map tags to variables to use in your formula
                </div>
            )}
        </div>
    );
};

export default VariableMapper;
