import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { LessonItem } from '$lib/core/content/schema';
import {
  blindExcerpt,
  buildGenreOptions,
  buildMarkerSegments,
  buildSoftHint,
  evaluateYearGuess,
  explainGenreTrap,
  extractDocumentProjects,
  extractYearSpan,
  filterProjects,
  mergeProjectRecord,
  parseDocumentYear,
  pickNextProject,
  projectStats,
  resolveProjectTasks,
  scoreWsoshProject,
  WSOSH_CRITERIA_TABLE,
} from './projects';

function loadAllLessons(): LessonItem[] {
  const dir = path.resolve(process.cwd(), 'content/packs/osnova/data');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const out: LessonItem[] = [];
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { lessons?: LessonItem[] };
    if (Array.isArray(raw.lessons)) out.push(...raw.lessons);
  }
  return out;
}

describe('Historical Project (WSOSh 50-point methodology)', () => {
  const lessons = loadAllLessons();
  const projects = extractDocumentProjects(lessons);

  it('extracts all 259 document blocks with parseable dates and non-empty excerpts', () => {
    assert.ok(projects.length >= 250, `Expected >= 250 docs, got ${projects.length}`);
    for (const p of projects) {
      assert.ok(p.excerpt.trim().length > 20, `Empty excerpt on ${p.id}`);
      assert.ok(p.years, `Missing parsed year span on ${p.id} (${p.date})`);
    }
  });

  it('official WSOSh criteria table sums strictly to 50 points', () => {
    const sum = WSOSH_CRITERIA_TABLE.reduce((acc, row) => acc + row.points, 0);
    assert.equal(sum, 50);
  });

  it('parses single years and ranges cleanly', () => {
    assert.equal(parseDocumentYear('19 февраля 1861 года'), 1861);
    assert.deepEqual(extractYearSpan('1861–1864 гг.'), { primary: 1861, min: 1861, max: 1864 });
    assert.equal(extractYearSpan('без даты'), undefined);
  });

  it('blindExcerpt masks document own year(s) ±1 while preserving earlier historical references', () => {
    const masked = blindExcerpt(
      'После событий 1812 года и реформы 1861 года указ от 1862 года подтвердил новые правила.',
      { primary: 1861, min: 1861, max: 1861 },
    );
    assert.ok(masked.includes('1812'), 'Distant earlier year should stay as terminus post quem');
    assert.ok(!masked.includes('1861'), 'Document own year must be masked');
    assert.ok(!masked.includes('1862'), 'Adjacent ±1 year must be masked');
    assert.ok(masked.includes('[…]'), 'Mask marker must appear');
  });

  it('buildMarkerSegments highlights verbatim quoted clues inside the excerpt', () => {
    const text = 'Мы, Божиею милостию, объявляем о даровании прав и вольностей дворянству.';
    const clues = ['Формула «Божиею милостию» и «вольностей дворянству»'];
    const segs = buildMarkerSegments(text, clues);
    const marked = segs.filter((s) => s.marker).map((s) => s.text);
    assert.deepEqual(marked, ['Божиею милостию', 'вольностей дворянству']);
    assert.equal(segs.map((s) => s.text).join(''), text);
  });

  it('buildGenreOptions returns 5 unique options including the correct genre', () => {
    const opts = buildGenreOptions('law', () => 0.3);
    assert.equal(opts.length, 5);
    assert.equal(new Set(opts).size, 5);
    assert.ok(opts.includes('law'));
  });

  it('explainGenreTrap returns targeted olympiad feedback for classic confusable pairs', () => {
    assert.ok(explainGenreTrap('act', 'law')?.includes('Акт'));
    assert.ok(explainGenreTrap('records', 'statistics')?.includes('Учёт'));
    assert.equal(explainGenreTrap('law', 'law'), undefined);
  });

  it('evaluateYearGuess grades exact, close, decade, and miss tiers accurately', () => {
    const span = { primary: 1861, min: 1861, max: 1861 };
    assert.equal(evaluateYearGuess(1861, span).verdict, 'exact');
    assert.equal(evaluateYearGuess(1862, span).verdict, 'exact');
    assert.equal(evaluateYearGuess(1865, span).verdict, 'close');
    assert.equal(evaluateYearGuess(1874, span).verdict, 'decade');
    assert.equal(evaluateYearGuess(1905, span).verdict, 'miss');
  });

  it('resolveProjectTasks guarantees >= 1 analytical task for EVERY document including docs without curated questions', () => {
    for (const p of projects) {
      const tasks = resolveProjectTasks(p);
      assert.ok(tasks.length >= 1, `No tasks for ${p.id}`);
      if (p.questions.length === 0) {
        assert.equal(tasks.length, 2);
        assert.equal(tasks[0]!.isSynthetic, true);
      } else {
        assert.equal(tasks.length, p.questions.length);
        assert.equal(tasks[0]!.isSynthetic, false);
      }
    }
  });

  it('scoreWsoshProject awards exact 50/50 for a perfect breakdown and avoids free points when pre-filtered', () => {
    const perfect = scoreWsoshProject({
      genreCorrect: true,
      periodCorrect: true,
      periodPreFiltered: false,
      yearScore: 1,
      usedHint: false,
      momentChecks: 2,
      sourceChecks: 3,
      tasksHit: 3,
      tasksTotal: 3,
      conclusionChecks: 2,
    });
    assert.equal(perfect.points, 50);
    assert.equal(perfect.score, 1);
    assert.deepEqual(perfect.breakdown, { moment: 10, source: 15, tasks: 18, conclusion: 7 });

    // Pre-filtered by single epoch with wrong year must NOT grant free period points
    const preFilteredMiss = scoreWsoshProject({
      genreCorrect: false,
      periodCorrect: true,
      periodPreFiltered: true,
      yearScore: 0,
      momentChecks: 0,
      sourceChecks: 0,
      tasksHit: 0,
      tasksTotal: 2,
      conclusionChecks: 0,
    });
    assert.equal(preFilteredMiss.breakdown.moment, 0);
    assert.equal(preFilteredMiss.points, 0);

    // Hint penalty deducts 1 point honestly from Block 1
    const withHint = scoreWsoshProject({
      genreCorrect: true,
      periodCorrect: true,
      yearScore: 1,
      usedHint: true,
      momentChecks: 2,
      sourceChecks: 3,
      tasksHit: 2,
      tasksTotal: 2,
      conclusionChecks: 2,
    });
    assert.equal(withHint.breakdown.moment, 9);
    assert.equal(withHint.points, 49);
  });

  it('filtering, stats, record merging, soft hints, and next-project picking work consistently', () => {
    const c19 = filterProjects(projects, { period: 'c19' });
    assert.ok(c19.length > 0);
    assert.ok(c19.every((p) => p.period === 'c19'));

    const rec = mergeProjectRecord(undefined, { score: 0.84, points: 42, genreCorrect: true, periodCorrect: true, at: 100 });
    assert.equal(rec.bestPoints, 42);
    assert.equal(rec.attempts, 1);

    const st = projectStats(projects, { [projects[0]!.id]: rec });
    assert.equal(st.solved, 1);
    assert.equal(st.total, projects.length);

    const next = pickNextProject(projects, {}, { currentId: projects[0]!.id, random: () => 0 });
    assert.ok(next && next.id !== projects[0]!.id);

    const hints = buildSoftHint(projects[0]!, 2);
    assert.ok(hints.length >= 1);
  });
});
