p='src/sim/rex.js';s=open(p).read()
def rep(a,b,cnt=1):
    global s
    assert s.count(a)>=1, a[:100]
    s=s.replace(a,b)

rep("import { clamp, lerp, sstep, wrap, expK, Spring, makeRng, bearing } from '../math.js';",
    "import { clamp, lerp, sstep, wrap, expK, Spring, makeRng, bearing } from '../math.js';\nimport { Nav } from './nav.js';")
rep("    this.terrain = terrain;\n    this.rand = makeRng(seed);","    this.terrain = terrain;\n    this.nav = terrain.obstacles ? new Nav(terrain) : null;\n    this.rand = makeRng(seed);")
rep("    this.ws = { side: 0, timer: 4 };","    this.ws = { side: 0, timer: 4 };\n    this.path = null; this.balF = new Spring(0); this.headAcc = new Vector3(); this.thrust = 1;")

# ------------------------------------------------ 1. path following for every travel goal
rep("""      const dx = r.x - this.x, dz = r.z - this.z, dist = Math.hypot(dx, dz);
      const e = dist > 0.8 ? wrap(bearing(dx, dz) - this.psi) : 0;
      const ae = Math.abs(e), d = dist - r.stop;
      r.dist = dist;""","""      const dx = r.x - this.x, dz = r.z - this.z, dist = Math.hypot(dx, dz);
      const st = r.phase === 'travel' && dist > r.stop + 1.5 ? this._steer(r.x, r.z) : { x: r.x, z: r.z, rem: dist };
      const e = dist > 0.8 ? wrap(bearing(st.x - this.x, st.z - this.z) - this.psi) : 0;
      const ae = Math.abs(e), d = Math.max(dist, st.rem) - r.stop;
      r.dist = dist;""")
rep("      const g = this.move, dx = g.x - this.x, dz = g.z - this.z, dist = Math.hypot(dx, dz), e = wrap(bearing(dx, dz) - this.psi), ae = Math.abs(e);",
    "      const g = this.move, st = this._steer(g.x, g.z), dist = Math.hypot(g.x - this.x, g.z - this.z), e = wrap(bearing(st.x - this.x, st.z - this.z) - this.psi), ae = Math.abs(e);")
rep("  // ---------------------------------------------------------------- feet\n","""  /** The point to head for now on the way to (gx, gz): the next corner of a planned route. */
  _steer(gx, gz) {
    if (!this.nav) return { x: gx, z: gz, rem: Math.hypot(gx - this.x, gz - this.z) };
    let P = this.path;
    const moved = P ? Math.hypot(P.gx - gx, P.gz - gz) : 1e9;
    if (!P || moved > 6 || (moved > 1.5 && this.t - P.t > 0.6) || this.t - P.t > 4) {
      P = this.path = { gx, gz, t: this.t, pts: this.nav.plan(this.x, this.z, gx, gz) };
      P.pts[P.pts.length - 1] = { x: gx, z: gz };
    } else { P.pts[P.pts.length - 1] = { x: gx, z: gz }; P.gx = gx; P.gz = gz; }
    while (P.pts.length > 1 && (Math.hypot(P.pts[0].x - this.x, P.pts[0].z - this.z) < 4 || this.nav.clear(this.x, this.z, P.pts[1].x, P.pts[1].z))) P.pts.shift();
    let rem = Math.hypot(P.pts[0].x - this.x, P.pts[0].z - this.z);
    for (let i = 1; i < P.pts.length; i++) rem += Math.hypot(P.pts[i].x - P.pts[i - 1].x, P.pts[i].z - P.pts[i - 1].z);
    return { x: P.pts[0].x, z: P.pts[0].z, rem };
  }

  // ---------------------------------------------------------------- feet
""")
# rock is solid whatever is driving the animal
rep("    const lim = this.terrain.arena + 20, rr = Math.hypot(this.x, this.z);","""    for (const o of this.terrain.obstacles || []) {
      const ddx = this.x - o.x, ddz = this.z - o.z, dd = Math.hypot(ddx, ddz), m = o.r + 1.5;
      if (dd < m) { this.x = o.x + ddx / (dd || 1) * m; this.z = o.z + ddz / (dd || 1) * m; const vn = (Math.sin(this.psiV) * ddx + Math.cos(this.psiV) * ddz) / (dd || 1); if (vn < 0) this.v *= 0.9; }
    }
    const lim = this.terrain.arena + 20, rr = Math.hypot(this.x, this.z);""")

