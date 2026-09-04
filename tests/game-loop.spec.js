import { test, expect } from './fixtures.js';

const TARGET_UPDATE_MS = 1000 / 36;
const MAX_UPDATES_PER_FRAME = 5;

test.describe('fixed-timestep game loop', () => {
  test('the first frame only establishes the timebase', async ({ game }) => {
    await game.pump(1, TARGET_UPDATE_MS);

    const s = await game.state();
    expect(s.frameCount).toBe(0);
    expect(s.accumulator).toBe(0);
    expect(s.lastTime).toBeGreaterThan(0);
  });

  test('runs one update per frame at a steady ~36fps', async ({ game }) => {
    await game.pump(1, 28); // prime lastTime
    await game.pump(10, 28);

    const s = await game.state();
    expect(s.frameCount).toBe(10);
    // 28ms frames run marginally ahead of the 27.78ms tick, so a remainder builds up.
    expect(s.accumulator).toBeCloseTo(10 * (28 - TARGET_UPDATE_MS), 6);
  });

  test('a slow 18fps frame rate still runs game time at 36 ticks per second', async ({ game }) => {
    await game.pump(1, 56); // prime lastTime
    await game.pump(10, 56); // half the frame rate, two updates per frame

    expect((await game.state()).frameCount).toBe(20);
  });

  test('keeps a sub-tick remainder in the accumulator', async ({ game }) => {
    await game.pump(1, TARGET_UPDATE_MS);
    await game.pump(1, TARGET_UPDATE_MS * 2.5);

    const s = await game.state();
    expect(s.frameCount).toBe(2);
    expect(s.accumulator).toBeCloseTo(TARGET_UPDATE_MS * 0.5, 6);
  });

  test('caps catch-up at MAX_UPDATES_PER_FRAME and drops the backlog', async ({ game }) => {
    await game.pump(1, TARGET_UPDATE_MS);

    // Simulates a tab that was backgrounded for 5 seconds.
    await game.pump(1, 5000);

    const s = await game.state();
    expect(s.frameCount).toBe(MAX_UPDATES_PER_FRAME);
    expect(s.accumulator).toBe(0); // dropped, not carried into a slow-motion spiral
  });

  test('a dropped backlog does not leak into the next frames', async ({ game }) => {
    await game.pump(1, TARGET_UPDATE_MS);
    await game.pump(1, 5000);
    await game.pump(3, 28);

    expect((await game.state()).frameCount).toBe(MAX_UPDATES_PER_FRAME + 3);
  });

  test('refocusing the tab resets the timebase', async ({ game }) => {
    await game.pump(2, TARGET_UPDATE_MS);
    await game.patch({ accumulator: 999 });

    await game.eval(() => document.dispatchEvent(new Event('visibilitychange')));

    const s = await game.state();
    expect(s.accumulator).toBe(0);
    expect(s.lastTime).toBe(0);

    // ...and the next frame after refocus costs no game time.
    const before = s.frameCount;
    await game.pump(1, 10000);
    expect((await game.state()).frameCount).toBe(before);
  });

  test('renders once per frame regardless of how many updates ran', async ({ game }) => {
    await game.startGame();
    await game.pump(1, TARGET_UPDATE_MS);

    const renders = await game.eval(() => {
      let count = 0;
      const original = window.render;
      window.render = (...args) => { count++; return original(...args); };
      window.__harness.pump(4, 1000 / 36 * 3); // 3 updates' worth of time per frame
      window.render = original;
      return count;
    });

    expect(renders).toBe(4);
  });
});
