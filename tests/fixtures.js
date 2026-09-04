import { test as base, expect } from '@playwright/test';

export const GAME_URL = '/index.html';

/**
 * Runs in the page *before* the game's <script>.
 *
 * Two things make the game testable without modifying it:
 *   1. Math.random is replaced with a seeded PRNG, so spawn positions, palettes
 *      and shark timers are reproducible from run to run.
 *   2. requestAnimationFrame is queued instead of scheduled, so no game time
 *      passes until a test asks for it via __harness.pump(). Every test starts
 *      from frame 0 with nothing drawn yet.
 *
 * The game declares its state with top-level `let`/`const` in a classic script,
 * which puts those bindings in the page's global lexical environment — so test
 * code can read and write `score`, `player`, `gameState`, … by bare name inside
 * page.evaluate().
 */
function installHarness(seed) {
  let s = seed >>> 0;
  const mulberry32 = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const queued = [];
  const harness = {
    time: 0,
    frames: 0,
    random: mulberry32,
    /** Advance `frames` animation frames, each `dt` ms after the last. */
    pump(frames = 1, dt = 1000 / 36) {
      for (let i = 0; i < frames; i++) {
        harness.time += dt;
        const due = queued.splice(0, queued.length);
        for (const cb of due) cb(harness.time);
        harness.frames++;
      }
      return harness.frames;
    },
    /** Make Math.random return a fixed value (or cycle a list of values). */
    fixRandom(values) {
      const list = Array.isArray(values) ? values : [values];
      let i = 0;
      harness.random = () => list[i++ % list.length];
    },
    restoreRandom() {
      harness.random = mulberry32;
    },
    pendingFrames: () => queued.length,
  };

  Math.random = () => harness.random();
  window.requestAnimationFrame = (cb) => queued.push(cb);
  window.cancelAnimationFrame = () => {};
  window.__harness = harness;
}

