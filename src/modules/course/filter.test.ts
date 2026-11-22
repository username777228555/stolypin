import test from 'node:test';
import assert from 'node:assert/strict';
import type { LessonBlock, LessonItem } from '$lib/core/content/schema';
import type { LessonState } from './progress';
import {
  adjacentLessons,
  courseStats,
  extractLessonDebates,
  filterDebates,
  filterLessons,
  flattenDebateCards,
  isDeepLesson,
  lessonBlockSummary,
  lessonSearchText,
  stripLessonLinks,
} from './filter';

const makeLesson = (
  id: string,
  period: string,
  order: number,
  title: string,
  extra: Partial<LessonItem> = {},
): LessonItem => ({
  id,
  period,
  order,
  title,
  goals: ['Цель урока'],
  sections: [{ title: 'Раздел 1', text: 'Текст про [[p-nikolay-1|Николая I]] и [[e-1825]] реформы.' }],
  summary: ['Итог'],
  entities: [],
  quiz: [],
  ...extra,
});

const SAMPLE_BLOCKS: LessonBlock[] = [
  {
    type: 'document',
    title: 'Речь в Государственном совете',
    genre: 'office',
    excerpt: 'Крепостное право есть зло...',
  },
  {
    type: 'debate',
    question: 'Была ли эпоха [[p-nikolay-1|Николая I]] временем застоя?',
    positions: [
      {
        who: 'С. В. Мироненко',
        work: 'Самодержавие и реформы',
        year: 1989,
        thesis: 'Власть готовила отмену крепостного права в секретных комитетах.',
        argument: 'Реформа Киселёва и указ об обязанных крестьянах создали юридическую базу.',
        ref: 'Мироненко, 1989',
      },
      {
        who: 'А. Е. Пресняков',
        work: 'Апогей самодержавия',
        year: 1925,
        thesis: 'Режим стремился законсервировать существующий порядок.',
        argument: 'Главной целью оставалась охрана политической стабильности.',
        ref: 'Пресняков, 1925',
      },
    ],
  },
];

const LESSONS: LessonItem[] = [
  makeLesson('l-1', 'rus', 1, 'Восточные славяне'),
  makeLesson('l-2', 'rus', 2, 'Крещение Руси'),
  makeLesson('l-3', 'c19', 1, 'Александр I'),
  makeLesson('l-4', 'c19', 2, 'Николай I', {
    question: 'Тридцать лет застоя или подготовка реформ?',
    sections: [
      {
        title: 'Внутренняя политика',
        text: 'Текст про [[p-nikolay-1|Николая I]] и [[e-1825]] реформы.',
        blocks: SAMPLE_BLOCKS,
      },
    ],
  }),
];

const NOW = 10_000_000;

const STATE: Record<string, LessonState> = {
  'l-1': { done: NOW - 5000, step: 0, due: NOW - 1000 }, // done & due
  'l-2': { done: NOW - 2000, step: 1, due: NOW + 5000 }, // done, not due
  'l-3': { step: 0, at: 2 }, // in progress
};

test('courseStats aggregates done, due, in-progress, and deep lessons', () => {
  assert.deepEqual(courseStats(LESSONS, STATE, NOW), {
    total: 4,
    done: 2,
    due: 1,
    inProgress: 1,
    deep: 1,
  });
});

test('isDeepLesson and lessonBlockSummary inspect structured lesson blocks', () => {
  assert.equal(isDeepLesson(LESSONS[0]!), false);
  assert.equal(isDeepLesson(LESSONS[3]!), true);
  assert.deepEqual(lessonBlockSummary(LESSONS[3]!), {
    documents: 1,
    debates: 1,
    essays: 0,
    arguments: 0,
    total: 2,
  });
});

test('filterLessons filters by period, status, and deepOnly', () => {
  assert.deepEqual(
    filterLessons(LESSONS, STATE, { period: 'c19', now: NOW }).map((l) => l.id),
    ['l-3', 'l-4'],
  );
  assert.deepEqual(
    filterLessons(LESSONS, STATE, { period: 'c19', deepOnly: true, now: NOW }).map((l) => l.id),
    ['l-4'],
  );
  assert.deepEqual(
    filterLessons(LESSONS, STATE, { filter: 'due', now: NOW }).map((l) => l.id),
    ['l-1'],
  );
  assert.deepEqual(
    filterLessons(LESSONS, STATE, { filter: 'todo', now: NOW }).map((l) => l.id),
    ['l-3', 'l-4'],
  );
  assert.deepEqual(
    filterLessons(LESSONS, STATE, { filter: 'done', now: NOW }).map((l) => l.id),
    ['l-1', 'l-2'],
  );
});

test('adjacentLessons returns prev and next in course order', () => {
  assert.equal(adjacentLessons(LESSONS, 'l-1').prev, undefined);
  assert.equal(adjacentLessons(LESSONS, 'l-1').next?.id, 'l-2');
  assert.equal(adjacentLessons(LESSONS, 'l-2').prev?.id, 'l-1');
  assert.equal(adjacentLessons(LESSONS, 'l-2').next?.id, 'l-3');
  assert.equal(adjacentLessons(LESSONS, 'l-4').next, undefined);
  assert.deepEqual(adjacentLessons(LESSONS, 'missing'), {});
});

test('stripLessonLinks and lessonSearchText extract clean searchable text', () => {
  assert.equal(stripLessonLinks('Указ [[p-peter|Петра I]] от [[e-1722]] года'), 'Указ Петра I от  года');
  const txt = lessonSearchText(LESSONS[0]!);
  assert.match(txt, /Николая I/);
  assert.doesNotMatch(txt, /\[\[p-nikolay-1/);
  assert.doesNotMatch(txt, /e-1825/);
});

test('extractLessonDebates, filterDebates, and flattenDebateCards build historian revision index', () => {
  const debates = extractLessonDebates(LESSONS);
  assert.equal(debates.length, 1);
  assert.equal(debates[0]!.lessonId, 'l-4');
  assert.equal(debates[0]!.positions.length, 2);

  assert.equal(filterDebates(debates, { period: 'rus' }).length, 0);
  assert.equal(filterDebates(debates, { period: 'c19', query: 'мироненко' }).length, 1);
  assert.equal(filterDebates(debates, { query: 'апогей самодержавия' }).length, 1);
  assert.equal(filterDebates(debates, { query: 'несуществующий' }).length, 0);

  const cards = flattenDebateCards(debates);
  assert.equal(cards.length, 2);
  assert.equal(cards[0]!.position.who, 'С. В. Мироненко');
  assert.equal(cards[1]!.position.who, 'А. Е. Пресняков');
});
