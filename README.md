# Bloomhold

A chill, candy-colored kingdom builder in the clouds, inspired by the look of Thronefall.
By day you ride Floof around a floating island and build. At night the grey Gloom drifts in,
and every one you paint bursts into butterflies. Nothing is ever lost for good: drained
buildings regrow at dawn.

## Play

Open `index.html` in a modern browser (Chrome, Edge, Safari, Firefox). It's a single file.
Three.js loads from the jsDelivr CDN, so the first load needs an internet connection.

## Deploy

`index.html` is fully static. Drop it on any static host:

- **Netlify / Vercel / Cloudflare Pages:** drag the folder in, or point the project at it. No build step.
- **GitHub Pages:** commit `index.html` to a repo and enable Pages.
- **itch.io:** zip `index.html` and upload it as an HTML game.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Ride |
| Space (hold) | Pay sparks into a glowing plot to build or upgrade. Hold at the Heart to call the night |
| Shift | Dash |
| E | Bloom Burst: paints nearby Gloom and rings every flower around you |
| Enter | Begin the night |
| V | Vibe mode: hides the UI, the camera drifts, time flows |
| M | Island map |
| H | Hide HUD |
| Click | Wobble anything. Catch shooting stars at night |
| Scroll | Zoom |
| Tab (hold) | Peek at the whole island |
| F | Fullscreen |
| Mouse | Click the ground to ride there, or hold to steer. Press the build card to pay |
| Controller | Stick rides, A builds, B dashes, X bursts, Y calls the night, RB peeks, triggers zoom |

On touch screens, drag on the left half to ride and use the on-screen buttons.

Comfort options live under Menu → Settings: tap-once building (no holding), gentle night pace,
reduce motion (follows your system setting by default), large text, and guide tips on/off.

## Source

The game is split into modules under `src/` and bundled by `build.py`:

```
python3 build.py             # writes index.html
python3 build.py --artifact  # also writes dist/bloomhold.html (body-only, for embedding)
```

| File | What's inside |
| --- | --- |
| `shell.html` | Page, styles, HUD markup |
| `00_core.js` | Utilities, noise, islands + palettes, building/enemy tuning, save, input |
| `audio.js` | Generative music engine and every sound effect, all synthesized |
| `models.js` | Procedural low-poly models |
| `10_world.js` | Renderer, post-processing, sky, time of day, island generation |
| `20_fx.js` | Particles, coins, butterflies, fireflies, weather, shooting stars |
| `30_entities.js` | Player, plots and buildings, the Heart, the Gloom, sprites, villagers, critters |
| `40_game.js` | Game flow, waves, camera, UI, vibe mode, travel, boot |

Progress is saved in the browser's localStorage.