# ------------------------------------------------ 4. force comes from the feet: thrust and turning happen through stance
rep("    const aCmd = clamp((this.freeze ? 3.5 : 2.2) * (vT - this.v), this.freeze ? -4.2 : -3.0, lerp(1.6, 2.7, sstep(5, 9, vT)));\n    this.acc += (aCmd - this.acc) * expK(dt, 0.22);",
    """    // a foot on the ground is the only thing that can push or brake; the trailing foot near push-off pushes hardest
    const [FA, FB] = this.feet, onGround = (FA.planted ? 1 : 0) + (FB.planted ? 1 : 0);
    let push = onGround ? 1 : 0.12;
    if (onGround === 1 && spd > 0.5) { const st = FA.planted ? FA : FB, behind = (st.pos.x - this.x) * Math.sin(this.psi) + (st.pos.z - this.z) * Math.cos(this.psi); push *= 1 + 0.45 * clamp(-behind / 1.2, 0, 1); }
    this.thrust += (push - this.thrust) * expK(dt, 0.06);
    let aCmd = clamp((this.freeze ? 3.5 : 2.2) * (vT - this.v), this.freeze ? -4.2 : -3.0, lerp(1.6, 2.7, sstep(5, 9, vT)));
    aCmd = aCmd * this.thrust - (onGround ? 0 : 0.15 * this.v);
    this.acc += (aCmd - this.acc) * expK(dt, 0.22);""")
rep("    const alCmd = clamp(4 * (omT - this.om), -1.1, 1.1);",
    "    // turning torque also comes through a planted foot; standing still, it pivots on one foot while the other steps round\n    const pivot = onGround === 0 ? 0.15 : onGround === 1 ? 1.25 : spd < 0.3 ? 0.45 : 1;\n    const alCmd = clamp(4 * (omT - this.om), -1.1, 1.1) * pivot;")

# ------------------------------------------------ 5. feet conform to the ground only as far as a foot can, and rest on its high points
rep("      sw.p1.set(tx2, T.height(tx2, tz2), tz2);","""      const ffx = Math.sin(psiMs), ffz = Math.cos(psiMs);
      let gy = T.height(tx2, tz2);
      for (const [a, b] of [[0.75, 0], [-0.3, 0], [0.45, 0.28], [0.45, -0.28]]) gy = Math.max(gy, T.height(tx2 + ffx * a + ffz * b, tz2 + ffz * a - ffx * b) - 0.04);
      sw.p1.set(tx2, gy, tz2);""")
rep("      T.normal(tx2, tz2, sw.n1);","""      T.normal(tx2, tz2, sw.n1);
      sw.n1.lerp(UP, 0.45).normalize();                                   // a foot can only tilt so far: toes and pads take up the rest
      if (sw.n1.y < Math.cos(0.3)) { const hl = Math.hypot(sw.n1.x, sw.n1.z); sw.n1.set(sw.n1.x / hl * Math.sin(0.3), Math.cos(0.3), sw.n1.z / hl * Math.sin(0.3)); }""")

# ------------------------------------------------ 3. balance: keep the whole-body centre of mass over the feet
rep("    this.hc.set(this.x + lx * this.sway.x, this.py.x, this.z + lz * this.sway.x);",
    """    // where the mass is, relative to the hips, along the body: head and neck forward, tail back
    const hp = this.head.pos, hdF = (hp.x - this.x) * fx + (hp.z - this.z) * fz, hdY = hp.y - this.py.x;
    const tl = this.tail[Math.floor(DIM.tailN / 3)].p, tlF = (tl.x - this.x) * fx + (tl.z - this.z) * fz;
    const M = { head: 0.5, neck: 0.35, torso: 4.6, tail: 1.4 }, torsoF = 1.15;
    const comF = (M.head * hdF + M.neck * hdF * 0.6 + M.torso * torsoF + M.tail * tlF) / (M.head + M.neck + M.torso + M.tail);
    // support: under both feet when both are down, under the one foot otherwise
    const sL = (L.pos.x - this.x) * fx + (L.pos.z - this.z) * fz, sR = (R.pos.x - this.x) * fx + (R.pos.z - this.z) * fz;
    const supF = (sL * L.load + sR * R.load) / (L.load + R.load + 1e-3);
    // standing, the hips slide so the mass sits over the feet; moving, momentum carries it and the feet chase it instead
    const balT = clamp((supF - comF) * (1 - sstep(0.4, 1.6, spd)), -0.7, 0.5);
    this.balF.step(balT, 3.2, 1, dt);
    this.comF = comF + this.balF.x; this.supF = supF; this.headMoment = M.head * hdF + M.neck * hdF * 0.6;
    void hdY;
    this.hc.set(this.x + lx * this.sway.x + fx * this.balF.x, this.py.x, this.z + lz * this.sway.x + fz * this.balF.x);""")
