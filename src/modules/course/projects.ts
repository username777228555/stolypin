/**
 * Pure domain logic for «Исторический проект» — WSOSh (ВсОШ) source-criticism trainer built from all
 * `document` blocks across the course lessons.
 *
 * Follows the official ЦПМК ВсОШ 50-point rubric (Д. А. Хитров, Д. А. Черненко, А. А. Талызина,
 * Е. В. Камараули «Исторический проект») and HSE source classification by author's purpose
 * (И. Н. Данилевский и др., «Источниковедение»):
 *   1. Характеристика исторического момента и датировка (10 б.)
 *   2. Характеристика источника: внешняя и внутренняя критика (15 б.)
 *   3. Основная часть: исследовательские задачи с опорой на текст (18 б.)
 *   4. Итоговый вывод и информационный потенциал источника (7 б.)
 *   Итого: 50 баллов.
 */
import type { LessonBlock, LessonItem } from '$lib/core/content/schema';
import { GENRES, type SourceGenre } from './blocks/genres';
import { stripLessonLinks } from './filter';

export type DocumentBlock = Extract<LessonBlock, { type: 'document' }>;

export interface YearSpan {
  primary: number;
  min: number;
  max: number;
}

export interface DocumentProject {
  id: string;
  lessonId: string;
  lessonTitle: string;
  lessonOrder: number;
  period: string;
  sectionIndex: number;
  sectionTitle: string;
  title: string;
  author?: string;
  date?: string;
  year?: number;
  years?: YearSpan;
  genre: SourceGenre;
  excerpt: string;
  moment?: string;
  about?: string;
  clues: string[];
  questions: { q: string; a: string }[];
  source?: string;
}

export interface ProjectRecord {
  bestScore: number;
  bestPoints?: number;
  attempts: number;
  lastAt: number;
  genreOk: boolean;
  periodOk: boolean;
}

export type ProjectProgressMap = Record<string, ProjectRecord>;

export interface ProjectFilterOptions {
  period?: string | null;
  genre?: SourceGenre | null;
  onlyUnsolved?: boolean;
  query?: string;
  doneMap?: Readonly<ProjectProgressMap>;
  lessonIds?: ReadonlySet<string> | null;
}

export interface ExcerptSegment {
  text: string;
  marker: boolean;
}

export interface ProjectTaskItem {
  q: string;
  a: string;
  isSynthetic: boolean;
}

export type YearVerdict = 'exact' | 'close' | 'decade' | 'miss';

export interface YearEvaluation {
  verdict: YearVerdict;
  diff: number;
  score: number;
  label: string;
}

export interface WsoshScoreInput {
  genreCorrect: boolean;
  periodCorrect: boolean;
  /** When the user filtered the pool to a single epoch, period selection must not award free points. */
  periodPreFiltered?: boolean;
  yearScore: number; // 0..1
  usedHint?: boolean;
  /** Step 2: 2 criteria for historical moment (context + problem/challenge) */
  momentChecks: number; // 0..2
  /** Step 2: 3 criteria for external & internal criticism (author/addressee, form/purpose, bias/omissions) */
  sourceChecks: number; // 0..3
  /** Step 3: analytical tasks solved with text evidence */
  tasksHit: number;
  tasksTotal: number;
  /** Step 4: 2 conclusion criteria (general conclusion + informational potential) */
  conclusionChecks: number; // 0..2
}

export interface WsoshBreakdown {
  moment: number; // max 10
  source: number; // max 15
  tasks: number; // max 18
  conclusion: number; // max 7
}

export interface WsoshScoreResult {
  points: number; // 0..50
  maxPoints: 50;
  score: number; // 0..1
  percent: number; // 0..100
  xp: number;
  verdict: string;
  breakdown: WsoshBreakdown;
}

export interface ProjectStats {
  total: number;
  solved: number;
  perfect: number;
  avgScore: number;
  byGenre: Partial<Record<SourceGenre, number>>;
  byPeriod: Record<string, number>;
}

