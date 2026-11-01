# Arcade Plane Shooter

2D vertical arcade plane shooter built with **Phaser 3 + Vite**.

- Plane flies upward; the ocean/cloud background **scrolls continuously** and **speeds up while you hold UP/W**.
- Keyboard: **Arrows / WASD** to fly, **SPACE** (hold) to shoot, **P** pause, **M** mute.
- Level-based: clear Level 1 (12 kills) → Level 2 (16 kills) → Boss fight → Win screen. 3 lives → Game Over.
- Pixel-art sprites are generated in code (`src/textures.js`), sound effects are WebAudio bleeps (`src/sfx.js`) — no downloads needed.
- Power-ups: **double shot** (10s) and **shield** (absorbs one hit).

## Requires

Node.js **18+** (`node --version`).

## Run

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL.

## Build

```bash
npm run build
npm run preview
```

## Files

- `index.html` — canvas mount + `src/main.js`
- `src/main.js` — Phaser config (480×640, arcade physics, FIT scale)
- `src/textures.js` — in-code pixel-art generation (player, 3 enemies, boss, bullets, ocean/clouds tiles, power-ups)
- `src/sfx.js` — WebAudio synth (laser, explosion, power-up, win…)
- `src/levels.js` — level + enemy + boss tuning
- `src/scenes/Boot.js` — texture warm-up
- `src/scenes/Menu.js` — title + controls + scrolling demo
- `src/scenes/Game.js` — scroller, combat, levels, boss, HUD, pause
- `src/scenes/GameOver.js`, `src/scenes/Win.js` — end screens
