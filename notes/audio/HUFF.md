# Rex huff / snort rebuild (notes, in progress)

Backups of originals: out/audio/huff/{audiohybrid.js.orig, audio_pack.py.orig, manifest.json, CREDITS.md}
Harness: test/audio_hybrid.mjs (loadClips + hybridLib). Scratch: out/audio/huff/.

## Status: DONE (nobody has listened to it; everything below is measurement)

## Baseline (current huff, before any change), 6 seeds, out/audio/huff/r_before, measure.py
huff:  attack 13-75 ms (median ~25), peak at 20-80 ms, dur 0.36-0.47 s, rms -23.1 dB, crest 14.2-16.9 dB, centroid 1060-1450 Hz
snort: attack 13-21 ms, dur 0.24-0.30 s, rms -25.2 dB, crest 15.5-17.4 dB, centroid 1130-1500 Hz
growl: rms -9.5 dB, crest 7.3-8.3 dB.  roar: rms -11.7 dB, crest ~5 dB.
Spectrogram huff_1: broadband slab that starts at full level at t=0 and decays exponentially: a percussive burst. Confirms the brief.

## Search log
- Commons API is rate-limited from here ("too many requests"); the HTML Special:Search and category pages work (curl, browser UA).
- OpenGameArt has almost nothing: no horse/bison/hippo/whale exhale. farm-animals (Mudchute) is CC BY-SA: no. pig-sfx-pack is a rubber toy: no.
- Commons audio candidates (licence read from file page):
  - Humpback whale wheezeblow.ogg: NPS Glacier Bay, hydrophone, PD (US gov). 61 s.
  - Bison.ogg: NPS (Wind Cave), PD. 3.8 s "bison call".
  - Yellowstone sound library - Grizzly Bear vocalizations / Eating 001-003: NPS, PD (to check page).
  - Zagzav12 "X sound effect.wav" (hippo, rhino, horse, walrus, buffalo/bison, elephant, moose): CC0 "own work" 2012-14, long compilations.
    Origin cannot be checked (a single uploader's multi-minute "sound effect" compilations of exotic animals); treat as NOT usable unless something proves otherwise.
  - Giraffe snort/bursts (CC BY-SA), Two.european.bison / Various.ungulates (CC BY-SA), Mudchute pig/cow (BY-SA/GFDL), Varecia lemur huffs (GFDL/BY-SA): rejected on licence.
- Commons video candidates (audio track): hippo, rhino sleeping, horses eating/standing, bison wallowing (Flickr id, maybe NPS), Przewalski horse rolling.

## Sources found (archive.org reachable; freesound/pixabay/zapsplat 403 -> not used)
- NPS Yellowstone Sound Library on archive.org, public domain (US gov): nps-yell-sounds-bisoneating "01-Bison-Eating.mp3" 59 s,
  NPS transcript says "[Bison eating grass and snorting]", credit NPS/Jennifer Jerrett 2015. Also nps-yell-sounds-bison-rut.
  Orig page https://www.nps.gov/yell/learn/photosmultimedia/sounds-bisoneating.htm
- Red Library (USC Cinema sound effects collection, transferred and released CC0 by Craig Smith; archive.org items Red_Library_Animals_*,
  licenseurl CC0 1.0). Same uploader/chain as the project's existing camel clips (craigsmith, Freesound 437937). Horse snorts/breathing,
  elephant snort, pig snorts. Provenance caveat: old Hollywood library, released by the person who preserved it; documented on
  blog.freesound.org/?p=1515 and blog.archive.org 2023-05-20. Acceptable by the project's own precedent, but weaker than NPS.
- Rejected: Acoustic Atlas (CC BY-NC-ND), archive "horse-sound-effects" (re-upload of mixkit/bigsoundbank, mislabeled CC0),
  Zagzav12 Commons compilations (origin uncheckable), humpback wheezeblow (hydrophone, blows buried in noise), grizzly eating (river bed + chewing).
Downloads in /tmp/huff_dl/ia (not kept in repo; audio_pack.py refetches).

## Candidate cuts measured (out/audio/huff/cand/measure_events.txt, spectrograms cand/png/, sheet cand/sheet1.png)
Cuts include 80 ms of lead-in, so "attack" is from the real onset. crest/oncrest of raw normalised cuts.
| cut | what | attack ms | dur s | centroid Hz | 150-3k share | verdict |
|---|---|---|---|---|---|---|
| h04_0..2 (R13-04 Horse Snort, 0.86/5.55/10.24 s) | big broadband nostril snort, smooth swell, ~0.8 s | 104-145 | 0.77-0.80 | ~1410 | 0.98 | USE (hsnort_1..3); faint tick ~0.75 s into cut, -15 dB |
| h48_0 (R13-48, 9.42 s) | loud snort with flutter | 38 | 0.95 | 942 | 0.94 | USE (hsnort_4), sharper: snort only |
| h57_0,2,5 (R12-57 Horses Snorting) | fluttering "blow" (nostril flutter ~25 Hz), 0.5 s | 54-57 | 0.49 | 1240-1325 | 0.91 | USE (hblow_1..3) |
| h57_1,3,4,6,7 | same, twin-onset; h57_3 has a click before | 230-320 | 0.6-0.95 | ~1160 | 0.85 | not used |
| el_0, el_1 (R01-33 Elephant Snort) | trunk exhale, deep, smooth | 200-216 | 0.56 | ~800 | 0.91 | USE (elblow_1,2), noisy floor (hiss), lowpass it. Source is a ~6.1 s loop repeated: only ~5 unique breaths |
| el_2,4,7 | weak breaths | 146-222 | 0.49 | ~500 | 0.9 | not used |
| bis_0 (NPS bison eating, 38.9 s) | the only snort the detector finds; low, muddy, grass noise | 157 | 0.54 | 81 | 0.21 | REJECT (would have been the cleanest licence) |
| h54_5, h1404_1, h2358_0, pig_* | whinny / weak / footsteps / squeals | - | - | - | - | REJECT |
Old clips for comparison: the old huff renders had attack 13-75 ms.

## Duplicates found and fixed
Cross-correlating the cuts showed that the library files repeat one breath: R13-04's three snorts are one take (xcorr 0.69-0.87; two independent
breaths give ~0.05), R12-57's 0.58/8.61/16.37 s blows are one take, R12-60 loops every 5.55 s, the elephant file loops every 6.1 s.
Final clips are distinct takes (pairwise xcorr <= 0.15 except elblow_1/2 at 0.37). R12-60 3.15 s (first hsnort_3) had a click: dropped.

