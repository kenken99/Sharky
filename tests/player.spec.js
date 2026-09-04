import { test, expect } from './fixtures.js';

test.beforeEach(async ({ game }) => {
  await game.startGame();
  // Keep the sim to just the player: no enemies, no shark, no invincibility frames.
  await game.patch({ player: { invincible: 0 }, sharkTimer: 100000, enemies: [] });
});

test.describe('player movement', () => {
  test('accelerates right and faces right', async ({ game }) => {
    await game.hold('ArrowRight');
    await game.tick(3);
    await game.release('ArrowRight');

    const { player } = await game.state();
    expect(player.vx).toBeGreaterThan(0);
    expect(player.x).toBeGreaterThan(320);
    expect(player.facingLeft).toBe(false);
  });

  test('accelerates left and flips the sprite', async ({ game }) => {
    await game.hold('ArrowLeft');
    await game.tick(3);
    await game.release('ArrowLeft');

    const { player } = await game.state();
    expect(player.vx).toBeLessThan(0);
    expect(player.x).toBeLessThan(320);
    expect(player.facingLeft).toBe(true);
  });

  test('WASD mirrors the arrow keys', async ({ game }) => {
    await game.hold('w');
    await game.tick(3);
    await game.release('w');
    expect((await game.state()).player.vy).toBeLessThan(0);

    await game.hold('s');
    await game.tick(10);
    await game.release('s');
    expect((await game.state()).player.vy).toBeGreaterThan(0);
  });

  test('friction brings the fish to rest', async ({ game }) => {
    await game.patch({ player: { vx: 3, vy: 3 } });
    await game.tick(120);

    const { player } = await game.state();
    expect(Math.abs(player.vx)).toBeLessThan(0.01);
    expect(Math.abs(player.vy)).toBeLessThan(0.01);
  });

  test('caps speed at 3.5 + 0.2 per size level', async ({ game }) => {
    await game.patch({ player: { x: 100 } });
    await game.hold('ArrowRight');
    await game.tick(30);
    await game.release('ArrowRight');

    let { player } = await game.state();
    expect(Math.hypot(player.vx, player.vy)).toBeLessThanOrEqual(3.5 + 1e-9);

    await game.patch({ player: { sizeLevel: 3, width: 64, height: 40, x: 100 } });
    await game.hold('ArrowRight');
    await game.tick(30);
    await game.release('ArrowRight');

    ({ player } = await game.state());
    const cap = 3.5 + 3 * 0.2;
    expect(Math.hypot(player.vx, player.vy)).toBeLessThanOrEqual(cap + 1e-9);
    expect(Math.hypot(player.vx, player.vy)).toBeGreaterThan(3.5);
  });
});

test.describe('screen boundaries', () => {
  test('clamps at the left and right walls and reverses velocity', async ({ game }) => {
    await game.patch({ player: { x: 2, vx: -4 } });
    await game.tick(1);
    let { player } = await game.state();
    expect(player.x).toBe(player.width / 2);
    expect(player.vx).toBeGreaterThan(0);

    await game.patch({ player: { x: 638, vx: 4 } });
    await game.tick(1);
    ({ player } = await game.state());
    expect(player.x).toBe(640 - player.width / 2);
    expect(player.vx).toBeLessThan(0);
  });

  test('clamps below the HUD and above the seabed', async ({ game }) => {
    await game.patch({ player: { y: 0, vy: -4 } });
    await game.tick(1);
    let { player } = await game.state();
    expect(player.y).toBe(player.height / 2 + 10);
    expect(player.vy).toBeGreaterThan(0);

    await game.patch({ player: { y: 479, vy: 4 } });
    await game.tick(1);
    ({ player } = await game.state());
    expect(player.y).toBe(480 - 55 - player.height / 2);
    expect(player.vy).toBeLessThan(0);
  });
});

test.describe('dart', () => {
  test('boosts speed, then locks out for the cooldown', async ({ game }) => {
    await game.patch({ player: { vx: 2, vy: 0 } });

    await game.hold(' ');
    await game.tick(1);

    let { player } = await game.state();
    expect(player.dartTimer).toBe(10); // DART_DURATION
    expect(player.dartCooldown).toBe(54); // DART_COOLDOWN
    expect(player.vx).toBeGreaterThan(4); // boosted well past the normal 3.5 cap

    // Holding space through the cooldown must not re-trigger.
    await game.tick(20);
    ({ player } = await game.state());
    expect(player.dartTimer).toBe(0);
    expect(player.dartCooldown).toBe(54 - 20);

    await game.release(' ');
  });

  test('darts along the facing direction when nearly stationary', async ({ game }) => {
    await game.patch({ player: { vx: 0, vy: 0, facingLeft: true, x: 320 } });

    await game.hold(' ');
    await game.tick(1);
    await game.release(' ');

    const { player } = await game.state();
    expect(player.vx).toBeLessThan(-4);
    expect(player.vy).toBeCloseTo(0, 6);
  });

  test('is unavailable again until the cooldown expires', async ({ game }) => {
    await game.hold(' ');
    await game.tick(1);
    await game.release(' ');

    await game.tick(54); // cooldown 54 -> 0
    expect((await game.state()).player.dartCooldown).toBe(0);

    await game.hold(' ');
    await game.tick(1);
    await game.release(' ');
    expect((await game.state()).player.dartTimer).toBe(10);
  });
});

test.describe('eel freeze', () => {
  test('ignores input and coasts to a stop while frozen', async ({ game }) => {
    await game.patch({ playerFrozenTimer: 36 * 3, player: { vx: 2, vy: 0, x: 320 } });

    await game.hold('ArrowLeft');
    await game.tick(5);
    await game.release('ArrowLeft');

    const s = await game.state();
    expect(s.playerFrozenTimer).toBe(36 * 3 - 5);
    expect(s.player.vx).toBeGreaterThan(0); // input did not reverse it
    expect(s.player.vx).toBeLessThan(2); // still decaying
    expect(s.player.x).toBeGreaterThan(320);
  });

  test('regains control when the freeze expires', async ({ game }) => {
    await game.patch({ playerFrozenTimer: 3 });
    await game.tick(3);
    expect((await game.state()).playerFrozenTimer).toBe(0);

    await game.hold('ArrowLeft');
    await game.tick(3);
    await game.release('ArrowLeft');
    expect((await game.state()).player.vx).toBeLessThan(0);
  });
});
