const API_BASE = '/api';

export const apiClient = {
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return res.json();
  },

  async createTask(userRequest) {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userRequest }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to create task (${res.status})`);
    }
    return res.json();
  },

  async getTasks() {
    const res = await fetch(`${API_BASE}/tasks`);
    if (!res.ok) throw new Error('Failed to load tasks');
    return res.json();
  },

  async getTask(id) {
    const res = await fetch(`${API_BASE}/tasks/${id}`);
    if (!res.ok) throw new Error('Failed to load task details');
    return res.json();
  },

  async stopTask(id) {
    const res = await fetch(`${API_BASE}/tasks/${id}/stop`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to stop task');
    return res.json();
  },

  async getMemory() {
    const res = await fetch(`${API_BASE}/memory`);
    if (!res.ok) throw new Error('Failed to fetch memory records');
    return res.json();
  },

  async deleteMemory(id) {
    const res = await fetch(`${API_BASE}/memory/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete memory record');
    return res.json();
  },

  async getSettings() {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error('Failed to load settings');
    return res.json();
  },

  async getGeminiModels() {
    const res = await fetch(`${API_BASE}/settings/gemini-models`);
    if (!res.ok) return { models: [] };
    return res.json();
  },

  async testLlm(apiKey, model, provider) {
    const res = await fetch(`${API_BASE}/settings/test-llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model, provider }),
    });
    return res.json();
  },

  async testGemini(apiKey, model) {
    const res = await fetch(`${API_BASE}/settings/test-gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model }),
    });
    return res.json();
  },

  async testSearch(apiKey, provider) {
    const res = await fetch(`${API_BASE}/settings/test-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, provider }),
    });
    return res.json();
  },

  async testTavily(apiKey) {
    const res = await fetch(`${API_BASE}/settings/test-tavily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    return res.json();
  },

  async getProfile() {
    const res = await fetch(`${API_BASE}/profile`);
    if (!res.ok) throw new Error('Failed to fetch user profile');
    return res.json();
  },

  async updateProfile(profile) {
    const res = await fetch(`${API_BASE}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!res.ok) throw new Error('Failed to update user profile');
    return res.json();
  },

  async saveSearch(query, intent, criteria) {
    const res = await fetch(`${API_BASE}/profile/saved-searches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, intent, criteria }),
    });
    if (!res.ok) throw new Error('Failed to save search');
    return res.json();
  },

  async deleteSavedSearch(id) {
    const res = await fetch(`${API_BASE}/profile/saved-searches/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete saved search');
    return res.json();
  },

  async updateSettings(settings) {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  },

  subscribeTaskProgress(taskId, onMessage, onError) {
    const eventSource = new EventSource(`${API_BASE}/tasks/${taskId}/progress`);
    
    eventSource.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        onMessage(parsed);
      } catch (err) {
        console.error('Failed to parse SSE payload:', err);
      }
    };

    eventSource.onerror = (err) => {
      if (onError) onError(err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  },
};
