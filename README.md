# SUPERNAT · Cimetière d'Anjanahary & Ampasapito · 2.5D Isometric

An apocalyptic 2.5D isometric survival shooter set in the historical necropolis of
**Anjanahary & Ampasapito** in Antananarivo, Madagascar — zero build step, zero dependencies.
The dimensional Rift has torn open above the 12-hectare Malagasy necropolis. The dead of 66
historical parcels and the fallen of the Carré Militaire have risen from their granite vaults
(*fasana*). You are the last Hunter holding the Great Gate (*Vavahady Lehibe*).

The map geometry and architecture are transformed using real geospatial data scraped from
OpenStreetMap and historical archives of Antananarivo Renivohitra:
- **Làlana Rasoamiaramanana** (Rue Rasoamiaramanana) northern perimeter road connecting Anjanahary to Ampasapito
- **Vavahady Lehibe** (Great North Gate) with red-brick pillars and wrought iron gates
- **Allée Centrale Pavée** (OSM way 45980202) granite cobblestone central avenue lined with Italian Cypress
- **Carré Militaire** (Lots 38, 38bis, 39) with the central Monument aux Morts (*Tsangambato*) and war crosses
- **Faritra Fasana 1-66** multi-tiered granite Merina family crypts (*fasana*) and 1880 *Fasam-bahiny* colonial vaults
- **Terminus Ampasapito** with artisanal tomb stonecutter workshops (*Mpanao Vato Fasana*), Taxi-Be 154 minibus (Mercedes 207D), and Taxi-Ville 4L
- **Highland Madagascar flora** with blooming violet Jacaranda trees, lemon eucalyptus, and fallen petal carpets
- **Malagasy red laterite soil** (*tany mena*) with winding dirt footpaths (*elakelan-trano fasana*)

![theme](https://img.shields.io/badge/theme-madagascar%20supernatural-9dff20)
![perspective](https://img.shields.io/badge/perspective-2.5D%20isometric-b06cff)
![fps](https://img.shields.io/badge/target-60fps-ff2e4d)
![deps](https://img.shields.io/badge/dependencies-zero-9dff20)

## Play

```bash
node server.js          # → http://localhost:8080  (solo, zero dependencies)
# or any static server:  python3 -m http.server 8080
```

Open the printed URL. Works with keyboard + mouse on desktop and twin-stick
touch controls on mobile.

## Multiplayer Co-op (2–4 hunters, real-time)

Hunt the necropolis as a pack. The Python server hosts the game **and** the
WebSocket backend — same URL, no build step, solo play untouched when offline.

```bash
pip install -r requirements.txt
python server.py        # → http://localhost:8080  (game + WS at /ws)
# or:  uvicorn server:app --host 0.0.0.0 --port 8080
```

1. One hunter clicks **＋ CREATE**, shares the 4-letter room code (or COPY LINK).
2. The pack enters the code and clicks **➤ JOIN**, then everyone presses
   **BEGIN THE HUNT** to deploy into the same Anjanahary instance.
3. Downed hunters respawn — the pack survives as long as one hunter stands.

HUD extras while packed: room code, hunter count, ping latency, team score,
and ally vitality chips. Other Hunters render with accent colors, name tags,
and firing tracers.

**Netcode:** 30 Hz server tick relaying player state (pos, aim, dash/i-frames,
HP, combo/score); host-authoritative waves/enemies/pickups (~15 Hz world
snapshots); guest hit-claims with host-confirmed kill credit; 100 ms
interpolation + dead-reckoning for 60 FPS-smooth remotes; ping/pong
heartbeats, host migration, and empty-room cleanup. See `server.py` for the
JSON protocol and `tools/mp_*` for the automated multiplayer test suites.

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

Rift portals tear open and wave after wave of supernatural life pours from the
tombs. Kills feed a **combo multiplier** (up to x10) that decays in 3 seconds,
pickups drop from the fallen (heal, rapid fire, triple shot, piercing rounds,
veil ward), and every fourth wave an **Abomination** arrives — kill it or it
births more dead.

Juice baked in: screen shake, hit-stop, slow-motion death cam, particle bursts,
persistent blood decals, dash ghost trails, muzzle flash, floating combat text,
procedural WebAudio SFX with an ambient drone, and haptics on mobile.

## The Bestiary (Spirits & Legends of Anjanahary)

The in-game bestiary documents each form of supernatural life rising in the cemetery:

- **Shambler** (*Lolo Vokatra*) — the risen dead from the granite vaults
- **Wraith** (*Angatra*) — ancestral restless spirit drifting through stone walls
- **Hellhound** (*Alika Masiaka*) — tomb stalker corrupted by red laterite rift energy
- **Vampire** (*Mpitsentsitra Liana*) — ancient aristocrats of the 1880 Fasam-bahiny
- **Banshee** (*Matotoa*) — wailing spirit screaming spirit shards across the Carré Militaire
- **Abomination** (*Biby Goavana*) — fused colossus walking through gunfire

## Scraped Data & Map Structure

```
data/ampasapito_anjanahary_data.json   scraped OSM vector boundary, nodes, thoroughfares, & sectors
tools/scrape_anjanahary.mjs            data processor / scraper generator
tools/test_anjanahary_map.mjs          automated test suite for map geometry, sectors, and 2.5D rendering
tools/smoke.mjs                        headless engine and simulation tests (solo)
tools/mp_protocol_test.py              WS protocol tests: rooms, 30 Hz tick, relay, migration
tools/mp_netclient_test.mjs            js/net.js end-to-end test against the live server
tools/mp_gameplay_test.mjs             two-game co-op integration test (host + guest)
```

## Tech

Vanilla ES modules + Canvas 2D isometric rendering. Real-time 2:1 isometric coordinate projection,
bidirectional screen-to-world mapping, depth-sorted 2.5D necropolis geometry, articulated human locomotion,
pre-rendered Madagascar ground plane, capped particle counts and a DPR cap keep it at 60 fps on mobile.

```
server.py                   FastAPI + WebSocket backend: rooms, 30 Hz tick, host relay (serves game too)
requirements.txt            fastapi, uvicorn, websockets
js/main.js                  boot + fixed loop
js/game.js                  2.5D state machine, Anjanahary ground renderer, combat, waves, co-op sync
js/net.js                   WebSocket client: interpolation, dead reckoning, ping, host snapshots
js/iso.js                   isometric projection math, camera, 2.5D Malagasy props (fasana, monument, etc.)
js/data/anjanaharyMapData.js real OSM coordinates, thoroughfares, sector classifier, Malagasy lore
js/humanoid.js              realistic human actors & locomotion kinematics (City Z style)
js/enemies.js               bestiary: stats, AI, 2.5D humanoid & creature renderers
js/particles.js             2.5D particles, floating text, glow sprites
js/input.js                 keyboard / mouse / multi-touch twin sticks
js/audio.js                 procedural WebAudio SFX + ambience
js/ui.js                    HUD with dynamic Anjanahary sector indicator, screens, bestiary UI
```

