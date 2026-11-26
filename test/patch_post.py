p='src/rex/body/rex.js';s=open(p).read()
def rep(a,b):
    global s
    assert s.count(a)>=1, a[:90]
    s=s.replace(a,b)
# breathing: held while it listens or stares, quickened when agitated
rep("    const rate = lerp(0.2, 0.6, this.exertion);","    const PO = this.post || { alert: 0, display: 0, agit: 0, hold: 0 };\n    const rate = lerp(0.2, 0.6, this.exertion) * (1 + 0.9 * PO.agit) * (1 - 0.6 * PO.hold);")
rep("    this.breath = (0.5 - 0.5 * Math.cos(wp * Math.PI * 2)) * (1 + 1.2 * this.exertion);","    this.breath = (0.5 - 0.5 * Math.cos(wp * Math.PI * 2)) * (1 + 1.2 * this.exertion) * (1 - 0.8 * PO.hold) * (1 + 0.5 * PO.agit);")
# posture: display crouches and drops the chest; alert stills the weight shift
rep("const crouch = 0.36 * mRun + 0.5 * this.lowness","const PO = this.post || { alert: 0, display: 0, agit: 0, hold: 0 };\n    const crouch = 0.24 * PO.display + 0.36 * mRun + 0.5 * this.lowness")
rep("- 0.13 * this.lowness - 0.05 * this.stalk + 0.07 * this.roarEnv;","- 0.13 * this.lowness - 0.05 * this.stalk + 0.07 * this.roarEnv - 0.07 * PO.display + 0.04 * PO.alert;")
rep("    const idle = spd < 0.1 && this.vT === 0 && Math.abs(this.omT) < 0.05 && L.planted && R.planted;","    const idle = spd < 0.1 && this.vT === 0 && Math.abs(this.omT) < 0.05 && L.planted && R.planted && !(this.post && this.post.alert > 0.4);")
# head: alert lifts, display lowers and pushes forward
rep("    const yawH = this.psi + this.twistYaw.x + clamp(0.5 * gazeRel, -0.8, 0.8);","""    const PO = this.post || { alert: 0, display: 0, agit: 0, hold: 0 };
    const hfP = hf + 0.38 * PO.display - 0.15 * PO.alert, huP = hu + 0.55 * PO.alert - 0.85 * PO.display;
    const yawH = this.psi + this.twistYaw.x + clamp(0.5 * gazeRel, -0.8, 0.8);""")
rep("    const G = h.goal.set(t5.x + Math.sin(yawH) * hf, t5.y + hu, t5.z + Math.cos(yawH) * hf);","    const G = h.goal.set(t5.x + Math.sin(yawH) * hfP, t5.y + huP, t5.z + Math.cos(yawH) * hfP);")
# gestures that live in the head
rep("    const roar = this.roarEnv; desPitch = lerp(desPitch, Math.min(desPitch + 0.25, 0.45), roar);","""    const roar = this.roarEnv; desPitch = lerp(desPitch, Math.min(desPitch + 0.25, 0.45), roar);
    const gk = act && act.forced ? act.kind : '', gu = act ? act.t / act.dur : 0;
    if (gk === 'snap') { if (gu < 0.3) desPitch += 0.25 * sstep(0, 0.3, gu); }
    if (gk === 'growl') desPitch -= 0.12 * env;""")
rep("act && act.kind === 'sniffAir' ? 0.06 * env : 0.8 * roar * (0.92 + 0.08 * Math.sin(this.t * 37));","""act && act.kind === 'sniffAir' ? 0.06 * env : 0.8 * roar * (0.92 + 0.08 * Math.sin(this.t * 37));
    if (gk === 'snap') this.jawExtra = gu < 0.26 ? 0.55 * sstep(0.05, 0.26, gu) : gu < 0.43 ? 1.0 : gu < 0.47 ? lerp(1.0, -0.03, (gu - 0.43) / 0.04) : 0;
    if (gk === 'growl') this.jawExtra = 0.1 * env + 0.025 * Math.sin(this.t * 41) * env;
    this.jawExtra += 0.2 * PO.display + 0.02 * PO.agit * Math.sin(this.t * 23);
    if (gk === 'tilt') h.tiltT = act.sgn * 0.28 * env;""")
rep("    G.y += 0.3 * roar; G.x += h.f.x * 0.25 * roar; G.z += h.f.z * 0.25 * roar;","""    G.y += 0.3 * roar; G.x += h.f.x * 0.25 * roar; G.z += h.f.z * 0.25 * roar;
    if (gk === 'huff') { const k = Math.sin(Math.PI * Math.min(1, gu * 2.2)) * (gu < 0.45 ? 1 : 0); G.addScaledVector(h.f, 0.18 * k); G.y += 0.08 * k; }
    if (gk === 'growl') { G.y -= 0.25 * env; G.addScaledVector(h.f, 0.12 * env); }
    let wpBoost = 1;
    if (gk === 'snap' && act.pt) {
      if (gu < 0.28) { G.addScaledVector(h.f, -0.45 * sstep(0, 0.28, gu)); G.y += 0.25 * sstep(0, 0.28, gu); }
      else if (gu < 0.62) {
        t1.copy(act.pt); t2.subVectors(t1, h.pos); const dd = t2.length(); t2.multiplyScalar(1 / Math.max(dd, 1e-3));
        t3.copy(t1).addScaledVector(t2, -(DIM.headLen - 0.15)); G.copy(t3); wpBoost = 2.3;
      }
    }""")
rep("    const wp = 5.5;\n","    const wp = 5.5 * wpBoost;\n")
rep("    shell(G);\n    const wp","    shell(G);\n    const wp")
# tail: lashes when agitated, held still when alert, raised in display
rep("      + (this.act && this.act.kind === 'tailFlick' ? 0.45 * this.act.sgn * Math.sin((this.act.t / this.act.dur) * Math.PI * 2) : 0);",
    """      + (this.act && this.act.kind === 'tailFlick' ? 0.45 * this.act.sgn * Math.sin((this.act.t / this.act.dur) * Math.PI * 2) : 0)
      + (this.post ? this.post.agit * (0.32 * Math.sin(this.t * 3.1) + 0.14 * Math.sin(this.t * 7.3 + 1.3)) * (0.6 + 0.4 * Math.sin(this.t * 0.37)) : 0);
    const PO = this.post || { alert: 0, display: 0, agit: 0, hold: 0 };""")
rep("      pitch += (k <= 5 ? -0.03 : 0.024) * (1 - 0.7 * mRun) + 0.01 * this.lowness;","      pitch += (k <= 5 ? -0.03 : 0.024) * (1 - 0.7 * mRun) + 0.01 * this.lowness + (k <= 6 ? 0.012 : -0.006) * PO.display;")
rep("      + (0.07 * Math.sin(this.t * 0.37 + 1) + 0.045 * Math.sin(this.t * 0.83)) * (1 - 0.7 * this.stalk)","      + (0.07 * Math.sin(this.t * 0.37 + 1) + 0.045 * Math.sin(this.t * 0.83)) * (1 - 0.7 * this.stalk) * (1 - 0.8 * (this.post ? this.post.alert : 0))")
# stomp: a deliberate heavy footfall
rep("      const intensity = clamp(0.42 + 0.075 * spd, 0, 1.4) * (1 - 0.45 * this.stalk);","      const intensity = clamp(0.42 + 0.075 * spd, 0, 1.4) * (1 - 0.45 * this.stalk) * (this.stompNext ? 2.0 : 1); this.stompNext = 0;")
open(p,'w').write(s); print('ok')
