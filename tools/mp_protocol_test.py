"""SUPERNAT multiplayer protocol test: rooms, 30Hz tick, host relay, migration.

Run:  python server.py &
      python tools/mp_protocol_test.py
"""
import asyncio, json, sys, time, urllib.request

BASE = "http://127.0.0.1:8080"
WS = "ws://127.0.0.1:8080/ws"
fails = []
def ok(cond, label):
    print(("  PASS " if cond else "  FAIL ") + label)
    if not cond: fails.append(label)

async def recv_of(ws, types, timeout=5):
    """Receive until a message of wanted type(s) arrives."""
    if isinstance(types, str): types = {types}
    end = time.time() + timeout
    while time.time() < end:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=end - time.time())
        except asyncio.TimeoutError:
            return None
        m = json.loads(raw)
        if m.get("t") in types: return m
    return None

async def main():
    import websockets
    # ── http ──
    h = json.loads(urllib.request.urlopen(BASE + "/api/health", timeout=5).read())
    ok(h.get("ok") and h.get("tickHz") == 30, f"health ok (tickHz={h.get('tickHz')})")
    html = urllib.request.urlopen(BASE + "/", timeout=5).read().decode()
    ok("SUPERNAT" in html and "mp-panel" in html, "static index serves multiplayer UI")
    js = urllib.request.urlopen(BASE + "/js/net.js", timeout=5).read().decode()
    ok("class NetClient" in js, "static js/net.js served")

    # ── create room (host) ──
    host = await websockets.connect(WS)
    await host.send(json.dumps({"t": "hello", "name": "HOSTY", "create": True}))
    w = await recv_of(host, "welcome")
    ok(w and w.get("isHost") and len(w.get("room", "")) == 4, f"host welcome room={w and w.get('room')}")
    room = w["room"]

    # ── guest joins ──
    guest = await websockets.connect(WS)
    await guest.send(json.dumps({"t": "hello", "name": "GUESTY", "room": room}))
    w2 = await recv_of(guest, "welcome")
    ok(w2 and not w2.get("isHost") and w2.get("room") == room, "guest joined same room")
    jn = await recv_of(host, "player_join")
    ok(jn and jn.get("name") == "GUESTY", "host notified of guest join")

    # ── bad joins ──
    bad = await websockets.connect(WS)
    await bad.send(json.dumps({"t": "hello", "name": "X", "room": "ZZZZ"}))
    err = await recv_of(bad, "error")
    ok(err and "not found" in err.get("msg", ""), "unknown room rejected")
    await bad.close()

    # ── state sync @30Hz ──
    st = {"t": "state", "x": 1140, "y": 920, "vx": 10, "vy": 0, "ang": 1.5,
          "hp": 100, "maxHp": 100, "dashT": 0, "iframes": 0, "firing": True,
          "mult": 3, "score": 500, "kills": 7, "walkPhase": 1.2, "moveAng": 0.1,
          "isMoving": True, "alive": True, "seq": 1,
          "buffs": {"rapid": 5, "spread": 0, "pierce": 0, "shield": 0}}
    await host.send(json.dumps(st)); await host.send(json.dumps(st))
    await guest.send(json.dumps({**st, "x": 1200, "firing": False, "score": 250}))
    t0 = time.time(); snaps = 0; saw_host = saw_world = None
    async def drain(ws, dur):
        global snaps, saw_host
        end = time.time() + dur
        while time.time() < end:
            try: m = json.loads(await asyncio.wait_for(ws.recv(), timeout=0.5))
            except asyncio.TimeoutError: continue
            if m.get("t") == "snapshot":
                snaps += 1
                for p in m.get("players", []):
                    if p.get("name") == "HOSTY" and p.get("score") == 500: saw_host = p
    # host publishes world; guest should receive it
    world = {"t": "host_snapshot", "wave": 3, "intermission": 0, "spawnLeft": 4, "running": True,
             "enemies": [{"id": 1, "type": "shambler", "x": 100, "y": 200, "hp": 30, "maxHp": 30,
                          "rot": 0.5, "state": "stalk", "telegraphed": False, "alpha": 1,
                          "walkPhase": 2.0, "vx": 5, "vy": 6}],
             "portals": [{"x": 1, "y": 2, "type": "wraith", "t": 0.4}],
             "pickups": [{"id": 9, "kind": "heal", "x": 50, "y": 60, "t": 8}],
             "ebullets": [{"x": 1, "y": 1, "vx": 3, "vy": 4}], "deaths": []}
    await host.send(json.dumps(world))
    end = time.time() + 1.5
    while time.time() < end:
        try: m = json.loads(await asyncio.wait_for(guest.recv(), timeout=0.5))
        except asyncio.TimeoutError: continue
        if m.get("t") == "snapshot":
            snaps += 1
            for p in m.get("players", []):
                if p.get("name") == "HOSTY" and p.get("score") == 500 and p.get("firing"): saw_host = p
            if m.get("world") and m["world"].get("wave") == 3: saw_world = m["world"]
    hz = snaps / 1.5
    ok(20 <= hz <= 45, f"snapshot tick ~30Hz (got {hz:.1f}/s)")
    ok(saw_host and saw_host.get("mult") == 3 and abs(saw_host.get("x", 0) - 1140) < 1,
       "guest sees host player state (x, mult, firing)")
    ok(saw_world and len(saw_world.get("enemies", [])) == 1 and saw_world["enemies"][0]["type"] == "shambler",
       "guest receives host world snapshot (wave/enemies)")
    ok(saw_world and len(saw_world.get("pickups", [])) == 1 and len(saw_world.get("ebullets", [])) == 1,
       "world includes pickups + enemy bullets")

    # ── guest hit → host only ──
    await guest.send(json.dumps({"t": "hit", "enemy": 1, "dmg": 24, "crit": True, "ang": 1.1, "mult": 2}))
    hit = await recv_of(host, "hit")
    ok(hit and hit.get("enemy") == 1 and hit.get("dmg") == 24 and hit.get("crit"), "hit claim forwarded to host")
    # guest must NOT receive its own hit back
    try:
        m = json.loads(await asyncio.wait_for(guest.recv(), timeout=0.4))
        ok(m.get("t") != "hit", "hit not echoed to guest")
    except asyncio.TimeoutError:
        ok(True, "hit not echoed to guest")

    # ── host kill_credit → guest ──
    await host.send(json.dumps({"t": "kill_credit", "to": w2["id"], "enemy": "shambler",
                                "base": 10, "x": 100, "y": 200, "big": False, "netId": 1}))
    kc = await recv_of(guest, "kill_credit")
    ok(kc and kc.get("base") == 10 and kc.get("netId") == 1, "kill credit routed to guest")

    # ── pickup_take → host ──
    await guest.send(json.dumps({"t": "pickup_take", "pickup": 9}))
    pt = await recv_of(host, "pickup_take")
    ok(pt and pt.get("pickup") == 9, "pickup_take forwarded to host")

    # ── ping/pong ──
    tping = int(time.time() * 1000)
    await guest.send(json.dumps({"t": "ping", "ts": tping}))
    pong = await recv_of(guest, "pong")
    ok(pong and pong.get("ts") == tping and pong.get("serverTs"), "ping/pong heartbeat")

    # ── room full (5th hunter rejected) ──
    extras = []
    for i in range(2):
        w3 = await websockets.connect(WS)
        await w3.send(json.dumps({"t": "hello", "name": f"E{i}", "room": room}))
        r = await recv_of(w3, ("welcome", "error"))
        ok(r and r.get("t") == "welcome", f"room fills to {3+i}/4")
        extras.append(w3)
    full = await websockets.connect(WS)
    await full.send(json.dumps({"t": "hello", "name": "FULL", "room": room}))
    ferr = await recv_of(full, ("welcome", "error"))
    ok(ferr and ferr.get("t") == "error" and "full" in ferr.get("msg", ""), "5th hunter rejected (room full)")
    await full.close()

    # ── host migration ──
    await host.close()
    hc = await recv_of(guest, "host_changed", timeout=6)
    ok(hc and hc.get("newHost") == w2["id"], "host migration → oldest guest")
    # new host's world now accepted
    await guest.send(json.dumps({**world, "wave": 4}))
    m2 = await recv_of(extras[0], "snapshot", timeout=5)
    # drain until world wave 4 appears
    found = False; end = time.time() + 3
    while time.time() < end and not found:
        m2 = await recv_of(extras[0], "snapshot", timeout=4)
        if m2 and m2.get("world") and m2["world"].get("wave") == 4: found = True
    ok(found, "migrated host publishes world (wave 4)")
    for w3 in extras: await w3.close()
    await guest.close()
    await asyncio.sleep(0.5)
    rooms = json.loads(urllib.request.urlopen(BASE + "/api/rooms", timeout=5).read())
    ok(all(r["room"] != room or r["players"] == 0 for r in rooms.get("rooms", [])),
       "empty room no longer listed with players")

asyncio.run(main())
print("RESULT:", "ALL MULTIPLAYER TESTS PASSED" if not fails else f"{len(fails)} FAILURES")
sys.exit(1 if fails else 0)
