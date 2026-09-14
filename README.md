# SUPERNAT · City of the Fallen

An apocalyptic top-down shooter that runs entirely in the browser — no build
step, no dependencies. The Rift tore open above Meridian City; the dead rose,
old myths took flesh, and you are the last Hunter of the Veil Order.

![theme](https://img.shields.io/badge/theme-apocalyptic%20supernatural-9dff20)
![fps](https://img.shields.io/badge/target-60fps-ff2e4d)
![deps](https://img.shields.io/badge/dependencies-zero-b06cff)

## Play

```bash
node server.js          # → http://localhost:8080
# or any static server:  python3 -m http.server 8080
```

Open the printed URL. Works with keyboard + mouse on desktop and twin-stick
touch controls on mobile.

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Move | `W A S D` / arrows | left thumb stick |
| Aim & fire | mouse + hold `LMB` | right thumb stick |
| Dash (i-frames) | `Shift` / `Space` | `DASH` button |
| Pause | `P` / `Esc` | ❚❚ button |
| Restart | `R` (on pause / game over) | HUNT AGAIN |
| Sound | `M` | ♪ toggle |

## The loop

Rift portals tear open and wave after wave of supernatural life pours into the
streets. Kills feed a **combo multiplier** (up to x10) that decays in 3 seconds,
pickups drop from the fallen (heal, rapid fire, triple shot, piercing rounds,
veil ward), and every fourth wave an **Abomination** arrives — kill it or it
births more dead.

Juice baked in: screen shake, hit-stop, slow-motion death cam, particle bursts,
persistent blood decals, dash ghost trails, muzzle flash, floating combat text,
procedural WebAudio SFX with an ambient drone, and haptics on mobile.

## The Bestiary

The in-game bestiary documents each form of supernatural life:

- **Shambler** — the risen dead
- **Wraith** — restless spirit, phases and drifts
- **Hellhound** — stalks, then charges
- **Vampire** — strafes between bullets
- **Banshee** — screams spirit shards from afar
- **Abomination** — fused colossus, spawns shamblers on death

## High scores

Top 8 runs are stored locally (`localStorage`) with name, score, wave and kill
count — engrave your name on the wall when you fall.

## Tech

Vanilla ES modules + Canvas 2D. Pre-rendered background/decals, pooled glow
sprites, capped particle counts and a DPR cap keep it at 60 fps on mobile.

```
js/main.js      boot + fixed loop
js/game.js      state machine, combat, waves, rendering
js/enemies.js   bestiary: stats, AI, vector-art renderers
js/particles.js particles, floating text, glow sprites
js/input.js     keyboard / mouse / multi-touch twin sticks
js/audio.js     procedural WebAudio SFX + ambience
js/ui.js        HUD, screens, bestiary UI, high scores
tools/smoke.mjs headless simulation test (node tools/smoke.mjs)
```
