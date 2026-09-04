import { test, expect } from './fixtures.js';

// Player at size 0 is 32x20 = 640px². checkCollisions() compares areas:
//   ratio > 1.15  -> the player eats
//   ratio < 0.85  -> the player dies
//   otherwise     -> both bounce
const TINY = 0;   // 20x12  = 240   -> ratio 2.67, eaten
const SMALL = 1;  // 28x20  = 560   -> ratio 1.14, bounce
const MEDIUM = 2; // 40x26  = 1040  -> ratio 0.62, fatal

test.beforeEach(async ({ game }) => {
  await game.startGame();
  await game.patch({ player: { invincible: 0 }, sharkTimer: 100000, enemies: [] });
});

test.describe('player vs fish', () => {
  test('eats a clearly smaller fish', async ({ game }) => {
    const enemy = await game.placeEnemyOnPlayer(TINY);
    await game.eval(() => checkCollisions());

    const s = await game.state();
    expect(s.enemyCount).toBe(0);
    expect(s.score).toBe(enemy.points);
    expect(s.lives).toBe(5);
    expect(s.gameState).toBe(s.STATE.PLAYING);
  });

  test('dies to a clearly bigger fish', async ({ game }) => {
    await game.placeEnemyOnPlayer(MEDIUM);
    await game.eval(() => checkCollisions());

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.DYING);
    expect(s.lives).toBe(4);
    expect(s.dyingTimer).toBe(90);
    expect(s.score).toBe(0);
  });

  test('bounces off a similarly sized fish', async ({ game }) => {
    await game.placeEnemyOnPlayer(SMALL);
    await game.eval(() => {
      enemies[0].x = player.x - 5; // off-centre so the push has a direction
      checkCollisions();
    });

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.PLAYING);
    expect(s.enemyCount).toBe(1);
    expect(s.score).toBe(0);
    expect(s.lives).toBe(5);
    expect(s.player.invincible).toBe(15); // brief grace so they don't re-collide
    expect(s.player.vx).toBeGreaterThan(0); // pushed away from the enemy
    expect(s.popups).toContain('BONK!');
  });

  test('ignores fish entirely while invincible', async ({ game }) => {
    await game.patch({ player: { invincible: 30 } });
    await game.placeEnemyOnPlayer(MEDIUM);

    await game.eval(() => checkCollisions());

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.PLAYING);
    expect(s.lives).toBe(5);
    expect(s.enemyCount).toBe(1);
  });

  test('leaves non-overlapping fish alone', async ({ game }) => {
    await game.placeEnemyOnPlayer(TINY);
    await game.eval(() => { enemies[0].x = player.x + 200; });

    await game.eval(() => checkCollisions());

    const s = await game.state();
    expect(s.enemyCount).toBe(1);
    expect(s.score).toBe(0);
  });

  test('growing turns a former predator into prey', async ({ game }) => {
    await game.patch({ player: { sizeLevel: 4, width: 80, height: 48 } });
    await game.placeEnemyOnPlayer(MEDIUM);

    await game.eval(() => checkCollisions());

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.PLAYING);
    expect(s.enemyCount).toBe(0);
    expect(s.score).toBe(50);
  });
});

test.describe('starfish shield', () => {
  test('bounces off a bigger fish instead of dying', async ({ game }) => {
    await game.patch({ starfishImmunityTimer: 36 * 20 });
    await game.placeEnemyOnPlayer(MEDIUM);
    await game.eval(() => { enemies[0].x = player.x - 5; });

    await game.eval(() => checkCollisions());

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.PLAYING);
    expect(s.lives).toBe(5);
    expect(s.enemyCount).toBe(1);
    expect(s.popups).toContain('BONK!');
  });

  test('is granted for 20 seconds when the starfish is collected', async ({ game }) => {
    await game.eval(() => {
      spawnStarfish();
      starfish.x = player.x;
      starfish.y = player.y;
    });

    await game.tick(1);

    const s = await game.state();
    expect(s.starfishActive).toBe(false);
    expect(s.starfishImmunityTimer).toBe(36 * 20); // STARFISH_IMMUNITY_DURATION
    expect(s.popups).toContain('STARFISH SHIELD!');
  });

  test('counts down and expires', async ({ game }) => {
    await game.patch({ starfishImmunityTimer: 5 });
    await game.tick(5);
    expect((await game.state()).starfishImmunityTimer).toBe(0);

    await game.placeEnemyOnPlayer(MEDIUM);
    await game.eval(() => checkCollisions());
    expect((await game.state()).gameState).toBe(2); // STATE.DYING — shield is gone
  });
});
