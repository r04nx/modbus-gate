import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Terminal as TerminalIcon } from 'lucide-react';

const Terminal = () => {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const wsRef = useRef(null);
    const fitAddonRef = useRef(null);
    const [connected, setConnected] = useState(false);

    // Use dynamic API base URL
    const API_HOST = window.location.hostname;
    const API_PORT = '8000';
    const WS_BASE = `ws://${API_HOST}:${API_PORT}/api/v1/terminal/ws`;

    useEffect(() => {
        // Initialize xterm
        const term = new XTerm({
            cursorBlink: true,
            theme: {
                background: '#0f172a', // Match app theme
                foreground: '#f8fafc',
                cursor: '#3b82f6',
                selectionBackground: 'rgba(59, 130, 246, 0.3)',
            },
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 14,
            rows: 30,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        fitAddonRef.current = fitAddon;

        if (terminalRef.current) {
            term.open(terminalRef.current);
            try {
                fitAddon.fit();
            } catch (e) {
                console.warn("Fit error:", e);
            }
        }
        xtermRef.current = term;

        // Connect WebSocket
        const connect = () => {
            const ws = new WebSocket(WS_BASE);
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                term.writeln('\x1b[1;32mConnected to terminal backend...\x1b[0m\r\n');

                // Send initial resize
                setTimeout(() => {
                    if (fitAddonRef.current) {
                        fitAddonRef.current.fit();
                        const dims = { cols: term.cols, rows: term.rows };
                        ws.send(JSON.stringify(dims));
                    }
                }, 100);
            };

            ws.onmessage = (event) => {
                term.write(event.data);
            };

            ws.onclose = (e) => {
                setConnected(false);
                if (e.code === 1008) {
                    term.writeln('\r\n\x1b[1;31mTerminal is disabled in settings.\x1b[0m');
                } else {
                    term.writeln('\r\n\x1b[1;31mConnection closed.\x1b[0m');
                }
            };

            ws.onerror = (err) => {
                console.error("WS Error", err);
            }
        };

        connect();

        // Handle input
        term.onData((data) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(data);
            }
        });

        // Handle resize
        const handleResize = () => {
            if (fitAddonRef.current) {
                try {
                    fitAddonRef.current.fit();
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        const dims = { cols: term.cols, rows: term.rows };
                        wsRef.current.send(JSON.stringify(dims));
                    }
                } catch (e) {
                    console.warn("Resize error:", e);
                }
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (wsRef.current) {
                wsRef.current.close();
            }
            term.dispose();
        };
    }, []);

    return (
        <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-xl">
                        <TerminalIcon className="text-primary" size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">System Terminal</h1>
                        <p className="text-text-secondary">Root shell access</p>
                    </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${connected ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                    {connected ? 'Connected' : 'Disconnected'}
                </div>
            </div>

            <div className="flex-1 bg-[#0f172a] rounded-xl border border-surfaceHighlight overflow-hidden p-4 shadow-lg relative">
                <div ref={terminalRef} className="h-full w-full" />
            </div>
        </div>
    );
};

export default Terminal;
