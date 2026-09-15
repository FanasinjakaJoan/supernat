#!/usr/bin/env python3
"""SUPERNAT · Real-time Multiplayer WebSocket Server (Anjanahary Necropolis).

FastAPI + WebSockets backend providing:
  - Dynamic room/lobby management (4-letter room codes, up to 4 hunters each)
  - 30 Hz synchronized server tick relaying player states at low latency
  - Host-authoritative world sync (waves / enemies / pickups relayed via host)
  - Ping/pong heartbeats, disconnect handling, host migration, room cleanup
  - Static file serving so the game remains playable directly in the browser

Run:
    pip install -r requirements.txt
    python server.py                  # → http://localhost:8080
    # or:
    uvicorn server:app --host 0.0.0.0 --port 8080

Protocol (JSON over WS /ws):
  Client → Server:
    {"t":"hello","name":"HUNTER","room":"AB12","create":false}
    {"t":"state", ...player fields..., "seq":N}
    {"t":"host_snapshot", ...world fields...}
    {"t":"hit","enemy":12,"dmg":24,"crit":false,"ang":1.2,"mult":3}
    {"t":"pickup_take","pickup":7}
    {"t":"kill_credit","to":"<playerId>", ...}
    {"t":"ping","ts":123456789}
    {"t":"leave"}
  Server → Client:
    {"t":"welcome","id":..,"room":..,"isHost":..,"tickHz":30}
    {"t":"player_join"/"player_leave"/"host_changed", ...}
    {"t":"snapshot","players":[...],"world":{...}|null,"ts":..}
    {"t":"hit",...} (forwarded to host only)
    {"t":"kill_credit",...} (forwarded to a single peer)
    {"t":"pong","ts":..,"serverTs":..}
    {"t":"error","msg":..}
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import string
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse

# ── tuning ────────────────────────────────────────────────────────────────────
TICK_HZ = 30
TICK_DT = 1.0 / TICK_HZ
WORLD_EVERY_N_TICKS = 2          # full world snapshot at 15 Hz, players at 30 Hz
MAX_PLAYERS = 4
ROOM_CODE_LEN = 4
ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no I/L/O/0/1 (readable codes)
EMPTY_ROOM_TTL = 60.0            # seconds before an empty room is destroyed
HELLO_TIMEOUT = 12.0             # seconds to send hello after WS accept
MAX_NAME_LEN = 12
HEARTBEAT_TIMEOUT = 25.0         # disconnect if no message at all for this long

ROOT = Path(__file__).resolve().parent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("supernat")


def now_ms() -> int:
    return int(time.time() * 1000)


def short_id() -> str:
    return uuid.uuid4().hex[:8]


def clean_name(raw: Any) -> str:
    s = str(raw or "HUNTER").strip().upper()
    s = "".join(c for c in s if c in (string.ascii_uppercase + string.digits + " _-"))
    s = s.strip() or "HUNTER"
    return s[:MAX_NAME_LEN]


def num(v: Any, default: float = 0.0, lo: float = -1e6, hi: float = 1e6) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if f != f:  # NaN
        return default
    return max(lo, min(hi, f))


# ── room state ────────────────────────────────────────────────────────────────
@dataclass
class Player:
    id: str
    name: str
    ws: WebSocket
    is_host: bool = False
    joined_at: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    ping_ms: Optional[float] = None
    state: Optional[Dict[str, Any]] = None  # latest validated player state


@dataclass
class Room:
    code: str
    players: Dict[str, Player] = field(default_factory=dict)
    host_id: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)
    empty_since: Optional[float] = None
    host_snapshot: Optional[Dict[str, Any]] = None
    host_snapshot_at: float = 0.0
    world_dirty: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    tick_task: Optional[asyncio.Task] = None
    tick_count: int = 0


rooms: Dict[str, Room] = {}
rooms_lock = asyncio.Lock()


def generate_code() -> str:
    for _ in range(100):
        code = "".join(random.choice(ROOM_ALPHABET) for _ in range(ROOM_CODE_LEN))
        if code not in rooms:
            return code
    return uuid.uuid4().hex[:ROOM_CODE_LEN].upper()


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="SUPERNAT Multiplayer", version="1.0.0")


@app.get("/api/health")
async def health() -> JSONResponse:
    async with rooms_lock:
        total_players = sum(len(r.players) for r in rooms.values())
        return JSONResponse({
            "ok": True,
            "game": "supernat",
            "tickHz": TICK_HZ,
            "rooms": len(rooms),
            "players": total_players,
            "maxPlayers": MAX_PLAYERS,
            "ts": now_ms(),
        })


@app.get("/api/rooms")
async def list_rooms() -> JSONResponse:
    async with rooms_lock:
        data = [
            {"room": code, "players": len(r.players), "max": MAX_PLAYERS,
             "wave": (r.host_snapshot or {}).get("wave", 0)}
            for code, r in rooms.items() if r.players
        ]
    return JSONResponse({"rooms": data, "ts": now_ms()})


# ── tick loop (30 Hz synchronized broadcast) ──────────────────────────────────
def sanitize_player_state(pid: str, name: str, is_host: bool, raw: Dict[str, Any]) -> Dict[str, Any]:
    """Validate + clamp an incoming player state (anti-garbage, light anti-cheat)."""
    buffs = raw.get("buffs") or {}
    return {
        "id": pid,
        "name": name,
        "isHost": is_host,
        "x": num(raw.get("x"), 1140, 0, 5000),
        "y": num(raw.get("y"), 920, 0, 5000),
        "vx": num(raw.get("vx"), 0, -3000, 3000),
        "vy": num(raw.get("vy"), 0, -3000, 3000),
        "ang": num(raw.get("ang"), 0, -7, 7),
        "hp": num(raw.get("hp"), 100, 0, 500),
        "maxHp": num(raw.get("maxHp"), 100, 1, 500),
        "dashT": num(raw.get("dashT"), 0, 0, 2),
        "iframes": num(raw.get("iframes"), 0, 0, 10),
        "firing": bool(raw.get("firing")),
        "mult": int(num(raw.get("mult"), 1, 1, 10)),
        "score": int(num(raw.get("score"), 0, 0, 10_000_000)),
        "kills": int(num(raw.get("kills"), 0, 0, 100_000)),
        "walkPhase": num(raw.get("walkPhase"), 0, -1e7, 1e7),
        "moveAng": num(raw.get("moveAng"), 0, -7, 7),
        "isMoving": bool(raw.get("isMoving")),
        "alive": bool(raw.get("alive", True)),
        "seq": int(num(raw.get("seq"), 0, 0, 10_000_000)),
        "buffs": {
            "rapid": num(buffs.get("rapid"), 0, 0, 30),
            "spread": num(buffs.get("spread"), 0, 0, 30),
            "pierce": num(buffs.get("pierce"), 0, 0, 30),
            "shield": num(buffs.get("shield"), 0, 0, 30),
        },
    }


def sanitize_world_snapshot(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Validate the host-authoritative world snapshot (cap sizes for safety)."""
    enemies = []
    for e in (raw.get("enemies") or [])[:80]:
        if not isinstance(e, dict):
            continue
        etype = str(e.get("type", "shambler"))[:16]
        enemies.append({
            "id": int(num(e.get("id"), 0, 0, 100_000)),
            "type": etype,
            "x": num(e.get("x"), 0, -200, 5200),
            "y": num(e.get("y"), 0, -200, 5200),
            "hp": num(e.get("hp"), 1, 0, 100_000),
            "maxHp": num(e.get("maxHp"), 1, 1, 100_000),
            "rot": num(e.get("rot"), 0, -7, 7),
            "state": str(e.get("state", "stalk"))[:12],
            "telegraphed": bool(e.get("telegraphed")),
            "alpha": num(e.get("alpha"), 1, 0, 1),
            "walkPhase": num(e.get("walkPhase"), 0, -1e7, 1e7),
            "vx": num(e.get("vx"), 0, -3000, 3000),
            "vy": num(e.get("vy"), 0, -3000, 3000),
        })
    portals = []
    for p in (raw.get("portals") or [])[:12]:
        if not isinstance(p, dict):
            continue
        portals.append({
            "x": num(p.get("x"), 0, -200, 5200),
            "y": num(p.get("y"), 0, -200, 5200),
            "type": str(p.get("type", "shambler"))[:16],
            "t": num(p.get("t"), 0, 0, 5),
        })
    pickups = []
    for p in (raw.get("pickups") or [])[:40]:
        if not isinstance(p, dict):
            continue
        pickups.append({
            "id": int(num(p.get("id"), 0, 0, 100_000)),
            "kind": str(p.get("kind", "heal"))[:12],
            "x": num(p.get("x"), 0, -200, 5200),
            "y": num(p.get("y"), 0, -200, 5200),
            "t": num(p.get("t"), 0, 0, 30),
        })
    ebullets = []
    for b in (raw.get("ebullets") or [])[:60]:
        if not isinstance(b, dict):
            continue
        ebullets.append({
            "x": num(b.get("x"), 0, -400, 5400),
            "y": num(b.get("y"), 0, -400, 5400),
            "vx": num(b.get("vx"), 0, -2000, 2000),
            "vy": num(b.get("vy"), 0, -2000, 2000),
        })
    deaths = []
    for d in (raw.get("deaths") or [])[:20]:
        if not isinstance(d, dict):
            continue
        deaths.append({
            "id": int(num(d.get("id"), 0, 0, 100_000)),
            "type": str(d.get("type", "shambler"))[:16],
            "x": num(d.get("x"), 0, -200, 5200),
            "y": num(d.get("y"), 0, -200, 5200),
            "big": bool(d.get("big")),
        })
    return {
        "wave": int(num(raw.get("wave"), 0, 0, 999)),
        "intermission": num(raw.get("intermission"), 0, 0, 30),
        "spawnLeft": int(num(raw.get("spawnLeft"), 0, 0, 500)),
        "running": bool(raw.get("running", True)),
        "enemies": enemies,
        "portals": portals,
        "pickups": pickups,
        "ebullets": ebullets,
        "deaths": deaths,
    }


