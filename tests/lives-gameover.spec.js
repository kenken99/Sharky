import { test, expect } from './fixtures.js';

const SIZE_THRESHOLDS = [0, 8, 20, 40, 70, 120, 180];

test.beforeEach(async ({ game }) => {
  await game.startGame();
  await game.patch({ player: { invincible: 0 }, sharkTimer: 100000, enemies: [] });
});

test.describe('dying and respawning', () => {
  test('a death costs a life and plays out over 90 ticks', async ({ game }) => {
    await game.eval(() => playerDeath());

    let s = await game.state();
    expect(s.gameState).toBe(s.STATE.DYING);
    expect(s.lives).toBe(4);
    expect(s.dyingTimer).toBe(90);
    expect(s.musicPlaying).toBe(false);

    await game.tick(89);
    expect((await game.state()).gameState).toBe(s.STATE.DYING);

    await game.tick(1);
    expect((await game.state()).gameState).toBe(s.STATE.PLAYING);
  });

  test('respawn recentres the fish with long invincibility', async ({ game }) => {
    await game.patch({ player: { x: 600, y: 400 } });
    await game.eval(() => playerDeath());
    await game.tick(90);

    const { player } = await game.state();
    expect(player.x).toBe(320);
    expect(player.y).toBe(240);
    expect(player.vx).toBe(0);
    expect(player.invincible).toBeGreaterThan(100);
  });

  test('respawn shrinks the player one size level', async ({ game }) => {
    await game.patch({ player: { sizeLevel: 3, width: 64, height: 40, eatCount: 55 } });

    await game.eval(() => playerDeath());
    await game.tick(90);

    const { player } = await game.state();
    expect(player.sizeLevel).toBe(2);
    expect(player.width).toBe(52);
    expect(player.height).toBe(32);
    expect(player.eatCount).toBe(SIZE_THRESHOLDS[2]);
  });

  test('respawn cannot shrink below the smallest size', async ({ game }) => {
    await game.eval(() => playerDeath());
    await game.tick(90);

    const { player } = await game.state();
    expect(player.sizeLevel).toBe(0);
    expect(player.width).toBe(32);
  });

  test('respawn clears fish within 150px of the spawn point', async ({ game }) => {
    await game.eval(() => {
      const near = { x: 340, y: 250, vx: 0, vy: 0, type: 0, width: 20, height: 12, points: 10, sizeLevel: 0, colorIdx: 0, patternIdx: 0 };
      const far = { x: 600, y: 100, vx: 0, vy: 0, type: 0, width: 20, height: 12, points: 10, sizeLevel: 0, colorIdx: 0, patternIdx: 0 };
      enemies = [near, far];
      playerDeath();
    });

    await game.tick(90);

    const positions = await game.eval(() => enemies.map((e) => e.x));
    expect(positions).toEqual([600]);
  });
});

test.describe('game over', () => {
  test('the last life ends the run', async ({ game }) => {
    await game.patch({ lives: 1 });
    await game.eval(() => playerDeath());
    await game.tick(90);

    const s = await game.state();
    expect(s.lives).toBe(0);
    expect(s.gameState).toBe(s.STATE.GAME_OVER);
    expect(s.gameOverTimer).toBe(120);
  });

  test('a qualifying score is flagged for initials entry', async ({ game }) => {
    await game.patch({ lives: 1, score: 15000 }); // beats the 5th default entry (12000)
    await game.eval(() => playerDeath());
    await game.tick(90);

    const s = await game.state();
    expect(s.hsEntryRank).toBe(3); // slots in above 14000
    expect(s.highScore).toBe(20000); // top entry unchanged
  });

  test('a top score updates the displayed high score', async ({ game }) => {
    await game.patch({ lives: 1, score: 25000 });
    await game.eval(() => playerDeath());
    await game.tick(90);

    const s = await game.state();
    expect(s.hsEntryRank).toBe(0);
    expect(s.highScore).toBe(25000);
  });

  test('a low score does not qualify', async ({ game }) => {
    await game.patch({ lives: 1, score: 100 });
    await game.eval(() => playerDeath());
    await game.tick(90);

    expect((await game.state()).hsEntryRank).toBe(-1);
  });

  test('ignores input until the game-over timer expires', async ({ game }) => {
    await game.patch({ lives: 1, score: 100 });
    await game.eval(() => playerDeath());
    await game.tick(90);

    await game.press('x');
    expect((await game.state()).gameState).toBe(3); // still STATE.GAME_OVER

    await game.tick(120);
    await game.press('x');

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.TITLE);
    expect(s.attractPhase).toBe(0);
    expect(s.attractTimer).toBe(0);
  });

  test('a qualifying run goes to initials entry instead of the title', async ({ game }) => {
    await game.patch({ lives: 1, score: 25000 });
    await game.eval(() => playerDeath());
    await game.tick(90 + 120);

    await game.press('x');

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.HIGH_SCORE_ENTRY);
    expect(s.hsEntryInitials).toEqual(['A', 'A', 'A']);
    expect(s.hsEntryPos).toBe(0);
  });
});
