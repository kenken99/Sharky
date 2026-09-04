import { test, expect } from './fixtures.js';

const PLAYER_ANIM_FRAMES = 24;
const ENEMY_ANIM_FRAMES = 8;
const SHARK_ANIM_FRAMES = 16;
const SPRITE_CACHE_LIMIT = 1024;

test.describe('sprite cache', () => {
  test('reuses one canvas per animation-cycle position', async ({ game }) => {
    const result = await game.eval((frames) => {
      spriteCache.clear();
      const first = createPlayerFish(2, 5, false);
      const sizeAfterFirst = spriteCache.size;
      const wrapped = createPlayerFish(2, 5 + frames, false);
      const wrappedTwice = createPlayerFish(2, 5 + frames * 3, false);
      return {
        same: first === wrapped && first === wrappedTwice,
        sizeAfterFirst,
        sizeAtEnd: spriteCache.size,
      };
    }, PLAYER_ANIM_FRAMES);

    expect(result.same).toBe(true);
    expect(result.sizeAfterFirst).toBe(1);
    expect(result.sizeAtEnd).toBe(1); // the frame argument is reduced before it becomes a key
  });

  test('a full player animation cycle costs exactly one canvas per frame', async ({ game }) => {
    const size = await game.eval((frames) => {
      spriteCache.clear();
      for (let f = 0; f < frames * 10; f++) createPlayerFish(0, f, false);
      return spriteCache.size;
    }, PLAYER_ANIM_FRAMES);

    expect(size).toBe(PLAYER_ANIM_FRAMES);
  });

  test('enemy and shark frames wrap over their own cycle lengths', async ({ game }) => {
    const result = await game.eval(([enemyFrames, sharkFrames]) => {
      spriteCache.clear();
      const enemyA = createEnemyFish(1, 3, false, 0, 0);
      const enemyB = createEnemyFish(1, 3 + enemyFrames, false, 0, 0);
      const sharkA = createShark(2, true);
      const sharkB = createShark(2 + sharkFrames, true);
      return {
        enemySame: enemyA.canvas === enemyB.canvas,
        sharkSame: sharkA.canvas === sharkB.canvas,
        size: spriteCache.size,
      };
    }, [ENEMY_ANIM_FRAMES, SHARK_ANIM_FRAMES]);

    expect(result.enemySame).toBe(true);
    expect(result.sharkSame).toBe(true);
    expect(result.size).toBe(2);
  });

  test('facing left and right are cached separately', async ({ game }) => {
    const size = await game.eval(() => {
      spriteCache.clear();
      createPlayerFish(0, 0, false);
      createPlayerFish(0, 0, true);
      return spriteCache.size;
    });

    expect(size).toBe(2);
  });

  test('is bounded, evicting the oldest entries first', async ({ game }) => {
    const result = await game.eval((limit) => {
      spriteCache.clear();
      const firstKeyBefore = (() => { createEnemyFish(0, 0, false, 0, 0); return spriteCache.keys().next().value; })();
      // Each distinct colour index is a distinct cache key, so this overflows the cache.
      for (let i = 1; i <= limit + 100; i++) createEnemyFish(0, 0, false, i, 0);
      return {
        size: spriteCache.size,
        oldestEvicted: !spriteCache.has(firstKeyBefore),
        newestKept: spriteCache.has(`enemy_0_${limit + 100}_0_0_false`),
      };
    }, SPRITE_CACHE_LIMIT);

    expect(result.size).toBeLessThanOrEqual(SPRITE_CACHE_LIMIT);
    expect(result.oldestEvicted).toBe(true);
    expect(result.newestKept).toBe(true);
  });

  test('a long play session does not grow the cache without bound', async ({ game }) => {
    await game.startGame();
    await game.pump(1);
    const before = (await game.state()).spriteCacheSize;

    await game.pump(600); // ~17 seconds of gameplay

    const after = (await game.state()).spriteCacheSize;
    expect(after).toBeLessThanOrEqual(1024);
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

test.describe('sprite dimensions', () => {
  test('player sprites are drawn at 2x pixel scale', async ({ game }) => {
    const dims = await game.eval(() => {
      const c = createPlayerFish(0, 0, false);
      return { w: c.width, h: c.height, defW: PLAYER_SIZES[0].w, defH: PLAYER_SIZES[0].h };
    });

    expect(dims.w).toBe(dims.defW * 2);
    expect(dims.h).toBe(dims.defH * 2);
  });

  test('every player size level renders', async ({ game }) => {
    const sizes = await game.eval(() =>
      SIZE_DIMENSIONS.map((_, level) => {
        const c = createPlayerFish(level, 0, false);
        return { w: c.width, h: c.height };
      })
    );

    expect(sizes).toHaveLength(7);
    for (const s of sizes) {
      expect(s.w).toBeGreaterThan(0);
      expect(s.h).toBeGreaterThan(0);
    }
  });

  test('every enemy type renders', async ({ game }) => {
    const drawn = await game.eval(() =>
      ENEMY_TYPES.map((_, type) => {
        const { canvas: c } = createEnemyFish(type, 0, false, 0, 0);
        return c.width > 0 && c.height > 0;
      })
    );

    expect(drawn).toEqual([true, true, true, true, true, true, true]);
  });
});
