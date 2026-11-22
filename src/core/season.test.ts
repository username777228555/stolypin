import test from 'node:test';
import assert from 'node:assert/strict';
import { isWinterSeason, resolveWinterTheme, daysUntilNewYear } from './season';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0);

test('isWinterSeason activates on Nov 15 and runs through Jan 20', () => {
  assert.equal(isWinterSeason(d(2026, 11, 14)), false);
  assert.equal(isWinterSeason(d(2026, 11, 15)), true);
  assert.equal(isWinterSeason(d(2026, 11, 21)), true);
  assert.equal(isWinterSeason(d(2026, 12, 31)), true);
  assert.equal(isWinterSeason(d(2027, 1, 1)), true);
  assert.equal(isWinterSeason(d(2027, 1, 20)), true);
  assert.equal(isWinterSeason(d(2027, 1, 21)), false);
  assert.equal(isWinterSeason(d(2026, 7, 4)), false);
});

test('resolveWinterTheme picks gzhel in light and khokhloma in dark during season', () => {
  const nov21 = d(2026, 11, 21);
  const nov14 = d(2026, 11, 14);

  assert.equal(resolveWinterTheme('auto', false, nov21), 'gzhel');
  assert.equal(resolveWinterTheme('auto', true, nov21), 'khokhloma');
  assert.equal(resolveWinterTheme('auto', false, nov14), 'off');
  assert.equal(resolveWinterTheme('auto', true, nov14), 'off');
});

test('explicit winter preferences and default gzhel override date window and light/dark auto-pick', () => {
  const summer = d(2026, 6, 15);
  const dec25 = d(2026, 12, 25);

  assert.equal(resolveWinterTheme(undefined, false, summer), 'gzhel');
  assert.equal(resolveWinterTheme(undefined, true, dec25), 'gzhel');
  assert.equal(resolveWinterTheme('gzhel', true, summer), 'gzhel');
  assert.equal(resolveWinterTheme('khokhloma', false, summer), 'khokhloma');
  assert.equal(resolveWinterTheme('off', false, dec25), 'off');
  assert.equal(resolveWinterTheme('off', true, dec25), 'off');
});

test('daysUntilNewYear counts down accurately in Nov 15 - Dec 31', () => {
  assert.equal(daysUntilNewYear(d(2026, 11, 14)), null);
  assert.equal(daysUntilNewYear(d(2026, 11, 15)), 47);
  assert.equal(daysUntilNewYear(d(2026, 12, 31)), 1);
  assert.equal(daysUntilNewYear(d(2027, 1, 1)), 0);
  assert.equal(daysUntilNewYear(d(2027, 1, 5)), null);
});
