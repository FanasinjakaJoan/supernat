// ─── SUPERNAT · unified keyboard / mouse / touch input ─────────────────────
const STICK_R = 56; // px radius for virtual sticks

export const Input = {
  keys: new Set(),
  mouse: { x: 640, y: 360, down: false },
  touchMode: false,
  dashQueued: false,
  pauseQueued: false,
  moveStick: null, // {id, ox, oy, vx, vy, mag}
  aimStick: null,

  init(stage, canvas) {
    this.stage = stage;

    addEventListener('keydown', (e) => {
      // never hijack typing in text fields (high-score name entry)
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')
        this.dashQueued = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseQueued = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });

    // ── pointer handling (mouse + multi-touch) ──
    stage.addEventListener('pointerdown', (e) => {
      this.mouse.isScreen = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (e.pointerType === 'touch') {
        this.touchMode = true;
        document.body.classList.add('touch');
        if (e.target && e.target.closest && e.target.closest('[data-ui]')) return;
        e.preventDefault();
        const leftZone = e.clientX < innerWidth * 0.45;
        if (leftZone && !this.moveStick) {
          this.moveStick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, vx: 0, vy: 0, mag: 0 };
        } else if (!this.aimStick) {
          this.aimStick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, vx: 0, vy: 0, mag: 0 };
        }
      } else {
        if (e.target === canvas) this.mouse.down = true;
      }
    });

    addEventListener('pointermove', (e) => {
      this.mouse.isScreen = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this._drag(this.moveStick, e);
      this._drag(this.aimStick, e);
    });

    const release = (e) => {
      if (this.moveStick && e.pointerId === this.moveStick.id) this.moveStick = null;
      if (this.aimStick && e.pointerId === this.aimStick.id) { this.aimStick = null; }
      if (e.pointerType !== 'touch') this.mouse.down = false;
    };
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);

    // iOS pinch / double-tap zoom guards
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  },

  _drag(stick, e) {
    if (!stick || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox;
    let dy = e.clientY - stick.oy;
    const m = Math.hypot(dx, dy);
    const k = Math.min(1, m / STICK_R);
    if (m > 1e-4) { dx /= m; dy /= m; }
    stick.vx = dx * k; stick.vy = dy * k; stick.mag = k;
    stick.cx = stick.ox + dx * Math.min(m, STICK_R);
    stick.cy = stick.oy + dy * Math.min(m, STICK_R);
  },

  /** Movement vector: WASD/arrows or left virtual stick. */
  moveVector() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (this.moveStick && this.moveStick.mag > 0.08) { x = this.moveStick.vx; y = this.moveStick.vy; }
    const mag = Math.min(1, Math.hypot(x, y));
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, mag };
  },

  /** True while the player wants to fire. */
  isFiring() {
    return this.mouse.down || (this.aimStick !== null && this.aimStick.mag > 0.35);
  },
};
