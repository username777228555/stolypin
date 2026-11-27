import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAutoReload,
  formatRouteError,
  isDynamicImportError,
  loadRouteWithRetry,
} from './route-loader';

test('isDynamicImportError detects Vite/browser dynamic import failures and ignores normal errors', () => {
  assert.equal(
    isDynamicImportError(
      new TypeError('Failed to fetch dynamically imported module: https://example.com/src/modules/home/HomePage.svelte'),
    ),
    true,
  );
  assert.equal(isDynamicImportError(new TypeError('Importing a module script failed.')), true);
  assert.equal(isDynamicImportError(new Error('504 Outdated Optimize Dep')), true);
  assert.equal(isDynamicImportError(new Error('Cannot read properties of undefined')), false);
});

test('loadRouteWithRetry recovers automatically on transient dynamic import errors', async () => {
  let calls = 0;
  const delays: number[] = [];
  const mod = await loadRouteWithRetry(
    async () => {
      calls++;
      if (calls < 2) {
        throw new TypeError('Failed to fetch dynamically imported module: /src/modules/home/HomePage.svelte');
      }
      return { default: 'HomePage' };
    },
    {
      retries: 2,
      baseDelayMs: 100,
      sleep: async (ms) => {
        delays.push(ms);
      },
    },
  );
  assert.equal(mod.default, 'HomePage');
  assert.equal(calls, 2);
  assert.deepEqual(delays, [100]);
});

test('loadRouteWithRetry does not retry non-import errors and triggers onStaleChunk after exhausting retries', async () => {
  let normalCalls = 0;
  await assert.rejects(
    loadRouteWithRetry(
      async () => {
        normalCalls++;
        throw new Error('Regular runtime bug');
      },
      { retries: 2, sleep: async () => {} },
    ),
    /Regular runtime bug/,
  );
  assert.equal(normalCalls, 1);

  let staleTriggered = false;
  let importCalls = 0;
  await assert.rejects(
    loadRouteWithRetry(
      async () => {
        importCalls++;
        throw new TypeError('Failed to fetch dynamically imported module: /HomePage.svelte');
      },
      {
        retries: 2,
        sleep: async () => {},
        onStaleChunk: () => {
          staleTriggered = true;
          return false;
        },
      },
    ),
    /Failed to fetch dynamically imported module/,
  );
  assert.equal(importCalls, 3);
  assert.equal(staleTriggered, true);
});

test('canAutoReload enforces a cooldown to prevent reload loops', () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  assert.equal(canAutoReload(mockStorage, 100_000), true);
  assert.equal(canAutoReload(mockStorage, 105_000), false);
  assert.equal(canAutoReload(mockStorage, 120_000), true);
});

test('formatRouteError hides raw TypeError URLs behind clear Russian copy', () => {
  const formatted = formatRouteError(
    new TypeError('Failed to fetch dynamically imported module: https://app.run.app/src/modules/home/HomePage.svelte'),
  );
  assert.equal(formatted.canReload, true);
  assert.ok(!formatted.message.includes('TypeError'));
  assert.ok(!formatted.message.includes('HomePage.svelte'));
  assert.ok(formatted.message.includes('Обновить'));
});
