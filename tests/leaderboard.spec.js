import { test, expect } from './fixtures.js';

const STORAGE_KEY = 'sharkyLeaderboard';
const DEFAULT_TOP = { name: 'ORC', score: 20000 };

const readStorage = (game) =>
  game.eval((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY);

test.describe('persistence', () => {
  test('seeds the default table when storage is empty', async ({ game }) => {
    await game.reload();

    const s = await game.state();
    expect(s.leaderboard).toHaveLength(10);
    expect(s.leaderboard[0]).toEqual(DEFAULT_TOP);
    expect(s.leaderboard.at(-1)).toEqual({ name: 'CLM', score: 2000 });
    expect(s.highScore).toBe(20000);
  });

  test('loads a saved table', async ({ game }) => {
    const saved = Array.from({ length: 10 }, (_, i) => ({ name: 'AAA', score: 99000 - i * 1000 }));
    await game.reload({ storage: { [STORAGE_KEY]: JSON.stringify(saved) } });

    const s = await game.state();
    expect(s.leaderboard).toEqual(saved);
    expect(s.highScore).toBe(99000);
  });

  test('falls back to the defaults when storage is corrupt', async ({ game }) => {
    await game.reload({ storage: { [STORAGE_KEY]: 'not json at all' } });

    const s = await game.state();
    expect(s.leaderboard).toHaveLength(10);
    expect(s.leaderboard[0]).toEqual(DEFAULT_TOP);
  });

  test('a committed entry survives a reload', async ({ game }) => {
    await game.reload();
    await game.patch({ gameState: 6, hsEntryRank: 0, score: 50000 });

    await game.press('k');
    await game.press('e');
    await game.press('n');
    await game.press('Enter');

    const stored = await readStorage(game);
    expect(stored).toHaveLength(10);
    expect(stored[0]).toEqual({ name: 'KEN', score: 50000 });

    await game.reload({ clear: false });
    const s = await game.state();
    expect(s.leaderboard[0]).toEqual({ name: 'KEN', score: 50000 });
    expect(s.highScore).toBe(50000);
  });
});

test.describe('initials entry', () => {
  test.beforeEach(async ({ game }) => {
    await game.reload();
    await game.patch({ gameState: 6, hsEntryRank: 4, score: 13000 });
  });

  test('typing letters fills the initials left to right', async ({ game }) => {
    await game.press('a');
    await game.press('b');
    await game.press('c');

    const s = await game.state();
    expect(s.hsEntryInitials).toEqual(['A', 'B', 'C']);
    expect(s.hsEntryPos).toBe(2); // parks on the last slot
  });

  test('arrow up and down cycle a letter and wrap around', async ({ game }) => {
    await game.press('ArrowUp');
    expect((await game.state()).hsEntryInitials[0]).toBe('B');

    await game.press('ArrowDown');
    await game.press('ArrowDown'); // A wraps back to Z
    expect((await game.state()).hsEntryInitials[0]).toBe('Z');

    await game.press('ArrowUp'); // Z wraps forward to A
    expect((await game.state()).hsEntryInitials[0]).toBe('A');
  });

  test('left and right move between slots and clamp at the ends', async ({ game }) => {
    await game.press('ArrowLeft');
    expect((await game.state()).hsEntryPos).toBe(0);

    await game.press('ArrowRight');
    await game.press('ArrowRight');
    await game.press('ArrowRight'); // clamps at the third slot
    expect((await game.state()).hsEntryPos).toBe(2);

    await game.press('ArrowLeft');
    expect((await game.state()).hsEntryPos).toBe(1);
  });

  test('space also advances to the next slot', async ({ game }) => {
    await game.press(' ');
    expect((await game.state()).hsEntryPos).toBe(1);
  });

  test('enter commits the entry at the qualifying rank', async ({ game }) => {
    await game.press('x');
    await game.press('y');
    await game.press('z');
    await game.press('Enter');

    const s = await game.state();
    expect(s.leaderboard).toHaveLength(10); // still exactly ten places
    expect(s.leaderboard[4]).toEqual({ name: 'XYZ', score: 13000 });
    expect(s.leaderboard[5]).toEqual({ name: 'TRT', score: 12000 }); // pushed down
    expect(s.leaderboard.map((e) => e.score)).toEqual([...s.leaderboard.map((e) => e.score)].sort((a, b) => b - a));
    expect(s.gameState).toBe(s.STATE.TITLE);
    expect(s.attractPhase).toBe(0);
  });

  test('M is reserved for the music toggle, so it cannot be used as an initial', async ({ game }) => {
    await game.press('m');

    const s = await game.state();
    expect(s.hsEntryInitials).toEqual(['A', 'A', 'A']); // ignored, not entered
    expect(s.musicEnabled).toBe(true); // and it does not toggle music here either
    expect(s.gameState).toBe(s.STATE.HIGH_SCORE_ENTRY);
  });

  test('digits and punctuation are ignored', async ({ game }) => {
    await game.press('5');
    await game.press('-');

    const s = await game.state();
    expect(s.hsEntryInitials).toEqual(['A', 'A', 'A']);
    expect(s.hsEntryPos).toBe(0);
  });
});
