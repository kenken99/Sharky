import { test, expect } from './fixtures.js';

const SIZE_THRESHOLDS = [0, 8, 20, 40, 70, 120, 180];
const SIZE_DIMENSIONS = [
  { w: 32, h: 20 }, { w: 40, h: 26 }, { w: 52, h: 32 }, { w: 64, h: 40 },
  { w: 80, h: 48 }, { w: 96, h: 56 }, { w: 112, h: 64 },
];

/** Eat one enemy of the given type without going through collision detection. */
async function eatOne(game, type = 0) {
  return game.eval((t) => {
    const def = ENEMY_TYPES[t];
    const e = {
      x: player.x, y: player.y, type: t, width: def.w, height: def.h,
      points: def.points, sizeLevel: def.sizeLevel, colorIdx: 0, patternIdx: 0,
    };
    enemies.push(e);
    eatFish(e, enemies.length - 1);
    return { points: def.points, score, comboCount };
  }, type);
}

test.beforeEach(async ({ game }) => {
  await game.startGame();
  await game.patch({ sharkTimer: 100000 });
});

test.describe('scoring and combos', () => {
  test('the first fish scores face value', async ({ game }) => {
    await eatOne(game, 0); // tiny fish, 10 points

    const s = await game.state();
    expect(s.score).toBe(10);
    expect(s.comboCount).toBe(1);
    expect(s.comboTimer).toBe(90);
    expect(s.enemyCount).toBe(0);
  });

  test('the combo multiplier ramps and caps at x5', async ({ game }) => {
    const expected = [10, 20, 30, 40, 50, 50, 50]; // 10 * min(combo, 5)
    let running = 0;

    for (const points of expected) {
      running += points;
      await eatOne(game, 0);
      expect((await game.state()).score).toBe(running);
    }

    expect((await game.state()).comboCount).toBe(expected.length);
  });

  test('scores each fish type at its own value', async ({ game }) => {
    const points = await game.eval(() => ENEMY_TYPES.map((t) => t.points));
    expect(points).toEqual([10, 25, 50, 100, 200, 500, 1000]);

    await game.patch({ player: { sizeLevel: 6, width: 112, height: 64 } });
    await eatOne(game, 3); // large fish, 100 points, first of the combo
    expect((await game.state()).score).toBe(100);
  });

  test('the combo lapses 90 ticks after the last bite', async ({ game }) => {
    await eatOne(game, 0);
    await game.patch({ enemies: [] });

    await game.tick(89);
    expect((await game.state()).comboCount).toBe(1);

    await game.tick(1);
    const s = await game.state();
    expect(s.comboCount).toBe(0);
    expect(s.comboTimer).toBe(0);
  });

  test('shows a combo popup once the multiplier is above 1', async ({ game }) => {
    await eatOne(game, 0);
    expect((await game.state()).popups).toContain('+10');

    await eatOne(game, 0);
    expect((await game.state()).popups).toContain('+20 x2!');
  });
});

test.describe('growth', () => {
  test('grows one size level at each eat-count threshold', async ({ game }) => {
    for (let nextSize = 1; nextSize < SIZE_THRESHOLDS.length; nextSize++) {
      await game.patch({
        player: {
          sizeLevel: nextSize - 1,
          eatCount: SIZE_THRESHOLDS[nextSize] - 1,
          width: SIZE_DIMENSIONS[nextSize - 1].w,
          height: SIZE_DIMENSIONS[nextSize - 1].h,
        },
      });

      await eatOne(game, 0);

      const s = await game.state();
      expect(s.player.sizeLevel).toBe(nextSize);
      expect(s.player.width).toBe(SIZE_DIMENSIONS[nextSize].w);
      expect(s.player.height).toBe(SIZE_DIMENSIONS[nextSize].h);
      // Level tracks size: level 1 at size 0, level 7 at size 6.
      expect(s.level).toBe(nextSize + 1);

      if (s.gameState === s.STATE.BONUS) await game.eval(() => endBonusRound());
    }
  });

  test('does not grow before the threshold is reached', async ({ game }) => {
    await game.patch({ player: { sizeLevel: 0, eatCount: 6 } });
    await eatOne(game, 0);

    const s = await game.state();
    expect(s.player.eatCount).toBe(7);
    expect(s.player.sizeLevel).toBe(0);
    expect(s.level).toBe(1);
  });

  test('stops growing past the largest size', async ({ game }) => {
    await game.patch({
      player: { sizeLevel: 6, eatCount: 500, width: 112, height: 64 },
      level: 7,
    });
    await eatOne(game, 0);

    const s = await game.state();
    expect(s.player.sizeLevel).toBe(6);
    expect(s.player.width).toBe(112);
    expect(s.level).toBe(7);
  });

  test('a size-up flashes the screen and fires the level-up effect', async ({ game }) => {
    await game.patch({ player: { sizeLevel: 0, eatCount: 7 } });
    await eatOne(game, 0);

    const effects = await game.eval(() => ({ flashTimer, levelUpTimer }));
    expect(effects.flashTimer).toBe(20);
    expect(effects.levelUpTimer).toBe(60);
  });

  test('reaching level 5 kicks off a bonus round', async ({ game }) => {
    await game.patch({
      player: { sizeLevel: 3, eatCount: SIZE_THRESHOLDS[4] - 1, width: 64, height: 40 },
    });

    await eatOne(game, 0);

    const s = await game.state();
    expect(s.level).toBe(5);
    expect(s.gameState).toBe(s.STATE.BONUS);
  });

  test('non-multiple-of-5 levels stay in play', async ({ game }) => {
    await game.patch({
      player: { sizeLevel: 0, eatCount: SIZE_THRESHOLDS[1] - 1 },
    });

    await eatOne(game, 0);

    const s = await game.state();
    expect(s.level).toBe(2);
    expect(s.gameState).toBe(s.STATE.PLAYING);
  });
});

test.describe('the super fishfood jar', () => {
  test('grows the player a whole size level on pickup', async ({ game }) => {
    await game.eval(() => {
      spawnPowerUp();
      powerUp.x = player.x;
      powerUp.y = player.y;
    });

    await game.tick(1);

    const s = await game.state();
    expect(s.powerUpActive).toBe(false);
    expect(s.player.sizeLevel).toBe(1);
    expect(s.player.width).toBe(SIZE_DIMENSIONS[1].w);
    expect(s.player.eatCount).toBe(SIZE_THRESHOLDS[1]);
    expect(s.popups).toContain('SUPER GROW!');
  });

  test('is capped at size level 5', async ({ game }) => {
    await game.patch({ player: { sizeLevel: 5, width: 96, height: 56, eatCount: 120 } });
    await game.eval(() => {
      spawnPowerUp();
      powerUp.x = player.x;
      powerUp.y = player.y;
    });

    await game.tick(1);

    const s = await game.state();
    expect(s.powerUpActive).toBe(false);
    expect(s.player.sizeLevel).toBe(5);
  });
});
