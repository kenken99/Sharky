import { test, expect } from './fixtures.js';

const BONUS_DURATION = 36 * 20;
const PELLET_GRID = 12 * 8;

test.beforeEach(async ({ game }) => {
  await game.startGame();
  await game.patch({ sharkTimer: 100000 });
});

test.describe('starting a bonus round', () => {
  test('fills the screen with a grid of pellets', async ({ game }) => {
    await game.patch({ level: 5 });
    await game.eval(() => startBonusRound());

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.BONUS);
    expect(s.pelletCount).toBe(PELLET_GRID);
    expect(s.activePellets).toBe(PELLET_GRID);
    expect(s.bonusTimer).toBe(BONUS_DURATION);
    expect(s.bonusScore).toBe(0);
    expect(s.bonusLevelBefore).toBe(5);
  });

  test('clears hazards so the round is purely a pellet hunt', async ({ game }) => {
    await game.eval(() => {
      enemies = [{ x: 0, y: 0, width: 20, height: 12 }];
      spawnEel();
      spawnStarfish();
      spawnPowerUp();
      playerFrozenTimer = 50;
      startBonusRound();
    });

    const s = await game.state();
    expect(s.enemyCount).toBe(0);
    expect(s.eelCount).toBe(0);
    expect(s.starfishActive).toBe(false);
    expect(s.powerUpActive).toBe(false);
    expect(s.playerFrozenTimer).toBe(0);
  });

  test('keeps every pellet inside the playfield', async ({ game }) => {
    await game.eval(() => startBonusRound());

    const outOfBounds = await game.eval(() =>
      bonusPellets.filter((p) => p.x < 0 || p.x > GW || p.y < 0 || p.y > GH - 40).length
    );
    expect(outOfBounds).toBe(0);
  });
});

test.describe('collecting pellets', () => {
  test('a collected pellet scores into both the run and the round', async ({ game }) => {
    await game.eval(() => startBonusRound());

    const pellet = await game.eval(() => {
      const p = bonusPellets[0];
      player.x = p.x;
      player.y = p.y;
      player.vx = 0;
      player.vy = 0;
      return { points: p.points };
    });

    await game.tick(1);

    const s = await game.state();
    expect(s.activePellets).toBe(PELLET_GRID - 1);
    expect(s.bonusScore).toBe(pellet.points);
    expect(s.score).toBe(pellet.points);
    expect(s.popups).toContain(`+${pellet.points}`);
  });

  test('pellets are worth 50-125 points in 25 point steps', async ({ game }) => {
    await game.eval(() => startBonusRound());

    const values = await game.eval(() => [...new Set(bonusPellets.map((p) => p.points))].sort((a, b) => a - b));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(50);
      expect(v).toBeLessThanOrEqual(125);
      expect((v - 50) % 25).toBe(0);
    }
  });

  test('the player still steers and stays on screen', async ({ game }) => {
    await game.eval(() => startBonusRound());
    await game.patch({ player: { x: 320, y: 240, vx: 0, vy: 0 } });

    await game.hold('ArrowRight');
    await game.tick(200);
    await game.release('ArrowRight');

    const { player } = await game.state();
    expect(player.x).toBeLessThanOrEqual(640 - player.width / 2);
    expect(player.facingLeft).toBe(false);
  });
});

test.describe('ending a bonus round', () => {
  test('ends early once the last pellet is eaten', async ({ game }) => {
    await game.patch({ level: 5 });
    await game.eval(() => {
      startBonusRound();
      bonusPellets.forEach((p, i) => { p.active = i === 0; });
      player.x = bonusPellets[0].x;
      player.y = bonusPellets[0].y;
      player.vx = 0;
      player.vy = 0;
    });

    await game.tick(1); // eats the pellet
    await game.tick(1); // next tick sees an empty board and bails out

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.PLAYING);
    expect(s.level).toBe(5);
  });

  test('ends when the clock runs out, with pellets left over', async ({ game }) => {
    await game.patch({ level: 5, player: { x: 320, y: 240, vx: 0, vy: 0 } });
    await game.eval(() => startBonusRound());

    await game.tick(BONUS_DURATION);

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.PLAYING);
    expect(s.bonusTimer).toBe(0);
    expect(s.activePellets).toBeGreaterThan(0);
    expect(s.level).toBe(5);
  });

  test('hands the player back a normal round', async ({ game }) => {
    await game.patch({ level: 5 });
    await game.eval(() => { startBonusRound(); bonusTimer = 1; });
    await game.tick(1);

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.PLAYING);
    expect(s.currentMusic).toBe('happy');
    expect(s.sharkTimer).toBeGreaterThan(0);
    expect(game.pageErrors).toEqual([]);
  });
});
