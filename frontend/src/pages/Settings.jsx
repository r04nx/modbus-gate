import React, { useState } from 'react';
import { Settings as SettingsIcon, Database, Users, Network, Server, HardDrive } from 'lucide-react';
import ConfigurationManagement from '../components/settings/ConfigurationManagement';
import UserManagement from '../components/settings/UserManagement';
import NetworkConfiguration from '../components/settings/NetworkConfiguration';
import SystemSettings from '../components/settings/SystemSettings';
import DataStoragePolicy from '../components/settings/DataStoragePolicy';

const Settings = () => {
    const [activeTab, setActiveTab] = useState('config');

    const tabs = [
        { id: 'config', label: 'Configuration', icon: Database, color: 'text-blue-400' },
        { id: 'users', label: 'Users', icon: Users, color: 'text-cyan-400' },
        { id: 'network', label: 'Network', icon: Network, color: 'text-purple-400' },
        { id: 'system', label: 'System', icon: Server, color: 'text-emerald-400' },
        { id: 'storage', label: 'Storage Policy', icon: HardDrive, color: 'text-orange-400' },
    ];

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-gradient-to-br from-primary/50 to-accent/30 rounded-xl">
                    <SettingsIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-white">Settings</h1>
                    <p className="text-text-secondary text-sm">Configure system preferences and policies</p>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-2 flex gap-2 border border-surfaceHighlight/30">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all duration-300 ${activeTab === tab.id
                                    ? 'bg-surfaceHighlight/30 text-white shadow-lg border border-surfaceHighlight/50'
                                    : 'text-text-secondary hover:text-white hover:bg-surfaceHighlight/10'
                                }`}
                        >
                            <Icon className={`w-5 h-5 ${activeTab === tab.id ? tab.color : ''}`} />
                            <span className="font-medium">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                {activeTab === 'config' && <ConfigurationManagement />}
                {activeTab === 'users' && <UserManagement />}
                {activeTab === 'network' && <NetworkConfiguration />}
                {activeTab === 'system' && <SystemSettings />}
                {activeTab === 'storage' && <DataStoragePolicy />}
            </div>
        </div>
    );
};

export default Settings;
