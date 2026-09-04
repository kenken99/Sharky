import { test, expect } from './fixtures.js';

const ASPECT = 640 / 480;

test.describe('page + canvas smoke', () => {
  test('loads the game with a 640x480 logical canvas', async ({ game, page }) => {
    await expect(page).toHaveTitle('Sharky Sharkster');

    const canvas = page.locator('#gameCanvas');
    await expect(canvas).toBeVisible();

    const backingStore = await game.eval(() => ({ w: canvas.width, h: canvas.height, GW, GH }));
    expect(backingStore).toEqual({ w: 640, h: 480, GW: 640, GH: 480 });
  });

  test('boots into the title screen with nothing simulated yet', async ({ game }) => {
    const s = await game.state();
    expect(s.gameState).toBe(s.STATE.TITLE);
    expect(s.frameCount).toBe(0);
    expect(s.score).toBe(0);
    expect(s.attractPhase).toBe(0);
  });

  test('renders a non-blank title frame', async ({ game }) => {
    await game.pump(20);

    const pixels = await game.eval(() => {
      const data = ctx.getImageData(0, 0, GW, GH).data;
      const colors = new Set();
      let opaque = 0;
      for (let i = 0; i < data.length; i += 4 * 97) {
        if (data[i + 3] > 0) opaque++;
        colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return { distinctColors: colors.size, opaque };
    });

    expect(pixels.opaque).toBeGreaterThan(0);
    expect(pixels.distinctColors).toBeGreaterThan(5);
  });

  test('runs 300 frames of attract mode without console or page errors', async ({ game }) => {
    await game.pump(300);

    expect(game.pageErrors).toEqual([]);
    expect(game.consoleErrors).toEqual([]);
  });

  test('renders playing, bonus and game-over states without errors', async ({ game }) => {
    await game.startGame();
    await game.pump(60);

    await game.eval(() => startBonusRound());
    await game.pump(30);

    await game.patch({ gameState: 3, gameOverTimer: 120 }); // STATE.GAME_OVER
    await game.pump(30);

    await game.patch({ gameState: 6, hsEntryRank: 0 }); // STATE.HIGH_SCORE_ENTRY
    await game.pump(30);

    expect(game.pageErrors).toEqual([]);
    expect(game.consoleErrors).toEqual([]);
  });

  test('scales the canvas to the viewport while keeping 4:3', async ({ game, page }) => {
    const measure = () =>
      game.eval(() => ({
        cssW: parseFloat(canvas.style.width),
        cssH: parseFloat(canvas.style.height),
        innerW: window.innerWidth,
        innerH: window.innerHeight,
      }));

    // resizeCanvas(): scale = min(innerW / 640, innerH / 480) * 0.95
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect.poll(async () => (await measure()).cssW).toBeCloseTo(912, 0);

    const wide = await measure();
    expect(wide.cssH).toBeCloseTo(684, 0); // height-bound, with 5% breathing room
    expect(wide.cssW / wide.cssH).toBeCloseTo(ASPECT, 3);
    expect(wide.cssH).toBeLessThanOrEqual(wide.innerH);

    await page.setViewportSize({ width: 640, height: 480 });
    await expect.poll(async () => (await measure()).cssW).toBeCloseTo(608, 0);

    const small = await measure();
    expect(small.cssH).toBeCloseTo(456, 0);
    expect(small.cssW / small.cssH).toBeCloseTo(ASPECT, 3);
  });

});
