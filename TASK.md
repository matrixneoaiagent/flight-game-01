# TASK — make.fun flight game entry (best-flight-game-20261126-0057)

You are building the entry for a make.fun competition: **the best flight game**.
Deadline 2026-11-28T00:57Z. The orchestrator submits; you only build inside this repository.

## What the entry must be

A complete, original, playable flight game in a desktop browser.

- **Static files only** under `game/`: `game/index.html` opens in Chrome and plays with **no network request**. Every script, image, sound and font is a file under `game/` or a `data:` URI. No build step.
- **Three.js is already vendored** at `game/vendor/three/three.module.min.js` and `three.core.min.js`. Load it with an import map in `game/index.html`:
  ```html
  <script type="importmap">{"imports":{"three":"./vendor/three/three.module.min.js"}}</script>
  ```
  three.module.min.js imports `./three.core.min.js`; keep both files. No other library.
- **Keyboard + mouse**: throttle up/down, pitch, roll, yaw, brake. The title screen lists the controls.
- **World**: ocean, an archipelago with mountains, a sky gradient, clouds, a runway, and **3–5 target rings** to fly through.
- **Aircraft** visible in a chase view, with a cockpit view toggled with `C`, and lit instruments (altitude, speed, heading, throttle).
- **HUD always shows** altitude, speed in knots, heading in degrees, throttle, ring progress and a timer.
- **Complete loop**: title screen → start → fly through all rings → win (or time-out/crash) → restart. Pause with `P`. No dead ends, no placeholder text, no empty panels.
- **Original** title, aircraft name, art and audio. Any sound is synthesised with WebAudio. No commercial-game names, characters or assets.
- Smooth at 1280×800.

## Files (do not touch the first four)

- `main.ts`, `serve.ts`, `shots.json`, `vendor/makefun-game.ts` — keep unchanged.
- `LICENSE` — keep (MIT).
- `.makefun/owner.json` — already present; do not change.
- `game/` — your game.
- `screenshots/` — replace the starter's shots with 3–4 real renders.
- `README.md` — rewrite with the badge block below, the title, controls and how to run.

## Screenshots (real renders, 1280×800, each ≤ 256 KiB)

Capture with Playwright and `/home/kozak/.local/bin/chromium` (`--no-sandbox --disable-dev-shm-usage`):

1. `1-chase.jpg` — chase view over recognisable terrain, aircraft in frame, lit instruments, HUD altitude/speed/heading visible. **This is the cover.**
2. `2-cockpit.jpg` — cockpit view with instruments and HUD.
3. `3-ring.jpg` — a runway or target ring ahead.
4. `4-title.jpg` — title screen.

Serve with `node serve.ts` (port 8080) and screenshot `http://localhost:8080`. Never composite or edit a screenshot.

## Verify before you finish

1. `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` → exit 0, `out/dossier.json` exists, `out/game/index.html` exists, `out/screenshots/` has 3–4 files. Delete `out/` afterwards.
2. Playwright: load the game, assert no console errors, no non-localhost requests, the canvas renders (a non-blank screenshot), and a key press changes the HUD (throttle/altitude).
3. Report the file tree, screenshot sizes, the verification output and the controls.

## README badges (required by the submission gate)

```md
# Flight game — make.fun entry

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/matrixneoaiagent/flight-game-01/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/matrixneoaiagent/flight-game-01/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

<one-paragraph description>

## Run it

    node serve.ts
    # open http://localhost:8080

Controls: ...
```

## Rules for the transcript gate

- Write the game's code **in this session**. Revise files at least twice.
- Do not copy code from another game, repository, site or our previous entries. Build it here.
- The vendored three.js `*.min.js` files are excluded from authorship counts.
- Keep the session focused: no unrelated work, no network fetches of code.

Work efficiently. A complete, polished game with strong screenshots matters more than extra features. Finish within about three hours.
