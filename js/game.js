// ─── SUPERNAT · core engine: state machine, combat, waves, juice ───────────
import { CFG, PAL, WAVE_FLAVOR } from './config.js';
import { TAU, clamp, lerp, rand, chance, pick, dist2, angleTo } from './utils.js';
import { SFX } from './audio.js';
import { Input } from './input.js';
import { ParticleSys, FloatText, getGlow } from './particles.js';
import { ENEMY_TYPES, pickWaveEnemy, updateEnemy, drawEnemy } from './enemies.js';

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
    this.score = 0;
    this.displayScore = 0;
    this.wave = 0;
    this.kills = 0;
    this.runT = 0;
    this.embers = [];
    this.fog = [];
    for (let i = 0; i < 26; i++)
      this.embers.push({ x: Math.random(), y: Math.random(), s: rand(0.6, 2), v: rand(8, 30), drift: rand(TAU), a: rand(0.15, 0.5) });
    for (let i = 0; i < 4; i++)
      this.fog.push({ x: Math.random(), y: Math.random(), vx: rand(-6, 6), vy: rand(-3, 3), r: rand(220, 420) });
    this.resize();
  }

  // ── sizing & pre-rendered backdrop ────────────────────────────────────────
  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, Math.min(this.w, this.h) < 720 ? 1.6 : 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.buildBackground();
    if (this.player) {
      this.player.x = clamp(this.player.x, 20, this.w - 20);
      this.player.y = clamp(this.player.y, 20, this.h - 20);
    }
  }

  buildBackground() {
    const w = this.w, h = this.h, d = this.dpr;
    const bg = document.createElement('canvas');
    bg.width = Math.round(w * d); bg.height = Math.round(h * d);
    const g = bg.getContext('2d');
    g.scale(d, d);
    // asphalt base
    g.fillStyle = PAL.bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const x = rand(w), y = rand(h), r = rand(90, 260);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(26,18,40,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // ruined roads (cross)
    const rx = w * rand(0.34, 0.62), ry = h * rand(0.36, 0.6);
    g.fillStyle = '#131020';
    g.fillRect(rx - 75, 0, 150, h);
    g.fillRect(0, ry - 65, w, 130);
    g.strokeStyle = 'rgba(214,196,120,0.16)'; g.lineWidth = 3; g.setLineDash([26, 34]);
    g.beginPath(); g.moveTo(rx, 0); g.lineTo(rx, h); g.stroke();
    g.beginPath(); g.moveTo(0, ry); g.lineTo(w, ry); g.stroke();
    g.setLineDash([]);
    // cracks
    g.strokeStyle = 'rgba(4,2,8,0.75)'; g.lineWidth = 1.6;
    for (let i = 0; i < 26; i++) {
      let x = rand(w), y = rand(h);
      g.beginPath(); g.moveTo(x, y);
      const segs = 3 + (Math.random() * 4 | 0);
      for (let s = 0; s < segs; s++) { x += rand(-46, 46); y += rand(-46, 46); g.lineTo(x, y); }
      g.stroke();
    }
    // rubble clusters + debris
    for (let i = 0; i < 12; i++) {
      const cx = rand(w), cy = rand(h);
      for (let s = 0; s < 7; s++) {
        const x = cx + rand(-46, 46), y = cy + rand(-36, 36), r = rand(3, 13);
        g.fillStyle = pick(['#1d1826', '#241d31', '#171320', '#2a2233']);
        g.beginPath();
        g.moveTo(x + r, y);
        for (let a = 1; a <= 6; a++) g.lineTo(x + Math.cos(a / 6 * TAU) * r * rand(0.6, 1.1), y + Math.sin(a / 6 * TAU) * r * rand(0.6, 1.1));
        g.fill();
      }
    }
    // scattered bones
    g.strokeStyle = 'rgba(216,207,196,0.34)'; g.lineWidth = 2.4; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const x = rand(w), y = rand(h), a = rand(TAU), l = rand(7, 15);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // old blood smears
    for (let i = 0; i < 7; i++) {
      const x = rand(w), y = rand(h);
      g.fillStyle = 'rgba(96,14,26,0.16)';
      g.beginPath(); g.ellipse(x, y, rand(20, 60), rand(12, 30), rand(TAU), 0, TAU); g.fill();
    }
    // speckle noise
    for (let i = 0; i < 1100; i++) {
      g.fillStyle = chance(0.5) ? 'rgba(160,140,190,0.045)' : 'rgba(0,0,0,0.09)';
      g.fillRect(rand(w), rand(h), rand(1, 2.4), rand(1, 2.4));
    }
    this.bg = bg;

    // decal layer (fresh blood etc.)
    const dec = document.createElement('canvas');
    dec.width = bg.width; dec.height = bg.height;
    this.decals = dec;
    this.decalCtx = dec.getContext('2d');
    this.decalCtx.scale(d, d);
    this.decalCount = 0;

    // rifts: glowing tears where the supernatural seeps through
    this.rifts = [];
    for (let i = 0; i < 3; i++) {
      let x, y, tries = 0;
      do { x = rand(w * 0.12, w * 0.88); y = rand(h * 0.12, h * 0.88); tries++; }
      while (dist2(x, y, w / 2, h / 2) < 160 * 160 && tries < 20);
      this.rifts.push({ x, y, r: rand(26, 40), ph: rand(TAU) });
      g.fillStyle = 'rgba(20,40,12,0.5)';
      g.beginPath(); g.ellipse(x, y, rand(34, 52), rand(20, 30), rand(TAU), 0, TAU); g.fill();
    }

    // cached vignette
    const vg = document.createElement('canvas');
    vg.width = bg.width; vg.height = bg.height;
    const v = vg.getContext('2d');
    v.scale(d, d);
    const grad = v.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(3,1,8,0.62)');
    v.fillStyle = grad; v.fillRect(0, 0, w, h);
    this.vignette = vg;
  }

  bloodDecal(x, y, big) {
    if (this.decalCount > 240) return;
    this.decalCount++;
    const g = this.decalCtx;
    g.save();
    g.translate(x, y); g.rotate(rand(TAU));
    const base = (big ? 26 : 13) * rand(0.75, 1.3);
    g.fillStyle = 'rgba(92,12,24,0.45)';
    g.beginPath(); g.ellipse(0, 0, base, base * rand(0.55, 0.9), 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(56,7,15,0.5)';
    for (let i = 0; i < 6; i++) {
      const a = rand(TAU), dd = rand(base * 0.5, base * 1.9);
      g.beginPath(); g.arc(Math.cos(a) * dd, Math.sin(a) * dd, rand(1, big ? 5 : 3.2), 0, TAU); g.fill();
    }
    g.restore();
  }

  // ── run lifecycle ─────────────────────────────────────────────────────────
  startRun() {
    this.state = 'playing';
    this.score = 0; this.displayScore = 0; this.kills = 0; this.runT = 0;
    this.wave = 0;
    this.mult = 1; this.comboKills = 0; this.comboTimer = 0; this.bestMult = 1;
    this.enemies.length = 0; this.bullets.length = 0; this.ebullets.length = 0;
    this.portals.length = 0; this.pickups.length = 0; this.ghosts.length = 0;
    this.spawnQueue = [];
    this.particles.clear(); this.texts.clear();
    this.decalCtx.save(); this.decalCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.decalCtx.clearRect(0, 0, this.decals.width, this.decals.height);
    this.decalCtx.restore();
    this.decalCount = 0;
    this.timeScale = 1; this.freeze = 0; this.shakeT = 0;
    const P = CFG.player;
    this.player = {
      x: this.w / 2, y: this.h / 2, vx: 0, vy: 0, r: P.radius,
      hp: P.hp, maxHp: P.hp, ang: -Math.PI / 2, iframes: 0,
      dashT: 0, dashCd: 0, dashAng: 0, fireCd: 0, flashT: 0, recoil: 0,
      buffs: { rapid: 0, spread: 0, pierce: 0, shield: 0 },
    };
    this.intermission = 0;
    this.nextWave();
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
      this.texts.add(p.x, p.y - 26, `+${CFG.healOnWave} HP`, '#9dff20', 15);
      this.emit('waveClear', { n: this.wave });
      this.intermission = 2.3;
      SFX.pickup();
    }
  }

  openPortal(type) {
    const m = 40;
    let x, y, tries = 0;
    do {
      const side = (Math.random() * 4) | 0;
      if (side === 0) { x = rand(m, this.w - m); y = -26; }
      else if (side === 1) { x = rand(m, this.w - m); y = this.h + 26; }
      else if (side === 2) { x = -26; y = rand(m, this.h - m); }
      else { x = this.w + 26; y = rand(m, this.h - m); }
      tries++;
    } while (this.player && dist2(x, y, this.player.x, this.player.y) < 150 * 150 && tries < 8);
    x = clamp(x, -30, this.w + 30);
    y = clamp(y, -30, this.h + 30);
    this.portals.push({ x, y, type, t: PORTAL_TIME, total: PORTAL_TIME });
    SFX.portal();
  }

  updatePortals(dt) {
    for (let i = this.portals.length - 1; i >= 0; i--) {
      const po = this.portals[i];
      po.t -= dt;
      if (chance(dt * 24)) {
        const a = rand(TAU), dd = rand(20, 34);
        this.particles.add({
          kind: 'spark', x: po.x + Math.cos(a) * dd, y: po.y + Math.sin(a) * dd,
          vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60,
          life: 0.3, max: 0.3, size: 1.8, color: ENEMY_TYPES[po.type].glow, drag: 0, grav: 0,
        });
      }
      if (po.t <= 0) {
        this.portals.splice(i, 1);
        this.spawnEnemy(po.type, po.x, po.y);
        this.particles.burst(po.x, po.y, ENEMY_TYPES[po.type].glow, 12, 160, 0.4, 2.2);
        this.particles.ring(po.x, po.y, ENEMY_TYPES[po.type].glow, 34, 0.35);
        SFX.spawn();
      }
    }
  }

  spawnEnemy(type, x, y) {
    const def = ENEMY_TYPES[type];
    const hpMul = 1 + (this.wave - 1) * 0.09;
    const e = {
      type, def, x, y,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      r: def.r, speed: def.speed * rand(0.9, 1.15),
      rot: 0, flash: 0, phase: rand(TAU), t: rand(10), alpha: 1,
      touchCd: 0, state: 'stalk', chargeT: rand(0.8, 1.8),
      shootT: rand(1.2, 2.2), telegraphed: false, lockAng: 0,
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
      x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
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
        x: mx, y: my, vx: Math.cos(a) * G.speed, vy: Math.sin(a) * G.speed,
        life: G.life, dmg: G.damage, pierce, hit: null,
      });
    }
    p.flashT = 0.05; p.recoil = 3.4;
    this.shake(1.1, 0.05);
    this.particles.shell(p.x, p.y, p.ang);
    this.particles.burst(p.x + Math.cos(p.ang) * (p.r + 10), p.y + Math.sin(p.ang) * (p.r + 10),
      '#ffd23d', 3, 120, 0.14, 1.6, p.ang, 0.9);
    SFX.shoot();
  }

  damageEnemy(e, dmg, ang, crit) {
    e.hp -= dmg;
    e.flash = 0.12;
    e.x += Math.cos(ang) * 3.4;
    e.y += Math.sin(ang) * 3.4;
    this.particles.burst(e.x, e.y, e.def.color, crit ? 8 : 4, 150, 0.32, 2, ang + Math.PI, 1.6);
    if (crit) this.texts.add(e.x + rand(-8, 8), e.y - e.r - 6, `${dmg | 0}!`, '#ff9d3d', 15);
    if (e.hp <= 0) this.killEnemy(e);
    else if (this._hitSndCd <= 0) { SFX.hit(); this._hitSndCd = 0.045; }
  }

  killEnemy(e) {
    e.dead = true;
    this.kills++;
    // combo chain
    this.comboKills++;
    this.comboTimer = CFG.combo.window;
    if (this.comboKills % CFG.combo.killsPerMult === 0 && this.mult < CFG.combo.maxMult) {
      this.mult++;
      this.bestMult = Math.max(this.bestMult, this.mult);
      this.texts.add(this.player.x, this.player.y - 34, `COMBO x${this.mult}`, '#9dff20', 17);
      SFX.buff();
    }
    const pts = Math.round(e.def.score * this.mult);
    this.score += pts;
    this.texts.add(e.x + rand(-6, 6), e.y - e.r - 4, `+${pts}`, '#c8ff9e', 13);
    // juice
    const big = e.type === 'abomination';
    this.particles.burst(e.x, e.y, e.def.color, big ? 34 : 14, big ? 320 : 210, big ? 0.8 : 0.55, big ? 3.6 : 2.6);
    this.particles.burst(e.x, e.y, '#ffffff', big ? 10 : 4, big ? 260 : 160, 0.3, 1.8);
    this.particles.smoke(e.x, e.y, e.def.color === '#7be9ff' ? 'rgba(123,233,255,0.8)' : 'rgba(120,20,40,0.85)', big ? 10 : 5, 50, 0.9, big ? 16 : 9);
    this.particles.ring(e.x, e.y, e.def.glow, big ? 90 : 44, big ? 0.5 : 0.32);
    this.bloodDecal(e.x, e.y, big || e.type === 'vampire');
    this.freeze = Math.max(this.freeze, big ? 0.07 : 0.034);
    this.shake(big ? 11 : 3.2, big ? 0.4 : 0.14);
    navigator.vibrate && navigator.vibrate(big ? 40 : 12);
    big ? SFX.bigKill() : SFX.kill();
    // the colossus births more dead
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
    const roll = Math.random();
    const kind = roll < 0.32 ? 'heal' : roll < 0.52 ? 'rapid' : roll < 0.72 ? 'spread'
      : roll < 0.86 ? 'pierce' : 'shield';
    this.pickups.push({ x, y, kind, t: CFG.pickup.life, ph: rand(TAU) });
  }

  damagePlayer(dmg, fromX, fromY) {
    if (this.state !== 'playing') return;
    const p = this.player;
    if (p.iframes > 0 || p.dashT > 0) return;
    if (p.buffs.shield > 0) {
      p.buffs.shield = Math.max(0, p.buffs.shield - 1.6);
      this.particles.ring(p.x, p.y, '#7be9ff', 40, 0.3);
      SFX.hit();
      return;
    }
    p.hp -= dmg;
    p.iframes = CFG.player.hurtIframes;
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

    // timers
    p.iframes = Math.max(0, p.iframes - dt);
    p.flashT = Math.max(0, p.flashT - dt);
    p.recoil = lerp(p.recoil, 0, 1 - Math.exp(-14 * dt));
    for (const k in p.buffs) p.buffs[k] = Math.max(0, p.buffs[k] - dt);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0 && this.mult > 1) { this.mult = 1; this.comboKills = 0; }

    if (this.state === 'playing') {
      // ── movement ──
      const mv = Input.moveVector();
      const P = CFG.player;
      const tx = mv.x * P.speed, ty = mv.y * P.speed;
      const k = 1 - Math.exp(-13 * dt);
      p.vx = lerp(p.vx, tx, k);
      p.vy = lerp(p.vy, ty, k);

      // dash
      p.dashCd = Math.max(0, p.dashCd - dt);
      if (Input.dashQueued) {
        Input.dashQueued = false;
        if (p.dashCd <= 0) {
          const a = mv.mag > 0.1 ? Math.atan2(mv.y, mv.x) : p.ang;
          p.dashT = P.dashTime; p.dashCd = P.dashCooldown; p.dashAng = a;
          p.iframes = Math.max(p.iframes, P.dashTime + 0.05);
          this.particles.ring(p.x, p.y, '#9dff20', 30, 0.28);
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
      p.x = clamp(p.x + p.vx * dt, p.r + 6, this.w - p.r - 6);
      p.y = clamp(p.y + p.vy * dt, p.r + 6, this.h - p.r - 6);

      // ── aiming & firing ──
      if (Input.aimStick && Input.aimStick.mag > 0.2) {
        p.ang = Math.atan2(Input.aimStick.vy, Input.aimStick.vx);
      } else {
        p.ang = angleTo(p.x, p.y, Input.mouse.x, Input.mouse.y);
      }
      p.fireCd -= dt;
      if (Input.isFiring() && p.fireCd <= 0) this.fireBullets();
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
      if (b.life <= 0 || b.x < -20 || b.x > this.w + 20 || b.y < -20 || b.y > this.h + 20) {
        this.bullets.splice(i, 1); continue;
      }
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (b.hit === e) continue;
        const rr = e.r + 3;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          const crit = chance(CFG.gun.critChance);
          this.damageEnemy(e, b.dmg * (crit ? 2 : 1), Math.atan2(b.vy, b.vx), crit);
          if (b.pierce > 0) { b.pierce--; b.hit = e; b.dmg *= 0.8; }
          else { this.bullets.splice(i, 1); }
          break;
        }
      }
    }

    // ── enemies ──
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
    // separation (cheap, small n)
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

    // ── enemy bullets ──
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -30 || b.x > this.w + 30 || b.y < -30 || b.y > this.h + 30) {
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
      if (d2 < 74 * 74) { // magnet
        const d = Math.sqrt(d2) || 1;
        pk.x += ((p.x - pk.x) / d) * 300 * dt;
        pk.y += ((p.y - pk.y) / d) * 300 * dt;
      }
      if (d2 < 26 * 26) {
        this.pickups.splice(i, 1);
        this.applyPickup(pk.kind);
      }
    }

    if (this.state === 'playing') this.updateWave(dt);
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
    if (this.freeze > 0) { this.freeze -= rawDt; this.render(); return; }
    let dt = rawDt * this.timeScale;
    if (this.state === 'dying') {
      this.dyingT -= rawDt;
      this.timeScale = lerp(this.timeScale, 0.22, 0.12);
      if (this.dyingT <= 0) { this.timeScale = 1; this.finishRun(); dt = 0; }
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
      em.x += Math.sin(this.t * 0.7 + em.drift) * 0.0002;
      if (em.y < -0.02) { em.y = 1.02; em.x = Math.random(); }
    }
    for (const f of this.fog) {
      f.x += f.vx * rawDt; f.y += f.vy * rawDt;
      if (f.x < -460) f.x = this.w + 440; if (f.x > this.w + 460) f.x = -440;
      if (f.y < -460) f.y = this.h + 440; if (f.y > this.h + 460) f.y = -440;
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  render() {
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, w, h);
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    if (this.decals) ctx.drawImage(this.decals, 0, 0, w, h);

    // screen shake
    let sx = 0, sy = 0, sr = 0;
    if (this.shakeT > 0 && this.shakeMag > 0) {
      const m = this.shakeMag * Math.min(1, this.shakeT * 6);
      sx = rand(-m, m); sy = rand(-m, m); sr = rand(-1, 1) * m * 0.0022;
      this.shakeMag *= Math.pow(0.001, 0.016); // decay
    }
    ctx.save();
    ctx.translate(w / 2 + sx, h / 2 + sy);
    ctx.rotate(sr);
    ctx.translate(-w / 2, -h / 2);

    // rifts pulsing
    for (const r of this.rifts) {
      const pu = 0.55 + 0.45 * Math.sin(this.t * 1.6 + r.ph);
      const s = getGlow('#54d44a');
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16 + pu * 0.16;
      ctx.drawImage(s, r.x - r.r * 2.2, r.y - r.r * 2.2, r.r * 4.4, r.r * 4.4);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    this.drawPickups(ctx);
    this.drawPortals(ctx);
    this.drawEnemies(ctx);
    if (this.player && this.state !== 'menu') this.drawPlayer(ctx);
    this.drawBullets(ctx);
    this.particles.draw(ctx);
    this.texts.draw(ctx);
    ctx.restore();

    // drifting fog
    const fogSpr = getGlow('#3a2d55');
    ctx.globalAlpha = 0.10;
    for (const f of this.fog) ctx.drawImage(fogSpr, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    ctx.globalAlpha = 1;

    // ambient embers
    ctx.globalCompositeOperation = 'lighter';
    for (const em of this.embers) {
      const x = em.x * w, y = em.y * h;
      ctx.globalAlpha = em.a * (0.6 + 0.4 * Math.sin(this.t * 3 + em.drift));
      ctx.fillStyle = '#ff9d3d';
      ctx.fillRect(x, y, em.s, em.s);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, w, h);

    // low-hp heartbeat vignette
    if (this.player && this.state === 'playing' && this.player.hp < 30) {
      const pu = 0.25 + 0.2 * Math.sin(this.t * 6);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.65);
      g.addColorStop(0, 'rgba(255,20,40,0)');
      g.addColorStop(1, `rgba(255,20,40,${pu})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawPortals(ctx) {
    for (const po of this.portals) {
      const k = 1 - po.t / po.total;
      const col = ENEMY_TYPES[po.type].glow;
      const r = 8 + k * 24;
      ctx.save();
      ctx.translate(po.x, po.y);
      ctx.rotate(this.t * 4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.2;
      ctx.setLineDash([9, 7]);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = k * 0.5;
      const s = getGlow(col);
      ctx.drawImage(s, -r * 1.8, -r * 1.8, r * 3.6, r * 3.6);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  drawPickups(ctx) {
    for (const pk of this.pickups) {
      const blink = pk.t < 2 ? (Math.sin(this.t * 16) > 0 ? 1 : 0.25) : 1;
      const bob = Math.sin(pk.ph) * 3;
      const y = pk.y + bob;
      const col = pk.kind === 'heal' ? '#ff5d76' : pk.kind === 'rapid' ? '#ffd23d'
        : pk.kind === 'spread' ? '#7be9ff' : pk.kind === 'pierce' ? '#9dff20' : '#b06cff';
      ctx.save();
      ctx.translate(pk.x, y);
      ctx.globalAlpha = blink;
      const s = getGlow(col);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = blink * (0.5 + 0.2 * Math.sin(pk.ph * 2));
      ctx.drawImage(s, -20, -20, 40, 40);
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
      ctx.globalAlpha = 1;
    }
  }

  drawEnemies(ctx) {
    for (const e of this.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath(); ctx.ellipse(2, e.r * 0.8 + 4, e.r * 0.95, e.r * 0.4, 0, 0, TAU); ctx.fill();
      const ga = e.type === 'wraith' ? clamp(e.alpha, 0.25, 1) : 1;
      ctx.globalAlpha = ga;
      drawEnemy(ctx, e, this.t);
      // hit flash
      if (e.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (e.flash / 0.12) * 0.75 * ga;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, e.r * 1.05, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      // hp bar when hurt
      if (e.hp < e.maxHp) {
        const bw = e.r * 2;
        ctx.fillStyle = 'rgba(8,4,12,0.7)';
        ctx.fillRect(-bw / 2, -e.r - 10, bw, 3.6);
        ctx.fillStyle = e.def.color;
        ctx.fillRect(-bw / 2, -e.r - 10, bw * clamp(e.hp / e.maxHp, 0, 1), 3.6);
      }
      ctx.restore();
    }
  }

  drawBullets(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    // player bullets
    ctx.strokeStyle = '#c8ff7a';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    for (const b of this.bullets) {
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      ctx.stroke();
    }
    // enemy bullets: wailing spirit orbs
    const s = getGlow('#b06cff');
    for (const b of this.ebullets) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(s, b.x - 13, b.y - 13, 26, 26);
      ctx.fillStyle = '#e9d5ff';
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  drawPlayer(ctx) {
    const p = this.player;
    // dash ghosts
    for (const g of this.ghosts) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.ang);
      ctx.globalAlpha = (g.life / 0.26) * 0.3;
      ctx.fillStyle = '#9dff20';
      ctx.beginPath(); ctx.arc(0, 0, p.r * 0.9, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(1, p.r * 0.85 + 4, p.r * 1.05, p.r * 0.42, 0, 0, TAU); ctx.fill();
    // i-frame blink
    if (p.iframes > 0 && Math.sin(this.t * 42) > 0) ctx.globalAlpha = 0.45;

    ctx.save();
    ctx.rotate(p.ang);
    // trailing cloak
    const wav = Math.sin(this.t * 9) * 2 + (Math.hypot(p.vx, p.vy) > 40 ? 3 : 0);
    ctx.fillStyle = '#1d1526';
    ctx.beginPath();
    ctx.moveTo(-2, -p.r * 0.8);
    ctx.quadraticCurveTo(-p.r * 2.1 - wav, 0, -2, p.r * 0.8);
    ctx.closePath(); ctx.fill();
    // gun (recoils)
    const rec = p.recoil;
    ctx.fillStyle = '#0e0b12';
    ctx.fillRect(p.r * 0.2 - rec, -2.6, p.r * 1.35, 5.2);
    ctx.fillStyle = '#9dff20';
    ctx.fillRect(p.r * 1.35 - rec, -1.6, 3.4, 3.2);
    // body
    ctx.fillStyle = '#2b2135';
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(157,255,32,0.35)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.stroke();
    // shoulders
    ctx.fillStyle = '#3a2c4a';
    ctx.beginPath(); ctx.arc(-1, -p.r * 0.72, 4.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-1, p.r * 0.72, 4.6, 0, TAU); ctx.fill();
    // hooded head
    ctx.fillStyle = '#171021';
    ctx.beginPath(); ctx.arc(1.5, 0, p.r * 0.62, 0, TAU); ctx.fill();
    // glowing hunter eyes
    ctx.fillStyle = '#9dff20';
    ctx.beginPath(); ctx.arc(p.r * 0.42, -2.6, 1.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(p.r * 0.42, 2.6, 1.8, 0, TAU); ctx.fill();
    // muzzle flash
    if (p.flashT > 0) {
      const k = p.flashT / 0.05;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      const s = getGlow('#ffd23d');
      const mr = 20 * k + 8;
      ctx.drawImage(s, p.r * 1.55 - mr, -mr, mr * 2, mr * 2);
      ctx.fillStyle = '#fff8d0';
      ctx.beginPath(); ctx.arc(p.r * 1.5, 0, 3.4 * k, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore(); // un-rotate

    // dash cooldown arc
    if (p.dashCd > 0) {
      const frac = 1 - p.dashCd / CFG.player.dashCooldown;
      ctx.strokeStyle = 'rgba(157,255,32,0.55)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 7, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
      ctx.stroke();
    }
    // shield ward
    if (p.buffs.shield > 0) {
      ctx.rotate(this.t * 1.8);
      ctx.strokeStyle = `rgba(123,233,255,${0.5 + 0.3 * Math.sin(this.t * 6)})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(0, 0, p.r + 11, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
