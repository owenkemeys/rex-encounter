# Rex Encounter

A first-person browser game with one Tyrannosaurus that thinks for itself. It sees, hears and smells. Every pose comes from a simulation, not from animation clips.

Play it at [rexencounter.com](https://rexencounter.com).

## Share a tape

After you die, a security-camera tape of the run plays. You can share a playable link, or download the tape as an MP4, with sound.

A playable link looks like `https://share.rexencounter.com/r/<id>`. Opening it shows a still, then plays that tape at rexencounter.com.

The corner of a saved clip reads rexencounter.com.

## The rex

The animal itself lives in [`src/rex/`](src/rex/). Nothing in that folder imports from this game. You can drop it into another game, or try its brain in another animal. The guide is [`src/rex/README.md`](src/rex/README.md).

## Run it locally

```
npm i
npm start
```

That builds the game and serves `dist/` at http://localhost:8080. You can also run `npm run build` and serve `dist/` yourself.

`dist/app.js` and `dist/mp4.js` are build output and are not committed. Everything else in `dist/` (the page, audio, assets) is source.

The rex checks: `npm run test:rex`. Other checks are `node test/<name>.mjs`.

If you are changing the game, [AGENTS.md](AGENTS.md) is the cheat sheet for this repo.

## Credits

Audio: [`dist/audio/CREDITS.md`](dist/audio/CREDITS.md).

Textures and arena models: [`dist/assets/CREDITS.md`](dist/assets/CREDITS.md) and [`dist/assets/arena/CREDITS.md`](dist/assets/arena/CREDITS.md).
