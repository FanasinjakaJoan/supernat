// ─── SUPERNAT · balance, palette, & Anjanahary Madagascar flavor ───────────
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
  bg: '#140a08',        // Malagasy nocturnal red laterite tone
  acid: '#9dff20',
  toxic: '#54d44a',
  blood: '#ff2e4d',
  ember: '#ff9d3d',
  ghost: '#7be9ff',
  violet: '#b06cff',
  bone: '#e8e0cf',
  laterite: '#b8442e',  // Antananarivo red clay
  jacaranda: '#9d68db', // Highland jacaranda flower
  granite: '#6b6375',   // Merina tomb stone
};

export const WAVE_FLAVOR = [
  "Cimetière d'Anjanahary · The dead awaken under the blood moon.",
  "Carré Militaire · The fallen Tirailleurs rise from Lot 38.",
  "Faritra Fasana 66 · Ny Angatra sy ny Lolo vokatra mananika ny tamboho.",
  "Vavahady Lehibe · Hold the Great Gate against the Abomination!",
  "Fasam-bahiny 1880 · Ancient colonial shadows stir in the stone crypts.",
  "Terminus Ampasapito · Red dust rises over the stonecutter workshops.",
  "Alin'ny Fasana · The Kinoly claws through the granite steps.",
  "Tapitra ny andro · Dawn will not reach Anjanahary. Stand firm among the tombs!",
];
