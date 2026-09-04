# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

There is no build system, no dependencies, and no test suite. The entire game is a single self-contained file: `sharky_sharkster.html`.

- Run locally: open `sharky_sharkster.html` directly in a browser (e.g. `open sharky_sharkster.html` on macOS).
- A static server is only needed if a browser blocks `file://` for some API; none is required today.
- Audio requires a user gesture — `initAudio()` is wired to the first key/click via `audioStarted` in the input handler.

## Architecture

Everything lives inside `<script>` in `sharky_sharkster.html`. The file is organized into clearly-marked banner-comment sections that you should preserve when editing. Top-to-bottom, the major systems are:

1. **Canvas setup** — fixed 640x480 logical resolution (`GW`/`GH`); `resizeCanvas()` scales the canvas via CSS while keeping pixel-art crisp (`image-rendering: pixelated`).
2. **Audio engine** — Web Audio API only. `masterGain → musicGain / sfxGain`. `playNote()` for one-shot SFX, `playNoteAt()` for scheduled notes, `playMusicLoop()` schedules melody+bass measures into the future and re-schedules on a timer. `startMusic('happy'|'tense'|...)` swaps tracks; `stopMusic()` cancels scheduled nodes.
3. **Sprite system** — all art is procedural pixel art drawn pixel-by-pixel (`drawPixel`) into offscreen canvases. The big sprite factories are `createPlayerFish(sizeLevel, frame, facingLeft)`, `createEnemyFish(type, frame, facingLeft, colorIdx, patternIdx)`, and `createShark(frame, facingLeft)`. Each renders a frame once and stores it in `spriteCache` (a `Map`, capped at `SPRITE_CACHE_LIMIT` with oldest-first eviction) via `cacheSprite(key, canvas)`; the render loop just blits. **The `frame` argument must be reduced modulo the factory's `*_ANIM_FRAMES` constant and that reduced value used for both the cache key and every animation term** — otherwise the cache key is unbounded (a new canvas per rendered frame) or the key and the drawn art disagree. Wag/mouth cycles are phrased as whole cycles over `*_ANIM_FRAMES` so the loop wraps seamlessly.
4. **Particles / popups** — `spawnBubble`, `spawnEatParticles`, `spawnScorePopup`, `spawnDeathParticles` all push into shared arrays consumed by `updateParticles()` / `drawParticles()`.
5. **Background** — `createBackground()` pre-renders the scrolling seabed into an offscreen canvas; `drawCaustics()` overlays animated light.
6. **Game state machine** — `STATE = { TITLE, PLAYING, DYING, GAME_OVER, LEVEL_UP, PAUSED, HIGH_SCORE_ENTRY, BONUS }` with a single `gameState` variable. Both `update()` and `render()` switch on `gameState`; new states must be handled in **both**.
7. **Leaderboard** — persisted in `localStorage` under the key `sharkyLeaderboard` via `loadLeaderboard()` / `saveLeaderboard()`. `DEFAULT_LEADERBOARD` is the seed when storage is empty. Initials entry is its own state (`HIGH_SCORE_ENTRY`) with `hsEntryRank` / `hsEntryInitials` / `hsEntryPos`.
8. **Entities** — player fish (size levels 1–7), enemy fish, the shark (boss; `updateShark` / `activateShark` / `sharkTimer` / `sharkBitesThisPatrol`), electric eels (`spawnEel` / `updateEels` / `triggerEelShock` — applies a freeze effect), starfish immunity power-up (`STARFISH_IMMUNITY_DURATION`), and the Super Fishfood Jar power-up. Eating logic is centralized in `eatFish()` and `checkCollisions()`.
9. **Bonus round** — every 5th level. `startBonusRound()` switches to `STATE.BONUS` with its own background (`createBonusBackground`), update loop (`updateBonusRound`), and renderer (`drawBonusRound`); `endBonusRound()` returns to `STATE.PLAYING`.
10. **Game loop** — fixed-timestep at 36 FPS. `gameLoop(timestamp)` accumulates real time, runs up to `MAX_UPDATES_PER_FRAME` (5) `update()` ticks per rAF, then renders once. If the accumulator exceeds the cap (e.g. tab was backgrounded), it is **dropped to 0** rather than spiraling. A `visibilitychange` listener also resets timing when the tab refocuses. Preserve this behavior when editing the loop.

## Conventions worth keeping

- All game time is measured in 36 FPS update ticks, not wall-clock ms (e.g. `STARFISH_IMMUNITY_DURATION = 36 * 20`). Use the same convention for any new timer.
- Sprites are cached, not redrawn per frame — if you add a new entity type, follow the existing pattern of pre-rendering frames into a sprite array at startup.
- Section banner comments (`// ====...`) are load-bearing for navigation in this single large file. Keep them in sync if you reorganize code.
- When adding a new game state, update the `STATE` object **and** the switches in both `update()` and `render()`.