/** Official 50-point WSOSh «Исторический проект» criteria breakdown (ЦПМК). */
export const WSOSH_CRITERIA_TABLE = [
  {
    id: 'moment',
    part: '1. Характеристика исторического момента и датировка',
    points: 10,
    note: 'Датировка по словам-уликам (terminus post/ante quem), ключевые процессы эпохи и противоречие, породившее документ.',
  },
  {
    id: 'source',
    part: '2. Характеристика источника (внешняя и внутренняя критика)',
    points: 15,
    note: 'Вид по цели создания (ВШЭ), автор и его статус, адресат, публикация, формуляр, позиция автора, умолчания и достоверность.',
  },
  {
    id: 'tasks',
    part: '3. Основная часть — решение исследовательских задач',
    points: 18,
    note: 'Аргументированные ответы на вопросы проекта строго с опорой на цитаты/детали текста + фоновые знания эпохи.',
  },
  {
    id: 'conclusion',
    part: '4. Заключение: обобщающий вывод и потенциал источника',
    points: 7,
    note: 'Возвращение к проблеме, итоговая оценка значения документа для историка и связь с широким историческим контекстом.',
  },
] as const;

export const MOMENT_CRITERIA = [
  'Назвал(а) ключевые события и процессы, происходившие к моменту создания источника',
  'Объяснил(а) противоречие или исторический вызов, на который отвечает этот документ',
] as const;

export const SOURCE_CRITERIA = [
  'Определил(а) автора (социальный статус, должность), адресата и факт публикации / закрытости текста',
  'Отметил(а) цель создания и особенности формуляра (язык, структура, делопроизводственные или жанровые приметы)',
  'Оценил(а) позицию автора, субъективность, умолчания и достоверность («сведения источника ≠ как было на самом деле»)',
] as const;

export const CONCLUSION_CRITERIA = [
  'Сформулировал(а) обобщающий вывод, связывающий содержание документа с проблемой эпохи',
  'Оценил(а) информационный потенциал: что источник позволяет узнать историку, а в чём его границы',
] as const;

export const WSOSH_GENRE_TRAPS = [
  {
    pair: ['law', 'act'] as const,
    title: 'Законодательство vs Актовый источник',
    tip: 'Закон (указ, манифест, уложение, декрет) устанавливает новые общие нормы сверху от имени верховной власти. Акт (договор, грамота, завещание, купчая) закрепляет конкретные правоотношения между сторонами.',
  },
  {
    pair: ['office', 'records'] as const,
    title: 'Делопроизводство vs Материалы учёта',
    tip: 'Делопроизводство (доклады, рапорты, прошения, протоколы, инструкции) обслуживает текущую работу учреждения или имения. Учёт (писцовые книги, ревизские сказки) проверяет и фиксирует исполнение уже принятых решений.',
  },
  {
    pair: ['records', 'statistics'] as const,
    title: 'Материалы учёта vs Статистика',
    tip: 'Учёт нужен для фискального или административного контроля уже установленных норм, а статистика (переписи, земские обследования) собирает массовые данные для обработки и выработки будущих решений.',
  },
  {
    pair: ['publicism', 'periodical'] as const,
    title: 'Публицистика vs Периодическая печать',
    tip: 'Публицистика (памфлет, программная записка, проект конституции, воззвание) выражает мнение общественной группы по острому вопросу. Периодика — регулярное издание (газета, журнал) как канал коммуникации с обществом.',
  },
  {
    pair: ['personal', 'literature'] as const,
    title: 'Личное происхождение vs Литературное произведение',
    tip: 'Дневник, письмо или мемуары создаются для общения или памяти; художественный текст (даже автобиографический) подчиняется эстетическому замыслу и допускает художественный вымысел.',
  },
  {
    pair: ['law', 'office'] as const,
    title: 'Законодательство vs Делопроизводство',
    tip: 'Доклад министра, проект закона, инструкция внутри ведомства или циркуляр подчинённым — это делопроизводство, а не закон: закон утверждается верховной властью и действует для всего общества.',
  },
  {
    pair: ['publicism', 'personal'] as const,
    title: 'Публицистика vs Источник личного происхождения',
    tip: 'Если «письмо» адресовано обществу или власти ради политического влияния (открытое письмо, памфлет, проект реформ), его цель — общественная борьба (публицистика), а не частное общение.',
  },
] as const;

