import axios from 'axios';

// Use current host for API calls instead of hardcoded localhost
// This allows the app to work when accessed from other devices on the network
const API_HOST = window.location.hostname;
const API_PORT = '8000';

const api = axios.create({
    baseURL: `http://${API_HOST}:${API_PORT}/api/v1`,
});

export const getDevices = () => api.get('/devices/');
export const createDevice = (device) => api.post('/devices/', device);
export const updateDevice = (id, device) => api.patch(`/devices/${id}`, device);
export const deleteDevice = (id) => api.delete(`/devices/${id}`);
export const testDeviceConnection = (id) => api.post(`/devices/${id}/test`);

export const getTags = () => api.get('/tags/');
export const createTag = (tag) => api.post('/tags/', tag);
export const updateTag = (id, tag) => api.patch(`/tags/${id}`, tag);
export const deleteTag = (id) => api.delete(`/tags/${id}`);
export const getTagValues = () => api.get('/tags/values');
export const exportTags = (type) => api.get(`/tags/export?type=${type}`, { responseType: 'blob' });
export const importTags = (type, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/tags/import?type=${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};

// Calculation operations
export const getOperations = () => api.get('/calc/operations');

// Logs
export const getLogs = (level = null, limit = 500) => {
    const params = { limit };
    if (level && level !== 'ALL') params.level = level;
    return api.get('/logs/', { params });
};
export const clearLogs = () => api.delete('/logs/');

// Tag Write
export const writeTag = (id, value) => api.post(`/tags/${id}/write`, { value });

export default api;
