/**
 * Pure helpers for the «Курс» module: filtering lessons by epoch, progress status and deep format,
 * computing summary counts and block composition, finding adjacent lessons (prev/next), extracting
 * plain search text, and building the «Споры историков» revision index.
 */
import type { LessonBlock, LessonItem } from '$lib/core/content/schema';
import type { LessonState } from './progress';

export type LessonFilter = 'all' | 'todo' | 'due' | 'done';

export interface CourseStats {
  total: number;
  done: number;
  due: number;
  inProgress: number;
  deep: number;
}

export interface LessonBlockSummary {
  documents: number;
  debates: number;
  essays: number;
  arguments: number;
  total: number;
}

export type DebateBlock = Extract<LessonBlock, { type: 'debate' }>;
export type DebatePosition = DebateBlock['positions'][number];

export interface DebateEntry {
  id: string;
  lessonId: string;
  lessonTitle: string;
  lessonOrder: number;
  period: string;
  sectionIndex: number;
  sectionTitle: string;
  question: string;
  positions: DebatePosition[];
  note?: string;
}

export interface DebateFlashcard {
  id: string;
  debateId: string;
  lessonId: string;
  lessonTitle: string;
  period: string;
  question: string;
  position: DebatePosition;
}

export function isLessonDue(st: LessonState | undefined, now = Date.now()): boolean {
  return !!st?.done && !!st.due && st.due <= now;
}

/** A lesson in the deep olympiad format has a central question and structured section blocks. */
export function isDeepLesson(lesson: Pick<LessonItem, 'question' | 'sections'>): boolean {
  return Boolean(lesson.question) && lesson.sections.some((sec) => (sec.blocks?.length ?? 0) > 0);
}

export function lessonBlockSummary(lesson: Pick<LessonItem, 'sections'>): LessonBlockSummary {
  let documents = 0;
  let debates = 0;
  let essays = 0;
  let args = 0;
  let total = 0;
  for (const sec of lesson.sections) {
    for (const b of sec.blocks ?? []) {
      total++;
      if (b.type === 'document') documents++;
      else if (b.type === 'debate') debates++;
      else if (b.type === 'essay') essays++;
      else if (b.type === 'argument') args++;
    }
  }
  return { documents, debates, essays, arguments: args, total };
}

export function courseStats(
  lessons: readonly LessonItem[],
  state: Readonly<Record<string, LessonState>>,
  now = Date.now(),
): CourseStats {
  let done = 0;
  let due = 0;
  let inProgress = 0;
  let deep = 0;
  for (const l of lessons) {
    if (isDeepLesson(l)) deep++;
    const s = state[l.id];
    if (s?.done) {
      done++;
      if (isLessonDue(s, now)) due++;
    } else if (s?.at !== undefined) {
      inProgress++;
    }
  }
  return { total: lessons.length, done, due, inProgress, deep };
}

export function filterLessons(
  lessons: readonly LessonItem[],
  state: Readonly<Record<string, LessonState>>,
  opts: { period?: string | null; filter?: LessonFilter; deepOnly?: boolean; now?: number } = {},
): LessonItem[] {
  const { period = null, filter = 'all', deepOnly = false, now = Date.now() } = opts;
  return lessons.filter((l) => {
    if (period && l.period !== period) return false;
    if (deepOnly && !isDeepLesson(l)) return false;
    const s = state[l.id];
    if (filter === 'todo') return !s?.done;
    if (filter === 'due') return isLessonDue(s, now);
    if (filter === 'done') return !!s?.done;
    return true;
  });
}

export function adjacentLessons(
  lessons: readonly LessonItem[],
  currentId: string,
): { prev?: LessonItem; next?: LessonItem } {
  const idx = lessons.findIndex((l) => l.id === currentId);
  if (idx === -1) return {};
  return {
    prev: idx > 0 ? lessons[idx - 1] : undefined,
    next: idx + 1 < lessons.length ? lessons[idx + 1] : undefined,
  };
}

/** Strips `[[id|label]]` and `[[id]]` markup so lesson text indexes cleanly for search. */
export function stripLessonLinks(text: string): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, _id: string, label?: string) => label ?? '');
}

export function lessonSearchText(lesson: Pick<LessonItem, 'question' | 'goals' | 'summary' | 'sections'>): string {
  const parts: string[] = [];
  if (lesson.question) parts.push(stripLessonLinks(lesson.question));
  for (const g of lesson.goals) parts.push(g);
  for (const s of lesson.summary) parts.push(s);
  for (const sec of lesson.sections) {
    parts.push(sec.title);
    parts.push(stripLessonLinks(sec.text));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Collects all structured historian debates from course lessons in course order. */
export function extractLessonDebates(lessons: readonly LessonItem[]): DebateEntry[] {
  const out: DebateEntry[] = [];
  for (const lesson of lessons) {
    lesson.sections.forEach((sec, sectionIndex) => {
      let blockIdx = 0;
      for (const b of sec.blocks ?? []) {
        if (b.type === 'debate' && b.positions.length > 0) {
          out.push({
            id: `${lesson.id}:s${sectionIndex}:d${blockIdx++}`,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            lessonOrder: lesson.order,
            period: lesson.period,
            sectionIndex,
            sectionTitle: sec.title,
            question: b.question,
            positions: b.positions,
            note: b.note,
          });
        }
      }
    });
  }
  return out;
}

export function filterDebates(
  debates: readonly DebateEntry[],
  opts: { period?: string | null; query?: string } = {},
): DebateEntry[] {
  const { period = null } = opts;
  const q = (opts.query ?? '').trim().toLowerCase();
  return debates.filter((d) => {
    if (period && d.period !== period) return false;
    if (!q) return true;
    const hay = [
      d.lessonTitle,
      d.sectionTitle,
      stripLessonLinks(d.question),
      ...d.positions.flatMap((p) => [p.who, p.work, stripLessonLinks(p.thesis), stripLessonLinks(p.argument)]),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Flattens debate entries into individual historian-position flashcards for active recall training. */
export function flattenDebateCards(debates: readonly DebateEntry[]): DebateFlashcard[] {
  const out: DebateFlashcard[] = [];
  for (const d of debates) {
    d.positions.forEach((position, i) => {
      out.push({
        id: `${d.id}:p${i}`,
        debateId: d.id,
        lessonId: d.lessonId,
        lessonTitle: d.lessonTitle,
        period: d.period,
        question: d.question,
        position,
      });
    });
  }
  return out;
}