export const WSOSH_COMMON_MISTAKES = [
  {
    bad: 'Определять вид источника по заголовку («письмо» → личный, «указ» → всегда закон)',
    good: 'Определять вид строго по цели создания (ВШЭ): открытое политическое письмо — публицистика, а ведомственный проект реформ — делопроизводство или публицистика.',
  },
  {
    bad: 'Принимать слова автора за объективную истину («источник доказывает, что…»)',
    good: 'Разделять факт существования текста и достоверность его сведений: отмечать позицию автора, его интерес, адресата и возможные умолчания.',
  },
  {
    bad: 'Писать характеристику момента как пересказ учебника обо всём правлении',
    good: 'Называть только те события и противоречия, которые непосредственно привели к появлению документа и объясняют, зачем он написан именно тогда.',
  },
  {
    bad: 'Отвечать на вопросы проекта отрывочно, «вразброс», без ссылок на текст',
    good: 'Опираться на конкретные цитаты и детали документа, дополняя их фоновыми знаниями (терминами, датами, институтами) и сводя к общему выводу.',
  },
] as const;

const ALL_GENRES = Object.keys(GENRES) as SourceGenre[];

/** Pedagogically realistic distractor groups mirroring frequent WSOSh classification traps. */
const CONFUSABLE_GENRES: Record<SourceGenre, readonly SourceGenre[]> = {
  law: ['act', 'office', 'publicism', 'records'],
  act: ['law', 'office', 'records', 'chronicle'],
  office: ['law', 'act', 'records', 'statistics', 'personal'],
  records: ['statistics', 'office', 'act', 'law'],
  statistics: ['records', 'office', 'periodical', 'publicism'],
  publicism: ['periodical', 'personal', 'literature', 'office', 'law'],
  periodical: ['publicism', 'personal', 'office', 'literature'],
  personal: ['publicism', 'literature', 'office', 'periodical'],
  literature: ['personal', 'publicism', 'chronicle', 'historiography'],
  chronicle: ['literature', 'act', 'historiography', 'personal'],
  historiography: ['publicism', 'chronicle', 'literature', 'personal'],
};

/** Extracts all plausible 3–4 digit historical years (800..2030) from a Russian date string. */
export function extractYearSpan(dateStr?: string): YearSpan | undefined {
  if (!dateStr) return undefined;
  const matches = [...dateStr.matchAll(/\b(\d{3,4})\b/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 800 && n <= 2030);
  if (!matches.length) return undefined;
  return {
    primary: matches[0]!,
    min: Math.min(...matches),
    max: Math.max(...matches),
  };
}

/** Extracts the first plausible 3–4 digit historical year (800..2030) from a Russian date string. */
export function parseDocumentYear(dateStr?: string): number | undefined {
  return extractYearSpan(dateStr)?.primary;
}

/** Collects every structured `document` block from course lessons in course order. */
export function extractDocumentProjects(lessons: readonly LessonItem[]): DocumentProject[] {
  const out: DocumentProject[] = [];
  for (const lesson of lessons) {
    lesson.sections.forEach((sec, sectionIndex) => {
      let docIdx = 0;
      for (const b of sec.blocks ?? []) {
        if (b.type !== 'document') continue;
        const years = extractYearSpan(b.date);
        out.push({
          id: `${lesson.id}:s${sectionIndex}:doc${docIdx++}`,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          lessonOrder: lesson.order,
          period: lesson.period,
          sectionIndex,
          sectionTitle: sec.title,
          title: b.title,
          author: b.author,
          date: b.date,
          year: years?.primary,
          years,
          genre: b.genre,
          excerpt: b.excerpt,
          moment: b.moment,
          about: b.about,
          clues: b.clues ?? [],
          questions: b.questions ?? [],
          source: b.source,
        });
      }
    });
  }
  return out;
}

/**
 * Redacts explicit mentions of the document's own year(s) (`min - 1 .. max + 1`) inside the excerpt
 * during blind mode (just like WSOSh jury masks `[…]`), while leaving earlier dates intact as clues.
 */
export function blindExcerpt(excerpt: string, years?: YearSpan): string {
  if (!years) return excerpt;
  return excerpt.replace(/\b(\d{3,4})\b/g, (raw, numStr: string) => {
    const n = Number(numStr);
    if (n >= years.min - 1 && n <= years.max + 1) {
      return '[…]';
    }
    return raw;
  });
}

/**
 * Extracts quoted marker phrases (`«...»`) from `clues` (stripping lesson links first)
 * and splits the source excerpt into non-overlapping highlighted segments.
 */
export function buildMarkerSegments(text: string, clues: readonly string[]): ExcerptSegment[] {
  const phrases: string[] = [];
  for (const rawClue of clues) {
    const clue = stripLessonLinks(rawClue);
    for (const m of clue.matchAll(/«([^»]{3,90})»/g)) {
      const p = m[1]!.trim();
      const parts = p
        .split(/…|\.\.\./)
        .map((x) => x.trim())
        .filter((x) => x.length >= 4);
      for (const part of parts) phrases.push(part);
    }
  }
  if (!phrases.length) return [{ text, marker: false }];

  const lower = text.toLowerCase();
  const spans: { start: number; end: number }[] = [];
  for (const phrase of phrases) {
    const needle = phrase.toLowerCase();
    let idx = lower.indexOf(needle);
    while (idx !== -1) {
      spans.push({ start: idx, end: idx + needle.length });
      idx = lower.indexOf(needle, idx + needle.length);
    }
  }
  if (!spans.length) return [{ text, marker: false }];

  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number }[] = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (!last || sp.start > last.end) {
      merged.push({ ...sp });
    } else if (sp.end > last.end) {
      last.end = sp.end;
    }
  }

  const segs: ExcerptSegment[] = [];
  let cursor = 0;
  for (const sp of merged) {
    if (sp.start > cursor) segs.push({ text: text.slice(cursor, sp.start), marker: false });
    segs.push({ text: text.slice(sp.start, sp.end), marker: true });
    cursor = sp.end;
  }
  if (cursor < text.length) segs.push({ text: text.slice(cursor), marker: false });
  return segs;
}

