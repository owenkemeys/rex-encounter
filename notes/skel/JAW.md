# Why the Tyrannosaurus jaw is "usually half open"

Read-only investigation. No file under src/ was touched. Measurement script: out/skel/jaw/measure.mjs, raw output out/skel/jaw/result.json (4 scenarios x 2 seeds x 120 s, 120 Hz, scripted player).

## 1. Contributors to PS.JAW (rex.js)
PS.JAW = this.jaw (rex.js:1941), a critically damped spring chasing jawT. _jaw() at rex.js:1565-1576:
  jawT = 0.03 + 0.12*exertion*(0.4+0.6*min(breath,1)) + 0.05*rho + jawExtra
Closing is fast (wn 30, aMax 700), opening slower (wn 11, aMax 45+30*roarEnv). Floor -0.035 rad (teeth meet).

| Contributor | file:line | rad | deg |
|---|---|---|---|
| resting offset (not closed) | rex.js:1566, init 144 | 0.03 | 1.7 |
| breath/exertion "panting" | rex.js:1566 (exertion 592-597, breath 602) | 0 to 0.12 (breath-phase modulated 0.048..0.12 at exertion 1) | 0 to 6.9 |
| rho (head lowered / sniffing / low posture) | rex.js:1566, 1445 | 0 to 0.05 | 0 to 2.9 |
| roar (bellow) | rex.js:1323 | 0.8*roar | up to 46 |
| yawn | 1323 | 0.8 | 46 |
| sniffAir act | 1323 | 0.06 | 3.4 |
| strike / seize / snap | 1324, 1325, 1328 | 1.0 / 1.0 / 1.0 | 57 (brief) |
| strike/seize afterhold | 1324, 1325 | 0.1 / 0.16 | 5.7 / 9.2 (held until act ends) |
| orient act | 1327 | 0.08*env | 4.6 |
| growl act | 1329 | 0.12*env | 6.9 |
| rumble | 1330 | 0 | shut |
| **threat display posture** | **1332** | **0.2*PO.display** (+0.03*PO.agit) | **11.5 (+1.7)** |
| intent.mouth (held item, taste) | 1335; mind.js 1607, 2190, 2199, 2213, 2249 | 0.14-0.5 | 8-29 |
| chewing/tear | 1361 | 0.45 then 0.04 | 26 / 2.3 |
| toss | 1367 | 0.12 | 6.9 |
| startle | 1369 | 0.22*se | 12.6 |
| intent.nose | 1440 | 0.07*max(0,sin) | 0-4 |

Panting drivers: exertion = 0.004*v^2 integrated with 12 s decay (rex.js:592), so steady state is 0.048*v^2 and it saturates at 1.0 at about 4.5 m/s (a jog); also floored at 0.85*fatigue. fatigue (597) is separate and slow (STAM full 50 s, recover 35 s; species/tyrannosaurus.js:29); it only reached 0.19-0.24 in the chases. So "tires quickly" is the short-term exertion, not fatigue. There is no dedicated pant act, no heat term, and no minimum beyond the 0.03 rest. Exertion is not gated by fatigue or by speed history, so a trot sets it.

Display is driven from mind.js: behaviour 'display' (1438-1445: I.display=1, I.agitation=0.9, growl/stomp every ~2.4 s), plus display 0.4-0.8 in stare, guard, backoff, snap/pounce sub-phases (1451, 1456, 1729, 1845, 1929, 2124...). Selection U.display = 0.15 + 0.85*irritation + 0.5*approach + 0.2*arousal whenever the person is seen within 24 m (mind.js:857), duration lognormal ~7 s.

## 2. Measurements (fraction of ticks; 120 s each)
| scenario, seed | <3 deg | 3-10 | 10-20 | >20 | mean deg |
|---|---|---|---|---|---|
| alone, 3 | 78.1% | 21.9% | 0 | 0 | 2.8 |
| alone, 11 | 84.4% | 15.6% | 0 | 0 | 2.7 |
| person standing at 12 m, 3 | 90.1% | 9.3% | 0.5% | 0 | 2.1 |
| person standing at 12 m, 11 | 36.3% | 42.6% | 17.4% | 3.7% | 6.0 |
| person walking about, 3 | 73.9% | 11.3% | 10.5% | 4.3% | 4.5 |
| person walking about, 11 | 85.7% | 5.0% | 5.8% | 3.4% | 4.1 |
| chase, 3 | 64.9% | 33.2% | 1.6% | 0.3% | 3.3 |
| chase, 11 | 78.5% | 19.5% | 1.6% | 0.3% | 3.0 |

