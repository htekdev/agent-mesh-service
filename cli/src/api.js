// MeshWire API client — wraps all REST calls
import { readConfig } from './config.js';

export class MeshWireClient {
  constructor({ url, token, meshId } = {}) {
    const cfg = readConfig();
    this.url = (url || cfg.url || 'https://meshwire.io').replace(/\/$/, '');
    this.token = token || cfg.token;
    this.meshId = meshId || cfg.meshId;
  }

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  async request(method, path, body) {
    const url = `${this.url}${path}`;
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg;
      try { msg = JSON.parse(text).error; } catch { msg = text || res.statusText; }
      throw new Error(`${res.status} ${msg}`);
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }

  // ─── Health ────────────────────────────────────────────────────
  health() {
    return this.request('GET', '/health');
  }

  // ─── Meshes ────────────────────────────────────────────────────
  createMesh(name, description = '') {
    return this.request('POST', '/mesh', { name, description });
  }

  getMesh(meshId = this.meshId) {
    return this.request('GET', `/mesh/${meshId}`);
  }

  // ─── Agents ────────────────────────────────────────────────────
  registerAgent(meshId = this.meshId, { name, description, workspace, metadata } = {}) {
    return this.request('POST', `/mesh/${meshId}/agents`, {
      name, description, workspace, metadata,
    });
  }

  listAgents(meshId = this.meshId) {
    return this.request('GET', `/mesh/${meshId}/agents`);
  }

  heartbeat(meshId = this.meshId, agentId) {
    return this.request('POST', `/mesh/${meshId}/agents/${agentId}/heartbeat`);
  }

  // ─── Messages ──────────────────────────────────────────────────
  sendMessage(meshId = this.meshId, { senderId, recipientId = '*', content, priority = 'normal', metadata } = {}) {
    return this.request('POST', `/mesh/${meshId}/messages`, {
      sender_id: senderId,
      recipient_id: recipientId,
      content,
      priority,
      metadata,
    });
  }

  pollMessages(meshId = this.meshId, { recipientId, offset = 0, timeout = 30, limit = 50 } = {}) {
    const params = new URLSearchParams({
      offset: String(offset),
      timeout: String(timeout),
      limit: String(limit),
    });
    if (recipientId) params.set('recipient', recipientId);
    return this.request('GET', `/mesh/${meshId}/messages?${params}`);
  }

  replyToMessage(meshId = this.meshId, messageId, { senderId, content } = {}) {
    return this.request('POST', `/mesh/${meshId}/messages/${messageId}/reply`, {
      sender_id: senderId,
      content,
    });
  }

  // ─── Integrate ─────────────────────────────────────────────────
  getIntegrationGuide(meshId = this.meshId, format = 'all') {
    return this.request('GET', `/mesh/${meshId}/integrate?format=${format}`);
  }
}

export function createClient(overrides) {
  return new MeshWireClient(overrides);
}