/** Picks 5 genre options (1 correct + 4 plausible olympiad traps) in shuffled order. */
export function buildGenreOptions(
  correct: SourceGenre,
  random: () => number = Math.random,
): SourceGenre[] {
  const preferred = [...(CONFUSABLE_GENRES[correct] ?? [])];
  const rest = ALL_GENRES.filter((g) => g !== correct && !preferred.includes(g));
  const distractors: SourceGenre[] = [];

  for (const pool of [preferred, rest]) {
    const copy = [...pool];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    for (const item of copy) {
      if (distractors.length < 4 && !distractors.includes(item) && item !== correct) {
        distractors.push(item);
      }
    }
  }

  const options: SourceGenre[] = [correct, ...distractors];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j]!, options[i]!];
  }
  return options;
}

/** Returns a targeted WSOSh trap explanation if the student confused a classic pair of genres. */
export function explainGenreTrap(picked: SourceGenre, correct: SourceGenre): string | undefined {
  if (picked === correct) return undefined;
  const hit = WSOSH_GENRE_TRAPS.find(
    (t) =>
      (t.pair[0] === picked && t.pair[1] === correct) ||
      (t.pair[1] === picked && t.pair[0] === correct),
  );
  return hit?.tip;
}

/** Evaluates a student's year guess against the document's canonical year span. */
export function evaluateYearGuess(guessYear: number, years?: YearSpan): YearEvaluation {
  if (!years) {
    return { verdict: 'exact', diff: 0, score: 1, label: 'Дата учтена' };
  }
  const diff =
    guessYear < years.min
      ? years.min - guessYear
      : guessYear > years.max
        ? guessYear - years.max
        : 0;

  if (diff <= 1) {
    return {
      verdict: 'exact',
      diff,
      score: 1,
      label: diff === 0 ? 'Точное попадание' : 'Почти точно (±1 год)',
    };
  }
  if (diff <= 5) {
    return {
      verdict: 'close',
      diff,
      score: 0.75,
      label: `Очень близко (ошибка ${diff} г.)`,
    };
  }
  if (diff <= 15) {
    return {
      verdict: 'decade',
      diff,
      score: 0.4,
      label: `В пределах эпохи (ошибка ${diff} л.)`,
    };
  }
  return {
    verdict: 'miss',
    diff,
    score: 0,
    label: `Расхождение ${diff} л.`,
  };
}

/**
 * Returns the analytical tasks for Step 3 of the project.
 * If the document block already has curated olympiad questions (189/259 docs), returns them verbatim.
 * For the remaining 70 documents, synthesizes 2 authentic WSOSh source-criticism tasks so every single
 * document practices text-grounded evidence extraction and source reliability criticism.
 */
