p='src/sim/rex.js';s=open(p).read()
def rep(a,b):
    global s
    assert s.count(a)>=1, a[:90]
    s=s.replace(a,b)
i=s.index("  _goal(intent) {"); j=s.index("  // Small unprompted behaviours")
s=s[:i]+"""  _goal(intent) {
    const g = intent.goal;
    this.move = null; this.face = null;
    if (g && (g.kind === 'reach' || g.kind === 'approach')) {
      if (g.id !== this.goalId || !this.reach) {
        this.goalId = g.id;
        this.reach = { x: g.x, z: g.z, y: this.terrain.height(g.x, g.z), phase: g.quick ? 'travel' : 'notice', timer: 0.28, stop: g.kind === 'approach' ? g.stop : DIM.reachStop, probe: g.kind === 'reach', hold: g.hold ?? 4.5 };
        if (g.kind === 'reach') { this.att.kind = 'goal'; this.att.timer = 1.8; this.forceRefix = true; }
        this.reorient = false;
      } else if (this.reach.x !== g.x || this.reach.z !== g.z || (g.kind === 'approach' && this.reach.stop !== g.stop)) {     // the goal itself is moving
        const r = this.reach; r.x = g.x; r.z = g.z; r.y = this.terrain.height(g.x, g.z); r.stop = g.kind === 'approach' ? g.stop : DIM.reachStop;
        const dx = g.x - this.x, dz = g.z - this.z, d = Math.hypot(dx, dz) - r.stop;
        if (r.phase === 'investigate' && (d > 0.9 || d < -1.6 || Math.abs(wrap(bearing(dx, dz) - this.psi)) > 0.45)) r.phase = 'travel';
        if (r.phase === 'investigate') r.timer = Math.max(r.timer, 2);
      }
    } else { this.reach = null; this.goalId = null; }
    if (g && g.kind === 'move') this.move = g;
    if (g && g.kind === 'face') this.face = g;
    this.drive = g && g.kind === 'drive' ? g : null;
    this.freeze = intent.freeze ? 1 : 0;
    // posture requests from whatever is driving the animal, smoothed so nothing snaps
    const P = this.post || (this.post = { alert: 0, display: 0, agit: 0, hold: 0 });
    const k = expK(1 / 120, 0.5);
    P.alert += ((intent.alert || 0) - P.alert) * k; P.display += ((intent.display || 0) - P.display) * k * 0.7;
    P.agit += ((intent.agitation || 0) - P.agit) * k * 0.5; P.hold += ((intent.breathHold || 0) - P.hold) * k;
  }

"""+s[j:]
rep("    if (a) { a.t += dt; if (a.t >= a.dur || (!idle && a.kind !== 'roar')) this.act = null; return; }",
    "    if (a) { a.t += dt; if (a.t >= a.dur || (!idle && !a.forced)) this.act = null; if (this.act && this.act.kind === 'snap') this._snapStep(a); return; }\n    if (intent.noIdle) { this.actTimer = Math.max(this.actTimer, 2); return; }")
rep("const idle = !this.reach && !this.drive && Math.abs(this.v) < 0.1","const idle = !this.reach && !this.drive && !this.move && !this.face && Math.abs(this.v) < 0.1")
rep("""    this.act = { kind: 'roar', t: 0, dur: 2.7, pt: null, sgn: 1 };""","""    this.act = { kind: 'roar', t: 0, dur: 2.7, pt: null, sgn: 1, forced: true };""")
rep("  /** An outside push (m/s added to the body).","""  /** Brain-triggered gestures. Each is just a goal for the same head, jaw, neck and body machinery. */
  gesture(kind, pt) {
    const cur = this.act;
    if (cur && cur.forced && (cur.kind === 'roar' || cur.kind === 'snap') && cur.t < cur.dur * 0.8) return false;
    const dur = { huff: 0.9, growl: 2.4, shake: 1.0, snap: 1.25, tilt: 2.2, stomp: 0.6, sniffAir: 3.2 }[kind];
    this.act = { kind, t: 0, dur, pt: pt ? new Vector3(pt.x, pt.y, pt.z) : null, sgn: this.rand() < 0.5 ? -1 : 1, forced: true };
    if (kind === 'huff' || kind === 'growl' || kind === 'snap') this.events.push({ type: kind, x: this.head.pos.x, y: this.head.pos.y, z: this.head.pos.z });
    if (kind === 'stomp') this.stompNext = 1;
    if (kind === 'sniffAir' && !pt) { const b = this.head.yaw; this.act.pt = new Vector3(this.x + Math.sin(b) * 30, this.groundY + 20, this.z + Math.cos(b) * 30); }
    if (kind === 'sniffAir') this.forceRefix = true;
    return true;
  }

  _snapStep(a) {
    // wind up (head draws back, jaws part), strike (head driven at the target, body lunges), jaws slam, recover
    if (!a.lunged && a.t > 0.32) { a.lunged = true; const dx = a.pt.x - this.x, dz = a.pt.z - this.z, d = Math.hypot(dx, dz) || 1; this.ux += (dx / d) * 2.4; this.uz += (dz / d) * 2.4; this.pPitch.v -= 0.5; }
    if (!a.clacked && a.t > 0.56) { a.clacked = true; this.events.push({ type: 'clack', x: this.head.pos.x, y: this.head.pos.y, z: this.head.pos.z }); }
  }

  /** An outside push (m/s added to the body).""")
