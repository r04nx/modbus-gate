import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Server, Tag, Settings, Activity, FileText, Network, Terminal, Download } from 'lucide-react';
import clsx from 'clsx';
import axios from 'axios';

const Layout = ({ children }) => {
    const location = useLocation();
    const [terminalEnabled, setTerminalEnabled] = useState(false);

    useEffect(() => {
        const checkTerminal = async () => {
            try {
                const API_HOST = window.location.hostname;
                const API_PORT = '8000';
                const API_BASE = `http://${API_HOST}:${API_PORT}/api/v1`;
                // Simple auth header if needed, though GET might be public or we rely on cookie/basic auth default
                // SystemSettings uses Basic auth admin:admin. We should probably use it here too.
                const getAuthHeader = () => ({ Authorization: `Basic ${btoa('admin:admin')}` });

                const res = await axios.get(`${API_BASE}/system/terminal`, { headers: getAuthHeader() });
                setTerminalEnabled(res.data.enabled);
            } catch (e) {
                console.error("Failed to check terminal status", e);
            }
        };
        checkTerminal();
    }, []);

    const navItems = [
        { path: '/', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/devices', label: 'Devices', icon: Server },
        { path: '/tags', label: 'Tags', icon: Tag },
        { path: '/servers', label: 'Servers', icon: Network },
        { path: '/logs', label: 'Logs', icon: FileText },
    ];

    if (terminalEnabled) {
        navItems.push({ path: '/terminal', label: 'Terminal', icon: Terminal });
    }

    navItems.push({ path: '/config', label: 'Config', icon: Download });
    navItems.push({ path: '/settings', label: 'Settings', icon: Settings });

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-surface/50 backdrop-blur-xl border-r border-surfaceHighlight flex flex-col shadow-glow z-20">
                <div className="p-6 flex items-center gap-3 border-b border-surfaceHighlight/50">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center shadow-lg">
                        <Activity className="text-white" size={24} />
                    </div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        VistaIOT
                    </h1>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={clsx(
                                    'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group',
                                    isActive
                                        ? 'bg-primary/10 text-primary shadow-[0_0_20px_rgba(59,130,246,0.15)] border border-primary/20'
                                        : 'text-text-secondary hover:bg-surfaceHighlight/30 hover:text-white hover:translate-x-1'
                                )}
                            >
                                <Icon size={20} className={clsx('transition-colors', isActive ? 'text-primary' : 'group-hover:text-white')} />
                                <span className="font-medium">{item.label}</span>
                                {isActive && (
                                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_currentColor]" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-surfaceHighlight/50">
                    <div className="bg-surfaceHighlight/20 rounded-xl p-4 border border-surfaceHighlight/30">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                            <span className="text-xs font-medium text-success">System Online</span>
                        </div>
                        <p className="text-xs text-text-muted">v1.0.0 • Stable</p>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto relative">
                {/* Background Gradients */}
                <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
                <div className="absolute -top-20 -right-20 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

                <div className="p-8 relative z-10 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