export function resolveProjectTasks(project: DocumentProject): ProjectTaskItem[] {
  if (project.questions.length > 0) {
    return project.questions.map((q) => ({ q: q.q, a: q.a, isSynthetic: false }));
  }

  const genreInfo = GENRES[project.genre];
  const cluesLine = project.clues.length
    ? project.clues.map((c) => `• ${c}`).join('\n')
    : 'Опирайтесь на термины, титулы, имена и реалии в тексте отрывка.';

  return [
    {
      q: 'Какие конкретные детали текста (термины, формулировки, реалии) позволяют реконструировать историческую ситуацию и замысел автора?',
      a: `${project.moment ? `${project.moment}\n\n` : ''}Опорные маркеры в тексте:\n${cluesLine}`,
      isSynthetic: true,
    },
    {
      q: 'Оцените достоверность и ограничения документа: о чём автор умалчивает или что может подавать предвзято в силу вида источника и своей позиции?',
      a: `Вид источника — «${genreInfo.label}» (${genreInfo.purpose}). ${project.about ?? 'Любой источник отражает точку зрения и интересы своего создателя — его сведения нужно сверять с другими видами источников.'}`,
      isSynthetic: true,
    },
  ];
}

/**
 * Computes the official 50-point WSOSh «Исторический проект» score across all 4 ЦПМК blocks:
 *   1. Характеристика момента и датировка: max 10 (5 dating/period + 5 moment self-check)
 *   2. Характеристика источника:           max 15 (6 genre by purpose + 9 external/internal criticism)
 *   3. Основная часть (задачи по тексту):  max 18
 *   4. Заключение (вывод + потенциал):     max 7
 * Total: 0..50 points.
 */
export function scoreWsoshProject(input: WsoshScoreInput): WsoshScoreResult {
  const yearScore = Math.max(0, Math.min(1, input.yearScore));

  // Block 1 (max 10): 5 pts dating/epoch (fair when pre-filtered!) + 5 pts moment criteria (2 checks)
  const datingRaw = input.periodPreFiltered
    ? yearScore * 5
    : (input.periodCorrect ? 2 : 0) + yearScore * 3;
  const datingPts = Math.max(0, datingRaw - (input.usedHint ? 1 : 0));
  const momentCheckPts = (Math.max(0, Math.min(2, input.momentChecks)) / 2) * 5;
  const moment = Math.round(Math.min(10, datingPts + momentCheckPts));

  // Block 2 (max 15): 6 pts genre by purpose + 9 pts external/internal criticism (3 checks)
  const genrePts = input.genreCorrect ? 6 : 0;
  const sourceCheckPts = (Math.max(0, Math.min(3, input.sourceChecks)) / 3) * 9;
  const source = Math.round(Math.min(15, genrePts + sourceCheckPts));

  // Block 3 (max 18): research tasks with text evidence
  const tasksRatio =
    input.tasksTotal > 0
      ? Math.max(0, Math.min(1, input.tasksHit / input.tasksTotal))
      : 0;
  const tasks = Math.round(tasksRatio * 18);

  // Block 4 (max 7): general conclusion (4 pts) + informational potential (3 pts)
  const clampedConcl = Math.max(0, Math.min(2, input.conclusionChecks));
  const conclusion = clampedConcl === 2 ? 7 : clampedConcl === 1 ? 4 : 0;

  const points = Math.max(0, Math.min(50, moment + source + tasks + conclusion));
  const score = Math.round((points / 50) * 100) / 100;
  const percent = Math.round((points / 50) * 100);
  const xp = Math.max(12, Math.round(14 + score * 30));

  let verdict: string;
  if (points >= 43) {
    verdict = 'Уровень победителя ЗЭ ВсОШ: точная атрибуция, критика источника и аргументация по тексту';
  } else if (points >= 34) {
    verdict = 'Сильная работа уровня призёра РЭ/ЗЭ — мелкие детали легко добрать по критериям';
  } else if (points >= 22) {
    verdict = 'Хорошая основа — усильте критику достоверности и точнее опирайтесь на слова-улики';
  } else {
    verdict = 'Сложный источник — разберите слова-улики, критерии критики и вернитесь к нему позже';
  }

  return {
    points,
    maxPoints: 50,
    score,
    percent,
    xp,
    verdict,
    breakdown: { moment, source, tasks, conclusion },
  };
}

