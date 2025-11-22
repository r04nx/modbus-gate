import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8000/api/v1',
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

export default api;
