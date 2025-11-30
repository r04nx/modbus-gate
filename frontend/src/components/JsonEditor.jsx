import React, { useState, useRef } from 'react';
import { Code, Braces, Clock, Tag, Check, Copy, Type, Hash, KeyRound } from 'lucide-react';
import clsx from 'clsx';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism-tomorrow.css'; // Dark theme

const JsonEditor = ({ value, onChange, availableTags = [], devicesMap = {} }) => {
    // We need a ref to the Editor component to access the internal textarea if possible,
    // or we just rely on the fact that we can't easily get cursor position from the wrapper
    // without some hacks. 
    // react-simple-code-editor passes the ref to the underlying textarea.
    const textareaRef = useRef(null);
    const [showTagSelector, setShowTagSelector] = useState(false);
    const [tagSearch, setTagSearch] = useState('');

    const handleFormat = () => {
        try {
            const parsed = JSON.parse(value);
            onChange(JSON.stringify(parsed, null, 2));
        } catch (e) {
            // If it's not valid JSON (e.g. has placeholders), we can't format it easily with JSON.stringify
            alert("Invalid JSON or contains placeholders that break JSON syntax");
        }
    };

    const insertText = (text) => {
        // react-simple-code-editor forwards ref to the textarea?
        // According to docs/source, it does not directly forward ref to textarea in all versions,
        // but let's try. If textareaRef.current is the component, we might need .session or similar?
        // Actually, looking at the library source, it spreads props to textarea, so ref should work 
        // IF the library uses forwardRef. 
        // If not, we might need to use a querySelector or similar if ref fails.

        let textarea = textareaRef.current;

        // Fallback if ref doesn't point to the textarea element directly
        if (textarea && !textarea.setSelectionRange && textarea._input) {
            textarea = textarea._input;
        }

        if (!textarea || !textarea.setSelectionRange) {
            // Try finding it by ID or class if we added one, or just append
            // But for now let's assume ref works or we append to end
            const newValue = value + text;
            onChange(newValue);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = value.substring(0, start) + text + value.substring(end);

        onChange(newValue);

        // Restore cursor position
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + text.length, start + text.length);
        }, 0);
    };

    const insertTag = (tag, type = 'value') => {
        // type: 'value' | 'name' | 'kv'
        let textToInsert = '';

        if (type === 'value') {
            textToInsert = `"{{${tag.tag_id}}}"`;
        } else if (type === 'name') {
            textToInsert = `"${tag.name}"`;
        } else if (type === 'kv') {
            textToInsert = `"${tag.name}": "{{${tag.tag_id}}}"`;
        }

        insertText(textToInsert);
        setShowTagSelector(false);
    };

    const filteredTags = availableTags.filter(t =>
        t.name.toLowerCase().includes(tagSearch.toLowerCase()) ||
        t.tag_id.toLowerCase().includes(tagSearch.toLowerCase()) ||
        (devicesMap[t.device_id] || '').toLowerCase().includes(tagSearch.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-0 border border-surfaceHighlight rounded-xl bg-surface relative">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-2 bg-surfaceHighlight/10 border-b border-surfaceHighlight/30 rounded-t-xl">
                <button
                    onClick={handleFormat}
                    className="p-1.5 text-text-muted hover:text-white hover:bg-surfaceHighlight/20 rounded-lg transition-colors"
                    title="Format JSON"
                >
                    <Braces size={16} />
                </button>
                <div className="h-4 w-px bg-surfaceHighlight/30 mx-1" />
                <button
                    onClick={() => insertText('"{{timestamp}}"')}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-text-muted hover:text-white hover:bg-surfaceHighlight/20 rounded-lg transition-colors"
                >
                    <Clock size={14} />
                    <span>Time (s)</span>
                </button>
                <button
                    onClick={() => insertText('"{{timestamp_ms}}"')}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-text-muted hover:text-white hover:bg-surfaceHighlight/20 rounded-lg transition-colors"
                >
                    <Clock size={14} />
                    <span>Time (ms)</span>
                </button>
                <div className="h-4 w-px bg-surfaceHighlight/30 mx-1" />
                <div className="relative">
                    <button
                        onClick={() => setShowTagSelector(!showTagSelector)}
                        className={clsx(
                            "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-colors",
                            showTagSelector ? "bg-primary text-white" : "text-text-muted hover:text-white hover:bg-surfaceHighlight/20"
                        )}
                    >
                        <Tag size={14} />
                        <span>Insert Tag</span>
                    </button>

                    {showTagSelector && (
                        <div className="absolute top-full left-0 mt-1 w-80 max-h-80 bg-surface border border-surfaceHighlight rounded-xl shadow-xl z-50 flex flex-col">
                            <div className="p-2 border-b border-surfaceHighlight/30">
                                <input
                                    type="text"
                                    placeholder="Search tags..."
                                    value={tagSearch}
                                    onChange={(e) => setTagSearch(e.target.value)}
                                    className="w-full bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-primary"
                                    autoFocus
                                />
                            </div>
                            <div className="flex-1 overflow-y-auto p-1 space-y-0.5 custom-scrollbar">
                                {filteredTags.map(tag => {
                                    const deviceName = devicesMap[tag.device_id] || 'Unknown Device';
                                    return (
                                        <div
                                            key={tag.tag_id}
                                            className="group flex flex-col gap-1 p-2 hover:bg-surfaceHighlight/10 rounded-lg border border-transparent hover:border-surfaceHighlight/20 transition-all cursor-default"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[10px] text-primary font-medium leading-tight truncate">{deviceName}</div>
                                                    <div className="font-medium text-xs text-white truncate">{tag.name}</div>
                                                </div>
                                                <span className="text-[10px] text-text-muted font-mono bg-surfaceHighlight/20 px-1 py-0.5 rounded whitespace-nowrap">{tag.tag_id}</span>
                                            </div>

                                            <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => insertTag(tag, 'value')}
                                                    className="flex-1 flex items-center justify-center gap-1 bg-surfaceHighlight/20 hover:bg-primary hover:text-white text-text-secondary text-[10px] py-1 rounded border border-surfaceHighlight/30 transition-all"
                                                    title="Insert Value"
                                                >
                                                    <Hash size={10} />
                                                    <span>Value</span>
                                                </button>
                                                <button
                                                    onClick={() => insertTag(tag, 'name')}
                                                    className="flex-1 flex items-center justify-center gap-1 bg-surfaceHighlight/20 hover:bg-primary hover:text-white text-text-secondary text-[10px] py-1 rounded border border-surfaceHighlight/30 transition-all"
                                                    title="Insert Name"
                                                >
                                                    <Type size={10} />
                                                    <span>Name</span>
                                                </button>
                                                <button
                                                    onClick={() => insertTag(tag, 'kv')}
                                                    className="flex-1 flex items-center justify-center gap-1 bg-surfaceHighlight/20 hover:bg-primary hover:text-white text-text-secondary text-[10px] py-1 rounded border border-surfaceHighlight/30 transition-all"
                                                    title="Insert KV Pair"
                                                >
                                                    <KeyRound size={10} />
                                                    <span>KV</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {filteredTags.length === 0 && (
                                    <div className="p-2 text-center text-xs text-text-muted">No tags found</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Editor */}
            <div className="relative w-full h-64 bg-[#2d2d2d] overflow-auto custom-scrollbar">
                <Editor
                    value={value}
                    onValueChange={onChange}
                    highlight={code => highlight(code, languages.json)}
                    padding={16}
                    textareaId="json-editor-textarea"
                    textareaClassName="focus:outline-none"
                    style={{
                        fontFamily: '"Fira code", "Fira Mono", monospace',
                        fontSize: 14,
                        backgroundColor: 'transparent',
                        minHeight: '100%',
                    }}
                    ref={textareaRef}
                />
            </div>

            {/* Footer */}
            <div className="px-4 py-2 bg-surfaceHighlight/5 border-t border-surfaceHighlight/30 text-xs text-text-muted flex justify-between rounded-b-xl">
                <span>Supports JSON syntax</span>
                <span>Use {'{{tag_id}}'} for dynamic values</span>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #2d2d2d;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #555;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #666;
                }
            `}</style>
        </div>
    );
};

export default JsonEditor;