export function filterProjects(
  projects: readonly DocumentProject[],
  opts: ProjectFilterOptions = {},
): DocumentProject[] {
  const { period = null, genre = null, onlyUnsolved = false, doneMap, lessonIds = null } = opts;
  const q = (opts.query ?? '').trim().toLowerCase();

  return projects.filter((p) => {
    if (lessonIds && !lessonIds.has(p.lessonId)) return false;
    if (period && p.period !== period) return false;
    if (genre && p.genre !== genre) return false;
    if (onlyUnsolved && (doneMap?.[p.id]?.bestScore ?? 0) >= 0.7) return false;
    if (!q) return true;
    const hay = [
      p.title,
      p.author ?? '',
      p.date ?? '',
      p.lessonTitle,
      p.sectionTitle,
      p.excerpt,
      p.moment ? stripLessonLinks(p.moment) : '',
      p.about ? stripLessonLinks(p.about) : '',
      ...p.clues.map(stripLessonLinks),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function mergeProjectRecord(
  prev: ProjectRecord | undefined,
  attempt: { score: number; points?: number; genreCorrect: boolean; periodCorrect: boolean; at?: number },
): ProjectRecord {
  const at = attempt.at ?? Date.now();
  const pts = attempt.points ?? Math.round(attempt.score * 50);
  return {
    bestScore: Math.max(prev?.bestScore ?? 0, attempt.score),
    bestPoints: Math.max(prev?.bestPoints ?? 0, pts),
    attempts: (prev?.attempts ?? 0) + 1,
    lastAt: at,
    genreOk: Boolean(prev?.genreOk || attempt.genreCorrect),
    periodOk: Boolean(prev?.periodOk || attempt.periodCorrect),
  };
}

export function projectStats(
  projects: readonly DocumentProject[],
  doneMap: Readonly<ProjectProgressMap>,
): ProjectStats {
  const byGenre: Partial<Record<SourceGenre, number>> = {};
  const byPeriod: Record<string, number> = {};
  let solved = 0;
  let perfect = 0;
  let scoreSum = 0;

  for (const p of projects) {
    byGenre[p.genre] = (byGenre[p.genre] ?? 0) + 1;
    byPeriod[p.period] = (byPeriod[p.period] ?? 0) + 1;
    const rec = doneMap[p.id];
    if (rec) {
      solved++;
      scoreSum += rec.bestScore;
      if (rec.bestScore >= 0.86) perfect++;
    }
  }

  return {
    total: projects.length,
    solved,
    perfect,
    avgScore: solved > 0 ? Math.round((scoreSum / solved) * 100) / 100 : 0,
    byGenre,
    byPeriod,
  };
}

/**
 * Picks the next project for the blind trainer: prefers unseen documents (with curated questions first),
 * never repeats `currentId` if alternatives exist.
 */
export function pickNextProject(
  projects: readonly DocumentProject[],
  doneMap: Readonly<ProjectProgressMap>,
  opts: { currentId?: string; random?: () => number } = {},
): DocumentProject | undefined {
  if (!projects.length) return undefined;
  const rng = opts.random ?? Math.random;
  const pool =
    projects.length > 1 && opts.currentId
      ? projects.filter((p) => p.id !== opts.currentId)
      : [...projects];

  const unsolvedWithQ = pool.filter((p) => !doneMap[p.id] && p.questions.length > 0);
  const unsolved = pool.filter((p) => !doneMap[p.id]);
  const candidates = unsolvedWithQ.length ? unsolvedWithQ : unsolved.length ? unsolved : pool;
  const idx = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[idx];
}

/** Builds progressive non-spoiler hints from clues before dating is submitted. */
export function buildSoftHint(project: DocumentProject, hintLevel: number): string[] {
  const hints: string[] = [];
  if (hintLevel >= 1 && project.clues.length > 0) {
    hints.push(`Слово-улика: ${stripLessonLinks(project.clues[0]!)}`);
  }
  if (hintLevel >= 2 && project.clues.length > 1) {
    hints.push(`Ещё улика: ${stripLessonLinks(project.clues[1]!)}`);
  } else if (hintLevel >= 2 && project.author) {
    hints.push(`Автор или ведомство начинается на «${project.author.trim().slice(0, 1)}…»`);
  }
  return hints;
}
