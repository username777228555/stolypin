import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAttributionRound,
  buildBlindCampaignRound,
  buildLocateQueue,
  computeBadgeLayouts,
  filterMaps,
  findMapById,
  HISTORICAL_MAPS,
  mapStats,
  resolveMapImage,
  scoreBlindCampaign,
  smoothOverlayPath,
  type AttributionItem,
} from './atlas';

function loadAllEventIds(): Set<string> {
  const dir = path.resolve(process.cwd(), 'content/packs/osnova/data');
  const ids = new Set<string>();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const e of json.events ?? []) ids.add(e.id);
  }
  return ids;
}

test('all 58 real full-color historical maps exist on disk with valid calibrated coordinates, entity links, and non-overlapping callout badges', () => {
  const eventIds = loadAllEventIds();
  assert.equal(HISTORICAL_MAPS.length, 58, `Expected 58 real maps, got ${HISTORICAL_MAPS.length}`);

  const seenMapIds = new Set<string>();
  for (const map of HISTORICAL_MAPS) {
    assert.ok(!seenMapIds.has(map.id), `Duplicate map id: ${map.id}`);
    seenMapIds.add(map.id);

    // Real raster map file must exist in public/content/maps/
    assert.ok(map.image.startsWith('/content/maps/') && map.image.endsWith('.webp'), `Bad image path on ${map.id}`);
    const absImg = path.resolve(process.cwd(), 'public', map.image.replace(/^\//, ''));
    assert.ok(fs.existsSync(absImg), `Missing raster map image on disk: ${absImg}`);
    assert.ok(fs.statSync(absImg).size > 20_000, `Map image unexpectedly tiny: ${absImg}`);
    assert.ok(
      map.width >= 600 && map.height >= 550 && Math.max(map.width, map.height) >= 730,
      `Invalid dimensions on ${map.id}: ${map.width}x${map.height}`,
    );
    assert.ok(map.credit.length > 3 && map.license.length > 1, `Missing attribution on ${map.id}`);

    assert.ok(map.points.length >= 6, `Map ${map.id} should have >=6 points`);
    assert.ok(map.routes.length >= 2, `Map ${map.id} should have >=2 routes`);
    assert.ok(map.statements.length >= 3, `Map ${map.id} should have >=3 statements`);
    assert.ok(map.clues.length >= 2, `Map ${map.id} should have >=2 recognition clues`);

    for (const pt of map.points) {
      assert.ok(
        pt.x >= 2 && pt.x <= 98 && pt.y >= 2 && pt.y <= 98,
        `Point ${map.id}/${pt.id} (${pt.label}) out of 2..98% bounds: (${pt.x}, ${pt.y})`,
      );
      if (pt.mask) {
        assert.ok(
          pt.mask.x >= 0 && pt.mask.y >= 0 && pt.mask.w > 0 && pt.mask.h > 0 && pt.mask.x + pt.mask.w <= 101 && pt.mask.y + pt.mask.h <= 101,
          `Invalid point mask on ${map.id}/${pt.id}`,
        );
      }
      if (pt.entityId) {
        assert.ok(eventIds.has(pt.entityId), `Map ${map.id}/${pt.id} references missing eventId: ${pt.entityId}`);
      }
    }

    for (const bm of map.blindMasks ?? []) {
      assert.ok(bm.x >= 0 && bm.y >= 0 && bm.w > 0 && bm.h > 0 && bm.x + bm.w <= 101 && bm.y + bm.h <= 101);
    }

    const vbH = Math.round((1000 * map.height) / map.width);
    for (const r of map.routes) {
      assert.ok(r.coords.length >= 2);
      for (const [rx, ry] of r.coords) {
        assert.ok(rx >= 0 && rx <= 100 && ry >= 0 && ry <= 100, `Route coord out of bounds on ${map.id}`);
      }
      const svgPath = smoothOverlayPath(r.coords, 1000, vbH);
      assert.ok(svgPath.startsWith('M '), `Invalid route path on ${map.id}`);
    }

    // Callout badges must never overlap each other and must remain strictly inside the map frame
    const pinScale = Math.max(0.88, Math.min(1.16, vbH / 960));
    const badgeR = Math.round(13.2 * pinScale * 10) / 10;
    const layouts = computeBadgeLayouts(map.points, 1000, vbH, badgeR);
    assert.equal(layouts.length, map.points.length);
    for (let i = 0; i < layouts.length; i++) {
      const a = layouts[i]!;
      assert.ok(
        a.bx >= badgeR && a.bx <= 1000 - badgeR && a.by >= badgeR && a.by <= vbH - badgeR,
        `Badge ${map.id}/${a.id} outside frame: (${a.bx}, ${a.by})`,
      );
      for (let j = i + 1; j < layouts.length; j++) {
        const b = layouts[j]!;
        const gap = Math.hypot(a.bx - b.bx, a.by - b.by);
        assert.ok(
          gap >= badgeR * 2.0,
          `Overlapping badges on ${map.id}: ${a.id} & ${b.id} (gap=${gap.toFixed(1)}, min=${(badgeR * 2.0).toFixed(1)})`,
        );
      }
    }
  }

  // Regression check: Kherson (Korsun) on map #1 must sit on southwestern Crimea, not in the Black Sea
  const varangians = findMapById('map-varangians');
  assert.ok(varangians);
  const korsun = varangians.points.find((p) => p.id === 'korsun');
  assert.ok(korsun);
  assert.ok(korsun.x >= 32 && korsun.x <= 37 && korsun.y >= 92 && korsun.y <= 96, `Kherson coordinates off Crimea: (${korsun.x}, ${korsun.y})`);

  // Regression check: Caucasus War must strictly use canonical 1817–1864 dates (no mixed 1784/1801/1813/1828)
  const caucasus = findMapById('map-caucasus');
  assert.ok(caucasus);
  assert.equal(caucasus.span, '1817–1864');
  assert.ok(caucasus.title.includes('1817–1864'));
  for (const pt of caucasus.points) {
    assert.ok(
      !/(1784|1801|1813|1828)/.test(`${pt.year ?? ''} ${pt.label}`),
      `Caucasus point ${pt.id} mixes non-Caucasus-War dates: ${pt.year} ${pt.label}`,
    );
  }

  // Crimean War must now have 5 detailed maps (overview + Sinop + Sevastopol bastions + Balaclava/Inkerman + Kars)
  for (const cid of ['map-crimean', 'map-sinop-1853', 'map-sevastopol-siege', 'map-sevastopol-crimea', 'map-kars-1855']) {
    assert.ok(findMapById(cid), `Missing Crimean War map: ${cid}`);
  }
});

test('filterMaps (period, scope, query), buildLocateQueue, buildBlindCampaignRound, and scoring work reliably', () => {
  const c18 = filterMaps(HISTORICAL_MAPS, { period: 'c18' });
  assert.ok(c18.length >= 10);
  assert.ok(c18.every((m) => m.period === 'c18'));

  const battles = filterMaps(HISTORICAL_MAPS, { scope: 'battle' });
  const campaigns = filterMaps(HISTORICAL_MAPS, { scope: 'campaign' });
  assert.ok(battles.length >= 25, `Expected >=25 battle plans, got ${battles.length}`);
  assert.ok(campaigns.length >= 30, `Expected >=30 campaign maps, got ${campaigns.length}`);
  assert.equal(battles.length + campaigns.length, HISTORICAL_MAPS.length);

  const hits = filterMaps(HISTORICAL_MAPS, { query: 'Бородино' });
  assert.ok(hits.some((m) => m.id === 'map-borodino-1812'));

  const target = hits[0]!;
  const queue = buildLocateQueue(target, () => 0.42);
  assert.equal(queue.length, target.points.length);

  const round = buildBlindCampaignRound(target, HISTORICAL_MAPS, () => 0.25);
  assert.equal(round.titleOptions.length, 4);
  assert.ok(round.titleOptions.some((o) => o.id === target.id));
  assert.equal(round.pointOptions.length, 4);
  assert.ok(round.pointOptions.includes(round.targetPoint.label));

  const perfect = scoreBlindCampaign({
    campaignCorrect: true,
    pointCorrect: true,
    statementsCorrect: 3,
    statementsTotal: 3,
  });
  assert.equal(perfect.score, 1);
  assert.equal(perfect.percent, 100);
  assert.ok(perfect.xp >= 30);

  const stats = mapStats(HISTORICAL_MAPS, {
    [target.id]: { locateBest: 1, blindSolved: true, attempts: 2, lastAt: 100 },
  });
  assert.equal(stats.mastered, 1);
  assert.equal(stats.blindSolved, 1);
});

test('buildAttributionRound picks valid distractors from same culture kind', () => {
  const pool: AttributionItem[] = [
    { id: 'c1', title: 'Софийский собор', kind: 'architecture', period: 'ancient', year: 1037, summary: 's', features: ['13 глав'], src: '/a.webp' },
    { id: 'c2', title: 'Покрова на Нерли', kind: 'architecture', period: 'udel', year: 1165, summary: 's', features: ['одноглавый'], src: '/b.webp' },
    { id: 'c3', title: 'Зимний дворец', kind: 'architecture', period: 'c18', year: 1754, summary: 's', features: ['барокко'], src: '/c.webp' },
    { id: 'c4', title: 'Казанский собор', kind: 'architecture', period: 'c19', year: 1801, summary: 's', features: ['ампир'], src: '/d.webp' },
  ];
  const rTitle = buildAttributionRound(pool, { mode: 'title', random: () => 0.1 });
  assert.ok(rTitle);
  assert.equal(rTitle.options.length, 4);
  assert.ok(rTitle.options.some((o) => o.id === rTitle.correctOptionId));

  const rPeriod = buildAttributionRound(pool, { mode: 'period', random: () => 0.6 });
  assert.ok(rPeriod);
  assert.equal(rPeriod.options.length, 4);
  assert.ok(rPeriod.options.some((o) => o.id === rPeriod.correctOptionId));
});

test('resolveMapImage handles relative base, root base, subpaths, and external URLs cleanly', () => {
  assert.equal(resolveMapImage('/content/maps/varangians.webp', './'), './content/maps/varangians.webp');
  assert.equal(resolveMapImage('/content/maps/varangians.webp', '/'), '/content/maps/varangians.webp');
  assert.equal(resolveMapImage('/content/maps/varangians.webp', '/stolypin/'), '/stolypin/content/maps/varangians.webp');
  assert.equal(resolveMapImage('content/maps/borodino-1812.webp', '/app'), '/app/content/maps/borodino-1812.webp');
  assert.equal(resolveMapImage('https://example.com/map.webp', './'), 'https://example.com/map.webp');
  for (const m of HISTORICAL_MAPS) {
    assert.ok(resolveMapImage(m.image, './').startsWith('./content/maps/'));
  }
});