## Clips added (test/audio_pack.py, built into dist/audio, manifest 71 -> 80 clips, all old entries byte-identical in manifest)
| clip | source (archive.org item / file, cut s) | what |
|---|---|---|
| hsnort_1 | Red_Library_Animals_Horses_1 / R13-04-Horse Snort, 0.86-1.93 | big broadband snort (hoof tick at 0.75 s: huff() never reads past 0.66 s) |
| hsnort_2 | Red_Library_Animals_Horses_1 / R12-60-Horses Snort and Vocalize, 1.96-2.71 | deep grunt-snort, slightly voiced |
| hsnort_4 | Red_Library_Animals_Horses_2 / R13-48 Loud Snort, 9.42-10.48 | firm snort (snort pool) |
| hblow_1..3 | Red_Library_Animals_Horses_1 / R12-57-Horses Snorting, 0.58-1.29, 13.58-14.35, 4.79-5.39 | fluttering nostril blow |
| hblow_4 | Red_Library_Animals_Horses_4 / R23-49-Horse Breathing, 4.37-5.03 | plain breath |
| elblow_1,2 | Red_Library_Animals_Misc / R01-33-Elephant Snort, 0.90-1.49, 1.68-2.27 | trunk exhale, deep |
Rebuilt hsnort_2 and hblow_4 from a fresh, empty source dir: byte-identical MP3s (recipe reproducible).

