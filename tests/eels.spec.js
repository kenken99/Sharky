import { test, expect } from './fixtures.js';

const EEL_SHOCK_RADIUS = 70;
const EEL_FREEZE_DURATION = 36 * 3;

/** Put a single eel at a known spot with its shock ready. */
async function placeEel(game, x, y) {
  await game.eval(([ex, ey]) => {
    eels = [];
    spawnEel();
    Object.assign(eels[0], { x: ex, y: ey, vx: 0, vy: 0, shockCooldown: 0, shockFlash: 0 });
  }, [x, y]);
}

test.beforeEach(async ({ game }) => {
  await game.startGame();
  await game.patch({ player: { invincible: 0, x: 320, y: 240, vx: 0, vy: 0 }, sharkTimer: 100000, enemies: [] });
});

test.describe('electric eels', () => {
  test('only start appearing once the player is size 3 or bigger', async ({ game }) => {
    await game.patch({ player: { sizeLevel: 2 }, eels: [] });
    await game.fixRandom(0); // always inside the spawn probability
    await game.tick(5);
    expect((await game.state()).eelCount).toBe(0);

    await game.patch({ player: { sizeLevel: 3 } });
    await game.tick(1);
    expect((await game.state()).eelCount).toBe(1);

    await game.restoreRandom();
  });

  test('at most two eels are on screen at once', async ({ game }) => {
    await game.patch({ player: { sizeLevel: 5 }, eels: [] });
    await game.fixRandom(0);
    await game.tick(10);
    await game.restoreRandom();

    expect((await game.state()).eelCount).toBe(2);
  });

  test('a shock freezes the player when in range', async ({ game }) => {
    await placeEel(game, 320, 240); // right on top of the player
    await game.eval(() => triggerEelShock(eels[0]));

    const s = await game.state();
    expect(s.playerFrozenTimer).toBe(EEL_FREEZE_DURATION);
    expect(s.particleCount).toBeGreaterThan(0); // spark burst
  });

  test('a shock outside the radius leaves the player alone', async ({ game }) => {
    await placeEel(game, 320 + EEL_SHOCK_RADIUS + 10, 240);
    await game.eval(() => triggerEelShock(eels[0]));

    expect((await game.state()).playerFrozenTimer).toBe(0);
  });

  test('a shock freezes nearby fish but not distant ones', async ({ game }) => {
    await placeEel(game, 100, 100);
    await game.eval(() => {
      enemies = [
        { x: 130, y: 100, width: 20, height: 12, frozenTimer: 0 },
        { x: 500, y: 400, width: 20, height: 12, frozenTimer: 0 },
      ];
      triggerEelShock(eels[0]);
    });

    const frozen = await game.eval(() => enemies.map((e) => e.frozenTimer));
    expect(frozen).toEqual([EEL_FREEZE_DURATION, 0]);
  });

  test('an eel goes on cooldown after shocking', async ({ game }) => {
    await placeEel(game, 320, 240);
    await game.eval(() => triggerEelShock(eels[0]));

    const eel = await game.eval(() => ({ cooldown: eels[0].shockCooldown, flash: eels[0].shockFlash }));
    expect(eel.cooldown).toBe(36 * 5);
    expect(eel.flash).toBe(20);
  });

  test('eels swim off screen and are cleaned up', async ({ game }) => {
    await placeEel(game, 600, 240);
    await game.eval(() => { eels[0].vx = 30; });

    await game.tick(10);

    expect((await game.state()).eelCount).toBe(0);
  });
});