async def send_safe(ws: WebSocket, payload: Dict[str, Any]) -> bool:
    try:
        await ws.send_text(json.dumps(payload, separators=(",", ":")))
        return True
    except Exception:
        return False


async def broadcast(room: Room, payload: Dict[str, Any], exclude: Optional[str] = None) -> None:
    async with room.lock:
        targets = [p for pid, p in room.players.items() if pid != exclude]
    if not targets:
        return
    text = json.dumps(payload, separators=(",", ":"))
    dead: list[str] = []
    for p in targets:
        try:
            await p.ws.send_text(text)
        except Exception:
            dead.append(p.id)
    if dead:
        await remove_players(room, dead, reason="send-failed")


async def remove_players(room: Room, ids: list[str], reason: str = "leave") -> None:
    """Remove players, migrate host if needed, notify the room."""
    removed: list[Player] = []
    new_host: Optional[Player] = None
    async with room.lock:
        for pid in ids:
            pl = room.players.pop(pid, None)
            if pl:
                removed.append(pl)
        if not removed:
            return
        room.last_active = time.time()
        if not room.players:
            room.empty_since = time.time()
            room.host_id = None
        elif room.host_id in [p.id for p in removed]:
            # host migration → oldest remaining hunter takes over
            nxt = min(room.players.values(), key=lambda p: p.joined_at)
            nxt.is_host = True
            room.host_id = nxt.id
            new_host = nxt
            room.host_snapshot = None  # fresh host will publish a new snapshot
    for pl in removed:
        log.info(f"[{room.code}] ✕ {pl.name} ({pl.id}) left ({reason}) — {len(room.players)} left")
        await broadcast(room, {"t": "player_leave", "id": pl.id, "name": pl.name, "ts": now_ms()})
    if new_host:
        log.info(f"[{room.code}] ♛ host migrated → {new_host.name} ({new_host.id})")
        await broadcast(room, {
            "t": "host_changed", "newHost": new_host.id, "name": new_host.name, "ts": now_ms(),
        })