## New huff() (src/view/audiohybrid.js)
Recording is the sound. Long huff: one of hsnort_1/2, elblow_1/2, hblow_2/4 at random per seed; pitched down per clip (bright horse snorts 3.5-6.5 st,
deep takes 1-3 st), a 0.4-1.4 st sag over the breath, 0.7-0.95 s of source (x1.25 for elephant); 85% of seeds add a second breath from another
clip 4-7 st lower, lowpassed 900 Hz, gain 0.3-0.45; synth huff only lowpassed at 220 Hz, gain 0.12. Envelope: smoothstep swell over 70-110 ms (x1.4),
hold, release over the last 50-70% of the breath; no saturation (old code had sat 0.6), no exciter. Snort ({short:true}): pool hsnort_4, hblow_1/3/4,
hsnort_1/2, 0.7x the pitch drop, 0.42-0.55 s of source, swell 35-55 ms, faster release, no synth layer, under-layer 50% of seeds.
HYB_NEEDS.huff = ['hsnort_','hblow_','elblow_'] (audio.js loads every manifest clip, so no change there). sniff(): unchanged except its rare closing
snort is guarded by `BREATH().length` (r() call order unchanged). LEVEL.huff 0.07 / LEVEL.snort 0.055 kept (already well below growl/roar, see below).

