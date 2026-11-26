p='src/rex/body/rex.js';s=open(p).read()
def rep(a,b):
    global s
    assert a in s, a[:100]
    s=s.replace(a,b)

# ---- a) swing: heel lifts first, foot folds up and back, knee drives through, then the foot reaches and plants
rep("""    const w = Math.pow(u, 0.82), e = w * w * (3 - 2 * w);   // quick off the ground, soft onto it""",
"""    // the foot does not travel on an arc: it peels up first, folds and is carried through, then reaches out and plants
    const uh = sstep(0.1, 0.9, u), e = uh * uh * uh * (uh * (uh * 6 - 15) + 10);""")
rep("""    const lift = sw.clr * Math.sin(Math.PI * Math.pow(u, 0.8));""",
"""    const lift = sw.clr * (Math.sin(Math.PI * Math.pow(u, 0.7)) + 0.35 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.6)), 2));""")
rep("""    const prof = u < 0.62 ? -0.95 * Math.sin((Math.PI * u) / 0.62) : 0.22 * Math.sin((Math.PI * (u - 0.62)) / 0.38);""",
"""    // toes: curled down while the foot is carried, lifted to meet the ground at the end
    const prof = u < 0.6 ? -1.25 * Math.sin((Math.PI * u) / 0.6) * (0.75 + 0.25 * this.stalk) : 0.32 * Math.sin((Math.PI * (u - 0.6)) / 0.4);""")
# stalking: a held step when it freezes mid-stride
rep("""    const T = this.terrain, sw = foot.sw, s = foot.s;
    sw.t += dt;""","""    const T = this.terrain, sw = foot.sw, s = foot.s;
    const hold = this.freeze && this.stalk > 0.4 && sw.t / sw.T > 0.18 && sw.t / sw.T < 0.72;      // a foot held in the air
    sw.t += hold ? 0 : dt * (1 - 0.35 * this.stalk * (1 - Math.abs(sw.t / sw.T - 0.5) * 2));""")
rep("clr: lerp(0.3, 0.5, m) + 0.45 * sstep(3, 8, spd) + 0.22 * this.stalk,","clr: lerp(0.3, 0.5, m) + 0.45 * sstep(3, 8, spd) + 0.4 * this.stalk,")
# stalking: step, pause, step
rep("      const dsMin = lerp(lerp(0.26, 0.1, turnK), Math.max(0.02, (dty - 0.5) * 2 * Tstep * 0.6), m);",
    "      if (!this.stalkPause || this.stalkPause.t !== Math.max(A.tLand, B.tLand)) this.stalkPause = { t: Math.max(A.tLand, B.tLand), d: this.rand.range(0.3, 1.3) };\n      const dsMin = Math.max(lerp(lerp(0.26, 0.1, turnK), Math.max(0.02, (dty - 0.5) * 2 * Tstep * 0.6), m), this.stalk > 0.5 ? this.stalkPause.d : 0);")

# ---- b) pelvis turns and rolls with each stride
rep("this.pYaw.step(clamp(-0.055 * (fL - fR), -0.14, 0.14) + 0.03 * wsS, 7, 0.9, dt);","this.pYaw.step(clamp(-0.085 * (fL - fR) * (1 - 0.5 * mRun), -0.18, 0.18) + 0.03 * wsS, 6, 0.85, dt);")
rep("+ 0.055 * (R.load - L.load) * (1 - 0.5 * mRun)","+ 0.075 * (R.load - L.load) * (1 - 0.5 * mRun)")
# ---- c) tail swings against the legs
rep("const yawTot = clamp(0.55 * this.om, -0.5, 0.5) + 0.09 * (L.load - R.load) * m","const yawTot = clamp(0.55 * this.om, -0.5, 0.5) + 0.15 * (L.load - R.load) * m * (1 - 0.4 * sstep(4, 9, spd)) - 0.8 * this.pYaw.x")
# ---- d) a fixated head holds still in space while the body bobs under it
rep("    F.l += (nl - F.l) * expK(dt, 0.45); F.f += (nf - F.f) * expK(dt, 0.25); F.y += (ny - F.y) * expK(dt, 0.22);",
    "    const stab = intent.look && intent.look.lock ? 1 : 0.35 * Math.min(1, spd / 2);\n    F.l += (nl - F.l) * expK(dt, lerp(0.45, 0.9, stab)); F.f += (nf - F.f) * expK(dt, 0.25); F.y += (ny - F.y) * expK(dt, lerp(0.22, 0.6, stab));")

