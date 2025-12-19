import React from 'react';
import { ShieldAlert, Lock, Mail, Copy } from 'lucide-react';

const LicenseError = () => {
    // Get hardware ID from URL params if passed, or show unknown
    const params = new URLSearchParams(window.location.search);
    const hardwareId = params.get('id') || 'UNKNOWN';

    const copyToClipboard = () => {
        navigator.clipboard.writeText(hardwareId);
        alert('Hardware ID copied to clipboard');
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-surface/50 backdrop-blur-xl border border-error/30 rounded-2xl p-8 shadow-2xl text-center">
                <div className="w-20 h-20 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                    <Lock className="text-error" size={40} />
                </div>

                <h1 className="text-3xl font-bold text-white mb-2">Application Locked</h1>
                <p className="text-text-secondary mb-8">
                    This software is protected and is not authorized to run on this hardware device.
                </p>

                <div className="bg-surfaceHighlight/20 rounded-xl p-4 mb-6 border border-surfaceHighlight/30 text-left">
                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider mb-1 block">Device Footprint</label>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 font-mono text-sm text-primary break-all bg-black/20 p-2 rounded">
                            {hardwareId}
                        </code>
                        <button
                            onClick={copyToClipboard}
                            className="p-2 hover:bg-surfaceHighlight/50 rounded-lg transition-colors text-text-secondary hover:text-white"
                            title="Copy ID"
                        >
                            <Copy size={18} />
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    <p className="text-sm text-text-secondary">
                        To unlock this device, please contact support with the Device Footprint above.
                    </p>

                    <a
                        href={`mailto:r04nx@outlook.com?subject=License Activation Request&body=Device ID: ${hardwareId}`}
                        className="flex items-center justify-center gap-2 w-full py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-all shadow-lg shadow-primary/25"
                    >
                        <Mail size={20} />
                        Contact Support
                    </a>

                    <div className="text-xs text-text-muted mt-4">
                        Contact: <span className="text-white">r04nx@outlook.com</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LicenseError;
