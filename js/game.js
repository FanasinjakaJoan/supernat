// ─── SUPERNAT · 2.5D Isometric Engine, Combat, Waves, & Juice ─────────────
import { CFG, PAL, WAVE_FLAVOR } from './config.js';
import { TAU, clamp, lerp, rand, chance, pick, dist2, angleTo } from './utils.js';
import { SFX } from './audio.js';
import { Input } from './input.js';
import { ParticleSys, FloatText, getGlow } from './particles.js';
import { ENEMY_TYPES, pickWaveEnemy, updateEnemy, drawEnemy } from './enemies.js';
import {
  ISO_SCALE,
  ISO_Y_RATIO,
  worldToScreen,
  screenToWorld,
  screenDirToWorld,
  createCityProps,
  drawProp,
} from './iso.js';
import {
  updateHumanoidLocomotion,
  drawHunterHuman,
  drawTacticalReticle,
  accentForHunter,
} from './humanoid.js';
import { ANJANAHARY_GEO, getAnjanaharySector } from './data/anjanaharyMapData.js';

const PORTAL_TIME = 0.55;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.state = 'menu'; // menu | playing | paused | dying | over
    this.SFX = SFX;
    this.particles = new ParticleSys();
    this.texts = new FloatText();
    this.events = [];           // queue consumed by the UI layer
    this.t = 0;
    this.timeScale = 1;
    this.freeze = 0;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.onGameOver = null;
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.portals = [];
    this.pickups = [];
    this.ghosts = [];
    this.decals = [];
    this.score = 0;
    this.displayScore = 0;
    this.wave = 0;
    this.kills = 0;
    this.runT = 0;
    this.isoScale = ISO_SCALE;
    this.camX = 1140;
    this.camY = 920;

    // ── multiplayer (offline-first; wired by main.js via setNet) ──
    this.net = null;
    this.remotePlayers = new Map(); // id → interpolated Other Hunter state
    this._netEnemyId = 0;
    this._netPickupId = 0;
    this._recentDeaths = [];        // host: kills since last world snapshot
    this._takenPickups = new Map(); // guest: netId → ts (dedupe optimistic takes)
    this._creditedKills = new Map();// guest: netId → ts (dedupe kill FX)
    this._lastWaveSeen = 0;
    this._announcedClear = false;
    this._wasHost = true;

    // Atmospheric embers, jacaranda petals & drifting fog in Antananarivo night
    this.embers = [];
    this.fog = [];
    const emberColors = ['#ff9d3d', '#d45236', '#b074eb', '#c98aff', '#e8be5c'];
    for (let i = 0; i < 36; i++) {
      this.embers.push({
        x: Math.random(), y: Math.random(), s: rand(1.0, 2.6),
        v: rand(10, 32), drift: rand(TAU), a: rand(0.25, 0.65),
        col: pick(emberColors),
      });
    }
    for (let i = 0; i < 6; i++) {
      this.fog.push({
        x: Math.random(), y: Math.random(), vx: rand(-8, 8), vy: rand(-4, 4), r: rand(240, 440),
      });
    }

    this.resize();
  }

  // ── 2.5D Isometric Coordinate Helpers ─────────────────────────────────────
  worldToScreen(wx, wy, wz = 0) {
    return worldToScreen(wx, wy, wz, this.camX, this.camY, this.w, this.h);
  }

  screenToWorld(sx, sy, wz = 0) {
    return screenToWorld(sx, sy, wz, this.camX, this.camY, this.w, this.h);
  }

  // ── sizing & city layout ──────────────────────────────────────────────────
  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, Math.min(this.w, this.h) < 720 ? 1.6 : 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';

    // Semi-realistic Anjanahary & Ampasapito necropolis sector (12 hectares)
    this.arenaW = Math.max(2400, Math.round(this.w * 1.8));
    this.arenaH = Math.max(2200, Math.round(this.h * 1.8));
    this.props = createCityProps(this.arenaW, this.arenaH);

    this.buildBackground();

    if (this.player) {
      this.player.x = clamp(this.player.x, 50, this.arenaW - 50);
      this.player.y = clamp(this.player.y, 50, this.arenaH - 50);
    }
  }

  buildBackground() {
    const w = this.w, h = this.h, d = this.dpr;

    // Supernatural Rifts seeping energy through the historical cemetery
    this.rifts = [];
    this.rifts.push({ x: 1680, y: 880, r: 38, ph: 0 });    // Carré Militaire (Lots 38-39)
    this.rifts.push({ x: 440, y: 1340, r: 36, ph: 1.8 });  // Fasam-bahiny 1880 (Historic Colonial Crypts)
    this.rifts.push({ x: 620, y: 720, r: 34, ph: 3.4 });   // Faritra Fasana (West Family Vaults)
    this.rifts.push({ x: 2160, y: 440, r: 36, ph: 4.8 });  // Terminus Ampasapito (East Border)

    // Vignette
    const vg = document.createElement('canvas');
    vg.width = Math.round(w * d); vg.height = Math.round(h * d);
    const v = vg.getContext('2d');
    v.scale(d, d);
    const grad = v.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.76);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(16,4,6,0.74)');
    v.fillStyle = grad; v.fillRect(0, 0, w, h);
    this.vignette = vg;
  }

  bloodDecal(x, y, big) {
    if (this.decals.length > 250) this.decals.shift();
    this.decals.push({
      x, y,
      r: (big ? 26 : 14) * rand(0.85, 1.3),
      rot: rand(TAU),
      color: big ? 'rgba(82, 10, 18, 0.7)' : 'rgba(96, 12, 22, 0.6)',
    });
  }

  // ── run lifecycle ─────────────────────────────────────────────────────────
  startRun() {
    this.state = 'playing';
    this.score = 0; this.displayScore = 0; this.kills = 0; this.runT = 0;
    this.wave = 0;
    this.mult = 1; this.comboKills = 0; this.comboTimer = 0; this.bestMult = 1;
    this.enemies.length = 0; this.bullets.length = 0; this.ebullets.length = 0;
    this.portals.length = 0; this.pickups.length = 0; this.ghosts.length = 0;
    this.decals.length = 0;
    this.spawnQueue = [];
    this.particles.clear(); this.texts.clear();
    this.timeScale = 1; this.freeze = 0; this.shakeT = 0;
    const P = CFG.player;

    // Real human hunter positioned at Carrefour Central of Cimetière d'Anjanahary
    const startX = 1140;
    const startY = 920;
    this.player = {
      x: startX, y: startY,
      vx: 0, vy: 0, r: P.radius,
      hp: P.hp, maxHp: P.hp, ang: 0, iframes: 0,
      dashT: 0, dashCd: 0, dashAng: 0, fireCd: 0, flashT: 0, recoil: 0,
      walkPhase: 0, flinch: 0, isMoving: false, moveAng: 0,
      buffs: { rapid: 0, spread: 0, pierce: 0, shield: 0 },
    };
    this.camX = startX;
    this.camY = startY;
    this.intermission = 0;
    this._wasHost = this.isHost();
    if (this.isGuest()) {
      // guests follow the host's waves via authoritative snapshots
      this.wave = 0;
      this.spawnQueue = [];
      this._lastWaveSeen = 0;
      this._announcedClear = false;
      this._recentDeaths = [];
    } else {
      this.nextWave();
    }
    SFX.unlock();
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; SFX.click(); }
    else if (this.state === 'paused') { this.state = 'playing'; SFX.click(); }
  }

  finishRun() {
    this.state = 'over';
    const stats = {
      score: this.score, wave: this.wave, kills: this.kills,
      time: this.runT, bestMult: this.bestMult,
    };
    if (this.onGameOver) this.onGameOver(stats);
  }

  emit(type, data) { this.events.push({ type, data }); }

  // ── multiplayer core ──────────────────────────────────────────────────────
  /** Attach a NetClient (see js/net.js). Null-safe: game stays solo offline. */
  setNet(net) {
    this.net = net || null;
    if (!net) return;
    net.onHit = (msg) => {
      if (this.isHost() && this.state === 'playing') this.applyRemoteHit(msg);
    };
    net.onPickupTake = (msg) => {
      if (!this.isHost()) return;
      const id = msg.pickup | 0;
      const i = this.pickups.findIndex((pk) => pk.netId === id);
      if (i >= 0) this.pickups.splice(i, 1);
    };
    net.onKillCredit = (msg) => {
      if (!this.isGuest()) return;
      this.applyKillCredit(msg);
    };
    net.onHostChanged = () => this.handleHostChanged();
    net.onDisconnect = () => this.handleNetDisconnect();
    net.onPlayerLeave = (msg) => {
      this.remotePlayers.delete(msg.id);
    };
  }

  isOnline() { return !!(this.net && this.net.connected); }
  isHost() { return !this.isOnline() || this.net.isHost; }
  isGuest() { return this.isOnline() && !this.net.isHost; }

  /** Nearest alive hunter for enemy AI (local + interpolated Other Hunters). */
  getTargetFor(e) {
    if (!this.isOnline() || !this.player) return this.player;
    let best = null, bestD2 = Infinity;
    const consider = (x, y) => {
      const d2 = dist2(e.x, e.y, x, y);
      if (d2 < bestD2) { bestD2 = d2; best = { x, y }; }
    };
    if (this.player.hp > 0 && (this.state === 'playing' || this.state === 'dying')) {
      consider(this.player.x, this.player.y);
    }
    for (const rp of this.remotePlayers.values()) {
      if (rp.stale || rp.alive === false || (rp.hp || 0) <= 0) continue;
      consider(rp.x, rp.y);
    }
    return best || this.player;
  }

  teamScore() {
    let total = this.score || 0;
    for (const rp of this.remotePlayers.values()) total += (rp.score | 0);
    return total;
  }

  teamKills() {
    let total = this.kills || 0;
    for (const rp of this.remotePlayers.values()) total += (rp.kills | 0);
    return total;
  }

  /** Local player state upload @30 Hz (pos, aim, actions, hp, combo/score). */
  syncNetUpload() {
    if (!this.isOnline() || !this.player) return;
    const p = this.player;
    this.net.sendState({
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      vx: Math.round(p.vx),
      vy: Math.round(p.vy),
      ang: Math.round(p.ang * 1000) / 1000,
      hp: Math.round(p.hp),
      maxHp: p.maxHp,
      dashT: Math.round((p.dashT || 0) * 100) / 100,
      iframes: Math.round((p.iframes || 0) * 100) / 100,
      firing: Input.isFiring() && this.state === 'playing',
      mult: this.mult || 1,
      score: this.score || 0,
      kills: this.kills || 0,
      walkPhase: Math.round((p.walkPhase || 0) * 100) / 100,
      moveAng: Math.round((p.moveAng || 0) * 1000) / 1000,
      isMoving: !!p.isMoving,
      alive: this.state === 'playing',
      buffs: {
        rapid: Math.round((p.buffs.rapid || 0) * 10) / 10,
        spread: Math.round((p.buffs.spread || 0) * 10) / 10,
        pierce: Math.round((p.buffs.pierce || 0) * 10) / 10,
        shield: Math.round((p.buffs.shield || 0) * 10) / 10,
      },
    });
    // host publishes the authoritative world @15 Hz
    if (this.isHost() && this.state !== 'menu') {
      this.net.sendHostSnapshot(this.buildHostSnapshot());
    }
  }

  /** Refresh interpolated Other Hunters from the network buffers (60 FPS smooth). */
  syncRemotePlayers() {
    if (!this.isOnline()) {
      if (this.remotePlayers.size) this.remotePlayers.clear();
      return;
    }
    this.remotePlayers = this.net.getRemotePlayers();
  }

  buildHostSnapshot() {
    const snap = {
      wave: this.wave || 0,
      intermission: Math.round((this.intermission || 0) * 100) / 100,
      spawnLeft: (this.spawnQueue || []).length,
      running: this.state === 'playing' || this.state === 'dying' || this.state === 'paused',
      enemies: this.enemies.map((e) => ({
        id: e.netId || 0,
        type: e.type,
        x: Math.round(e.x * 10) / 10,
        y: Math.round(e.y * 10) / 10,
        hp: Math.round(e.hp * 10) / 10,
        maxHp: Math.round(e.maxHp * 10) / 10,
        rot: Math.round((e.rot || 0) * 1000) / 1000,
        state: e.state || 'stalk',
        telegraphed: !!e.telegraphed,
        alpha: e.alpha !== undefined ? Math.round(e.alpha * 100) / 100 : 1,
        walkPhase: Math.round((e.walkPhase || 0) * 100) / 100,
        vx: Math.round(e.vx || 0),
        vy: Math.round(e.vy || 0),
      })),
      portals: this.portals.map((po) => ({
        x: Math.round(po.x), y: Math.round(po.y), type: po.type,
        t: Math.round(po.t * 100) / 100,
      })),
      pickups: this.pickups.map((pk) => ({
        id: pk.netId || 0, kind: pk.kind,
        x: Math.round(pk.x), y: Math.round(pk.y),
        t: Math.round(pk.t * 10) / 10,
      })),
      ebullets: this.ebullets.map((b) => ({
        x: Math.round(b.x), y: Math.round(b.y),
        vx: Math.round(b.vx), vy: Math.round(b.vy),
      })),
      deaths: this._recentDeaths,
    };
    this._recentDeaths = [];
    return snap;
  }

  /** Guest: merge the host-authoritative world (interpolated enemy motion). */
  applyNetWorld(dt) {
    const world = this.net ? this.net.getWorld() : null;
    if (!world) return;
    const now = performance.now();

    // wave banners follow the host
    if (world.wave !== this._lastWaveSeen) {
      if (world.wave > 0 && this.state === 'playing') {
        this.wave = world.wave;
        this.emit('wave', { n: world.wave, flavor: WAVE_FLAVOR[(world.wave - 1) % WAVE_FLAVOR.length] });
        SFX.wave();
        this._announcedClear = false;
      }
      this._lastWaveSeen = world.wave;
    }
    if (world.intermission > 0 && !this._announcedClear && this.state === 'playing') {
      this._announcedClear = true;
      this.emit('waveClear', { n: this.wave });
    }

    // prune dedupe caches
    for (const [id, ts] of this._takenPickups) {
      if (now - ts > 2500) this._takenPickups.delete(id);
    }
    for (const [id, ts] of this._creditedKills) {
      if (now - ts > 2500) this._creditedKills.delete(id);
    }

    // enemies: match by netId, ease positions toward authoritative targets
    const seen = new Set();
    const k = 1 - Math.exp(-14 * dt); // smoothing factor → 60 FPS smoothness
    for (const se of (world.enemies || [])) {
      seen.add(se.id);
      let e = this.enemies.find((x) => x.netId === se.id);
      if (!e) {
        const def = ENEMY_TYPES[se.type] || ENEMY_TYPES.shambler;
        e = {
          type: se.type in ENEMY_TYPES ? se.type : 'shambler',
          def, netId: se.id,
          x: se.x, y: se.y, hp: se.hp, maxHp: se.maxHp,
          r: def.r, speed: def.speed, rot: se.rot || 0,
          flash: 0, phase: rand(TAU), t: rand(10), alpha: se.alpha,
          touchCd: 0, state: se.state, chargeT: 1, shootT: 2,
          telegraphed: !!se.telegraphed, lockAng: 0,
          walkPhase: se.walkPhase || 0, flinch: 0, isMoving: true,
          vx: se.vx || 0, vy: se.vy || 0,
        };
        this.enemies.push(e);
      } else {
        // snap on teleport, ease otherwise (jitter-proof interpolation)
        const d2 = dist2(e.x, e.y, se.x, se.y);
        if (d2 > 220 * 220) { e.x = se.x; e.y = se.y; }
        else {
          e.x = lerp(e.x, se.x, k);
          e.y = lerp(e.y, se.y, k);
        }
        e.hp = se.hp; e.maxHp = se.maxHp;
        e.rot = se.rot; e.state = se.state;
        e.telegraphed = !!se.telegraphed;
        e.alpha = se.alpha;
        e.walkPhase = se.walkPhase;
        e.vx = se.vx || 0; e.vy = se.vy || 0;
        e.flash = Math.max(0, e.flash - dt);
        e.touchCd = Math.max(0, e.touchCd - dt);
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!seen.has(this.enemies[i].netId)) this.enemies.splice(i, 1);
    }

    // portals / pickups / enemy bullets: direct authoritative copies
    this.portals = (world.portals || []).map((po) => ({
      x: po.x, y: po.y, type: po.type, t: po.t, total: PORTAL_TIME,
    }));
    this.pickups = (world.pickups || [])
      .filter((pk) => !this._takenPickups.has(pk.id))
      .map((pk) => ({ x: pk.x, y: pk.y, kind: pk.kind, t: pk.t, ph: (pk.id * 1.7) % TAU, netId: pk.id }));
    for (const pk of this.pickups) pk.ph += dt * 3;
    this.ebullets = (world.ebullets || []).map((b) => ({
      x: b.x, y: b.y, z: 18, vx: b.vx, vy: b.vy, life: 3.2, dmg: 9, r: 6,
    }));

    // death FX for kills we didn't score ourselves (shooter got kill_credit)
    for (const d of (world.deaths || [])) {
      if (this._creditedKills.has(d.id)) continue;
      const def = ENEMY_TYPES[d.type] || ENEMY_TYPES.shambler;
      this.particles.burst(d.x, d.y, def.color, d.big ? 30 : 14, d.big ? 300 : 200, 0.55, 2.6);
      this.particles.ring(d.x, d.y, def.glow, d.big ? 80 : 40, 0.35);
      this.bloodDecal(d.x, d.y, d.big);
      if (d.big) SFX.bigKill(); else SFX.kill();
    }
  }

  /** Host: apply a guest's damage claim against an authoritative enemy. */
  applyRemoteHit(msg) {
    const e = this.enemies.find((x) => x.netId === (msg.enemy | 0));
    if (!e || e.dead) return;
    this.damageEnemy(e, msg.dmg, msg.ang || 0, !!msg.crit, { remoteId: msg.from, mult: msg.mult | 0 });
  }

  /** Guest: confirmed kill score from the host (authoritative, no double-count). */
  applyKillCredit(msg) {
    const now = performance.now ? performance.now() : Date.now();
    if (msg.netId) this._creditedKills.set(msg.netId, now);
    this.kills++;
    this.comboKills++;
    this.comboTimer = CFG.combo.window;
    if (this.comboKills % CFG.combo.killsPerMult === 0 && this.mult < CFG.combo.maxMult) {
      this.mult++;
      this.bestMult = Math.max(this.bestMult, this.mult);
      this.texts.add(this.player.x, this.player.y - 34, `COMBO x${this.mult}`, '#9dff20', 18);
      SFX.buff();
    }
    const pts = Math.round((msg.base || 10) * (this.mult || 1));
    this.score += pts;
    this.texts.add((msg.x || 0) + rand(-6, 6), (msg.y || 0) - 18, `+${pts}`, '#c8ff9e', 14);
    const def = ENEMY_TYPES[msg.enemy] || ENEMY_TYPES.shambler;
    const big = !!msg.big;
    this.particles.burst(msg.x, msg.y, def.color, big ? 30 : 14, big ? 300 : 200, 0.6, 2.6);
    this.particles.ring(msg.x, msg.y, def.glow, big ? 80 : 40, 0.35);
    this.bloodDecal(msg.x, msg.y, big);
    this.shake(big ? 8 : 2.5, big ? 0.3 : 0.12);
    big ? SFX.bigKill() : SFX.kill();
  }

  /** Host migration / role change mid-run. */
  handleHostChanged() {
    if (!this.net || !this.player) return;
    if (this.isHost() && !this._wasHost) {
      // guest → host: take over the hunt from the last known world state
      const world = this.net.getWorld && this.net.getWorld();
      if (world) {
        this.wave = Math.max(this.wave, world.wave || 1);
        this.intermission = 0;
        const need = world.spawnLeft | 0;
        this.spawnQueue = this.spawnQueue || [];
        for (let i = 0; i < need; i++) this.spawnQueue.push(pickWaveEnemy(this.wave));
      } else if (!this.wave) {
        this.wave = 0;
        this.nextWave();
      }
      this._recentDeaths = [];
      this.texts.add(this.player.x, this.player.y - 40, '♛ YOU ARE THE HOST', '#ffd23d', 17);
      this.emit('wave', { n: this.wave, flavor: 'You now anchor the Rift. Hold the Gate!' });
      if (this.net.getWorld) this.net.forceWorldSend(this.buildHostSnapshot());
    } else if (!this.isHost() && this._wasHost) {
      // host → guest (rare): stop spawning, await authoritative snapshots
      this.spawnQueue = [];
      this._lastWaveSeen = this.wave;
    }
    this._wasHost = this.isHost();
  }

  /** Server lost mid-run: fall back to solo seamlessly. */
  handleNetDisconnect() {
    this.remotePlayers.clear();
    if (this.state === 'playing' || this.state === 'dying') {
      if (!this.enemies.length && !(this.spawnQueue || []).length && !this.portals.length) {
        this.intermission = 1.2; // resume local waves from current position
      }
      if (this.player) {
        this.texts.add(this.player.x, this.player.y - 40, 'SIGNAL LOST · SOLO HUNT', '#ff9d3d', 16);
      }
    }
    this._wasHost = true;
  }

  /** Co-op respawn: the pack survives as long as one hunter stands. */
  respawnLocal() {
    const p = this.player;
    const P = CFG.player;
    p.hp = p.maxHp;
    p.x = clamp(1140 + rand(-70, 70), 50, this.arenaW - 50);
    p.y = clamp(920 + rand(-70, 70), 50, this.arenaH - 50);
    p.vx = 0; p.vy = 0;
    p.iframes = 2.5;
    p.dashT = 0; p.dashCd = 0;
    p.buffs.rapid = 0; p.buffs.spread = 0; p.buffs.pierce = 0; p.buffs.shield = 0;
    this.camX = p.x; this.camY = p.y;
    this.state = 'playing';
    this.timeScale = 1;
    this.particles.ring(p.x, p.y, '#9dff20', 60, 0.5);
    this.particles.burst(p.x, p.y, '#9dff20', 18, 220, 0.5, 2.4);
    this.emit('wave', { n: this.wave, flavor: 'Death spits you back. The pack needs you!' });
    SFX.buff();
  }

  // ── waves ─────────────────────────────────────────────────────────────────
  nextWave() {
    this.wave++;
    const n = this.wave;
    const count = 6 + Math.floor(n * 2.4);
    this.spawnQueue = [];
    for (let i = 0; i < count; i++) this.spawnQueue.push(pickWaveEnemy(n));
    if (n >= 4 && n % 4 === 0)
      for (let i = 0; i < 1 + Math.floor(n / 8); i++) this.spawnQueue.push('abomination');

    // shuffle
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
    this.spawnInterval = clamp(1.05 - n * 0.05, 0.3, 1.05);
    this.spawnTimer = 0.9;
    this.emit('wave', { n, flavor: WAVE_FLAVOR[(n - 1) % WAVE_FLAVOR.length] });
    SFX.wave();
  }

  updateWave(dt) {
    if (this.intermission > 0) {
      this.intermission -= dt;
      if (this.intermission <= 0) this.nextWave();
      return;
    }
    if (this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.portals.length < 5) {
        this.spawnTimer = this.spawnInterval;
        const type = this.spawnQueue.pop();
        this.openPortal(type);
      }
    } else if (!this.portals.length && !this.enemies.length && this.state === 'playing') {
      // wave cleared
      const p = this.player;
      p.hp = Math.min(p.maxHp, p.hp + CFG.healOnWave);
      this.texts.add(p.x, p.y - 30, `+${CFG.healOnWave} HP`, '#9dff20', 16);
      this.emit('waveClear', { n: this.wave });
      this.intermission = 2.3;
      SFX.pickup();
    }
  }

  openPortal(type) {
    let x, y, tries = 0;
    const px = this.player ? this.player.x : this.arenaW * 0.5;
    const py = this.player ? this.player.y : this.arenaH * 0.5;
    do {
      const a = rand(TAU);
      const dist = rand(360, 580);
      x = px + Math.cos(a) * dist;
      y = py + Math.sin(a) * dist;
      tries++;
    } while ((x < 50 || x > this.arenaW - 50 || y < 50 || y > this.arenaH - 50) && tries < 15);

    x = clamp(x, 40, this.arenaW - 40);
    y = clamp(y, 40, this.arenaH - 40);
    this.portals.push({ x, y, type, t: PORTAL_TIME, total: PORTAL_TIME });
    SFX.portal();
  }

  updatePortals(dt) {
    for (let i = this.portals.length - 1; i >= 0; i--) {
      const po = this.portals[i];
      po.t -= dt;
      if (chance(dt * 24)) {
        const a = rand(TAU), dd = rand(18, 36);
        this.particles.add({
          kind: 'spark', x: po.x + Math.cos(a) * dd, y: po.y + Math.sin(a) * dd, z: rand(4, 28),
          vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60,
          life: 0.35, max: 0.35, size: 2, color: ENEMY_TYPES[po.type].glow, drag: 0, grav: 0,
        });
      }
      if (po.t <= 0) {
        this.portals.splice(i, 1);
        this.spawnEnemy(po.type, po.x, po.y);
        this.particles.burst(po.x, po.y, ENEMY_TYPES[po.type].glow, 14, 170, 0.42, 2.4);
        this.particles.ring(po.x, po.y, ENEMY_TYPES[po.type].glow, 38, 0.35);
        SFX.spawn();
      }
    }
  }

  spawnEnemy(type, x, y) {
    const def = ENEMY_TYPES[type];
    const hpMul = 1 + (this.wave - 1) * 0.09;
    const e = {
      type, def, x, y,
      netId: ++this._netEnemyId, // stable id for host-authoritative hit claims
      hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      r: def.r, speed: def.speed * rand(0.9, 1.15),
      rot: 0, flash: 0, phase: rand(TAU), t: rand(10), alpha: 1,
      touchCd: 0, state: 'stalk', chargeT: rand(0.8, 1.8),
      shootT: rand(1.2, 2.2), telegraphed: false, lockAng: 0,
      walkPhase: rand(TAU), flinch: 0, isMoving: false,
    };
    this.enemies.push(e);
  }

  // ── combat helpers ────────────────────────────────────────────────────────
  shake(mag, dur) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  spawnEnemyBullet(x, y, ang) {
    const sp = 230;
    this.ebullets.push({
      x, y, z: 18,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      life: 3.2, dmg: this.player.buffs.shield > 0 ? 6 : 9, r: 6,
    });
  }

  fireBullets() {
    const p = this.player, G = CFG.gun;
    const rate = G.fireRate * (p.buffs.rapid > 0 ? 1.9 : 1);
    p.fireCd = 1 / rate;
    const angles = p.buffs.spread > 0 ? [-0.17, 0, 0.17] : [0];
    const pierce = p.buffs.pierce > 0 ? 3 : 0;
    for (const off of angles) {
      const a = p.ang + off + rand(-G.spread, G.spread);
      const mx = p.x + Math.cos(p.ang) * (p.r + 8);
      const my = p.y + Math.sin(p.ang) * (p.r + 8);
      this.bullets.push({
        x: mx, y: my, z: 22,
        vx: Math.cos(a) * G.speed, vy: Math.sin(a) * G.speed,
        life: G.life, dmg: G.damage, pierce, hit: null,
      });
    }
    p.flashT = 0.05; p.recoil = 4.2;
    this.shake(1.2, 0.05);
    this.particles.shell(p.x, p.y, p.ang);
    this.particles.burst(p.x + Math.cos(p.ang) * (p.r + 10), p.y + Math.sin(p.ang) * (p.r + 10),
      '#ffd23d', 3, 130, 0.14, 1.8, p.ang, 0.9);
    SFX.shoot();
  }

  damageEnemy(e, dmg, ang, crit, scorer = null) {
    e.hp -= dmg;
    e.flash = 0.12;
    e.flinch = 1.0;
    e.x += Math.cos(ang) * 3.4;
    e.y += Math.sin(ang) * 3.4;
    this.particles.burst(e.x, e.y, e.def.color, crit ? 8 : 4, 150, 0.32, 2.2, ang + Math.PI, 1.6);
    if (crit) this.texts.add(e.x + rand(-8, 8), e.y - e.r - 6, `${dmg | 0}!`, '#ff9d3d', 16);
    if (e.hp <= 0) this.killEnemy(e, scorer);
    else if (this._hitSndCd <= 0) { SFX.hit(); this._hitSndCd = 0.045; }
  }

  killEnemy(e, scorer = null) {
    e.dead = true;
    const remoteKill = !!(scorer && scorer.remoteId && this.isOnline());
    if (remoteKill) {
      // co-op: score belongs to the guest hunter that landed the killing blow
      if (this.net) {
        this.net.sendKillCredit(scorer.remoteId, {
          enemy: e.type, base: e.def.score, x: e.x, y: e.y,
          big: e.type === 'abomination', netId: e.netId || 0,
        });
      }
    } else {
      this.kills++;
      this.comboKills++;
      this.comboTimer = CFG.combo.window;
      if (this.comboKills % CFG.combo.killsPerMult === 0 && this.mult < CFG.combo.maxMult) {
        this.mult++;
        this.bestMult = Math.max(this.bestMult, this.mult);
        this.texts.add(this.player.x, this.player.y - 34, `COMBO x${this.mult}`, '#9dff20', 18);
        SFX.buff();
      }
      const pts = Math.round(e.def.score * this.mult);
      this.score += pts;
      this.texts.add(e.x + rand(-6, 6), e.y - e.r - 4, `+${pts}`, '#c8ff9e', 14);
    }
    // shared death record → guests render kill FX from the world snapshot
    if (this.isOnline() && this.isHost() && this._recentDeaths.length < 20) {
      this._recentDeaths.push({ id: e.netId || 0, type: e.type, x: Math.round(e.x), y: Math.round(e.y), big: e.type === 'abomination' });
    }

    const big = e.type === 'abomination';
    this.particles.burst(e.x, e.y, e.def.color, big ? 36 : 15, big ? 320 : 210, big ? 0.8 : 0.55, big ? 3.6 : 2.6);
    this.particles.burst(e.x, e.y, '#ffffff', big ? 10 : 4, big ? 260 : 160, 0.3, 1.8);
    this.particles.smoke(e.x, e.y, e.def.color === '#7be9ff' ? 'rgba(123,233,255,0.8)' : 'rgba(120,20,40,0.85)', big ? 10 : 5, 50, 0.9, big ? 16 : 9);
    this.particles.ring(e.x, e.y, e.def.glow, big ? 90 : 44, big ? 0.5 : 0.32);
    this.bloodDecal(e.x, e.y, big || e.type === 'vampire');
    this.freeze = Math.max(this.freeze, big ? 0.07 : 0.034);
    this.shake(big ? 11 : 3.2, big ? 0.4 : 0.14);
    navigator.vibrate && navigator.vibrate(big ? 40 : 12);
    big ? SFX.bigKill() : SFX.kill();

    if (e.type === 'abomination') {
      for (let i = 0; i < 2; i++) {
        const a = rand(TAU);
        this.spawnEnemy('shambler', e.x + Math.cos(a) * 34, e.y + Math.sin(a) * 34);
      }
      this.dropPickup(e.x, e.y, 1);
    } else if (chance(CFG.pickup.chance)) {
      this.dropPickup(e.x, e.y);
    }
  }

  dropPickup(x, y, forced) {
    let kind;
    if (typeof forced === 'string') {
      kind = forced;
    } else if (forced) {
      kind = 'heal';
    } else {
      const roll = Math.random();
      kind = roll < 0.32 ? 'heal' : roll < 0.52 ? 'rapid' : roll < 0.72 ? 'spread'
        : roll < 0.86 ? 'pierce' : 'shield';
    }
    this.pickups.push({ x, y, kind, t: CFG.pickup.life, ph: rand(TAU), netId: ++this._netPickupId });
  }

  damagePlayer(dmg, fromX, fromY) {
    if (this.state !== 'playing') return;
    const p = this.player;
    if (p.iframes > 0 || p.dashT > 0) return;
    if (p.buffs.shield > 0) {
      if (dmg >= 500) {
        p.buffs.shield = 0;
      } else {
        p.buffs.shield = Math.max(0, p.buffs.shield - 1.6);
        this.particles.ring(p.x, p.y, '#7be9ff', 40, 0.3);
        SFX.hit();
        return;
      }
    }
    p.hp -= dmg;
    p.iframes = CFG.player.hurtIframes;
    p.flinch = 1.0;
    const a = angleTo(fromX, fromY, p.x, p.y);
    p.vx += Math.cos(a) * 190; p.vy += Math.sin(a) * 190;
    this.shake(13, 0.4);
    this.particles.burst(p.x, p.y, '#ff2e4d', 16, 240, 0.5, 2.6);
    this.bloodDecal(p.x, p.y, false);
    SFX.hurt();
    navigator.vibrate && navigator.vibrate(60);
    this.emit('hurt', {});
    if (p.hp <= 0) {
      p.hp = 0;
      this.state = 'dying';
      this.dyingT = 1.15;
      this.particles.burst(p.x, p.y, '#ff2e4d', 40, 330, 0.9, 3.4);
      this.particles.burst(p.x, p.y, '#e8e0cf', 18, 260, 0.7, 2.6);
      this.particles.ring(p.x, p.y, '#ff2e4d', 110, 0.7);
      this.particles.smoke(p.x, p.y, 'rgba(120,20,40,0.9)', 12, 60, 1.4, 16);
      this.shake(20, 0.6);
      SFX.over();
    }
  }

  // ── main update ───────────────────────────────────────────────────────────
  update(dt) {
    const p = this.player;
    this.runT += dt;
    this._hitSndCd = (this._hitSndCd || 0) - dt;

    // ── multiplayer sync: 30 Hz upload, interpolated Other Hunters, host world
    this.syncRemotePlayers();
    this.syncNetUpload();
    if (this.isGuest()) this.applyNetWorld(dt);

    p.iframes = Math.max(0, p.iframes - dt);
    p.flashT = Math.max(0, p.flashT - dt);
    p.recoil = lerp(p.recoil, 0, 1 - Math.exp(-14 * dt));
    for (const k in p.buffs) p.buffs[k] = Math.max(0, p.buffs[k] - dt);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0 && this.mult > 1) { this.mult = 1; this.comboKills = 0; }

    if (this.state === 'playing') {
      // ── realistic human locomotion & movement ──
      const mv = Input.moveVector();
      const P = CFG.player;
      let tx = 0, ty = 0;
      if (mv.mag > 0.05) {
        // Convert screen-relative WASD input to uniform ground velocity
        const wDir = screenDirToWorld(mv.x, mv.y);
        tx = wDir.x * P.speed;
        ty = wDir.y * P.speed;
      }
      const k = 1 - Math.exp(-13 * dt);
      p.vx = lerp(p.vx, tx, k);
      p.vy = lerp(p.vy, ty, k);

      // Dash (tactical evasive combat dive)
      p.dashCd = Math.max(0, p.dashCd - dt);
      if (Input.dashQueued) {
        Input.dashQueued = false;
        if (p.dashCd <= 0) {
          const a = Math.hypot(p.vx, p.vy) > 10 ? Math.atan2(p.vy, p.vx) : p.ang;
          p.dashT = P.dashTime; p.dashCd = P.dashCooldown; p.dashAng = a;
          p.iframes = Math.max(p.iframes, P.dashTime + 0.05);
          this.particles.ring(p.x, p.y, '#9dff20', 34, 0.28);
          SFX.dash();
          this.shake(2.4, 0.1);
        }
      }
      if (p.dashT > 0) {
        p.dashT -= dt;
        p.vx = Math.cos(p.dashAng) * P.dashSpeed;
        p.vy = Math.sin(p.dashAng) * P.dashSpeed;
        this.ghosts.push({ x: p.x, y: p.y, ang: p.ang, life: 0.26 });
        if (chance(dt * 60)) this.particles.burst(p.x, p.y, '#9dff20', 1, 60, 0.3, 2);
      }

      p.x = clamp(p.x + p.vx * dt, 40, this.arenaW - 40);
      p.y = clamp(p.y + p.vy * dt, 40, this.arenaH - 40);

      // Soft collision with urban props (crates, barricades, vehicles)
      for (const prop of this.props) {
        if (!prop.r) continue;
        const rr = p.r + prop.r;
        const d2 = dist2(p.x, p.y, prop.x, prop.y);
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = rr - d;
          p.x += ((p.x - prop.x) / d) * push;
          p.y += ((p.y - prop.y) / d) * push;
        }
      }

      // Update hunter realistic displacement gait
      updateHumanoidLocomotion(p, dt, true);

      // ── aiming & firing ──
      if (Input.aimStick && Input.aimStick.mag > 0.2) {
        const wAim = screenDirToWorld(Input.aimStick.vx, Input.aimStick.vy);
        p.ang = Math.atan2(wAim.y, wAim.x);
      } else {
        let aimTarget;
        if (Input.mouse && Input.mouse.isScreen) {
          aimTarget = this.screenToWorld(Input.mouse.x, Input.mouse.y, 0);
        } else {
          aimTarget = { x: Input.mouse.x, y: Input.mouse.y };
        }
        p.ang = angleTo(p.x, p.y, aimTarget.x, aimTarget.y);
      }

      p.fireCd -= dt;
      if (Input.isFiring() && p.fireCd <= 0) this.fireBullets();

      // Camera follow with aim lead
      const lead = 36;
      const targetCamX = clamp(p.x + Math.cos(p.ang) * lead, 180, this.arenaW - 180);
      const targetCamY = clamp(p.y + Math.sin(p.ang) * lead, 180, this.arenaH - 180);
      this.camX = lerp(this.camX, targetCamX, 1 - Math.exp(-8 * dt));
      this.camY = lerp(this.camY, targetCamY, 1 - Math.exp(-8 * dt));
    }

    // ghosts trail
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].life -= dt;
      if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }

    // ── player bullets ──
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -40 || b.x > this.arenaW + 40 || b.y < -40 || b.y > this.arenaH + 40) {
        this.bullets.splice(i, 1); continue;
      }
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (b.hit === e) continue;
        const rr = e.r + 4;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          const crit = chance(CFG.gun.critChance);
          const bang = Math.atan2(b.vy, b.vx);
          const bdmg = b.dmg * (crit ? 2 : 1);
          if (this.isGuest()) {
            // host-authoritative: claim damage, render hit FX optimistically
            if (e.netId && this.net) {
              this.net.sendHit(e.netId, Math.round(bdmg), crit, Math.round(bang * 1000) / 1000, this.mult || 1);
            }
            e.flash = 0.12;
            this.particles.burst(e.x, e.y, e.def.color, crit ? 6 : 3, 150, 0.3, 2.2, bang + Math.PI, 1.6);
            if (crit) this.texts.add(e.x + rand(-8, 8), e.y - e.r - 6, `${bdmg | 0}!`, '#ff9d3d', 16);
            if (this._hitSndCd <= 0) { SFX.hit(); this._hitSndCd = 0.045; }
          } else {
            this.damageEnemy(e, bdmg, bang, crit);
          }
          if (b.pierce > 0) { b.pierce--; b.hit = e; b.dmg *= 0.8; }
          else { this.bullets.splice(i, 1); }
          break;
        }
      }
    }

    // ── enemies ──
    if (this.isGuest()) {
      // guests: authoritative motion arrives via host snapshots (see applyNetWorld);
      // contact damage stays local so every hunter feels bites instantly.
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.flash = Math.max(0, e.flash - dt);
        e.touchCd = Math.max(0, e.touchCd - dt);
        const rrG = e.r + p.r - 2;
        if (e.touchCd <= 0 && dist2(e.x, e.y, p.x, p.y) < rrG * rrG) {
          e.touchCd = 0.6;
          this.damagePlayer(e.def.dmg, e.x, e.y);
        }
      }
    } else {
    this.updatePortals(dt);
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt);
      e.touchCd = Math.max(0, e.touchCd - dt);
      updateEnemy(e, this, dt);

      // contact damage
      const rr = e.r + p.r - 2;
      if (e.touchCd <= 0 && dist2(e.x, e.y, p.x, p.y) < rr * rr) {
        e.touchCd = 0.6;
        this.damagePlayer(e.def.dmg, e.x, e.y);
      }
    }

    // separation between enemies
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i]; if (a.dead) continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j]; if (b.dead) continue;
        const rr = a.r + b.r;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          const nx = (a.x - b.x) / d, ny = (a.y - b.y) / d;
          a.x += nx * push * 0.5; a.y += ny * push * 0.5;
          b.x -= nx * push * 0.5; b.y -= ny * push * 0.5;
        }
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--)
      if (this.enemies[i].dead) this.enemies.splice(i, 1);
    } // end host/guest enemy branch

    // ── enemy bullets ──
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -40 || b.x > this.arenaW + 40 || b.y < -40 || b.y > this.arenaH + 40) {
        this.ebullets.splice(i, 1); continue;
      }
      const rr = b.r + p.r;
      if (dist2(b.x, b.y, p.x, p.y) < rr * rr) {
        this.ebullets.splice(i, 1);
        this.particles.burst(b.x, b.y, '#b06cff', 8, 160, 0.35, 2.2);
        this.damagePlayer(b.dmg, b.x, b.y);
      }
    }

    // ── pickups ──
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.t -= dt; pk.ph += dt * 3;
      if (pk.t <= 0) { this.pickups.splice(i, 1); continue; }
      const d2 = dist2(pk.x, pk.y, p.x, p.y);
      if (d2 < 74 * 74) {
        const d = Math.sqrt(d2) || 1;
        pk.x += ((p.x - pk.x) / d) * 300 * dt;
        pk.y += ((p.y - pk.y) / d) * 300 * dt;
      }
      if (d2 < 26 * 26) {
        this.pickups.splice(i, 1);
        if (this.isGuest() && pk.netId && this.net) {
          this.net.sendPickupTake(pk.netId);
          const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          this._takenPickups.set(pk.netId, nowTs);
        }
        this.applyPickup(pk.kind);
      }
    }

    if (this.state === 'playing' && !this.isGuest()) this.updateWave(dt);
    this.particles.update(dt);
    this.texts.update(dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT <= 0) this.shakeMag = 0;
    this.displayScore = lerp(this.displayScore, this.score, 1 - Math.exp(-10 * dt));
  }

  applyPickup(kind) {
    const p = this.player;
    const B = 9;
    switch (kind) {
      case 'heal':
        p.hp = Math.min(p.maxHp, p.hp + 30);
        this.texts.add(p.x, p.y - 28, '+30 HP', '#ff5d76', 15); break;
      case 'rapid':
        p.buffs.rapid = B; this.texts.add(p.x, p.y - 28, 'RAPID FIRE', '#ffd23d', 14); break;
      case 'spread':
        p.buffs.spread = B; this.texts.add(p.x, p.y - 28, 'TRIPLE SHOT', '#7be9ff', 14); break;
      case 'pierce':
        p.buffs.pierce = B; this.texts.add(p.x, p.y - 28, 'PIERCING ROUNDS', '#9dff20', 14); break;
      case 'shield':
        p.buffs.shield = 5; this.texts.add(p.x, p.y - 28, 'VEIL WARD', '#b06cff', 14); break;
    }
    this.particles.ring(p.x, p.y, '#e8e0cf', 34, 0.3);
    SFX.pickup();
  }

  // ── frame driver ──────────────────────────────────────────────────────────
  frame(rawDt) {
    this.t += rawDt;
    if (this.net) this.net.update(); // pings + stale pruning even in menu/lobby
    if (this.freeze > 0) { this.freeze -= rawDt; this.render(); return; }
    let dt = rawDt * this.timeScale;
    if (this.state === 'dying') {
      this.dyingT -= rawDt;
      this.timeScale = lerp(this.timeScale, 0.22, 0.12);
      if (this.dyingT <= 0) {
        this.timeScale = 1;
        // co-op: the pack fights on — respawn instead of game over
        if (this.isOnline()) { this.respawnLocal(); dt = 0; }
        else { this.finishRun(); dt = 0; }
      }
    } else if (this.state === 'playing') {
      this.timeScale = lerp(this.timeScale, 1, 0.25);
    }
    this.updateAmbient(rawDt);
    if ((this.state === 'playing' || this.state === 'dying') && dt > 0) this.update(dt);
    this.render();
  }

  updateAmbient(rawDt) {
    for (const em of this.embers) {
      em.y -= (em.v * rawDt) / this.h;
      em.x += Math.sin(this.t * 0.7 + em.drift) * 0.0003;
      if (em.y < -0.02) { em.y = 1.02; em.x = Math.random(); }
    }
    for (const f of this.fog) {
      f.x += f.vx * rawDt; f.y += f.vy * rawDt;
      if (f.x < -460) f.x = this.w + 440; if (f.x > this.w + 460) f.x = -440;
      if (f.y < -460) f.y = this.h + 440; if (f.y > this.h + 460) f.y = -440;
    }
  }

  // ── 2.5D Isometric Render Pipeline ─────────────────────────────────────────
  render() {
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Screen Shake
    let sx = 0, sy = 0, sr = 0;
    if (this.shakeT > 0 && this.shakeMag > 0) {
      const m = this.shakeMag * Math.min(1, this.shakeT * 6);
      sx = rand(-m, m); sy = rand(-m, m); sr = rand(-1, 1) * m * 0.0022;
      this.shakeMag *= Math.pow(0.001, 0.016);
    }

    ctx.save();
    ctx.translate(w * 0.5 + sx, h * 0.5 + sy);
    ctx.rotate(sr);
    ctx.translate(-w * 0.5, -h * 0.5);

    // Pass 1: Isometric City Streets & Ground
    this.drawCityGround(ctx);

    // Pass 2: Rifts Pulsing on the Ground
    this.drawRifts(ctx);

    // Pass 3: 2.5D Depth-Sorted Entities (Actors, Props, Pickups, Portals)
    this.drawDepthSortedWorld(ctx);

    // Pass 4: 2.5D Projectiles & Tracers
    this.drawProjectiles(ctx);

    // Pass 5: 2.5D Particles & Floating Combat Text
    this.particles.draw(ctx, (wx, wy, wz) => this.worldToScreen(wx, wy, wz));
    this.texts.draw(ctx, (wx, wy, wz) => this.worldToScreen(wx, wy, wz));

    ctx.restore();

    // Pass 6: Drifting City Fog & Amber Embers
    this.drawAtmosphere(ctx);

    // Pass 7: Vignette & Low HP Heartbeat Pulse
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, w, h);
    if (this.player && this.state === 'playing' && this.player.hp < 30) {
      const pu = 0.25 + 0.2 * Math.sin(this.t * 6);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.65);
      g.addColorStop(0, 'rgba(255,20,40,0)');
      g.addColorStop(1, `rgba(255,20,40,${pu})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Pass 8: Tactical 2.5D Aiming Reticle (Desktop Mouse)
    if (this.state === 'playing' && !Input.touchMode) {
      drawTacticalReticle(ctx, Input.mouse.x, Input.mouse.y, Input.isFiring(), this.t);
    }
  }

  // ── Isometric Madagascar Anjanahary Ground Plane ──────────────────────────
  drawCityGround(ctx) {
    const { w, h, arenaW, arenaH } = this;

    // 1) Base dark Malagasy laterite red clay ("tany mena")
    ctx.fillStyle = '#180c09';
    ctx.fillRect(0, 0, w, h);

    // Subtle isometric diamond ground grid / laterite soil texture
    ctx.strokeStyle = 'rgba(74, 28, 20, 0.22)';
    ctx.lineWidth = 1;
    const step = 80;
    for (let x = 0; x <= arenaW; x += step) {
      const p1 = this.worldToScreen(x, 0, 0);
      const p2 = this.worldToScreen(x, arenaH, 0);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    for (let y = 0; y <= arenaH; y += step) {
      const p1 = this.worldToScreen(0, y, 0);
      const p2 = this.worldToScreen(arenaW, y, 0);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }

    // 2) Làlana Rasoamiaramanana (OSM way 76181286) across the north
    // Connecting Anjanahary west to Ampasapito east
    const roadY1 = 140, roadY2 = 270;
    const r1 = this.worldToScreen(0, roadY1, 0);
    const r2 = this.worldToScreen(arenaW, roadY1, 0);
    const r3 = this.worldToScreen(arenaW, roadY2, 0);
    const r4 = this.worldToScreen(0, roadY2, 0);

    // Dusty red clay road shoulders
    ctx.fillStyle = '#26100a';
    ctx.beginPath();
    ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.lineTo(r3.x, r3.y); ctx.lineTo(r4.x, r4.y);
    ctx.closePath(); ctx.fill();

    // Weathered Asphalt carriageway
    const asph1 = this.worldToScreen(0, roadY1 + 18, 0);
    const asph2 = this.worldToScreen(arenaW, roadY1 + 18, 0);
    const asph3 = this.worldToScreen(arenaW, roadY2 - 18, 0);
    const asph4 = this.worldToScreen(0, roadY2 - 18, 0);

    ctx.fillStyle = '#14101a';
    ctx.beginPath();
    ctx.moveTo(asph1.x, asph1.y); ctx.lineTo(asph2.x, asph2.y); ctx.lineTo(asph3.x, asph3.y); ctx.lineTo(asph4.x, asph4.y);
    ctx.closePath(); ctx.fill();

    // Road shoulder edge borders
    ctx.strokeStyle = '#321c16';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(asph1.x, asph1.y); ctx.lineTo(asph2.x, asph2.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(asph4.x, asph4.y); ctx.lineTo(asph3.x, asph3.y); ctx.stroke();

    // Broken center white dashed lines along Rue Rasoamiaramanana
    ctx.strokeStyle = 'rgba(210, 205, 200, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([24, 18]);
    const rMid1 = this.worldToScreen(0, (roadY1 + roadY2) * 0.5, 0);
    const rMid2 = this.worldToScreen(arenaW, (roadY1 + roadY2) * 0.5, 0);
    ctx.beginPath(); ctx.moveTo(rMid1.x, rMid1.y); ctx.lineTo(rMid2.x, rMid2.y); ctx.stroke();
    ctx.setLineDash([]);

    // 3) Allée Centrale Pavée d'Anjanahary (OSM Way 45980202)
    // Slices from North Gate at y=270 down south to y=2080
    const acX1 = 1040, acX2 = 1170;
    const ac1 = this.worldToScreen(acX1, 270, 0);
    const ac2 = this.worldToScreen(acX2, 270, 0);
    const ac3 = this.worldToScreen(acX2 + 80, 2080, 0);
    const ac4 = this.worldToScreen(acX1 + 80, 2080, 0);

    // Weathered Granite Cobblestone surface
    ctx.fillStyle = '#26202c';
    ctx.beginPath();
    ctx.moveTo(ac1.x, ac1.y); ctx.lineTo(ac2.x, ac2.y); ctx.lineTo(ac3.x, ac3.y); ctx.lineTo(ac4.x, ac4.y);
    ctx.closePath(); ctx.fill();

    // Cobblestone curbstones / lateral stone curbs
    ctx.strokeStyle = '#3e3448';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ac1.x, ac1.y); ctx.lineTo(ac4.x, ac4.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ac2.x, ac2.y); ctx.lineTo(ac3.x, ac3.y); ctx.stroke();

    // Transverse cobblestone joint courses along the avenue
    ctx.strokeStyle = 'rgba(32, 24, 38, 0.45)';
    ctx.lineWidth = 1.2;
    for (let cy = 300; cy < 2060; cy += 32) {
      const frac = (cy - 270) / (2080 - 270);
      const curX1 = acX1 + 80 * frac;
      const curX2 = acX2 + 80 * frac;
      const cp1 = this.worldToScreen(curX1, cy, 0);
      const cp2 = this.worldToScreen(curX2, cy, 0);
      ctx.beginPath(); ctx.moveTo(cp1.x, cp1.y); ctx.lineTo(cp2.x, cp2.y); ctx.stroke();
    }

    // 4) Allée du Carré Militaire (Cross Avenue linking Allée Centrale to Carré Militaire)
    const cmY1 = 880, cmY2 = 960;
    const cma1 = this.worldToScreen(acX2, cmY1, 0);
    const cma2 = this.worldToScreen(1920, cmY1, 0);
    const cma3 = this.worldToScreen(1920, cmY2, 0);
    const cma4 = this.worldToScreen(acX2, cmY2, 0);

    ctx.fillStyle = '#231d27';
    ctx.beginPath();
    ctx.moveTo(cma1.x, cma1.y); ctx.lineTo(cma2.x, cma2.y); ctx.lineTo(cma3.x, cma3.y); ctx.lineTo(cma4.x, cma4.y);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = '#382f40';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cma1.x, cma1.y); ctx.lineTo(cma2.x, cma2.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cma4.x, cma4.y); ctx.lineTo(cma3.x, cma3.y); ctx.stroke();

    // 5) Carré Militaire Sector Clearing (Lots 38, 38bis, 39)
    // Crushed pale gravel / limestone military court
    const mp1 = this.worldToScreen(1460, 760, 0);
    const mp2 = this.worldToScreen(1900, 760, 0);
    const mp3 = this.worldToScreen(1900, 1080, 0);
    const mp4 = this.worldToScreen(1460, 1080, 0);

    ctx.fillStyle = '#201b24';
    ctx.beginPath();
    ctx.moveTo(mp1.x, mp1.y); ctx.lineTo(mp2.x, mp2.y); ctx.lineTo(mp3.x, mp3.y); ctx.lineTo(mp4.x, mp4.y);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = '#42384a';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Central ceremonial star/roundel on Carré Militaire around Monument
    const mCenter = this.worldToScreen(1680, 920, 0);
    ctx.fillStyle = '#292230';
    ctx.beginPath();
    ctx.ellipse(mCenter.x, mCenter.y, 42, 21, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#5a4c64'; ctx.lineWidth = 1.4; ctx.stroke();

    // 6) Winding Laterite Footpaths ("Elakelan-trano Fasana" - OSM Way 1291650717)
    // Connecting the Merina family vaults in the West sector
    const westPathNodes = [
      { x: acX1, y: 580 },
      { x: 800, y: 620 },
      { x: 580, y: 840 },
      { x: 380, y: 1040 },
      { x: 560, y: 1360 },
      { x: 740, y: 1560 },
      { x: acX1 + 50, y: 1720 },
    ];
    ctx.strokeStyle = 'rgba(48, 22, 16, 0.7)';
    ctx.lineWidth = 32;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < westPathNodes.length; i++) {
      const pt = this.worldToScreen(westPathNodes[i].x, westPathNodes[i].y, 0);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Inner path core (worn down by generations of Famadihana processions)
    ctx.strokeStyle = 'rgba(64, 28, 20, 0.85)';
    ctx.lineWidth = 18;
    ctx.stroke();

    // 7) Fallen Jacaranda Petal Carpets
    // Under each Jacaranda tree across the cemetery
    const jacarandaLocs = [
      { x: 950, y: 840 }, { x: 1260, y: 640 }, { x: 960, y: 1520 }, { x: 1270, y: 1380 },
      { x: 540, y: 600 }, { x: 310, y: 880 }, { x: 630, y: 1180 }, { x: 340, y: 1340 },
      { x: 650, y: 1560 }, { x: 1600, y: 1240 }, { x: 1820, y: 1520 }, { x: 1690, y: 1720 }
    ];
    for (const j of jacarandaLocs) {
      const pos = this.worldToScreen(j.x, j.y, 0);
      if (pos.x < -80 || pos.x > w + 80 || pos.y < -80 || pos.y > h + 80) continue;
      // Soft purple ground halo
      ctx.fillStyle = 'rgba(150, 95, 210, 0.16)';
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 4, 34, 17, 0, 0, TAU);
      ctx.fill();

      // Petal flecks
      ctx.fillStyle = 'rgba(176, 118, 235, 0.45)';
      for (let k = 0; k < 12; k++) {
        const offX = Math.sin(k * 1.9 + j.x) * 26;
        const offY = Math.cos(k * 2.3 + j.y) * 13 + 4;
        ctx.beginPath();
        ctx.ellipse(pos.x + offX, pos.y + offY, 2.2, 1.2, 0.4, 0, TAU);
        ctx.fill();
      }
    }

    // 8) Persistent Blood Decals soaking into laterite earth and cobblestone
    for (const dec of this.decals) {
      const pos = this.worldToScreen(dec.x, dec.y, 0);
      if (pos.x < -60 || pos.x > w + 60 || pos.y < -60 || pos.y > h + 60) continue;
      ctx.fillStyle = dec.color;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, dec.r, dec.r * 0.5, dec.rot, 0, TAU);
      ctx.fill();
    }
  }

  drawRifts(ctx) {
    for (const r of this.rifts) {
      const pos = this.worldToScreen(r.x, r.y, 0);
      const pu = 0.55 + 0.45 * Math.sin(this.t * 1.6 + r.ph);
      const s = getGlow('#54d44a');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 + pu * 0.2;
      ctx.drawImage(s, pos.x - r.r * 2.2, pos.y - r.r * 1.1, r.r * 4.4, r.r * 2.2);

      // Vertical 2.5D dimensional rift tear
      ctx.strokeStyle = '#9dff20';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.quadraticCurveTo(pos.x + Math.sin(this.t * 4 + r.ph) * 6, pos.y - 25, pos.x, pos.y - 50);
      ctx.stroke();

      ctx.restore();
    }
  }

  // ── 2.5D Depth-Sorted Entity Pass ──────────────────────────────────────────
  drawDepthSortedWorld(ctx) {
    const renderables = [];

    // Static urban props
    for (const p of this.props) {
      renderables.push({ type: 'prop', depth: p.x + p.y, obj: p });
    }

    // Portals (dimensional tears)
    for (const po of this.portals) {
      renderables.push({ type: 'portal', depth: po.x + po.y, obj: po });
    }

    // Pickups
    for (const pk of this.pickups) {
      renderables.push({ type: 'pickup', depth: pk.x + pk.y, obj: pk });
    }

    // Enemies (humanoid zombies, vampires, banshees, beasts, colossus)
    for (const e of this.enemies) {
      renderables.push({ type: 'enemy', depth: e.x + e.y, obj: e });
    }

    // Player hunter
    if (this.player && this.state !== 'menu') {
      renderables.push({ type: 'player', depth: this.player.x + this.player.y, obj: this.player });
    }

    // Other Hunters (multiplayer, interpolated at render rate)
    if (this.remotePlayers && this.remotePlayers.size && this.state !== 'menu') {
      for (const [id, rp] of this.remotePlayers) {
        if (rp == null || rp.x === undefined) continue;
        renderables.push({ type: 'remote', depth: rp.x + rp.y, obj: rp, rid: id });
      }
    }

    // Sort ascending by depth (depth = x + y in 2:1 isometric projection)
    renderables.sort((a, b) => a.depth - b.depth);

    // Render back-to-front
    for (const r of renderables) {
      switch (r.type) {
        case 'prop':
          drawProp(ctx, r.obj, this.camX, this.camY, this.w, this.h, this.t);
          break;

        case 'portal':
          this.renderPortal(ctx, r.obj);
          break;

        case 'pickup':
          this.renderPickup(ctx, r.obj);
          break;

        case 'enemy':
          this.renderEnemy(ctx, r.obj);
          break;

        case 'player':
          this.renderPlayer(ctx, r.obj);
          break;

        case 'remote':
          this.renderRemotePlayer(ctx, r.obj, r.rid);
          break;
      }
    }
  }

  renderPortal(ctx, po) {
    const sc = this.worldToScreen(po.x, po.y, 0);
    const k = 1 - po.t / po.total;
    const col = ENEMY_TYPES[po.type].glow;
    const r = 10 + k * 26;

    ctx.save();
    ctx.translate(sc.x, sc.y);
    ctx.globalCompositeOperation = 'lighter';

    // Elliptical ground portal ring in 2.5D
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.4;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.5, this.t * 3, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vertical dimensional vortex column rising into the air
    const vh = 44 * k + 10;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.sin(this.t * 8) * 8, -vh * 0.5, 0, -vh);
    ctx.stroke();

    const s = getGlow(col);
    ctx.globalAlpha = k * 0.6;
    ctx.drawImage(s, -r * 1.5, -vh - r * 0.8, r * 3, r * 1.6);

    ctx.restore();
  }

  renderPickup(ctx, pk) {
    const blink = pk.t < 2 ? (Math.sin(this.t * 16) > 0 ? 1 : 0.25) : 1;
    const bob = Math.sin(pk.ph) * 3;
    const hoverZ = 14 + bob;
    const shadowPos = this.worldToScreen(pk.x, pk.y, 0);
    const floatPos = this.worldToScreen(pk.x, pk.y, hoverZ);

    const col = pk.kind === 'heal' ? '#ff5d76' : pk.kind === 'rapid' ? '#ffd23d'
      : pk.kind === 'spread' ? '#7be9ff' : pk.kind === 'pierce' ? '#9dff20' : '#b06cff';

    ctx.save();

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(shadowPos.x, shadowPos.y, 10, 5, 0, 0, TAU);
    ctx.fill();

    // Floating glyph in 2.5D space
    ctx.translate(floatPos.x, floatPos.y);
    ctx.globalAlpha = blink;

    const s = getGlow(col);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = blink * (0.5 + 0.2 * Math.sin(pk.ph * 2));
    ctx.drawImage(s, -18, -18, 36, 36);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = blink;
    ctx.rotate(pk.ph * 0.6);
    ctx.fillStyle = '#120c1c';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    const r = 9;
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.rotate(-pk.ph * 0.6);

    ctx.fillStyle = col;
    ctx.font = '700 9px Rajdhani, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const glyph = pk.kind === 'heal' ? '+' : pk.kind === 'rapid' ? 'R' : pk.kind === 'spread' ? 'W'
      : pk.kind === 'pierce' ? 'P' : 'S';
    ctx.fillText(glyph, 0, 0.5);

    ctx.restore();
  }

  renderEnemy(ctx, e) {
    const sc = this.worldToScreen(e.x, e.y, 0);

    // Frustum cull
    if (sc.x < -80 || sc.x > this.w + 80 || sc.y < -80 || sc.y > this.h + 80) return;

    ctx.save();
    ctx.translate(sc.x, sc.y);

    const ga = e.type === 'wraith' ? clamp(e.alpha, 0.25, 1) : 1;
    ctx.globalAlpha = ga;

    drawEnemy(ctx, e, this.t);

    // Hit flash
    if (e.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (e.flash / 0.12) * 0.75 * ga;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(0, -18, e.r * 1.1, e.r * 1.5, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;

    // Health bar above character head
    if (e.hp < e.maxHp) {
      const bw = e.r * 2.2;
      const barY = -e.r * 1.8 - 22;
      ctx.fillStyle = 'rgba(8,4,14,0.75)';
      ctx.fillRect(-bw / 2, barY, bw, 3.8);
      ctx.fillStyle = e.def.color;
      ctx.fillRect(-bw / 2, barY, bw * clamp(e.hp / e.maxHp, 0, 1), 3.8);
    }

    ctx.restore();
  }

  renderPlayer(ctx, p) {
    const sc = this.worldToScreen(p.x, p.y, 0);
    ctx.save();
    ctx.translate(sc.x, sc.y);

    drawHunterHuman(ctx, p, this, this.t);

    ctx.restore();
  }

  renderRemotePlayer(ctx, rp, rid) {
    const sc = this.worldToScreen(rp.x, rp.y, 0);
    if (sc.x < -90 || sc.x > this.w + 90 || sc.y < -110 || sc.y > this.h + 90) return;
    const accent = accentForHunter(rid || rp.name);
    const down = rp.alive === false || (rp.hp || 0) <= 0;
    // rehydrate a hunter pose from the interpolated network state
    const fake = {
      x: rp.x, y: rp.y,
      vx: rp.vx || 0, vy: rp.vy || 0,
      ang: rp.ang || 0,
      hp: rp.hp, maxHp: rp.maxHp || 100,
      iframes: rp.iframes || 0,
      dashT: rp.dashT || 0, dashCd: 0,
      flashT: rp.firing ? (((this.t * 24) | 0) % 2 === 0 ? 0.05 : 0) : 0,
      recoil: rp.firing ? 3.2 : 0,
      walkPhase: rp.walkPhase || 0,
      flinch: 0,
      isMoving: !!rp.isMoving,
      moveAng: rp.moveAng || 0,
      buffs: {
        rapid: 0, spread: 0, pierce: 0,
        shield: (rp.buffs && rp.buffs.shield) || 0,
      },
    };
    ctx.save();
    ctx.translate(sc.x, sc.y);
    if (down) ctx.globalAlpha = 0.45;
    else if (rp.stale) ctx.globalAlpha = 0.7;
    drawHunterHuman(ctx, fake, this, this.t, {
      accent,
      name: down ? `${rp.name || 'HUNTER'} · DOWN` : (rp.name || 'HUNTER'),
      hpFrac: clamp((rp.hp || 0) / (rp.maxHp || 100), 0, 1),
      isHost: !!rp.isHost,
    });
    // ally tracer: a short energy streak while the hunter is firing
    if (rp.firing && !down) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const gx = Math.cos(rp.ang || 0), gy = Math.sin(rp.ang || 0);
      const tip = this.worldToScreen(rp.x + gx * 22, rp.y + gy * 22, 22);
      const end = this.worldToScreen(rp.x + gx * 150, rp.y + gy * 150, 22);
      ctx.beginPath();
      ctx.moveTo(tip.x - sc.x, tip.y - sc.y);
      ctx.lineTo(end.x - sc.x, end.y - sc.y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // ── 2.5D Projectiles ──────────────────────────────────────────────────────
  drawProjectiles(ctx) {
    ctx.globalCompositeOperation = 'lighter';

    // Player bullets: high-speed energy tracer rounds with ground shadows
    for (const b of this.bullets) {
      const pos = this.worldToScreen(b.x, b.y, b.z || 22);
      const prev = this.worldToScreen(b.x - b.vx * 0.016, b.y - b.vy * 0.016, b.z || 22);

      // Tracer
      ctx.strokeStyle = '#c8ff7a';
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(prev.x, prev.y);
      ctx.stroke();

      // Tracer ground shadow
      const sPos = this.worldToScreen(b.x, b.y, 0);
      const sPrev = this.worldToScreen(b.x - b.vx * 0.016, b.y - b.vy * 0.016, 0);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sPos.x, sPos.y);
      ctx.lineTo(sPrev.x, sPrev.y);
      ctx.stroke();
    }

    // Enemy bullets: hovering spirit orbs with ground shadow
    const s = getGlow('#b06cff');
    for (const b of this.ebullets) {
      const pos = this.worldToScreen(b.x, b.y, b.z || 18);
      const sPos = this.worldToScreen(b.x, b.y, 0);

      // Shadow
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.ellipse(sPos.x, sPos.y, 6, 3, 0, 0, TAU); ctx.fill();

      // Spirit Orb
      ctx.globalAlpha = 0.88;
      ctx.drawImage(s, pos.x - 14, pos.y - 14, 28, 28);
      ctx.fillStyle = '#edd8ff';
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 3.5, 0, TAU); ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ── Atmospheric Particles & Embers (Highland Madagascar) ─────────────────
  drawAtmosphere(ctx) {
    const { w, h } = this;

    // Drifting highland mist (Zavona d'Antananarivo)
    const fogSpr = getGlow('#3a2436');
    ctx.globalAlpha = 0.085;
    for (const f of this.fog) {
      ctx.drawImage(fogSpr, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
    ctx.globalAlpha = 1;

    // Ambient floating jacaranda petals and laterite red dust motes
    ctx.globalCompositeOperation = 'lighter';
    for (const em of this.embers) {
      const x = em.x * w, y = em.y * h;
      ctx.globalAlpha = em.a * (0.6 + 0.4 * Math.sin(this.t * 3 + em.drift));
      ctx.fillStyle = em.col || '#ff9d3d';
      ctx.fillRect(x, y, em.s, em.s);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
