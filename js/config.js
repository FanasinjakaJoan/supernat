// ─── SUPERNAT · balance & palette ──────────────────────────────────────────
export const CFG = {
  player: {
    speed: 258,
    radius: 13,
    hp: 100,
    hurtIframes: 0.8,
    dashSpeed: 960,
    dashTime: 0.16,
    dashCooldown: 1.15,
  },
  gun: {
    fireRate: 8,          // shots per second
    damage: 12,
    speed: 700,
    life: 0.85,
    spread: 0.045,        // base inaccuracy (radians)
    critChance: 0.1,
  },
  combo: {
    window: 3.0,          // seconds to keep the chain alive
    killsPerMult: 5,
    maxMult: 10,
  },
  pickup: { chance: 0.13, life: 9 },
  particles: { max: 650 },
  healOnWave: 10,
};

export const PAL = {
  bg: '#0c0913',
  acid: '#9dff20',
  toxic: '#54d44a',
  blood: '#ff2e4d',
  ember: '#ff9d3d',
  ghost: '#7be9ff',
  violet: '#b06cff',
  bone: '#e8e0cf',
};

export const WAVE_FLAVOR = [
  'They smell your blood.',
  'The Rift pulses brighter.',
  'The dead do not tire.',
  'Meridian weeps green tears.',
  'No one is coming.',
  'Dawn is a lie.',
  'The Veil is torn wide open.',
  'Feed the ash.',
];
