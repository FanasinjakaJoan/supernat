// ─── SUPERNAT · procedural WebAudio SFX (no assets needed) ─────────────────
import { rand } from './utils.js';

class SFXSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._drone = false;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.4;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (!this._drone) this._startDrone();
    } catch (e) { /* audio unavailable — stay silent */ }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.4, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  /** Apocalyptic ambience: detuned low drone + filtered wind noise. */
  _startDrone() {
    this._drone = true;
    const c = this.ctx;
    try {
      const g = c.createGain(); g.gain.value = 0.045;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 170;
      const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 54;
      const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 54.7; o2.detune.value = 8;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.09;
      const lg = c.createGain(); lg.gain.value = 60;
      lfo.connect(lg); lg.connect(f.frequency);
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o1.start(); o2.start(); lfo.start();
      // wind: looping noise through a slow bandpass
      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      let v = 0;
      for (let i = 0; i < len; i++) { v = v * 0.98 + (Math.random() * 2 - 1) * 0.05; d[i] = v * 3; }
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 320; wf.Q.value = 0.6;
      const wg = c.createGain(); wg.gain.value = 0.05;
      src.connect(wf); wf.connect(wg); wg.connect(this.master); src.start();
    } catch (e) { /* ignore */ }
  }

  _ok() { return this.ctx && !this.muted; }

  tone(type, f0, f1, dur, vol = 0.2, delay = 0) {
    if (!this._ok()) return;
    try {
      const c = this.ctx, t = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(1, f0), t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) { /* ignore */ }
  }

  noise(dur = 0.1, { vol = 0.2, f = 1000, slide = 0, type = 'bandpass', q = 1, delay = 0 } = {}) {
    if (!this._ok()) return;
    try {
      const c = this.ctx, t = c.currentTime + delay;
      const len = Math.max(1, (dur * c.sampleRate) | 0);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const flt = c.createBiquadFilter(); flt.type = type; flt.Q.value = q;
      flt.frequency.setValueAtTime(Math.max(20, f), t);
      if (slide) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(flt); flt.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.03);
    } catch (e) { /* ignore */ }
  }

  // ── game sounds ──
  shoot() {
    this.tone('square', rand(560, 660), 170, 0.07, 0.09);
    this.noise(0.035, { vol: 0.05, f: 3400, type: 'highpass' });
  }
  hit() { this.noise(0.05, { vol: 0.1, f: rand(1500, 2100), q: 2 }); }
  kill() {
    this.noise(0.16, { vol: 0.22, f: 900, slide: -720, type: 'lowpass' });
    this.tone('sine', 200, 55, 0.18, 0.22);
  }
  bigKill() {
    this.noise(0.4, { vol: 0.3, f: 600, slide: -520, type: 'lowpass' });
    this.tone('sine', 130, 32, 0.45, 0.3);
    this.tone('square', 90, 40, 0.3, 0.12);
  }
  hurt() {
    this.tone('sawtooth', 300, 70, 0.28, 0.26);
    this.noise(0.2, { vol: 0.16, f: 500, slide: -300, type: 'lowpass' });
  }
  dash() { this.noise(0.16, { vol: 0.12, f: 400, slide: 2600, type: 'bandpass', q: 1.4 }); }
  pickup() { this.tone('sine', 520, 520, 0.07, 0.16); this.tone('sine', 790, 790, 0.11, 0.16, 0.07); }
  buff() { this.tone('triangle', 420, 880, 0.16, 0.16); this.tone('triangle', 630, 1240, 0.18, 0.12, 0.05); }
  portal() { this.tone('sine', 1200, 220, 0.3, 0.06); }
  spawn() { this.noise(0.12, { vol: 0.1, f: 260, slide: 300, type: 'bandpass', q: 3 }); }
  bansheeShot() { this.tone('sine', 880, 1450, 0.22, 0.07); }
  wave() {
    this.tone('triangle', 65, 65, 0.7, 0.28);
    this.tone('triangle', 98, 98, 0.7, 0.2, 0.04);
    this.noise(0.5, { vol: 0.06, f: 200, type: 'lowpass' });
  }
  over() {
    const seq = [220, 185, 147, 110];
    seq.forEach((f, i) => this.tone('triangle', f, f, 0.34, 0.2, i * 0.22));
    this.noise(0.9, { vol: 0.08, f: 300, slide: -220, type: 'lowpass', delay: 0.1 });
  }
  click() { this.tone('square', 900, 700, 0.045, 0.06); }
}

export const SFX = new SFXSys();
