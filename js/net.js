// ─── SUPERNAT · Multiplayer Network Client (vanilla ES, no dependencies) ─────
// WebSocket client for the Python FastAPI backend (server.py).
// - 30 Hz local state upload, interpolated remote-player rendering (100 ms delay)
// - Dead-reckoning extrapolation for jitter / packet loss
// - Host-authoritative world snapshots (waves / enemies / pickups at ~15 Hz)
// - Ping/pong latency tracking, host migration, graceful offline fallback
//
// Works offline-first: if the server is unreachable the game stays a fully
// playable single-player hunt. All methods are safe to call while offline.

const TAU = Math.PI * 2;
const SEND_STATE_HZ = 30;
const SEND_WORLD_HZ = 15;
const INTERP_DELAY = 100; // ms of interpolation delay for remote entities
const EXTRAPOLATE_MAX = 260; // ms of dead-reckoning past the newest sample
const BUF_KEEP = 12; // samples kept per remote player (~400 ms at 30 Hz)
const STALE_AFTER = 4000; // ms without packets before a remote is marked stale
const PING_EVERY = 2500; // ms between latency probes

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

/** Shortest-path angle interpolation. */
function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

function nowMs() {
  try {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
  } catch (e) { /* ignore */ }
  return Date.now();
}

/** Resolve the WebSocket URL: ?server= override → same-origin /ws → localhost. */
export function defaultWsUrl() {
  try {
    if (typeof window !== 'undefined' && window.location) {
      const q = new URLSearchParams(window.location.search || '');
      const override = q.get('server');
      if (override) {
        try {
          const v = localStorage.getItem('supernat.server');
          if (v) return v;
        } catch (e) { /* private mode */ }
        if (/^wss?:\/\//i.test(override)) return override;
      }
      try {
        const saved = localStorage.getItem('supernat.server');
        if (saved && /^wss?:\/\//i.test(saved)) return saved;
      } catch (e) { /* ignore */ }
      const loc = window.location;
      if (loc.host && loc.protocol !== 'file:') {
        const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${loc.host}/ws`;
      }
    }
  } catch (e) { /* headless */ }
  return 'ws://127.0.0.1:8080/ws';
}

export function randomHunterName() {
  const a = ['ASH', 'VEIL', 'RUIN', 'HEX', 'GRIM', 'ONYX', 'FERAL', 'HOLLOW', 'RIFT', 'DUSK'];
  const b = ['HUNTER', 'WARDEN', 'REAPER', 'SENTRY', 'STALKER', 'JUGGER', 'SHADE', 'FANG'];
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  return `${pick(a)}-${pick(b)}`.slice(0, 12);
}

export class NetClient {
  constructor() {
    this.ws = null;
    this.status = 'offline'; // offline | connecting | lobby | online
    this.id = null;
    this.roomCode = null;
    this.playerName = null;
    this.isHost = false;
    this.tickHz = 30;
    this.seq = 0;

    this.pingMs = null;
    this._pingTs = 0;
    this._lastPingSent = -10000; // send the first latency probe immediately
    this._serverTs = 0;
    this._serverAt = 0;

    this._lastStateSent = 0;
    this._lastWorldSent = 0;

    // remote player interpolation buffers: id → { name, samples:[], lastSeen, stale }
    this._bufs = new Map();
    // lobby roster (includes self): id → { name, isHost }
    this.roster = new Map();

    // host-authoritative world (for guests): { curr, prev, currTs, prevTs }
    this.world = { curr: null, prev: null, currTs: 0, prevTs: 0 };

    // callbacks (wired by game.js / ui.js)
    this.onWelcome = null;
    this.onSnapshot = null;   // raw snapshot (game consumes players+world)
    this.onRoster = null;     // roster changed
    this.onPlayerJoin = null;
    this.onPlayerLeave = null;
    this.onHostChanged = null;
    this.onHit = null;        // host only: guest damage claim
    this.onPickupTake = null; // host only
    this.onKillCredit = null; // guest: confirmed kill score
    this.onError = null;
    this.onDisconnect = null;

    this._connectResolve = null;
    this._connectReject = null;
  }

  get connected() {
    return !!this.ws && this.ws.readyState === 1 && !!this.id && this.status === 'online';
  }

  get playerCount() {
    return Math.max(1, this.roster.size || (this.connected ? 1 : 0));
  }

  // ── connection lifecycle ────────────────────────────────────────────────
  connect({ name, room = '', create = false, url = null } = {}) {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) this.disconnect();
    const WS = typeof WebSocket !== 'undefined' ? WebSocket : null;
    if (!WS) return Promise.reject(new Error('WebSocket unavailable'));
    const target = url || defaultWsUrl();
    this.status = 'connecting';
    this.playerName = (name || randomHunterName()).toUpperCase().slice(0, 12);
    this._bufs.clear();
    this.roster.clear();
    this.world = { curr: null, prev: null, currTs: 0, prevTs: 0 };

    return new Promise((resolve, reject) => {
      this._connectResolve = resolve;
      this._connectReject = reject;
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        this.status = 'offline';
        try { this.ws && this.ws.close(); } catch (e) { /* ignore */ }
        this.ws = null;
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error('connection timeout')), 9000);
      let ws;
      try {
        ws = new WS(target);
      } catch (e) {
        clearTimeout(timer);
        fail(e);
        return;
      }
      this.ws = ws;
      ws.onopen = () => {
        this._send({
          t: 'hello',
          name: this.playerName,
          room: (room || '').toUpperCase().slice(0, 8),
          create: !!create,
        });
      };
      ws.onmessage = (ev) => {
        let msg = null;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'welcome') {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.id = msg.id;
          this.roomCode = msg.room;
          this.isHost = !!msg.isHost;
          this.tickHz = msg.tickHz || 30;
          this.status = 'online';
          this.roster.set(this.id, { name: this.playerName, isHost: this.isHost });
          for (const p of (msg.players || [])) {
            if (p && p.id) this.roster.set(p.id, { name: p.name || 'HUNTER', isHost: !!p.isHost });
          }
          if (this.onWelcome) { try { this.onWelcome(msg); } catch (e) { console.error(e); } }
          if (this.onRoster) { try { this.onRoster(this.rosterList()); } catch (e) { console.error(e); } }
          resolve({ room: this.roomCode, isHost: this.isHost, id: this.id });
          return;
        }
        if (msg.t === 'error' && !settled) {
          clearTimeout(timer);
          fail(new Error(msg.msg || 'join failed'));
          return;
        }
        this._onMessage(msg);
      };
      ws.onerror = () => {
        if (!settled) { clearTimeout(timer); fail(new Error('server unreachable')); }
        else if (this.onError) { try { this.onError('connection error'); } catch (e) { /* ignore */ } }
      };
      ws.onclose = () => {
        const wasOnline = settled && this.status === 'online';
        const wasId = this.id;
        this.status = 'offline';
        this.ws = null;
        this.id = null;
        if (!settled) { clearTimeout(timer); fail(new Error('server unreachable')); }
        else if (wasOnline && wasId && this.onDisconnect) {
          try { this.onDisconnect(); } catch (e) { console.error(e); }
        }
      };
    });
  }

  disconnect() {
    const ws = this.ws;
    this.ws = null;
    this.status = 'offline';
    this.id = null;
    this.roomCode = null;
    this._bufs.clear();
    try { ws && ws.readyState <= 1 && ws.send(JSON.stringify({ t: 'leave' })); } catch (e) { /* ignore */ }
    try { ws && ws.close(1000, 'leave'); } catch (e) { /* ignore */ }
  }

  _send(obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try {
      this.ws.send(JSON.stringify(obj));
      return true;
    } catch (e) { return false; }
  }

  // ── uploads (throttled) ─────────────────────────────────────────────────
  sendState(s) {
    if (!this.connected) return false;
    const now = nowMs();
    if (now - this._lastStateSent < 1000 / SEND_STATE_HZ - 2) return false;
    this._lastStateSent = now;
    this.seq++;
    return this._send({ t: 'state', seq: this.seq, ...s });
  }

  sendHostSnapshot(w) {
    if (!this.connected || !this.isHost) return false;
    const now = nowMs();
    if (now - this._lastWorldSent < 1000 / SEND_WORLD_HZ - 2) return false;
    this._lastWorldSent = now;
    return this._send({ t: 'host_snapshot', ...w });
  }

  forceWorldSend(w) {
    if (!this.connected || !this.isHost) return false;
    this._lastWorldSent = nowMs();
    return this._send({ t: 'host_snapshot', ...w });
  }

  sendHit(enemyId, dmg, crit, ang, mult) {
    return this._send({ t: 'hit', enemy: enemyId | 0, dmg, crit: !!crit, ang, mult: mult | 0 });
  }

  sendPickupTake(pickupId) {
    return this._send({ t: 'pickup_take', pickup: pickupId | 0 });
  }

  sendKillCredit(to, { enemy, base, x, y, big, netId }) {
    return this._send({ t: 'kill_credit', to, enemy, base, x, y, big: !!big, netId: netId | 0 });
  }

  // ── per-frame maintenance (ping, stale pruning) ─────────────────────────
  update() {
    if (!this.connected) return;
    const now = nowMs();
    if (now - this._lastPingSent > PING_EVERY) {
      this._lastPingSent = now;
      this._pingTs = Date.now();
      this._send({ t: 'ping', ts: this._pingTs });
    }
    for (const [id, buf] of this._bufs) {
      if (!buf.stale && now - buf.lastSeen > STALE_AFTER) {
        buf.stale = true;
        if (this.onRoster) { try { this.onRoster(this.rosterList()); } catch (e) { /* ignore */ } }
      }
    }
  }

  // ── inbound ─────────────────────────────────────────────────────────────
  _onMessage(msg) {
    switch (msg.t) {
      case 'snapshot':
        this._applySnapshot(msg);
        break;
      case 'player_join':
        if (msg.id) {
          this.roster.set(msg.id, { name: msg.name || 'HUNTER', isHost: !!msg.isHost });
          if (this.onPlayerJoin) { try { this.onPlayerJoin(msg); } catch (e) { console.error(e); } }
          if (this.onRoster) { try { this.onRoster(this.rosterList()); } catch (e) { /* ignore */ } }
        }
        break;
      case 'player_leave':
        if (msg.id) {
          const left = this.roster.get(msg.id);
          this.roster.delete(msg.id);
          this._bufs.delete(msg.id);
          if (this.onPlayerLeave) { try { this.onPlayerLeave({ ...msg, name: (left && left.name) || msg.name }); } catch (e) { console.error(e); } }
          if (this.onRoster) { try { this.onRoster(this.rosterList()); } catch (e) { /* ignore */ } }
        }
        break;
      case 'host_changed':
        for (const [, r] of this.roster) r.isHost = false;
        if (msg.newHost && this.roster.has(msg.newHost)) this.roster.get(msg.newHost).isHost = true;
        else if (msg.newHost) this.roster.set(msg.newHost, { name: msg.name || 'HUNTER', isHost: true });
        this.isHost = (msg.newHost === this.id);
        this.world = { curr: null, prev: null, currTs: 0, prevTs: 0 };
        if (this.onHostChanged) { try { this.onHostChanged(msg); } catch (e) { console.error(e); } }
        if (this.onRoster) { try { this.onRoster(this.rosterList()); } catch (e) { /* ignore */ } }
        break;
      case 'hit':
        if (this.onHit) { try { this.onHit(msg); } catch (e) { console.error(e); } }
        break;
      case 'pickup_take':
        if (this.onPickupTake) { try { this.onPickupTake(msg); } catch (e) { console.error(e); } }
        break;
      case 'kill_credit':
        if (this.onKillCredit) { try { this.onKillCredit(msg); } catch (e) { console.error(e); } }
        break;
      case 'pong':
        if (msg.ts) {
          this.pingMs = Math.max(1, Math.round(Date.now() - msg.ts));
          this._serverTs = msg.serverTs || 0;
          this._serverAt = nowMs();
        }
        break;
      case 'ping':
        this._send({ t: 'pong', ts: Date.now() });
        break;
      case 'error':
        if (this.onError) { try { this.onError(msg.msg || 'server error'); } catch (e) { /* ignore */ } }
        break;
      default:
        break;
    }
  }

  _applySnapshot(msg) {
    const now = nowMs();
    const list = msg.players || [];
    for (const p of list) {
      if (!p || !p.id || p.id === this.id || p.pending) continue;
      let buf = this._bufs.get(p.id);
      if (!buf) {
        buf = { name: p.name || 'HUNTER', samples: [], lastSeen: 0, stale: false };
        this._bufs.set(p.id, buf);
      }
      buf.name = p.name || buf.name;
      buf.lastSeen = now;
      buf.stale = false;
      buf.samples.push({ recv: now, ...p });
      if (buf.samples.length > BUF_KEEP) buf.samples.splice(0, buf.samples.length - BUF_KEEP);
      if (!this.roster.has(p.id)) {
        this.roster.set(p.id, { name: p.name || 'HUNTER', isHost: !!p.isHost });
        if (this.onRoster) { try { this.onRoster(this.rosterList()); } catch (e) { /* ignore */ } }
      } else {
        this.roster.get(p.id).isHost = !!p.isHost;
      }
    }
    // drop buffers for players that vanished from the snapshot (cleaner than waiting)
    if (list.length) {
      const alive = new Set(list.map((p) => p && p.id).filter(Boolean));
      for (const id of [...this._bufs.keys()]) {
        if (!alive.has(id)) this._bufs.delete(id);
      }
      for (const id of [...this.roster.keys()]) {
        if (id !== this.id && !alive.has(id)) this.roster.delete(id);
      }
    }
    if (msg.world) {
      const w = this.world;
      w.prev = w.curr;
      w.prevTs = w.currTs;
      w.curr = msg.world;
      w.currTs = now;
    }
    if (this.onSnapshot) { try { this.onSnapshot(msg); } catch (e) { console.error(e); } }
  }

  rosterList() {
    const out = [];
    for (const [id, r] of this.roster) {
      const buf = this._bufs.get(id);
      const latest = buf && buf.samples.length ? buf.samples[buf.samples.length - 1] : null;
      out.push({
        id,
        name: r.name,
        isHost: !!r.isHost,
        self: id === this.id,
        stale: !!(buf && buf.stale),
        hp: latest ? latest.hp : null,
        maxHp: latest ? latest.maxHp : null,
        score: latest ? latest.score : null,
        kills: latest ? latest.kills : null,
        alive: latest ? latest.alive !== false : null,
      });
    }
    out.sort((a, b) => (b.self - a.self) || (b.isHost - a.isHost) || (a.name < b.name ? -1 : 1));
    return out;
  }

  // ── latency compensation ────────────────────────────────────────────────
  /**
   * Interpolated remote-player states for this render frame.
   * Returns Map(id → { name, x, y, vx, vy, ang, hp, ..., stale, interp }).
   * Uses INTERP_DELAY buffering + dead reckoning past the newest sample.
   */
  getRemotePlayers() {
    const now = nowMs();
    const renderAt = now - INTERP_DELAY;
    const out = new Map();
    for (const [id, buf] of this._bufs) {
      const s = buf.samples;
      if (!s.length) continue;
      const newest = s[s.length - 1];
      let out0 = null;
      if (s.length === 1 || renderAt >= newest.recv) {
        // dead reckoning: extrapolate from newest with velocity, clamped
        const age = now - newest.recv;
        const ex = clamp((renderAt - newest.recv) / 1000, 0, EXTRAPOLATE_MAX / 1000);
        out0 = {
          ...newest,
          x: newest.x + (newest.vx || 0) * ex,
          y: newest.y + (newest.vy || 0) * ex,
          interp: age > EXTRAPOLATE_MAX ? 'frozen' : 'extrapolated',
        };
      } else {
        // find bracketing samples
        let j = s.length - 1;
        while (j > 0 && s[j].recv > renderAt) j--;
        const a = s[j];
        const b = s[Math.min(j + 1, s.length - 1)];
        const span = Math.max(1, b.recv - a.recv);
        const t = clamp((renderAt - a.recv) / span, 0, 1);
        out0 = {
          ...b,
          x: lerp(a.x, b.x, t),
          y: lerp(a.y, b.y, t),
          vx: lerp(a.vx || 0, b.vx || 0, t),
          vy: lerp(a.vy || 0, b.vy || 0, t),
          ang: lerpAngle(a.ang || 0, b.ang || 0, t),
          moveAng: lerpAngle(a.moveAng || 0, b.moveAng || 0, t),
          walkPhase: lerp(a.walkPhase || 0, b.walkPhase || 0, t),
          dashT: b.dashT,
          iframes: b.iframes,
          interp: 'interpolated',
        };
      }
      out0.name = buf.name;
      out0.stale = buf.stale || (now - buf.lastSeen > STALE_AFTER);
      out.set(id, out0);
    }
    return out;
  }

  /** Latest authoritative world snapshot (guests). Null when offline/host. */
  getWorld() {
    return this.world.curr;
  }

  worldAge() {
    if (!this.world.currTs) return Infinity;
    return nowMs() - this.world.currTs;
  }
}
