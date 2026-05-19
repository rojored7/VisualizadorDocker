const API = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async post(url) {
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async del(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  containers: {
    list: () => API.get('/api/containers'),
    inspect: (id) => API.get(`/api/containers/${id}`),
    impact: (id) => API.get(`/api/containers/${id}/impact`),
    logs: (id, tail = 200) => API.get(`/api/containers/${id}/logs?tail=${tail}`),
    start: (id) => API.post(`/api/containers/${id}/start`),
    stop: (id) => API.post(`/api/containers/${id}/stop`),
    restart: (id) => API.post(`/api/containers/${id}/restart`),
    remove: (id, force = false) => API.del(`/api/containers/${id}?force=${force}`),
  },

  images: {
    list: () => API.get('/api/images'),
    impact: (id) => API.get(`/api/images/${encodeURIComponent(id)}/impact`),
    remove: (id, force = false) => API.del(`/api/images/${encodeURIComponent(id)}?force=${force}`),
  },

  volumes: {
    list: () => API.get('/api/volumes'),
    impact: (name) => API.get(`/api/volumes/${encodeURIComponent(name)}/impact`),
    remove: (name) => API.del(`/api/volumes/${encodeURIComponent(name)}`),
  },

  system: {
    df: () => API.get('/api/system/df'),
    prunePreview: () => API.get('/api/system/prune-preview'),
    prune: (target = 'all') => API.post(`/api/system/prune?target=${target}`),
  },
};
