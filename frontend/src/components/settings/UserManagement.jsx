import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Key, Activity } from 'lucide-react';
import axios from 'axios';

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [formData, setFormData] = useState({ username: '', password: '', role: 'root' });
    const [loading, setLoading] = useState(false);

    const API_BASE = 'http://localhost:8000/api/v1';
    const getAuthHeader = () => ({ Authorization: `Basic ${btoa('admin:admin')}` });

    useEffect(() => {
        fetchUsers();
        fetchSessions();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await axios.get(`${API_BASE}/users/`, { headers: getAuthHeader() });
            setUsers(res.data);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        }
    };

    const fetchSessions = async () => {
        try {
            const res = await axios.get(`${API_BASE}/users/sessions/active`, { headers: getAuthHeader() });
            setSessions(res.data);
        } catch (error) {
            console.error('Failed to fetch sessions:', error);
        }
    };

    const handleCreateUser = async () => {
        try {
            setLoading(true);
            await axios.post(`${API_BASE}/users/`, formData, { headers: getAuthHeader() });
            setShowCreateModal(false);
            setFormData({ username: '', password: '', role: 'root' });
            fetchUsers();
        } catch (error) {
            alert(`Failed to create user: ${error.response?.data?.detail || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            await axios.delete(`${API_BASE}/users/${userId}`, { headers: getAuthHeader() });
            fetchUsers();
        } catch (error) {
            alert(`Failed to delete user: ${error.response?.data?.detail || error.message}`);
        }
    };

    const handleResetPassword = async () => {
        try {
            setLoading(true);
            await axios.post(
                `${API_BASE}/users/${selectedUser.id}/reset-password`,
                { new_password: formData.password },
                { headers: getAuthHeader() }
            );
            setShowResetModal(false);
            setFormData({ username: '', password: '', role: 'root' });
            alert('Password reset successfully');
        } catch (error) {
            alert(`Failed to reset password: ${error.response?.data?.detail || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleTerminateSession = async (sessionId) => {
        if (!confirm('Terminate this session?')) return;
        try {
            await axios.delete(`${API_BASE}/users/sessions/${sessionId}`, { headers: getAuthHeader() });
            fetchSessions();
        } catch (error) {
            alert(`Failed to terminate session: ${error.response?.data?.detail || error.message}`);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Users Table */}
            <div className="bg-surfaceHighlight/10 rounded-2xl border border-surfaceHighlight/30 overflow-hidden">
                <div className="p-6 border-b border-surfaceHighlight/30 flex justify-between items-center">
                    <h4 className="text-lg font-bold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-cyan-400" />
                        User Accounts
                    </h4>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-surfaceHighlight/30 hover:bg-surfaceHighlight/50 text-white rounded-xl transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        Create User
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-surfaceHighlight/20 text-text-secondary font-medium">
                            <tr>
                                <th className="px-6 py-3">Username</th>
                                <th className="px-6 py-3">Role</th>
                                <th className="px-6 py-3">Last Login</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surfaceHighlight/10">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-surfaceHighlight/5 transition-colors">
                                    <td className="px-6 py-3 text-white font-medium">{user.username}</td>
                                    <td className="px-6 py-3">
                                        <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${user.role === 'superroot'
                                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                            : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-text-secondary text-sm">
                                        {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <button
                                            onClick={() => {
                                                setSelectedUser(user);
                                                setShowResetModal(true);
                                            }}
                                            className="text-cyan-400 hover:text-cyan-300 mr-3 transition-colors"
                                            title="Reset Password"
                                        >
                                            <Key className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteUser(user.id)}
                                            className="text-text-muted hover:text-red-400 transition-colors"
                                            title="Delete User"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Active Sessions */}
            <div className="bg-surfaceHighlight/10 rounded-2xl p-6 border border-surfaceHighlight/30">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    Active Sessions
                </h3>
                <div className="space-y-3">
                    {sessions.map((session) => (
                        <div key={session.id} className="flex items-center justify-between bg-surfaceHighlight/5 rounded-xl p-4 border border-surfaceHighlight/20 hover:border-surfaceHighlight/40 transition-all">
                            <div>
                                <p className="text-white font-medium">{session.username}</p>
                                <p className="text-text-secondary text-sm">
                                    {session.ip_address} • {new Date(session.created_at).toLocaleString()}
                                </p>
                            </div>
                            <button
                                onClick={() => handleTerminateSession(session.id)}
                                className="text-text-muted hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-all"
                            >
                                Terminate
                            </button>
                        </div>
                    ))}
                    {sessions.length === 0 && (
                        <p className="text-text-secondary text-center py-8">No active sessions</p>
                    )}
                </div>
            </div>

            {/* Create User Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-surfaceHighlight/20 backdrop-blur-xl rounded-2xl p-6 max-w-md w-full mx-4 border border-surfaceHighlight/50 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-4">Create New User</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Username</label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Password</label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">Role</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 transition-colors"
                                >
                                    <option value="root">Root</option>
                                    <option value="superroot">Superroot</option>
                                </select>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 bg-surfaceHighlight/20 hover:bg-surfaceHighlight/30 text-white px-4 py-3 rounded-xl transition-all border border-surfaceHighlight/30"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateUser}
                                    disabled={loading || !formData.username || !formData.password}
                                    className="flex-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                                >
                                    Create
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {showResetModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-surfaceHighlight/20 backdrop-blur-xl rounded-2xl p-6 max-w-md w-full mx-4 border border-surfaceHighlight/50 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-4">Reset Password for {selectedUser?.username}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-2">New Password</label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full bg-surfaceHighlight/20 border border-surfaceHighlight/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 transition-colors"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => {
                                        setShowResetModal(false);
                                        setFormData({ username: '', password: '', role: 'root' });
                                    }}
                                    className="flex-1 bg-surfaceHighlight/20 hover:bg-surfaceHighlight/30 text-white px-4 py-3 rounded-xl transition-all border border-surfaceHighlight/30"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleResetPassword}
                                    disabled={loading || !formData.password}
                                    className="flex-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-4 py-3 rounded-xl transition-all disabled:opacity-50 font-medium"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
