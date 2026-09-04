import { test, expect } from './fixtures.js';

/** Put the shark on screen and park the player in a chosen zone of it. */
async function engageShark(game, { zone, hp }) {
  await game.eval(({ zone, hp }) => {
    activateShark();
    shark.x = 320;
    shark.y = 240;
    shark.facingLeft = true;
    shark.phase = 'patrol';
    shark.hitCooldown = 0;
    if (hp !== undefined) shark.hp = hp;
    // facingLeft => the tail is to the right of centre, the jaws to the left.
    player.x = zone === 'tail' ? shark.x + shark.width * 0.3 : shark.x - shark.width * 0.3;
    player.y = shark.y;
    player.invincible = 0;
  }, { zone, hp });
}

test.beforeEach(async ({ game }) => {
  await game.startGame();
  await game.patch({ enemies: [] });
});

test.describe('shark activation', () => {
  test('scales HP with the level and resets per-patrol state', async ({ game }) => {
    await game.patch({ level: 3, sharkBitesThisPatrol: 2 });
    await game.eval(() => activateShark());

    const s = await game.state();
    expect(s.shark.active).toBe(true);
    expect(s.sharkActive).toBe(true);
    expect(s.shark.hp).toBe(8 + 3 * 2);
    expect(s.shark.phase).toBe('enter');
    expect(s.sharkBitesThisPatrol).toBe(0);
    expect(s.currentMusic).toBe('shark');
  });

  test('activates on its own once the shark timer runs out', async ({ game }) => {
    await game.patch({ sharkTimer: 3 });
    await game.tick(3);

    const s = await game.state();
    expect(s.sharkActive).toBe(true);
    expect(s.shark.active).toBe(true);
  });
});

test.describe('biting the shark from behind', () => {
  test('damages the shark and never kills the player', async ({ game }) => {
    await engageShark(game, { zone: 'tail', hp: 20 });

    await game.eval(() => checkCollisions());

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.PLAYING);
    expect(s.lives).toBe(5);
    expect(s.shark.hp).toBe(19); // 1 damage at size level 0
    expect(s.shark.hitCooldown).toBe(60);
    expect(s.sharkBitesThisPatrol).toBe(1);
    expect(s.popups.some((p) => p.includes('CHOMP!'))).toBe(true);
  });

  test('bite damage scales with player size', async ({ game }) => {
    const damageBySize = [1, 2, 3, 4, 6, 8];

    for (let size = 0; size < damageBySize.length; size++) {
      await game.patch({ player: { sizeLevel: size } });
      await engageShark(game, { zone: 'tail', hp: 40 });

      await game.eval(() => checkCollisions());

      expect((await game.state()).shark.hp).toBe(40 - damageBySize[size]);
    }
  });

  test('respects the hit cooldown between bites', async ({ game }) => {
    await engageShark(game, { zone: 'tail', hp: 20 });
    await game.eval(() => checkCollisions());
    await game.eval(() => checkCollisions()); // same frame, still on cooldown

    expect((await game.state()).shark.hp).toBe(19);
  });

  test('a third bite in one patrol drops the fishfood jar', async ({ game }) => {
    await engageShark(game, { zone: 'tail', hp: 40 });

    for (let i = 0; i < 3; i++) {
      await game.eval(() => {
        shark.hitCooldown = 0;
        checkCollisions();
      });
    }

    const s = await game.state();
    expect(s.sharkBitesThisPatrol).toBe(3);
    expect(s.powerUpActive).toBe(true);
  });

  test('defeating the shark scores 1000 x level and ends the patrol', async ({ game }) => {
    await game.patch({ level: 4 });
    await engageShark(game, { zone: 'tail', hp: 1 });

    await game.eval(() => checkCollisions());

    const s = await game.state();
    expect(s.shark.active).toBe(false);
    expect(s.sharkActive).toBe(false);
    expect(s.sharkDefeats).toBe(1);
    expect(s.score).toBe(4000);
    expect(s.sharkTimer).toBeGreaterThan(0);
    expect(s.currentMusic).toBe('happy');
    expect(s.popups).toContain('+4000 SHARK!');
  });

  test('a wounded shark turns back from leaving and speeds up', async ({ game }) => {
    await engageShark(game, { zone: 'tail', hp: 20 });

    const result = await game.eval(() => {
      shark.phase = 'exit';
      shark.vx = 1;
      const stayBefore = shark._stayTimer;
      checkCollisions();
      // Turning back re-derives the patrol speed (0.75 + level * 0.075), then the
      // "hit" bonus multiplies it by 1.15.
      const patrolSpeed = 0.75 + level * 0.075;
      return {
        phase: shark.phase,
        vx: shark.vx,
        expectedVx: -patrolSpeed * 1.15, // facingLeft => negative
        stayExtension: shark._stayTimer - stayBefore,
      };
    });

    expect(result.phase).toBe('patrol');
    expect(result.vx).toBeCloseTo(result.expectedVx, 6);
    expect(result.stayExtension).toBe(36 * 5); // five extra seconds to keep fighting
  });

  test('a wounded shark that is still patrolling just speeds up', async ({ game }) => {
    await engageShark(game, { zone: 'tail', hp: 20 });

    const result = await game.eval(() => {
      shark.phase = 'patrol';
      shark.vx = -1;
      checkCollisions();
      return { phase: shark.phase, vx: shark.vx };
    });

    expect(result.phase).toBe('patrol');
    expect(result.vx).toBeCloseTo(-1.15, 6);
  });
});

test.describe('swimming into the jaws', () => {
  test('is fatal', async ({ game }) => {
    await engageShark(game, { zone: 'head', hp: 20 });

    await game.eval(() => checkCollisions());

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.DYING);
    expect(s.lives).toBe(4);
    expect(s.shark.hp).toBe(20); // no damage dealt from the front
  });

  test('only pushes the player away while the starfish shield is up', async ({ game }) => {
    await engageShark(game, { zone: 'head', hp: 20 });
    await game.patch({ starfishImmunityTimer: 200 });

    await game.eval(() => checkCollisions());

    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.PLAYING);
    expect(s.lives).toBe(5);
    expect(s.player.vx).toBeLessThan(0); // shoved away from the shark's centre
  });
});