# lean into acceleration more, and pitch the trunk down when its front is loaded
rep("const pitchT = 0.55 * Math.atan(slope) - 0.03 * this.acc","const pitchT = 0.55 * Math.atan(slope) - 0.055 * this.acc")

# ------------------------------------------------ 2. a heavy head: torque- and force-limited, slower to lift than to drop, and it pushes back on the body
rep("    const wn = 11, z = 0.85, maxRate = 3.2;\n    h.yawV += (wn * wn * wrap(desYaw - h.yaw) - 2 * z * wn * h.yawV) * dt; h.yawV = clamp(h.yawV, -maxRate, maxRate); h.yaw += h.yawV * dt;\n    h.pitchV += (wn * wn * (desPitch - h.pitch) - 2 * z * wn * h.pitchV) * dt; h.pitchV = clamp(h.pitchV, -maxRate, maxRate); h.pitch += h.pitchV * dt;",
    """    // the skull turns like the heavy thing it is: bounded angular acceleration and rate; a snap is the exception
    const fast = act && act.forced && (act.kind === 'snap' || act.kind === 'shake') ? 1 : 0;
    const wn = lerp(6.5, 13, fast), z = 0.9, maxRate = lerp(1.25, 3.4, fast), maxAcc = lerp(4.2, 20, fast);
    const ay = clamp(wn * wn * wrap(desYaw - h.yaw) - 2 * z * wn * h.yawV, -maxAcc, maxAcc), ap = clamp(wn * wn * (desPitch - h.pitch) - 2 * z * wn * h.pitchV, -maxAcc, maxAcc);
    h.yawV = clamp(h.yawV + ay * dt, -maxRate, maxRate); h.yaw += h.yawV * dt;
    h.pitchV = clamp(h.pitchV + ap * dt, -maxRate * 0.8, maxRate * 0.8); h.pitch += h.pitchV * dt;""")
rep("    const wp = 5.5 * wpBoost;\n    h.vel.x += (wp * wp * (G.x - h.pos.x) - 2 * wp * h.vel.x) * dt;\n    h.vel.y += (wp * wp * (G.y - h.pos.y) - 2 * wp * h.vel.y) * dt;\n    h.vel.z += (wp * wp * (G.z - h.pos.z) - 2 * wp * h.vel.z) * dt;",
    """    // the head is half a tonne on the end of a neck: forces are bounded, lifting is harder than letting it drop,
    // and a head reaching far forward sags under its own weight
    const reach = Math.hypot(G.x - this.nb.x, G.z - this.nb.z);
    G.y -= 0.16 * Math.max(0, reach - 1.25) * (1 - PO.alert);
    const wp = 4.6 * wpBoost, aMax = 6.5 * wpBoost * wpBoost;
    let ax = wp * wp * (G.x - h.pos.x) - 2 * wp * h.vel.x, ayv = wp * wp * (G.y - h.pos.y) - 2 * wp * h.vel.y, az = wp * wp * (G.z - h.pos.z) - 2 * wp * h.vel.z;
    const ah = Math.hypot(ax, az); if (ah > aMax) { ax *= aMax / ah; az *= aMax / ah; }
    ayv = clamp(ayv, -aMax * 1.4, aMax * 0.6);
    h.vel.x += ax * dt; h.vel.y += ayv * dt; h.vel.z += az * dt;
    // reaction: what the neck does to the head, the head does back to the shoulders
    this.headAcc.set(ax, ayv, az);
    const lat = ax * lx + az * lz, lon = ax * fx + az * fz;
    this.twistYaw.v -= 0.012 * lat * dt * 60 * dt; this.chestDip.v += 0.02 * ayv * dt; this.pRoll.v += 0.006 * lat * dt; this.sway.v -= 0.02 * lat * dt; this.balF.v -= 0.025 * lon * dt;""")
# the neck: tail rises to counter a heavy head out front (see-saw about the hips)
rep("      pitch += (k <= 5 ? -0.03 : 0.024) * (1 - 0.7 * mRun) + 0.01 * this.lowness","      pitch += (k <= 5 ? -0.03 : 0.024) * (1 - 0.7 * mRun) + 0.01 * this.lowness + 0.004 * clamp((this.headMoment || 0) - 2.2, -1, 2)")
open(p,'w').write(s); print('ok')
