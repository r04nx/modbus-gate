import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Server, Tag, Settings, Activity, FileText, Network, Terminal, Download, Database, LogOut } from 'lucide-react';
import clsx from 'clsx';
import api from '../services/api';

const Layout = ({ children }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [terminalEnabled, setTerminalEnabled] = useState(false);

    const handleLogout = () => {
        localStorage.removeItem('auth');
        navigate('/login');
    };

    useEffect(() => {
        const checkTerminal = async () => {
            try {
                const res = await api.get('/system/terminal');
                setTerminalEnabled(res.data.enabled);
            } catch (e) {
                console.error("Failed to check terminal status", e);
            }
        };
        checkTerminal();
    }, []);

    const [systemStatus, setSystemStatus] = useState('checking');
    const [systemError, setSystemError] = useState(null);

    useEffect(() => {
        const checkSystem = async () => {
            try {
                await api.get('/system/hostname', { timeout: 5000 });
                setSystemStatus('online');
                setSystemError(null);
            } catch (e) {
                setSystemStatus('offline');
                setSystemError(e.message + (e.response ? ` (${e.response.status})` : ''));
                console.error("System check failed:", e);
            }
        };

        checkSystem();
        const interval = setInterval(checkSystem, 10000);
        return () => clearInterval(interval);
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

    navItems.push({ path: '/database', label: 'Database', icon: Database });
    navItems.push({ path: '/settings', label: 'Settings', icon: Settings });

    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            {/* Sidebar */}
            <aside className={clsx(
                "bg-surface/50 backdrop-blur-xl border-r border-surfaceHighlight flex flex-col shadow-glow z-20 transition-all duration-300",
                isCollapsed ? "w-20" : "w-64"
            )}>
                <div className="p-6 flex items-center gap-3 border-b border-surfaceHighlight/50">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center shadow-lg shrink-0">
                        <Activity className="text-white" size={24} />
                    </div>
                    <div className={clsx("flex flex-col overflow-hidden transition-all duration-300", isCollapsed && "w-0 opacity-0")}>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 leading-none whitespace-nowrap">
                            VistaIOT
                        </h1>
                        <a
                            href="https://spit.ac.in"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xl font-bold text-primary tracking-widest opacity-90 mt-1 hover:opacity-100 hover:text-accent transition-all whitespace-nowrap"
                        >
                            SP-IT
                        </a>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto overflow-x-hidden">
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
                                title={isCollapsed ? item.label : undefined}
                            >
                                <Icon size={20} className={clsx('transition-colors shrink-0', isActive ? 'text-primary' : 'group-hover:text-white')} />
                                <span className={clsx("font-medium transition-all duration-300 whitespace-nowrap", isCollapsed && "w-0 opacity-0 overflow-hidden")}>
                                    {item.label}
                                </span>
                                {isActive && !isCollapsed && (
                                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_currentColor]" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-surfaceHighlight/50">
                    <div className={clsx("bg-surfaceHighlight/20 rounded-xl p-4 border border-surfaceHighlight/30 transition-all", isCollapsed && "p-2")}>
                        <div className={clsx("flex items-center gap-3 mb-2", isCollapsed && "justify-center")}>
                            <div className={clsx(
                                "w-2 h-2 rounded-full animate-pulse shrink-0",
                                systemStatus === 'online' ? "bg-success" :
                                    systemStatus === 'offline' ? "bg-error" : "bg-warning"
                            )} />
                            <span className={clsx(
                                "text-xs font-medium transition-all duration-300 whitespace-nowrap overflow-hidden",
                                systemStatus === 'online' ? "text-success" :
                                    systemStatus === 'offline' ? "text-error" : "text-warning",
                                isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                            )}>
                                {systemStatus === 'online' ? 'System Online' :
                                    systemStatus === 'offline' ? 'System Offline' : 'Connecting...'}
                            </span>
                        </div>
                        {!isCollapsed && systemError && (
                            <p className="text-[10px] text-error mb-1 truncate" title={systemError}>
                                {systemError}
                            </p>
                        )}
                        <p className={clsx("text-xs text-text-muted transition-all duration-300 whitespace-nowrap overflow-hidden", isCollapsed && "w-0 opacity-0")}>v1.0.0 • Stable</p>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-700 space-y-2">
                    <button
                        onClick={handleLogout}
                        className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors w-full"
                        title={isCollapsed ? "Logout" : undefined}
                    >
                        <LogOut size={20} className="shrink-0" />
                        <span className={clsx("transition-all duration-300 whitespace-nowrap overflow-hidden", isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>Logout</span>
                    </button>
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="flex items-center justify-center w-full py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                        {isCollapsed ? "→" : "←"}
                    </button>
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