## Before / after (out/audio/huff/final_measure.txt; 6 seeds each, seed = s*131+31 as test/audio_hybrid.mjs; measure.py)
attack = 10%->90% of 10 ms RMS envelope; rms = loudest 400 ms after 60 Hz HP; crest = peak / that rms.
| voice | attack ms | rms dB | crest dB | centroid Hz | 150-3k share | body s (>10% env) |
|---|---|---|---|---|---|---|
| huff before | 13-75 (median 25) | -23.1 | 14.2-16.9 (med 15.4) | 1060-1450 | 0.68-0.81 | 0.36-0.47 |
| huff after  | 73-234 (median 127) | -23.1 | 9.3-14.0 (med 11.3) | 470-1020 | 0.75-0.98 | 0.39-0.56 |
| snort before | 13-21 (median 15) | -25.2 | 15.5-17.4 (med 16.5) | 1130-1500 | 0.66-0.77 | 0.24-0.30 |
| snort after  | 56-91 (median 85) | -25.2 | 10.8-14.9 (med 13.7) | 500-1100 | 0.81-0.97 | 0.35-0.56 |
| growl | 490-1090 | -9.5 | 7.3-8.3 | 160-190 | | 2.2-2.7 |
| roar  | 110-485 | -11.7 | ~5 | 320-340 | | 2.8-3.5 |
Attack ~5x slower for huff and ~5-6x for snort; crest 3-4 dB lower; huff/snort are 14/16 dB under the growl and 12/14 dB under the roar.
Spectrograms: png_before/, png_after/, sheets sheet_after2.png (shape: swell, body, release; no full-band onset slab).
The fluttering hblow takes keep a ~25 Hz amplitude flutter (that is the horse's nostril), which is why huff_4/6 crest is ~13.5-14 dB.

## Unsure
- Licence chain of the Red Library (CC0 by the person who preserved the USC tapes, not by the original recordists). Same chain as the existing camel clips.
- Elephant-based huffs (seeds 1 and 3 of 6) are deep (centroid ~490 Hz) and have the recording's hiss floor (lowpassed at 2.6 kHz).
- hsnort_2 has a faint voiced component (tonal lines ~200 Hz / ~1 kHz): a grunt-snort; could read as a vocal grunt.
- NOBODY HAS LISTENED. Judged only by numbers and spectrograms.


# SNIFF (follow-on job)
Owner on the published huff: "the huffs work better with the sound and the mist effect, the sniffs dont exactly land though".
Job: sniff() from real inhale recordings (2-4 quick nasal inhales, 120-250 ms, gaps 80-200 ms, optional soft exhale), plus a visual cue of small
inward wisps at the nostrils timed to the inhales (huff/snort burst unchanged). Backups: out/audio/huff/{audiohybrid.js.after_huff, effects.js.orig,
main.js.orig, audio.js.orig, manifest.after_huff.json}.
## Status: DONE (nobody has listened; numbers and spectrograms only)
## SNIFF: before (current published sniff, 6 seeds, out/audio/huff/r_sn_before, sn/measure_sniff_before.txt)
- rms (loudest 400 ms) -20.3..-20.8 dB: LOUDER than the new huff (-23.1 dB). LEVEL.sniff 0.091 > LEVEL.huff 0.07. Must come down.
- crest 15.9-18.3 dB; centroid 1380-2180 Hz; flatness 0.18-0.40 (synth white noise slices: creat_/alli_hiss + synth nostril layer).
- inhales (inhales.py, -14 dB bursts): 4-6 bursts of 50-240 ms, gaps 58-302 ms. Spectrogram: hard-edged full-band slabs (vertical walls at 0.19, 0.62 s), last one a burst.
## SNIFF: search
- Red Library / SSE / Gold Tape (archive.org, all 180 items listed): no sniff take. Dogs: only panting. Horse breathing: R23-49 "Horse Breathing" (Horses_4),
  R13-05 (a looped in/out pair, 1 s parts, too long), R14-04.
- Commons: no animal sniff audio. Videos: Lion sniffing (CC BY-SA, no), Babirusa sniffing (CC BY 2.0, Flickr; download rate-limited, trying),
  coyote (PD, trail video), dog olfaction papers (CC BY, lab noise).
- OpenGameArt "Sniffing" by spookymodem, CC BY 3.0: three human nose sniffs (1.7 s, 44.1k stereo), clean, bright (centroid ~2.3-2.5 kHz).
- Freesound blocked (403).
- Commons downloads were rate-limited (HTTP 429) for the whole session: the Babirusa sniffing video (CC BY 2.0) and the dog-olfaction paper videos
  (CC BY) could not be fetched or judged. Worth a second look later; no real animal sniff found otherwise.
## SNIFF: clips added (test/audio_pack.py; manifest 80 -> 91; reproducible: sniffh_2, sniffb_3 rebuilt from an empty dir, byte-identical)
- sniffb_1..8: Red_Library_Animals_Horses_4 / R23-49-Horse Breathing (CC0), cuts 8.01-8.46, 9.72-10.23, 11.43-11.88, 13.25-13.69, 15.20-15.71,
  17.88-18.23, 19.15-19.55, 24.13-24.60. Distinct breaths (not a loop: pairwise xcorr < 0.25), 0.35-0.5 s, centroid 1.0-1.5 kHz, broadband,
  attack 50-200 ms, no clicks (HF spike ratio <= 3.4). Whether each is an in- or out-breath cannot be told from the recording; they are used as
  short slices with an inhale envelope.
- sniffh_1..3: OpenGameArt "Sniffing" by spookymodem (CC BY 3.0): three human nose sniffs, bright (centroid ~2.3 kHz). Used only as a faint top layer.
## SNIFF: new sniff() (src/view/audiohybrid.js)
- 3 inhales (a 4th on ~35% of seeds) at fixed onsets [0.03, 0.30, 0.52, (0.82)] s +-12 ms, lengths ~0.17/0.15/0.20/(0.13) s +-15%. Exported as
  SNIFF_RHYTHM for the view; sniff() repeats it as a literal because hybridLib runs stringified in the Worker (tested: stringified make() works).
- Each inhale: a random slice of a random sniffb_ clip, near its body (from onset + 0..0.1 s), slowed 1.5-3.5 st (+-0.6 per inhale), rising 0.8 st
  over the inhale, hp 220 / lp 3600, level evened out by the slice's RMS; envelope rises (u/0.72)^1.3 and closes over the last quarter.
  55% of inhales add a sniffh_ slice 3-5.5 st down at 0.3 gain.
- 35% of seeds end in a small soft exhale (hblow_4 / hsnort_2 / elblow_*, 0.3-0.4 s, gain 0.35, sine swell): never a burst. The old closing
  huff(short) call is gone. No synth layer.
- LEVEL.sniff 0.091 -> 0.04. HYB_NEEDS.sniff = ['sniffb_', 'sniffh_'].
## SNIFF: before / after (6 seeds; measure.py + inhales.py; sn/measure_sniff_*.txt, sn/inhales_*.txt, png_sn_before/, png_sn_after/, sn/sheet_after2.png)
| | rms (loudest 400 ms) | crest | centroid | 150-3k share | flatness | bursts (-14 dB) | burst len | gaps |
|---|---|---|---|---|---|---|---|---|
| before | -20.3..-20.8 dB (2.3 dB LOUDER than huff) | 15.9-18.3 dB | 1380-2180 Hz | 0.71-0.92 | 0.18-0.40 | 4-6 | 50-240 ms | 58-302 ms |
| after  | -27.9..-28.0 dB (5 dB under huff -23.1) | 14.4-17.2 dB | 840-1320 Hz | 0.89-0.98 | 0.11-0.27 | 3-4 | 43-128 ms above -14 dB (whole inhale 150-200 ms) | 118-227 ms at -14 dB (true gaps 80-130 ms) |
Per-inhale attack (10->90% of its own envelope incl. 80 ms lead): before 0-181 ms with several 0-16 ms (hard edges), after 36-123 ms, all swells.
Crest stays ~15 dB because the silence between inhales counts; per inhale the shape is a swell. Spectrograms: before = hard-edged full-band slabs
(vertical walls); after = 3-4 separate soft-onset breaths, energy 300 Hz-3.5 kHz, a small dark exhale tail on some takes.
In the game harness (test/audio_hybrid.mjs) sniff level 0.039-0.040 vs huff 0.070, growl 0.330.
## SNIFF: visual cue (src/view/effects.js, one line in src/view/audio.js; main.js unchanged)
- audio.js _voice: breathCue for 'sniff' is now -1 (was 0.45); huff/snort still 1.
- effects.snort(pos, dir, k<0): queues 3 inhale wisps at SNIFF_RHYTHM[0..2] + 0.05 s; effects.breath() now remembers the nostril/snout every frame
  so the wisps follow the head. Each inhale: 2 vapour sprites (from the shared pool of 28; 6 per sniff), size 0.10-0.15, start 0.22-0.34 m ahead of
  the nostril, travel straight IN to it over 0.20-0.28 s while shrinking, opacity peak 0.09, no wind/buoyancy (flag d.inw, cleared on reuse).
  The huff/snort burst code path is unchanged (k >= 0).
- Sync caveat: the sound's 4th inhale (35% of takes) gets no wisp; the sound arrives later by distance/343 s (<= ~50 ms at the 18 m sniff range).
- Option NOT implemented (as asked): a head/snout sniff gesture from the view side. body.update(pose) builds bone matrices from the pose
  (boneMatrices(pose, this.mats)); a view-only bob could add a small pitch to the neck/skull entries of the pose (or of this.mats before the skull
  children are derived) for ~0.8 s on a sniff cue, without touching src/sim. Nostril flare: skinMaterial gets geo.nostril; a flare uniform would
  need shader work. Both untested ideas.
## SNIFF: unsure
- No real ANIMAL sniff recording with a usable licence was reachable; the inhales are slices of horse breaths (direction unknown) with a faint
  human sniff on top. Could read as "breathing" rather than "scenting". If it does, the next step would be the Babirusa / dog videos on Commons.
- The human sniff layer (CC BY, needs the credit now in CREDITS.md) may be recognisably human if it is too loud; it is at 0.3 of the horse layer.
- Rhythm is fixed (only jittered), so all sniffs share one cadence; done so the wisps can match.
- Build: npx esbuild ... /tmp/sniff_app.js OK. Other voices byte-identical (huff_1/4, snort_2, growl_1, roar_3 checked).