# ---- e/f) smooth curved paths (look-ahead pursuit) and a gaze that runs ahead along the route
rep("""    let rem = Math.hypot(P.pts[0].x - this.x, P.pts[0].z - this.z);
    for (let i = 1; i < P.pts.length; i++) rem += Math.hypot(P.pts[i].x - P.pts[i - 1].x, P.pts[i].z - P.pts[i - 1].z);
    return { x: P.pts[0].x, z: P.pts[0].z, rem };""","""    let rem = Math.hypot(P.pts[0].x - this.x, P.pts[0].z - this.z);
    for (let i = 1; i < P.pts.length; i++) rem += Math.hypot(P.pts[i].x - P.pts[i - 1].x, P.pts[i].z - P.pts[i - 1].z);
    // a point a little way along the route: steering at it rounds every corner into a curve
    const along = (L) => { let px = this.x, pz = this.z; for (const q of P.pts) { const d = Math.hypot(q.x - px, q.z - pz); if (d >= L) return { x: px + (q.x - px) * L / d, z: pz + (q.z - pz) * L / d }; L -= d; px = q.x; pz = q.z; } return { x: px, z: pz }; };
    const spd = Math.abs(this.v), c = along(Math.min(rem, 3.5 + 1.1 * spd));
    this.pathLook = along(Math.min(rem, 6 + 2.2 * spd));
    return { x: c.x, z: c.z, rem };""")
rep("""    } else if (a.kind === 'path') {
      const b = this.psi + clamp(this.om * 1.6, -0.9, 0.9);
      S.set(this.x + Math.sin(b) * 20, this.groundY + 2.4, this.z + Math.cos(b) * 20);""","""    } else if (a.kind === 'path') {
      if (this.pathLook && (this.move || this.reach)) S.set(this.pathLook.x, this.terrain.height(this.pathLook.x, this.pathLook.z) + 1.2, this.pathLook.z);
      else { const b = this.psi + clamp(this.om * 1.6, -0.9, 0.9); S.set(this.x + Math.sin(b) * 20, this.groundY + 2.4, this.z + Math.cos(b) * 20); }""")
open(p,'w').write(s)

# ---- g) pursuit cuts the target off instead of chasing its tail
p='src/rex/brain/mind.js';s=open(p).read()
def rep2(a,b):
    global s
    assert a in s, a[:100]
    s=s.replace(a,b)
rep2("  _snapPoint(a) {","""  /** Where the target will be when it can be reached: aim there, not at where it is now. */
  _intercept(a, speed) {
    const sim = this.sim, dx = a.x - sim.x, dz = a.z - sim.z, d = Math.hypot(dx, dz);
    const t = clamp(d / Math.max(speed, 3), 0, 2.8);
    return { x: a.x + a.vx * t, z: a.z + a.vz * t };
  }

  _snapPoint(a) {""")
rep2("        I.goal = { kind: 'approach', id: b.gen, x: a.x + a.vx * 0.6, z: a.z + a.vz * 0.6, stop: 7.0, quick: true };",
     "        const ip = this._intercept(a, Math.abs(sim.v) + 2); I.goal = { kind: 'approach', id: b.gen, x: ip.x, z: ip.z, stop: 7.0, quick: true };")
rep2("        I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: b.stop, quick: true }; I.pace = 1.3; I.stalk = true; I.noIdle = true;",
     "        const ip = this._intercept(a, 1.3); I.goal = { kind: 'approach', id: b.gen, x: ip.x, z: ip.z, stop: b.stop, quick: true }; I.pace = 1.3; I.stalk = true; I.noIdle = true;")
open(p,'w').write(s)
print('ok')