export class Game {
  constructor(page, seed = 1) {
    this.page = page;
    this.seed = seed;
    this.pageErrors = [];
    this.consoleErrors = [];
    page.on('pageerror', (err) => this.pageErrors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') this.consoleErrors.push(msg.text());
    });
  }

  async open({ storage } = {}) {
    await this.page.addInitScript(installHarness, this.seed);
    if (storage) await this.seedStorage(storage);
    await this.page.goto(GAME_URL);
    return this;
  }

  /** Queue localStorage values for every subsequent load of the page. */
  async seedStorage(storage) {
    await this.page.addInitScript((entries) => {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    }, Object.entries(storage));
  }

  /** Reload the game, optionally after clearing/seeding localStorage. */
  async reload({ storage, clear = true } = {}) {
    if (clear) await this.page.evaluate(() => localStorage.clear());
    if (storage) await this.seedStorage(storage);
    await this.page.goto(GAME_URL);
  }

  /** Run the fixed-timestep update() directly — no rendering, exactly n ticks. */
  tick(n = 1) {
    return this.page.evaluate((count) => {
      for (let i = 0; i < count; i++) update();
    }, n);
  }

  /** Drive the real gameLoop (update + render) through the queued rAF. */
  pump(frames = 1, dt = 1000 / 36) {
    return this.page.evaluate(([f, d]) => window.__harness.pump(f, d), [frames, dt]);
  }

  eval(fn, arg) {
    return this.page.evaluate(fn, arg);
  }

  fixRandom(values) {
    return this.page.evaluate((v) => window.__harness.fixRandom(v), values);
  }

  restoreRandom() {
    return this.page.evaluate(() => window.__harness.restoreRandom());
  }

  press(key) {
    return this.page.keyboard.press(key);
  }

  hold(key) {
    return this.page.keyboard.down(key);
  }

  release(key) {
    return this.page.keyboard.up(key);
  }

  /** Start a run without going through the title screen (skips audio init). */
  async startGame() {
    await this.page.evaluate(() => startGame());
  }

  /** Assign onto the game's globals, e.g. patch({ score: 100, player: { x: 10 } }). */
  async patch(values) {
    await this.page.evaluate((v) => {
      if ('gameState' in v) gameState = v.gameState;
      if ('score' in v) score = v.score;
      if ('lives' in v) lives = v.lives;
      if ('level' in v) level = v.level;
      if ('sharkTimer' in v) sharkTimer = v.sharkTimer;
      if ('sharkActive' in v) sharkActive = v.sharkActive;
      if ('starfishImmunityTimer' in v) starfishImmunityTimer = v.starfishImmunityTimer;
      if ('playerFrozenTimer' in v) playerFrozenTimer = v.playerFrozenTimer;
      if ('comboCount' in v) comboCount = v.comboCount;
      if ('comboTimer' in v) comboTimer = v.comboTimer;
      if ('sharkBitesThisPatrol' in v) sharkBitesThisPatrol = v.sharkBitesThisPatrol;
      if ('hsEntryRank' in v) hsEntryRank = v.hsEntryRank;
      if ('hsEntryPos' in v) hsEntryPos = v.hsEntryPos;
      if ('gameOverTimer' in v) gameOverTimer = v.gameOverTimer;
      if ('accumulator' in v) accumulator = v.accumulator;
      if ('enemies' in v) enemies = v.enemies;
      if ('eels' in v) eels = v.eels;
      if ('player' in v) Object.assign(player, v.player);
      if ('shark' in v) Object.assign(shark, v.shark);
      if ('starfish' in v) Object.assign(starfish, v.starfish);
      if ('powerUp' in v) Object.assign(powerUp, v.powerUp);
    }, values);
  }

  /** A snapshot of everything the specs assert on. */
  state() {
    return this.page.evaluate(() => ({
      STATE,
      gameState,
      score,
      lives,
      level,
      frameCount,
      accumulator,
      lastTime,
      attractPhase,
      attractTimer,
      musicEnabled,
      musicPlaying,
      currentMusic,
      comboCount,
      comboTimer,
      dyingTimer,
      gameOverTimer,
      sharkTimer,
      sharkActive,
      sharkDefeats,
      sharkBitesThisPatrol,
      starfishImmunityTimer,
      playerFrozenTimer,
      bonusTimer,
      bonusScore,
      bonusLevelBefore,
      hsEntryRank,
      hsEntryPos,
      hsEntryInitials: [...hsEntryInitials],
      highScore,
      leaderboard: leaderboard.map((e) => ({ ...e })),
      player: { ...player },
      shark: {
        x: shark.x, y: shark.y, hp: shark.hp, active: shark.active,
        facingLeft: shark.facingLeft, phase: shark.phase, hitCooldown: shark.hitCooldown,
      },
      starfishActive: starfish.active,
      powerUpActive: powerUp.active,
      enemyCount: enemies.length,
      eelCount: eels.length,
      particleCount: particles.length,
      popups: particles.filter((p) => p.type === 'text').map((p) => p.text),
      activePellets: bonusPellets.filter((p) => p.active).length,
      pelletCount: bonusPellets.length,
      spriteCacheSize: spriteCache.size,
      demoEnemyCount: demoEnemies.length,
    }));
  }

  /** Drop an enemy of the given ENEMY_TYPES index right on top of the player. */
  placeEnemyOnPlayer(type) {
    return this.page.evaluate((t) => {
      const def = ENEMY_TYPES[t];
      const e = {
        x: player.x, y: player.y, vx: 0, vy: 0, type: t,
        width: def.w, height: def.h, facingLeft: false, frame: 0, wobble: 0,
        points: def.points, sizeLevel: def.sizeLevel, colorIdx: 0, patternIdx: 0,
        dartTimer: 0, frozenTimer: 0, isEel: false,
      };
      enemies.push(e);
      return { width: def.w, height: def.h, points: def.points };
    }, type);
  }
}

export const test = base.extend({
  seed: [1, { option: true }],
  game: async ({ page, seed }, use) => {
    const game = new Game(page, seed);
    await game.open();
    await use(game);
  },
});

export { expect };