Mean by behaviour (deg): roam 1.7-2.8, watch 1.9-2.7, stalk 1.8, search 1.9-2.8, ambush 1.8, listen 1.7, circle 2.4, feign 1.8-2.6, appraise 1.7-1.9, inspect 2.9-4.1, nudge 4.0, sniff 3.6-3.7, prowl 3.8, pounce 6.5-6.8, backoff 9.9, pause (after a chase) 7.0-12.4, bluff 10.7, **display 16.3-27.1**.

Time spent between 8 and 25 degrees (share of all ticks), by contributor:
- stand12 s11: 21.7% = display 20.3% (growl 9.9%, display posture alone 9.1% (the "extra:-" bucket), stomp 2.0%), startle 0.7%.
- walkabout s3: 15.0% = display 13.5% (growl 11.2%, posture 2.9%, stomp 1.0%).
- walkabout s11: 9.0% = bluff 4.4%, display 4.4%.
- chase: 4.3-4.5% = exertion 2.6-3.2% (the 'pause' after the run), strike/startle 1-2%.
- alone s3/s11: 0%.

So with nobody around the animal is closed to within the 1.7 degree rest and sniffing. The half-open look arises when a person is within about 24 m: display and bluff (growl + display posture) hold 8-25 degrees for 5-20% of the time (up to 27 degrees mean inside display), and after a run exertion holds 7-12 degrees during the pause.

Caveat: 2 seeds x 4 scripts; seed 11 at 12 m spent 21% in display, seed 3 spent 0%, so the proportion is seed- and irritation-dependent.

## 3. View side (read only)
- boneMatrices (rexgeo.js:211-213): jaw bone = hinge (JAW_HINGE 0,-0.34,-0.2) rotation about X by PS.JAW, no added offset. Bind pose is built with jaw shut (rexgeo.js:697 comment), so PS.JAW = 0 is the rest/bind shape.
- Lip slit: the mouth gap is cut at half-width max(0.03, cell*0.8) head units (rexgeo.js:1057, ~0.03-0.06 each side), i.e. a thin closed slit, not a gap that holds the jaws apart. Teeth are longer than the slit (upper 0.27, lower 0.18 head units, rexgeo.js ~1030-1040), so they interlock when shut.
- Web sheets (WEBSHEET, rexgeo.js:57, 1105-1131): jaw weight runs 0..1 over the sheet; at jaw 0 they are folded (body.js:42-48, 65: creases smooth out between jaw 0.08 and 0.5 rad), no rest offset. Nothing in body.js adds to jaw angle (body.js:402 only feeds jawU).
- Skin treats 0 rad as closed. The sim's floor is -0.035 rad (teeth meet), and rest target 0.03 rad (1.7 deg) is about a 5 cm parting at the snout tip: visible as a slight lip gap, not "half open". Half open on screen means 10-25 degrees, which is sim-driven.

## 4. Conclusion
(a) mostly. Not (c): nothing in the view leaves a gap. Not (b): the resting floor is 1.7 degrees, harmless apart from slightly parted lips. The half-open look is two behaviours that are on too much and too strongly:
1. Display/bluff posture. 0.2*PO.display (11.5 deg) is added continuously (rex.js:1332), on top of growl (0.12, 6.9 deg) every ~2.4 s; and 'display' is selected whenever the person is within 24 m with only small irritation (mind.js:857, base 0.15).
2. Exertion "panting" saturates at a jog (rex.js:592 steady state 0.048*v^2) and decays over 12 s, so after any run it pants for ~10 s at 3-7 degrees plus the pause bucket 7-12; fatigue is not what drives it.
Minor: growl hold 0.12 rad, rest 0.03.

## Smallest fixes
1. rex.js:1332 `this.jawExtra += 0.2 * PO.display + 0.03 * PO.agit;` -> `0.05 * PO.display + 0.01 * PO.agit` (2.9 deg and 0.6 deg; a display stays a closed-mouth stare except growl/roar acts).
2. rex.js:1329 growl: `0.12 * env` -> `0.07 * env` (4 deg).
3. rex.js:1566 `0.12 * this.exertion` -> `0.07 * Math.max(0, this.exertion - 0.5) * 2` (nothing until the animal is genuinely blown, max 4 deg), and rest `0.03` -> `0.008` (0.5 deg).
4. mind.js:857 `0.15 + 0.85*M.irritation` -> `0.05 + 0.85*M.irritation` (fewer idle displays at range), optional.
5. To make pant visible after real exertion, key it on fatigue: `0.10 * Math.max(0, this.fatigue - 0.3)` (up to 4 deg at 1.0).
