import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CultureItem,
  EventItem,
  LessonItem,
  PersonItem,
  TermItem,
} from '$lib/core/content/schema';
import {
  buildThemeBundle,
  createChronologyDrill,
  CROSS_THEMES,
  evaluateChronologyDrill,
  filterThemes,
  findThemeById,
  type ThemeDataSource,
} from './themes';

function loadRealKb(): ThemeDataSource {
  const dir = path.resolve(process.cwd(), 'content/packs/osnova/data');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const lessons: LessonItem[] = [];
  const eventsById = new Map<string, EventItem>();
  const personsById = new Map<string, PersonItem>();
  const termsById = new Map<string, TermItem>();
  const cultureById = new Map<string, CultureItem>();

  for (const f of files) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const l of json.lessons ?? []) lessons.push(l);
    for (const e of json.events ?? []) eventsById.set(e.id, e);
    for (const p of json.persons ?? []) personsById.set(p.id, p);
    for (const t of json.terms ?? []) termsById.set(t.id, t);
    for (const c of json.culture ?? []) cultureById.set(c.id, c);
  }
  return { lessons, eventsById, personsById, termsById, cultureById };
}

test('all 11 cross-century themes reference 100% valid real IDs in osnova (zero dangling IDs)', () => {
  const kb = loadRealKb();
  const lessonIds = new Set(kb.lessons.map((l) => l.id));
  const themeIds = new Set<string>();

  assert.ok(CROSS_THEMES.length >= 10, `Expected at least 10 themes, got ${CROSS_THEMES.length}`);

  for (const theme of CROSS_THEMES) {
    assert.ok(!themeIds.has(theme.id), `Duplicate theme id: ${theme.id}`);
    themeIds.add(theme.id);
    assert.ok(theme.stages.length >= 3, `Theme ${theme.id} should have >=3 stages`);
    assert.ok(theme.essayTasks.length >= 3, `Theme ${theme.id} should have >=3 essay tasks`);
    assert.ok(theme.comparePairs.length >= 1, `Theme ${theme.id} should have >=1 comparison pair`);

    for (const stage of theme.stages) {
      for (const lid of stage.lessonIds) {
        assert.ok(lessonIds.has(lid), `Theme ${theme.id}/${stage.id} references missing lessonId: ${lid}`);
      }
      for (const eid of stage.milestoneIds) {
        assert.ok(kb.eventsById.has(eid), `Theme ${theme.id}/${stage.id} references missing eventId: ${eid}`);
      }
    }
    for (const pid of theme.keyPersons) {
      assert.ok(kb.personsById.has(pid), `Theme ${theme.id} references missing personId: ${pid}`);
    }
    for (const tid of theme.keyTerms) {
      assert.ok(kb.termsById.has(tid), `Theme ${theme.id} references missing termId: ${tid}`);
    }
    for (const cid of theme.keyCulture) {
      assert.ok(kb.cultureById.has(cid), `Theme ${theme.id} references missing cultureId: ${cid}`);
    }
  }
});

test('buildThemeBundle aggregates lessons, chronological milestones, debates, documents, and pitfalls', () => {
  const kb = loadRealKb();
  for (const theme of CROSS_THEMES) {
    const bundle = buildThemeBundle(theme, kb, {
      [theme.stages[0]!.lessonIds[0]!]: { done: 1000, step: 1, due: Date.now() + 86400000 },
    });
    assert.ok(bundle.lessons.length >= 4, `Theme ${theme.id} should resolve >=4 lessons`);
    assert.equal(bundle.stats.doneLessons, 1);
    assert.ok(bundle.debates.length >= 3, `Theme ${theme.id} should aggregate >=3 debates, got ${bundle.debates.length}`);
    assert.ok(bundle.documents.length >= 2, `Theme ${theme.id} should aggregate >=2 documents, got ${bundle.documents.length}`);

    // Milestones must be sorted ascending by year
    for (let i = 1; i < bundle.milestones.length; i++) {
      assert.ok(
        bundle.milestones[i - 1]!.event.year <= bundle.milestones[i]!.event.year,
        `Milestones out of chronological order in ${theme.id}`,
      );
    }
  }
});

test('filterThemes and findThemeById filter accurately by category and Russian query', () => {
  assert.ok(findThemeById('agrarian'));
  assert.equal(findThemeById('non-existent'), undefined);

  const foreign = filterThemes(CROSS_THEMES, { category: 'foreign' });
  assert.ok(foreign.length >= 2);
  assert.ok(foreign.every((t) => t.category === 'foreign'));

  const moneyHits = filterThemes(CROSS_THEMES, { query: 'Витте' });
  assert.ok(moneyHits.some((t) => t.id === 'money'));
});

test('createChronologyDrill and evaluateChronologyDrill score exact and partial ordering fairly', () => {
  const kb = loadRealKb();
  const agrarian = buildThemeBundle(findThemeById('agrarian')!, kb);
  const drill = createChronologyDrill(agrarian.milestones, 4, () => 0.37);

  assert.equal(drill.length, 4);
  const uniqueYears = new Set(drill.map((e) => e.year));
  assert.equal(uniqueYears.size, 4, 'Chronology drill items must have distinct years');

  const perfectOrder = [...drill].sort((a, b) => a.year - b.year).map((e) => e.id);
  const perfectRes = evaluateChronologyDrill(perfectOrder, drill);
  assert.equal(perfectRes.allCorrect, true);
  assert.equal(perfectRes.score, 1);
  assert.equal(perfectRes.xp, 20);

  const reversedOrder = [...perfectOrder].reverse();
  const wrongRes = evaluateChronologyDrill(reversedOrder, drill);
  assert.equal(wrongRes.allCorrect, false);
  assert.equal(wrongRes.score, 0);
});
