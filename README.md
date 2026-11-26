# Flight game — make.fun entry

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/matrixneoaiagent/flight-game-01/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/matrixneoaiagent/flight-game-01/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

**Skyreef Run** is an original five-gate flight trial built around the fictional Kestrel KR-7 “Tern”. You start airborne over the airstrip of a procedurally drawn reef, thread the glowing gates above the mountains and channels, and finish before the three-minute course clock expires. The game couples an arcade flight model with an animated chase view, a fully framed cockpit view, a glowing glass instrument cluster, procedural islands, ocean, clouds, runway and lighthouse — all running from static files with Three.js and synthesised WebAudio, and no network requests at runtime.

## Run it

    node serve.ts
    # open http://localhost:8080

Open the page in a desktop Chrome at 1280×800 or larger. Click **Begin flight** or press Enter. There is no build step, no install and no downloaded asset: the game loads only `game/index.html`, its ES modules and the vendored Three.js files from the same local server. In a normal window Three.js renders at the display's device pixel ratio; if it detects a software rasteriser (for example a headless CI box) it automatically drops MSAA and internal resolution so the flight remains controllable, while the screenshot staging mode keeps full quality.

## Controls

- **Mouse** — move toward a screen edge to pitch and roll. Centred mouse means hands-off.
- **W / S** — throttle up / down.
- **A / D** — roll left / right.
- **← / →** — roll left / right (keyboard alternative).
- **↑ / ↓** — pitch up / down.
- **Q / E** — yaw left / right.
- **Space** — airbrake (slows the aircraft and makes it sink).
- **C** — toggle chase view and cockpit view.
- **P / Esc** — pause and resume.
- **M** — mute or unmute the synthesised audio.
- **Enter** — begin a flight, or fly again from the flight report.
- **R** — fly again from the flight report.

The HUD always shows airspeed in knots, altitude in feet, heading in degrees, throttle percentage, gate progress, the course clock, a gate cue, warnings and the lit instrument cluster. Fly through all five gates in order to complete the course; hitting the sea, an island or the runway ends the flight.

## Screenshots

| File | View |
| --- | --- |
| `screenshots/1-chase.jpg` | Chase view approaching Gate 1 over the main island — the cover |
| `screenshots/2-cockpit.jpg` | Cockpit view with the framed canopy, six lit instruments and HUD |
| `screenshots/3-ring.jpg` | Low pass over the airstrip with the runway ahead and Gate 1 beyond |
| `screenshots/4-title.jpg` | Title screen and control card |

All four are direct 1280×800 Playwright renders of the running game, JPEG, under 256 KiB each. They were not composited or retouched.

## Source layout

- `game/index.html` — import map, HUD/title/pause/report layers and CSS
- `game/src/main.js` — fixed-step loop, screens, gate events, screenshot staging
- `game/src/flight.js` — arcade flight model, gate crossing, crash/time-out rules
- `game/src/scene.js` — procedural islands, ocean shader, sky, runway, rings, Kestrel model
- `game/src/hud.js` — HUD, gate cue and the lit 2D instrument panel
- `game/src/audio.js` — WebAudio turboprop, wind, chimes and impacts
- `game/src/input.js` — keyboard and mouse axes
- `game/src/ui.js` — title, pause and flight-report DOM screens
- `game/src/config.js`, `game/src/noise.js` — tuning and deterministic noise
- `game/vendor/three/` — the provided Three.js build, unchanged

`tools/capture.mjs` captures the four screenshots and `tools/verify.mjs` runs the headless interaction checks; both need the local server and Playwright/Chromium available.
