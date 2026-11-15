# Kit change: torch + 3 flares

## The switch
`src/ui.js`, top: `export const KIT = { torch: true, flares: 3, stones: 0, meat: 0 }`. main.js imports it (as KIT_START) and
sets up the ration table, the item cycle and the per-life reset from it. Raising stones/meat above 0 brings them back into
the hand, the cycle, the controls list and the tips.

## What changed
- main.js: the ration table always has stone/flare/meat entries (debug menu, tests, throw/lob code, world objects, animal
  reactions, sounds untouched) but starts at n = KIT counts. Flares never regenerate (every: Infinity). ITEMS only
  holds kinds with count > 0 (now ['flare']). `act.use()` does nothing silently when empty (the "no stone/flare left"
  note was removed). `select` guards an empty list (no NaN). New `act.resetKit()`, called from `act.respawn()`, so each life
  starts with 3 flares. `act.torch()` and the touch torch button honour `KIT.torch`. Touch #tItem shows the item or "none", loses its
  cycle arrow when there is a single item (class `solo`). Added `items`/`kit` getters to `window.__rex` for the check.
- ui.js: CTL is now built from the kit ("throw a flare"; the items row appears only with 2+ items; torch row only if torch).
  First-time tips: use -> "{use} to throw a flare"; items tip skipped with < 2 items; torch tip skipped if no torch. Item strip
  shows "none" when everything is spent; shown briefly after the last throw.
- dist/index.html: #tItem initial text "flare"; CSS `#tItem.solo::after`. Sandbox drawer buttons (Stone/Flare/Meat) left as is.
- Input paths: keyboard click / 1 2 3 / wheel, touch (tap view, item button), gamepad RT / LB / RB all go through act.use /
  act.cycle / act.select, so all are safe with one or zero items.

## Hidden (while stones/meat are 0), in lists and counts ("n of total" and toasts adjusted in ui.js; achievements.js untouched)
- hand "Fed" (meat you brought), bribe "Bought Off", decoy "Decoy" (thrown stone), steal "Light Fingers" and the secret nose
  "Under Its Nose" (take meat; no meat exists on foot now). Already-earned ones stay listed. "Drawn to Light" (flare) stays.
- The "take the meat" prompt remains (only shows if meat exists in the world).

## Checked
- esbuild build OK. Headless load of scratch copy (out/platform/kit/dist, script out/platform/kit/load.py): starts, no console
  errors (only GPU-stall warnings). Mouse use x4: flares 3 -> 2 -> 1 -> 0, 4th does nothing, no error; indicator reads "none";
  keys 2/3 raise no error. Peek card lists "throw a flare", no items row.
## Not checked
- Death/respawn reset (code path only), real touch device and gamepad (shared code paths only), game text of
  achievements.js not edited, dist/app.js not written.
