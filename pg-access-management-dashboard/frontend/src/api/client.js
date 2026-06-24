import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const auth = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
};

export const users = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.patch(`/users/${id}`, data),
  remove: (id) => api.delete(`/users/${id}`),
};

export const servers = {
  list: () => api.get('/servers'),
  create: (data) => api.post('/servers', data),
  remove: (id) => api.delete(`/servers/${id}`),
  databases: (serverId) => api.get(`/servers/${serverId}/databases`),
  tables: (serverId, dbName) => api.get(`/servers/${serverId}/databases/${dbName}/tables`),
  testConnection: (data) => api.post('/servers/test-connection', data),
  importedRoles: (serverId) => api.get(`/servers/${serverId}/roles`),
  syncRoles: (serverId) => api.post(`/servers/${serverId}/sync-roles`),
};

export const grants = {
  list: (params) => api.get('/grants', { params }),
  create: (data) => api.post('/grants', data),
  revoke: (id) => api.delete(`/grants/${id}`),
};

export default api;
