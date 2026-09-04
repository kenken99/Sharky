import { test, expect } from './fixtures.js';

const ATTRACT_PHASE_DURATION = 36 * 5; // must match the game constant

test.describe('title screen + attract mode', () => {
  test('cycles title -> high scores -> demo -> title', async ({ game }) => {
    expect((await game.state()).attractPhase).toBe(0);

    await game.tick(ATTRACT_PHASE_DURATION);
    expect((await game.state()).attractPhase).toBe(1);

    await game.tick(ATTRACT_PHASE_DURATION);
    let s = await game.state();
    expect(s.attractPhase).toBe(2);
    expect(s.demoEnemyCount).toBe(6); // initDemo() populated the demo fish

    await game.tick(ATTRACT_PHASE_DURATION);
    expect((await game.state()).attractPhase).toBe(0);
  });

  test('holds a phase until its duration elapses', async ({ game }) => {
    await game.tick(ATTRACT_PHASE_DURATION - 1);
    const s = await game.state();
    expect(s.attractPhase).toBe(0);
    expect(s.attractTimer).toBe(ATTRACT_PHASE_DURATION - 1);
  });

  test('any key starts a fresh run', async ({ game }) => {
    await game.press('x');

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.PLAYING);
    expect(s.score).toBe(0);
    expect(s.lives).toBe(5);
    expect(s.level).toBe(1);
    expect(s.enemyCount).toBe(0);
    expect(s.player).toMatchObject({
      x: 320, y: 240, vx: 0, vy: 0,
      sizeLevel: 0, eatCount: 0, invincible: 60, width: 32, height: 20,
    });
  });

  test('the first keypress initialises audio', async ({ game }) => {
    expect(await game.eval(() => audioStarted)).toBe(false);
    await game.press('x');
    expect(await game.eval(() => audioStarted)).toBe(true);
    expect(await game.eval(() => audioCtx !== null)).toBe(true);
  });

  test('M toggles music instead of starting the game', async ({ game }) => {
    expect((await game.state()).musicEnabled).toBe(true);

    await game.press('m');
    let s = await game.state();
    expect(s.musicEnabled).toBe(false);
    expect(s.gameState).toBe(s.STATE.TITLE);

    await game.press('m');
    s = await game.state();
    expect(s.musicEnabled).toBe(true);
    expect(s.gameState).toBe(s.STATE.TITLE);
  });

  test('starting the game plays the happy track', async ({ game }) => {
    await game.press('x');
    const s = await game.state();
    expect(s.currentMusic).toBe('happy');
    expect(s.musicPlaying).toBe(true);
  });
});
