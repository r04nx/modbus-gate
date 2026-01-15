import axios from 'axios';

// Use relative path for API calls to support reverse proxy (Nginx)
// This avoids CORS issues and firewall blocks on custom ports
const api = axios.create({
    baseURL: '/api/v1'
});

// Helper function for Basic Auth
const getAuthHeader = () => {
    const auth = localStorage.getItem('auth');
    return auth ? { Authorization: `Basic ${auth}` } : {};
};

// Add request interceptor to inject auth header dynamically
api.interceptors.request.use((config) => {
    const headers = getAuthHeader();
    if (headers.Authorization) {
        config.headers.Authorization = headers.Authorization;
    }
    return config;
}, (error) => Promise.reject(error));

let isInterceptorSetup = false;

export const setupInterceptors = (showToast) => {
    if (isInterceptorSetup) return;
    isInterceptorSetup = true;

    api.interceptors.response.use(
        (response) => response,
        (error) => {
            let message = error.response?.data?.detail || error.message || "An unexpected error occurred";

            // Handle Pydantic Validation Errors (Array of objects)
            if (typeof message === 'object') {
                try {
                    if (Array.isArray(message)) {
                        // Extract msgs from pydantic array
                        message = message.map(err => `${err.loc.join('.')} : ${err.msg}`).join('\n');
                    } else {
                        message = JSON.stringify(message);
                    }
                } catch (e) {
                    message = "Validation Error occurred";
                }
            }

            // Handle License Error
            if (error.response && error.response.status === 403 && error.response.data?.detail === 'LICENSE_INVALID') {
                const hardwareId = error.response.data.hardware_id || 'UNKNOWN';
                window.location.href = `/license-error?id=${hardwareId}`;
                return Promise.reject(error);
            }

            // Handle 401 specifically
            if (error.response && error.response.status === 401) {
                localStorage.removeItem('auth');
                window.location.href = '/login';
                return Promise.reject(error);
            }

            // Show toast for all other errors
            if (showToast) {
                showToast.error(message);
            }

            return Promise.reject(error);
        }
    );
};

export const getDevices = () => api.get('/devices/');
export const createDevice = (device) => api.post('/devices/', device);
export const updateDevice = (id, device) => api.patch(`/devices/${id}`, device);
export const deleteDevice = (id) => api.delete(`/devices/${id}`);
export const testDeviceConnection = (id) => api.post(`/devices/${id}/test`);

export const getTags = (limit = 100000) => api.get(`/tags/?limit=${limit}`);
export const createTag = (tag) => api.post('/tags/', tag);
export const updateTag = (id, tag) => api.patch(`/tags/${id}`, tag);
export const deleteTag = (id) => api.delete(`/tags/${id}`);
export const getTagValues = (historyLimit = 60) => api.get('/tags/values', { params: { history_limit: historyLimit } });
export const exportTags = (type) => api.get(`/tags/export?type=${type}`, { responseType: 'blob' });
export const importTags = (type, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/tags/import?type=${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};

// Calculation operations
export const getOperations = () => api.get('/operations');

// Logs
export const getLogs = (level = null, limit = 500) => {
    const params = { limit };
    if (level && level !== 'ALL') params.level = level;
    return api.get('/logs/', { params });
};
export const clearLogs = () => api.delete('/logs/');

// Tag Write
export const writeTag = (id, value) => api.post(`/tags/${id}/write`, { value });

// Server Config
export const getServerConfig = (type) => api.get(`/servers/${type}`);
export const updateServerConfig = (type, config) => api.put(`/servers/${type}`, config);

// Certificate Management
export const uploadCertificate = (formData) => api.post('/servers/certificates', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
});

export const listCertificates = () => api.get('/servers/certificates');

export const getCertificate = (id) => api.get(`/servers/certificates/${id}`);

export const getCertificateInfo = (id) => api.get(`/servers/certificates/${id}/info`);

export const updateCertificate = (id, formData) => api.put(`/servers/certificates/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
});

export const deleteCertificate = (id) => api.delete(`/servers/certificates/${id}`);

// Configuration Management
export const exportConfiguration = (options = {}) => {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
        params.append(key, value);
    });
    return api.get(`/config/export?${params.toString()}`);
};

export const importConfiguration = (config) => api.post('/config/import', config);

// Buffering
export const getSystemSettings = () => api.get('/system/settings');
export const updateSystemSettings = (settings) => api.put('/system/settings', settings);
export const getComPorts = () => api.get('/system/com-ports');

// Buffering
export const getBufferingStatus = () => api.get('/buffering/status');
export const updateBufferingConfig = (config) => api.put('/buffering/config', config);
export const setManualBuffering = (action) => api.post(`/buffering/manual/${action}`);
export const getBufferedData = (params) => api.get('/buffering/data', { params });
export const exportBufferedData = (params) => api.get('/buffering/export', { params, responseType: 'blob' });

export const clearBufferedData = () => api.delete('/buffering/data');
export const getBufferedTags = () => api.get('/buffering/tags');

// User Management
export const getCurrentUser = () => api.get('/users/me');
export const getUsers = () => api.get('/users/');
export const createUser = (user) => api.post('/users/', user);
export const updateUser = (id, user) => api.put(`/users/${id}`, user);
export const deleteUser = (id) => api.delete(`/users/${id}`);
export const resetPassword = (id, newPassword) => api.post(`/users/${id}/reset-password`, { new_password: newPassword });

// Session Management
export const getActiveSessions = () => api.get('/users/sessions/active');
export const terminateSession = (sessionId) => api.delete(`/users/sessions/${sessionId}`);

export default api;

