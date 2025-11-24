import axios from 'axios';

// Use current host for API calls instead of hardcoded localhost
// This allows the app to work when accessed from other devices on the network
const API_HOST = window.location.hostname;
const API_PORT = '8000';

// Helper function for Basic Auth
const getAuthHeader = () => ({ Authorization: `Basic ${btoa('admin:admin')}` });

const api = axios.create({
    baseURL: `http://${API_HOST}:${API_PORT}/api/v1`,
    headers: getAuthHeader()
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
        headers: { 'Content-Type': 'multipart/form-data', ...getAuthHeader() }
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

// Server Config
export const getServerConfig = (type) => api.get(`/servers/${type}`);
export const updateServerConfig = (type, config) => api.put(`/servers/${type}`, config);

// Certificate Management
export const uploadCertificate = (formData) => api.post('/servers/certificates', formData, {
    headers: { 'Content-Type': 'multipart/form-data', ...getAuthHeader() }
});

export const listCertificates = () => api.get('/servers/certificates');

export const getCertificate = (id) => api.get(`/servers/certificates/${id}`);

export const getCertificateInfo = (id) => api.get(`/servers/certificates/${id}/info`);

export const updateCertificate = (id, formData) => api.put(`/servers/certificates/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data', ...getAuthHeader() }
});

export const deleteCertificate = (id) => api.delete(`/servers/certificates/${id}`);

// Configuration Management
export const exportConfiguration = (options = {}) => {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
        params.append(key, value);
    });
    return api.get(`/config/export?${params.toString()}`, {
        headers: getAuthHeader()
    });
};

export const importConfiguration = (config) => api.post('/config/import', config, {
    headers: getAuthHeader()
});

export default api;