async def room_tick_loop(room: Room) -> None:
    """30 Hz synchronized broadcast of player states (+ 15 Hz world)."""
    try:
        while True:
            await asyncio.sleep(TICK_DT)
            async with room.lock:
                if not room.players:
                    if room.empty_since and (time.time() - room.empty_since) > EMPTY_ROOM_TTL:
                        break
                    continue
                room.tick_count += 1
                include_world = (
                    room.host_snapshot is not None
                    and (room.world_dirty or room.tick_count % WORLD_EVERY_N_TICKS == 0)
                )
                if include_world:
                    room.world_dirty = False
                players_out = []
                for p in room.players.values():
                    if p.state:
                        s = dict(p.state)
                        s["isHost"] = (p.id == room.host_id)
                        players_out.append(s)
                    else:
                        players_out.append({
                            "id": p.id, "name": p.name,
                            "isHost": (p.id == room.host_id),
                            "alive": False, "pending": True,
                        })
                snapshot = {
                    "t": "snapshot",
                    "ts": now_ms(),
                    "room": room.code,
                    "host": room.host_id,
                    "count": len(room.players),
                    "players": players_out,
                    "world": room.host_snapshot if include_world else None,
                }
                targets = list(room.players.values())
            text = json.dumps(snapshot, separators=(",", ":"))
            dead: list[str] = []
            for p in targets:
                try:
                    await p.ws.send_text(text)
                except Exception:
                    dead.append(p.id)
            if dead:
                await remove_players(room, dead, reason="tick-send-failed")
    except asyncio.CancelledError:
        pass
    finally:
        async with rooms_lock:
            if rooms.get(room.code) is room and not room.players:
                rooms.pop(room.code, None)
                log.info(f"[{room.code}] room destroyed (empty)")


