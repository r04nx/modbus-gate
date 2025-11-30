import React from 'react';

export default function Database() {
    // Using the port 8090 where we started sqlite-web
    const dbViewerUrl = `http://${window.location.hostname}:8090`;

    return (
        <div className="h-[calc(100vh-2rem)] flex flex-col space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Database Manager</h1>
                    <p className="text-text-secondary">Direct access to the SQLite database.</p>
                </div>
                <a
                    href={dbViewerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm font-medium"
                >
                    Open in New Tab
                </a>
            </div>

            <div className="flex-1 bg-white rounded-2xl overflow-hidden border border-surfaceHighlight shadow-card">
                <iframe
                    src={dbViewerUrl}
                    className="w-full h-full border-0"
                    title="Database Viewer"
                />
            </div>
        </div>
    );
}