rep("""    const S = this.subject;
    if (a.kind === 'player' && player) S.set(player.x, player.y, player.z);""","""    const S = this.subject;
    const look = intent.look;
    if (look && a.kind !== 'brain') { a.kind = 'brain'; this.forceRefix = true; }
    if (look) a.timer = 1;
    else if (a.kind === 'brain') a.timer = 0;
    if (look) S.set(look.x, look.y, look.z);
    else if (a.kind === 'player' && player) S.set(player.x, player.y, player.z);""")
rep("    if (this.act && this.act.pt) S.copy(this.act.pt);","    if (this.act && this.act.pt && this.act.kind !== 'snap') S.copy(this.act.pt);\n    const lock = look && look.lock ? 1 : 0;")
rep("    const thr = a.kind === 'path' ? 0.2 : 0.1;\n    if (this.refr <= 0 && (this.forceRefix || err > thr || (this.hold <= 0 && err > 0.025))) {",
    "    const thr = a.kind === 'path' ? 0.2 : lock ? 0.05 : 0.1;\n    if (this.refr <= 0 && (this.forceRefix || err > thr || (this.hold <= 0 && err > (lock ? 0.012 : 0.025)))) {")
rep("      this.hold = R.range(0.4, 1.5); this.refr = 0.17;","      this.hold = lock ? R.range(1.5, 5) : R.range(0.4, 1.5); this.refr = 0.17;")
rep("      const curious = a.kind === 'player' && dPlayer < 30 && R() < 0.3;","      const curious = (a.kind === 'player' && dPlayer < 30 && R() < 0.3) || (look && look.tilt && R() < 0.5);")
rep("      this.fix.lerp(S, expK(dt, 1.4));","      this.fix.lerp(S, expK(dt, lock ? 0.5 : 1.4));")
rep("    if (!travelling && !this.reach && intent.faceAttention !== false && a.kind === 'player' && player && !(this.act && this.act.pt)) {",
    "    if (!travelling && !this.reach && !this.face && !this.move && intent.faceAttention !== false && (a.kind === 'player' || a.kind === 'brain') && (player || look) && !(this.act && this.act.pt)) {")
rep("""      } else {
        if (ae > 0.3) omT = clamp(1.4 * e, -0.4, 0.4);
        r.timer -= dt;
        if (r.timer <= 0) { this.events.push({ type: 'arrived', id: this.goalId }); this.reach = null; }
      }
    } else if (this.reorient) {""","""      } else {
        if (ae > 0.3) omT = clamp(1.4 * e, -0.4, 0.4);
        r.timer -= dt;
        if (r.timer <= 0 && !r.told) { r.told = true; this.events.push({ type: 'arrived', id: this.goalId }); if (r.probe) this.reach = null; }
      }
    } else if (this.move) {
      const g = this.move, dx = g.x - this.x, dz = g.z - this.z, dist = Math.hypot(dx, dz), e = wrap(bearing(dx, dz) - this.psi), ae = Math.abs(e);
      vT = pace * (1 - sstep(0.6, 1.9, ae)) * (g.last ? Math.min(1, dist / 4) : 1);
      const want = 1.6 * e; omT = clamp(want, -omMax, omMax);
      if (Math.abs(want) > omMax) vT *= lerp(1, 0.62, sstep(1, 3, Math.abs(want) / omMax));
      if (dist < 3.2 && this.lastPassed !== g.id) { this.lastPassed = g.id; this.events.push({ type: 'passed', id: g.id }); }
    } else if (this.face) {
      const g = this.face, e = wrap(bearing(g.x - this.x, g.z - this.z) + (g.offset || 0) - this.psi), ae = Math.abs(e);
      if (ae > (this.facing ? 0.08 : 0.2)) { this.facing = true; omT = clamp(1.3 * e, -0.5, 0.5); } else this.facing = false;
    } else if (this.reorient) {""")
rep("        if (d <= 0.3 && d >= -1.3 && spd < 0.25 && ae < 0.16) { r.phase = 'investigate'; r.timer = 4.5; }",
    "        if (d <= 0.3 && d >= -1.3 && spd < 0.25 && ae < 0.16) { r.phase = 'investigate'; r.timer = r.hold; r.told = false; }")
rep("      const ae = Math.abs(e), d = dist - DIM.reachStop;","      const ae = Math.abs(e), d = dist - r.stop;")
rep("    vT *= 1 - 0.85 * this.roarEnv;","    vT *= 1 - 0.85 * this.roarEnv;\n    if (this.freeze) { vT = 0; omT *= 0.2; }")
rep("const aCmd = clamp(2.2 * (vT - this.v), -3.0,","const aCmd = clamp((this.freeze ? 3.5 : 2.2) * (vT - this.v), this.freeze ? -4.2 : -3.0,")
open(p,'w').write(s)
print('ok')