# ── websocket endpoint ────────────────────────────────────────────────────────
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    room: Optional[Room] = None
    player: Optional[Player] = None
    try:
        # ── hello handshake ──
        try:
            raw = await asyncio.wait_for(ws.receive_text(), timeout=HELLO_TIMEOUT)
        except asyncio.TimeoutError:
            await send_safe(ws, {"t": "error", "msg": "hello timeout"})
            await ws.close(code=4408)
            return
        try:
            hello = json.loads(raw)
        except json.JSONDecodeError:
            await send_safe(ws, {"t": "error", "msg": "bad hello"})
            await ws.close(code=4400)
            return
        if not isinstance(hello, dict) or hello.get("t") != "hello":
            await send_safe(ws, {"t": "error", "msg": "expected hello"})
            await ws.close(code=4400)
            return

        name = clean_name(hello.get("name"))
        want_room = str(hello.get("room") or "").strip().upper()
        want_create = bool(hello.get("create")) or not want_room

        async with rooms_lock:
            if want_create:
                code = generate_code()
                room = Room(code=code)
                rooms[code] = room
                room.tick_task = asyncio.create_task(room_tick_loop(room))
                log.info(f"[{code}] room created by {name}")
            else:
                room = rooms.get(want_room)
                if room is None:
                    await send_safe(ws, {"t": "error", "msg": f"room {want_room} not found"})
                    await ws.close(code=4404)
                    return
                if len(room.players) >= MAX_PLAYERS:
                    await send_safe(ws, {"t": "error", "msg": "room full (4/4 hunters)"})
                    await ws.close(code=4403)
                    return
            async with room.lock:
                pid = short_id()
                while pid in room.players:
                    pid = short_id()
                is_host = len(room.players) == 0
                player = Player(id=pid, name=name, ws=ws, is_host=is_host)
                room.players[pid] = player
                if is_host:
                    room.host_id = pid
                room.last_active = time.time()
                room.empty_since = None
                others = [{"id": p.id, "name": p.name, "isHost": p.is_host}
                          for qid, p in room.players.items() if qid != pid]

        await send_safe(ws, {
            "t": "welcome", "id": pid, "room": room.code, "name": name,
            "isHost": is_host, "tickHz": TICK_HZ, "maxPlayers": MAX_PLAYERS,
            "players": others, "serverTs": now_ms(),
        })
        log.info(f"[{room.code}] ➕ {name} ({pid}) joined{' as HOST' if is_host else ''} — {len(room.players)}/{MAX_PLAYERS}")
        await broadcast(room, {
            "t": "player_join", "id": pid, "name": name,
            "isHost": is_host, "count": len(room.players), "ts": now_ms(),
        }, exclude=pid)

        # ── main message loop ──
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=HEARTBEAT_TIMEOUT)
            except asyncio.TimeoutError:
                # heartbeat: ask the client to prove it is alive
                if not await send_safe(ws, {"t": "ping", "serverTs": now_ms()}):
                    break
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(msg, dict):
                continue
            mtype = msg.get("t")
            player.last_seen = time.time()
            room.last_active = time.time()

            if mtype == "state":
                async with room.lock:
                    if player.id in room.players:
                        player.state = sanitize_player_state(player.id, player.name, player.is_host, msg)
            elif mtype == "host_snapshot":
                async with room.lock:
                    if player.id == room.host_id:
                        room.host_snapshot = sanitize_world_snapshot(msg)
                        room.host_snapshot_at = time.time()
                        room.world_dirty = True
            elif mtype == "hit":
                # guest → host: damage claim against an authoritative enemy
                async with room.lock:
                    host = room.players.get(room.host_id or "")
                if host and host.id != player.id:
                    await send_safe(host.ws, {
                        "t": "hit", "from": player.id, "fromName": player.name,
                        "enemy": int(num(msg.get("enemy"), 0, 0, 100_000)),
                        "dmg": num(msg.get("dmg"), 0, 0, 10_000),
                        "crit": bool(msg.get("crit")),
                        "ang": num(msg.get("ang"), 0, -7, 7),
                        "mult": int(num(msg.get("mult"), 1, 1, 10)),
                        "ts": now_ms(),
                    })
            elif mtype == "pickup_take":
                async with room.lock:
                    host = room.players.get(room.host_id or "")
                if host and host.id != player.id:
                    await send_safe(host.ws, {
                        "t": "pickup_take", "from": player.id,
                        "pickup": int(num(msg.get("pickup"), 0, 0, 100_000)),
                        "ts": now_ms(),
                    })
            elif mtype == "kill_credit":
                # host → specific peer: confirmed kill score
                target_id = str(msg.get("to", ""))[:16]
                async with room.lock:
                    target = room.players.get(target_id)
                    is_host = (player.id == room.host_id)
                if is_host and target and target.id != player.id:
                    await send_safe(target.ws, {
                        "t": "kill_credit",
                        "enemy": str(msg.get("enemy", "shambler"))[:16],
                        "base": int(num(msg.get("base"), 0, 0, 100_000)),
                        "x": num(msg.get("x"), 0, -200, 5200),
                        "y": num(msg.get("y"), 0, -200, 5200),
                        "big": bool(msg.get("big")),
                        "netId": int(num(msg.get("netId"), 0, 0, 100_000)),
                        "ts": now_ms(),
                    })
            elif mtype == "ping":
                await send_safe(ws, {"t": "pong", "ts": msg.get("ts"), "serverTs": now_ms()})
            elif mtype == "pong":
                # reply to our heartbeat ping → estimate latency
                try:
                    sent = float(msg.get("ts") or 0)
                    if sent > 0:
                        player.ping_ms = (time.time() * 1000 - sent)
                except (TypeError, ValueError):
                    pass
            elif mtype == "leave":
                break
            # unknown types are ignored
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("ws error")
    finally:
        if room is not None and player is not None:
            try:
                await remove_players(room, [player.id], reason="disconnect")
            except Exception:
                pass
            try:
                await ws.close()
            except Exception:
                pass


# ── static game serving (backwards compatible: play directly in browser) ──────
@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(ROOT / "index.html", media_type="text/html")


@app.get("/{path:path}", include_in_schema=False)
async def static_files(path: str):
    if path.startswith("api/") or path == "ws":
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    target = (ROOT / path).resolve()
    try:
        target.relative_to(ROOT)
    except ValueError:
        return JSONResponse({"detail": "Forbidden"}, status_code=403)
    if target.is_file():
        return FileResponse(target)
    return JSONResponse({"detail": "Not Found"}, status_code=404)


def main() -> None:
    import uvicorn

    port = int(os.environ.get("PORT", "8080"))
    log.info("═" * 60)
    log.info("  SUPERNAT · Anjanahary Necropolis — Multiplayer Server")
    log.info(f"  Play → http://localhost:{port}   ·   WS → ws://localhost:{port}/ws")
    log.info(f"  Tick {TICK_HZ} Hz · {MAX_PLAYERS} hunters/room · rooms expire after {EMPTY_ROOM_TTL:.0f}s empty")
    log.info("═" * 60)
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")


if __name__ == "__main__":
    main()
