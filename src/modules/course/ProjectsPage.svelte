<script lang="ts">
  /**
   * «Исторический проект» — WSOSh (ВсОШ) source-criticism trainer built on all 259 lesson `document`
   * blocks, structured strictly by official ЦПМК criteria (50 points) & HSE source classification:
   *  1) «Тренажёр» — blind 4-step workflow:
   *       Step 1: Genre by purpose (5 confusable WSOSh options) + blind dating (period & exact year,
   *               with `[…]` redaction & post-check marker highlighting directly in the excerpt);
   *       Step 2: Historical moment + external & internal source criticism (active recall → canonical
   *               comparison → 5 WSOSh criteria checkboxes);
   *       Step 3: Research tasks strictly grounded in text evidence (curated questions or 2 WSOSh
   *               source-criticism tasks when a doc has none);
   *       Step 4: Conclusion & official 50-point WSOSh scorecard (`moment /10 + source /15 + tasks /18 + conclusion /7`).
   *  2) «Каталог» — searchable archive of all 259 sources (supports `?theme=<id>` & `?period=<id>`).
   *  3) «Критерии ВсОШ» — complete 50-point rubric, 11 HSE/Danilevsky genres, 7 genre traps & anti-patterns.
   */
  import { onMount } from 'svelte';
  import {
    Search,
    X,
    Eye,
    Check,
    ArrowRight,
    ArrowLeft,
    Shuffle,
    CircleCheck,
    BookOpen,
    ExternalLink,
    RotateCcw,
    SlidersHorizontal,
    Highlighter,
    Lightbulb,
    ThumbsUp,
    ThumbsDown,
  } from '@lucide/svelte';
  import PageHeader from '$lib/design/components/PageHeader.svelte';
  import Card from '$lib/design/components/Card.svelte';
  import Button from '$lib/design/components/Button.svelte';
  import Segmented from '$lib/design/components/Segmented.svelte';
  import ProgressBar from '$lib/design/components/ProgressBar.svelte';
  import EmptyState from '$lib/design/components/EmptyState.svelte';
  import EntityPreview from '$lib/components/EntityPreview.svelte';
  import { kb } from '$lib/core/content/kb.svelte';
  import { kvGet, kvSet } from '$lib/core/db';
  import { logAnswer } from '$lib/core/mastery';
  import { record, saveResult } from '$lib/core/progress.svelte';
  import { haptic } from '$lib/core/platform';
  import { router } from '$lib/core/router.svelte';
  import { openSheet } from '$lib/core/ui.svelte';
  import { pluralN, WORDS } from '$lib/core/utils/format';
  import { GENRES, type SourceGenre } from './blocks/genres';
  import { lessonInline } from './text';
  import {
    blindExcerpt,
    buildGenreOptions,
    buildMarkerSegments,
    buildSoftHint,
    CONCLUSION_CRITERIA,
    evaluateYearGuess,
    explainGenreTrap,
    extractDocumentProjects,
    filterProjects,
    mergeProjectRecord,
    MOMENT_CRITERIA,
    pickNextProject,
    projectStats,
    resolveProjectTasks,
    scoreWsoshProject,
    SOURCE_CRITERIA,
    WSOSH_COMMON_MISTAKES,
    WSOSH_CRITERIA_TABLE,
    WSOSH_GENRE_TRAPS,
    type DocumentProject,
    type ProjectProgressMap,
  } from './projects';
  import { findThemeById, themeLessonIdSet } from './themes';

  const KV_KEY = 'projects-done-v1';
  type Mode = 'train' | 'catalog' | 'guide';
  type Step = 1 | 2 | 3 | 4;

  const allProjects = $derived.by(() => {
    void kb.version;
    return extractDocumentProjects(kb.lessons);
  });
  const themeId = $derived(router.query.get('theme') || null);
  const activeTheme = $derived(themeId ? findThemeById(themeId) : undefined);
  const themeLessonIds = $derived(activeTheme ? themeLessonIdSet(activeTheme) : null);

  const askedMode = router.query.get('mode') as Mode | null;
  let mode = $state<Mode>(
    askedMode && ['train', 'catalog', 'guide'].includes(askedMode) ? askedMode : 'train',
  );
  let selectedPeriod = $state<string | null>(router.query.get('period') || null);
  let selectedGenre = $state<SourceGenre | null>(null);
  let onlyUnsolved = $state(false);
  let query = $state('');
  let filtersOpen = $state(false);
  let doneMap = $state<ProjectProgressMap>({});

  const scopedProjects = $derived(
    filterProjects(allProjects, {
      period: selectedPeriod,
      genre: selectedGenre,
      onlyUnsolved,
      query,
      doneMap,
      lessonIds: themeLessonIds,
    }),
  );

  const stats = $derived(
    projectStats(
      themeLessonIds ? allProjects.filter((p) => themeLessonIds.has(p.lessonId)) : allProjects,
      doneMap,
    ),
  );

  const periodsWithDocs = $derived(
    kb.periods.filter((p) =>
      allProjects.some((d) => d.period === p.id && (!themeLessonIds || themeLessonIds.has(d.lessonId))),
    ),
  );

  const activeGenres = $derived(
    (Object.keys(GENRES) as SourceGenre[]).filter((g) =>
      allProjects.some((d) => d.genre === g && (!themeLessonIds || themeLessonIds.has(d.lessonId))),
    ),
  );

  const hasFilters = $derived(Boolean(selectedPeriod || selectedGenre || onlyUnsolved || query.trim()));

  // ——— Active 4-step WSOSh trainer state ———
  let current = $state<DocumentProject | undefined>();
  let step = $state<Step>(1);

  // Step 1: Genre (5 options) + Dating (period + exact year)
  let genreOptions = $state<SourceGenre[]>([]);
  let pickedGenre = $state<SourceGenre | null>(null);
  let pickedPeriod = $state<string>('');
  let yearInput = $state<string>('');
  let hintLevel = $state(0);
  let dateSubmitted = $state(false);
  let showMarkers = $state(true);

  // Step 2: Historical moment + external/internal criticism
  let momentDraft = $state('');
  let criticismRevealed = $state(false);
  let momentChecks = $state<boolean[]>([false, false]);
  let sourceChecks = $state<boolean[]>([false, false, false]);

  // Step 3: Analytical tasks grounded in the text
  let shownAnswers = $state<Record<number, boolean>>({});
  let taskGrades = $state<Record<number, boolean>>({});

  // Step 4: Conclusion & 50-point scorecard
  let conclusionDraft = $state('');
  let conclusionChecks = $state<boolean[]>([false, false]);
  let finished = $state(false);

  /** True when active pool filters lock the user into a single epoch (so period guess shouldn't give free points). */
  const periodPreFiltered = $derived(Boolean(selectedPeriod));

  function loadProject(proj: DocumentProject | undefined) {
    current = proj;
    step = 1;
    genreOptions = proj ? buildGenreOptions(proj.genre) : [];
    pickedGenre = null;
    pickedPeriod = selectedPeriod && proj && proj.period === selectedPeriod ? selectedPeriod : '';
    yearInput = '';
    hintLevel = 0;
    dateSubmitted = false;
    showMarkers = true;
    momentDraft = '';
    criticismRevealed = false;
    momentChecks = [false, false];
    sourceChecks = [false, false, false];
    shownAnswers = {};
    taskGrades = {};
    conclusionDraft = '';
    conclusionChecks = [false, false];
    finished = false;
  }

  function loadNext() {
    const pool = scopedProjects.length ? scopedProjects : allProjects;
    loadProject(pickNextProject(pool, doneMap, { currentId: current?.id }));
  }

  function clearFilters() {
    selectedPeriod = null;
    selectedGenre = null;
    onlyUnsolved = false;
    query = '';
  }

  onMount(async () => {
    doneMap = await kvGet<ProjectProgressMap>(KV_KEY, {});
    const requestedId = router.query.get('id');
    if (requestedId) {
      const found = allProjects.find((p) => p.id === requestedId);
      if (found) {
        loadProject(found);
        return;
      }
    }
    loadNext();
  });

  $effect(() => {
    void themeLessonIds;
    if (!current && scopedProjects.length) {
      loadNext();
    } else if (current && themeLessonIds && !themeLessonIds.has(current.lessonId)) {
      loadNext();
    }
  });

  $effect(() => {
    if (selectedPeriod && current && !dateSubmitted && current.period === selectedPeriod) {
      pickedPeriod = selectedPeriod;
    }
  });

  const hints = $derived(current ? buildSoftHint(current, hintLevel) : []);
  const genreCorrect = $derived(Boolean(current && pickedGenre === current.genre));
  const trapExplanation = $derived(
    current && pickedGenre ? explainGenreTrap(pickedGenre, current.genre) : undefined,
  );

  const parsedYear = $derived.by(() => {
    const t = yearInput.trim();
    if (!/^\d{3,4}$/.test(t)) return null;
    const n = Number(t);
    return n >= 800 && n <= 2030 ? n : null;
  });

  const yearEval = $derived.by(() => {
    if (!current || !dateSubmitted || parsedYear === null) return null;
    return evaluateYearGuess(parsedYear, current.years);
  });

  const periodCorrect = $derived(
    Boolean(current && dateSubmitted && (periodPreFiltered || pickedPeriod === current.period)),
  );

  const step1Done = $derived(pickedGenre !== null && dateSubmitted);

  const displayExcerpt = $derived.by(() => {
    if (!current) return '';
    return dateSubmitted ? current.excerpt : blindExcerpt(current.excerpt, current.years);
  });

  const excerptSegments = $derived.by(() => {
    if (!current) return [];
    if (!dateSubmitted || !showMarkers) return [{ text: displayExcerpt, marker: false }];
    return buildMarkerSegments(displayExcerpt, current.clues);
  });

  const hasMarkers = $derived(excerptSegments.some((s) => s.marker));
  const activeTasks = $derived(current ? resolveProjectTasks(current) : []);

  const allTasksGraded = $derived.by(() => {
    if (!current || !activeTasks.length) return true;
    return activeTasks.every((_, i) => taskGrades[i] !== undefined);
  });

  const wsoshResult = $derived.by(() => {
    if (!current) return undefined;
    return scoreWsoshProject({
      genreCorrect,
      periodCorrect,
      periodPreFiltered,
      yearScore: yearEval?.score ?? 0,
      usedHint: hintLevel > 0,
      momentChecks: momentChecks.filter(Boolean).length,
      sourceChecks: sourceChecks.filter(Boolean).length,
      tasksHit: Object.values(taskGrades).filter(Boolean).length,
      tasksTotal: activeTasks.length,
      conclusionChecks: conclusionChecks.filter(Boolean).length,
    });
  });

  function chooseGenre(g: SourceGenre) {
    if (!current || pickedGenre !== null) return;
    pickedGenre = g;
    haptic(g === current.genre ? 'success' : 'error');
  }

  function submitDating(e?: Event) {
    e?.preventDefault();
    if (!current || dateSubmitted || parsedYear === null) return;
    if (!periodPreFiltered && !pickedPeriod) return;
    dateSubmitted = true;
    const ev = evaluateYearGuess(parsedYear, current.years);
    const ok = (periodPreFiltered || pickedPeriod === current.period) && ev.score >= 0.75;
    haptic(ok ? 'success' : 'error');
  }

  function toggleMomentCheck(idx: number) {
    if (finished) return;
    momentChecks = momentChecks.map((v, i) => (i === idx ? !v : v));
  }

  function toggleSourceCheck(idx: number) {
    if (finished) return;
    sourceChecks = sourceChecks.map((v, i) => (i === idx ? !v : v));
  }

  function toggleConclusionCheck(idx: number) {
    if (finished) return;
    conclusionChecks = conclusionChecks.map((v, i) => (i === idx ? !v : v));
  }

  async function finishProject() {
    if (!current || !wsoshResult || finished) return;
    finished = true;
    step = 4;
    haptic(wsoshResult.points >= 34 ? 'success' : 'tap');

    logAnswer({
      period: current.period,
      skill: 'sources',
      entity: current.source,
      type: 'open',
      score: wsoshResult.score,
      src: 'project',
    });

    const analysisScore =
      (wsoshResult.breakdown.moment + wsoshResult.breakdown.tasks + wsoshResult.breakdown.conclusion) /
      35;
    logAnswer({
      period: current.period,
      skill: 'analysis',
      type: 'open',
      score: Math.max(0, Math.min(1, Math.round(analysisScore * 100) / 100)),
      src: 'project',
    });

    const nextMap: ProjectProgressMap = {
      ...doneMap,
      [current.id]: mergeProjectRecord(doneMap[current.id], {
        score: wsoshResult.score,
        points: wsoshResult.points,
        genreCorrect,
        periodCorrect,
      }),
    };
    doneMap = nextMap;
    await kvSet(KV_KEY, nextMap);

    const qCount = 2 + activeTasks.length;
    const hitsCount =
      (genreCorrect ? 1 : 0) +
      ((yearEval?.score ?? 0) >= 0.75 ? 1 : 0) +
      Object.values(taskGrades).filter(Boolean).length;
    await record({ xp: wsoshResult.xp, questions: qCount, correct: hitsCount, quizzes: 1 });
    await saveResult({
      kind: 'quiz',
      ref: `project:${current.id}`,
      score: wsoshResult.points,
      total: wsoshResult.maxPoints,
    });
  }

  function openRef(ev: MouseEvent) {
    const id = (ev.target as HTMLElement).closest<HTMLElement>('[data-ref]')?.dataset.ref;
    if (!id) return;
    ev.preventDefault();
    openSheet({ component: EntityPreview, props: { id, from: 'Исторический проект' } });
  }

  function openEntity(id: string) {
    openSheet({ component: EntityPreview, props: { id, from: 'Исторический проект' } });
  }

  const STEP_LABELS: { n: Step; label: string }[] = [
    { n: 1, label: 'Атрибуция' },
    { n: 2, label: 'Критика' },
    { n: 3, label: 'Задачи' },
    { n: 4, label: 'Итог · 50 б.' },
  ];

  function canJumpTo(target: Step): boolean {
    if (target === 1) return true;
    if (target === 2) return step1Done;
    if (target === 3) return step1Done && criticismRevealed;
    return step1Done && criticismRevealed && allTasksGraded;
  }
</script>

<div class="page projects-page">
  <PageHeader
    title="Исторический проект"
    eyebrow={activeTheme ? `Линия: ${activeTheme.title}` : 'Источниковедение ВсОШ · 50 баллов'}
    back={activeTheme ? `/course/themes/${activeTheme.id}` : '/practice'}
  />

  <div class="top-strip">
    <div class="top-meta">
      <span class="muted small">
        Разобрано <strong class="num">{stats.solved}</strong> из {pluralN(stats.total, WORDS.project)}
        {#if stats.solved > 0}
          · средний балл <strong class="num">{Math.round(stats.avgScore * 50)}/50</strong>
        {/if}
      </span>
      <button
        type="button"
        class="filter-btn"
        class:active={filtersOpen || hasFilters}
        aria-expanded={filtersOpen}
        onclick={() => (filtersOpen = !filtersOpen)}
      >
        <SlidersHorizontal size={14} />
        <span>Фильтр{hasFilters ? ' · вкл.' : ''}</span>
      </button>
    </div>
    <ProgressBar
      value={stats.total ? stats.solved / stats.total : 0}
      color="var(--accent)"
      height={5}
      label="Прогресс исторических проектов"
    />
  </div>

  <div class="mode-bar">
    <Segmented
      bind:value={mode}
      options={[
        { value: 'train', label: 'Тренажёр' },
        { value: 'catalog', label: 'Каталог', count: scopedProjects.length },
        { value: 'guide', label: 'Критерии ВсОШ' },
      ]}
    />
  </div>

  {#if filtersOpen && mode !== 'guide'}
    <Card padding="md" class="filters-card">
      <div class="f-grid">
        <label class="f-field">
          <span class="f-lbl">Эпоха</span>
          <select
            class="f-select"
            value={selectedPeriod ?? ''}
            onchange={(e) => {
              selectedPeriod = (e.currentTarget as HTMLSelectElement).value || null;
              if (mode === 'train') loadNext();
            }}
          >
            <option value="">Все эпохи ({allProjects.length})</option>
            {#each periodsWithDocs as p (p.id)}
              <option value={p.id}>{p.short} ({stats.byPeriod[p.id] ?? 0})</option>
            {/each}
          </select>
        </label>

        <label class="f-field">
          <span class="f-lbl">Вид источника</span>
          <select
            class="f-select"
            value={selectedGenre ?? ''}
            onchange={(e) => {
              selectedGenre = ((e.currentTarget as HTMLSelectElement).value || null) as SourceGenre | null;
              if (mode === 'train') loadNext();
            }}
          >
            <option value="">Все виды</option>
            {#each activeGenres as g (g)}
              <option value={g}>{GENRES[g].label} ({stats.byGenre[g] ?? 0})</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="f-bottom">
        <label class="f-check">
          <input
            type="checkbox"
            checked={onlyUnsolved}
            onchange={(e) => {
              onlyUnsolved = (e.currentTarget as HTMLInputElement).checked;
              if (mode === 'train') loadNext();
            }}
          />
          <span>Только неосвоенные (&lt; 35/50 б.)</span>
        </label>
        {#if hasFilters}
          <button
            type="button"
            class="f-reset"
            onclick={() => {
              clearFilters();
              if (mode === 'train') loadNext();
            }}
          >
            Сбросить фильтры
          </button>
        {/if}
      </div>
    </Card>
  {/if}

  {#if mode === 'train'}
    {#if !current}
      <EmptyState
        title="По выбранному фильтру документов нет"
        text="Сбросьте фильтр эпохи или вида источника, чтобы продолжить разбор."
      >
        <Button size="sm" onclick={() => { clearFilters(); loadNext(); }}>Показать все источники</Button>
      </EmptyState>
    {:else}
      <div class="workspace">
        <!-- Left column: sticky archival source text -->
        <section class="paper-col" aria-label="Текст исторического источника">
          <article class="paper-card">
            <header class="paper-head">
              <div class="paper-meta">
                {#if dateSubmitted}
                  <span class="paper-tag">{GENRES[current.genre].label}</span>
                  <h2 class="paper-title">{current.title}</h2>
                  <p class="paper-sub">
                    {[current.author, current.date, kb.periodById.get(current.period)?.short]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                {:else}
                  <span class="paper-tag">Слепой документ ВсОШ · даты скрыты как […]</span>
                  <h2 class="paper-title">Атрибутируйте источник по тексту</h2>
                  <p class="paper-sub">
                    Ищите в тексте термины, титулы, учреждения, упоминания событий и стиль речи
                  </p>
                {/if}
              </div>

              <div class="paper-tools">
                {#if dateSubmitted && hasMarkers}
                  <button
                    type="button"
                    class="tool-btn"
                    class:on={showMarkers}
                    onclick={() => (showMarkers = !showMarkers)}
                  >
                    <Highlighter size={14} />
                    <span>{showMarkers ? 'Скрыть улики' : 'Подсветить улики'}</span>
                  </button>
                {:else if !dateSubmitted && hintLevel < 2 && current.clues.length > 0}
                  <button
                    type="button"
                    class="tool-btn"
                    onclick={() => (hintLevel = Math.min(2, hintLevel + 1))}
                  >
                    <Lightbulb size={14} />
                    <span>Улика (−1 б.)</span>
                  </button>
                {/if}
                <button type="button" class="tool-btn" onclick={loadNext} title="Загрузить другой источник">
                  <Shuffle size={14} />
                  <span>Другой</span>
                </button>
              </div>
            </header>

            <blockquote class="excerpt">
              {#each excerptSegments as seg, i (i)}
                {#if seg.marker}<mark class="clue-mark">{seg.text}</mark>{:else}{seg.text}{/if}
              {/each}
            </blockquote>

            {#if !dateSubmitted && hints.length > 0}
              <div class="hints-box">
                {#each hints as h, i (i)}
                  <p>{h}</p>
                {/each}
              </div>
            {/if}

            {#if dateSubmitted && current.clues.length > 0}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="clues-strip" onclick={openRef}>
                <span class="lbl">Слова-улики для атрибуции и датировки</span>
                <ul class="clues-list">
                  {#each current.clues as clue, i (i)}
                    <li>{@html lessonInline(clue)}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </article>
        </section>

        <!-- Right column: 4-step WSOSh workbench -->
        <section class="work-col" aria-label="Этапы разбора исторического проекта">
          <nav class="stepper" aria-label="Шаги проекта">
            {#each STEP_LABELS as s (s.n)}
              {@const unlocked = canJumpTo(s.n)}
              <button
                type="button"
                class="step-btn"
                class:active={step === s.n}
                class:done={s.n < step || (finished && s.n === 4)}
                disabled={!unlocked}
                onclick={() => {
                  if (unlocked) step = s.n;
                }}
              >
                <span class="sn num">{s.n}</span>
                <span class="sl">{s.label}</span>
              </button>
            {/each}
          </nav>

          {#if step === 1}
            <Card padding="md" class="step-card">
              <div class="block-head">
                <span class="eyebrow">Шаг 1а · Вид источника по цели создания (ВШЭ · до 6 б.)</span>
                <h3>Зачем автор создал этот документ?</h3>
                <p class="muted xs">
                  Ориентируйтесь не на заголовок, а на функцию текста. Выберите 1 из 5 близких видов.
                </p>
              </div>

              <div class="genre-list">
                {#each genreOptions as g (g)}
                  {@const picked = pickedGenre === g}
                  {@const isRight = current.genre === g}
                  <button
                    type="button"
                    class="genre-opt"
                    class:correct={pickedGenre !== null && isRight}
                    class:wrong={picked && !isRight}
                    disabled={pickedGenre !== null}
                    onclick={() => chooseGenre(g)}
                  >
                    <span class="go-label">{GENRES[g].label}</span>
                    {#if pickedGenre !== null && isRight}
                      <Check size={16} />
                    {/if}
                  </button>
                {/each}
              </div>

              {#if pickedGenre !== null}
                <div class="feedback" class:ok={genreCorrect} class:bad={!genreCorrect}>
                  <strong>
                    {genreCorrect
                      ? `Верно (+6 б.): ${GENRES[current.genre].label}`
                      : `Верный вид: ${GENRES[current.genre].label}`}
                  </strong>
                  <p>{GENRES[current.genre].purpose}.</p>
                  {#if trapExplanation}
                    <p class="trap-tip"><strong>Ловушка ВсОШ:</strong> {trapExplanation}</p>
                  {/if}
                </div>
              {/if}

              <hr class="sep" />

              <div class="block-head">
                <span class="eyebrow">Шаг 1б · Атрибуция и датировка (до 5 б.)</span>
                <h3>К какому времени относится документ?</h3>
              </div>

              <form class="dating-form" onsubmit={submitDating}>
                {#if periodPreFiltered}
                  <p class="prefilter-note">
                    Эпоха уже задана фильтром ({kb.periodById.get(selectedPeriod!)?.short}) — в зачёт идёт точность указанного года.
                  </p>
                {:else}
                  <label class="f-field">
                    <span class="f-lbl">Историческая эпоха</span>
                    <select
                      class="f-select"
                      bind:value={pickedPeriod}
                      disabled={dateSubmitted}
                    >
                      <option value="">Выберите эпоху…</option>
                      {#each kb.periods as p (p.id)}
                        <option value={p.id}>{p.short} ({p.from}–{p.to})</option>
                      {/each}
                    </select>
                  </label>
                {/if}

                <div class="year-row">
                  <label class="f-field grow">
                    <span class="f-lbl">Предполагаемый год создания (напр., 1861)</span>
                    <input
                      type="text"
                      inputmode="numeric"
                      pattern={'[0-9]{3,4}'}
                      class="f-input num"
                      placeholder="Введите год…"
                      bind:value={yearInput}
                      disabled={dateSubmitted}
                    />
                  </label>
                  {#if !dateSubmitted}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={parsedYear === null || (!periodPreFiltered && !pickedPeriod)}
                    >
                      Проверить
                    </Button>
                  {/if}
                </div>
              </form>

              {#if dateSubmitted && yearEval}
                <div
                  class="feedback"
                  class:ok={periodCorrect && yearEval.score >= 0.75}
                  class:bad={!periodCorrect || yearEval.score < 0.4}
                >
                  <strong>{yearEval.label} · {current.date ?? current.year}</strong>
                  <p>
                    Эпоха: <strong>{kb.periodById.get(current.period)?.short}</strong>
                    {#if !periodPreFiltered}
                      ({periodCorrect ? 'угадана верно' : 'выбрана другая эпоха'})
                    {/if}
                    {#if hintLevel > 0}
                      · использована подсказка (−1 б.)
                    {/if}
                  </p>
                </div>
              {/if}

              {#if step1Done}
                <div class="step-foot">
                  <Button full icon={ArrowRight} onclick={() => (step = 2)}>
                    Шаг 2: Момент и критика источника
                  </Button>
                </div>
              {/if}
            </Card>
          {:else if step === 2}
            <Card padding="md" class="step-card">
              <div class="block-head">
                <span class="eyebrow">Шаг 2 · Исторический момент и критика (до 14 б.)</span>
                <h3>Сформулируйте характеристику до сверки</h3>
                <p class="muted xs">
                  На ВсОШ проверяют отдельно <strong>исторический момент</strong> (что привело к появлению текста)
                  и <strong>внешнюю / внутреннюю критику</strong> (автор, адресат, публикация, формуляр, предвзятость).
                </p>
              </div>

              <textarea
                class="draft-area"
                rows="4"
                bind:value={momentDraft}
                disabled={finished}
                placeholder="Краткий черновик (необязательно): что происходило в стране в этот момент? Кто автор и для кого он писал? О чём источник может умалчивать?"
              ></textarea>

              {#if !criticismRevealed}
                <Button full icon={Eye} onclick={() => (criticismRevealed = true)}>
                  Сверить с эталоном ВсОШ
                </Button>
              {:else}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <div class="canon-grid" onclick={openRef}>
                  {#if current.moment}
                    <div class="canon-box">
                      <span class="lbl">Эталон · Характеристика исторического момента</span>
                      <p>{@html lessonInline(current.moment)}</p>
                    </div>
                  {/if}
                  {#if current.about}
                    <div class="canon-box">
                      <span class="lbl">Эталон · Характеристика источника и критика</span>
                      <p>{@html lessonInline(current.about)}</p>
                    </div>
                  {/if}
                </div>

                <div class="check-block">
                  <span class="lbl">Самопроверка · Исторический момент (до 5 б.)</span>
                  {#each MOMENT_CRITERIA as label, i (i)}
                    <label class="chk-row" class:checked={momentChecks[i]}>
                      <input
                        type="checkbox"
                        checked={momentChecks[i]}
                        disabled={finished}
                        onchange={() => toggleMomentCheck(i)}
                      />
                      <span>{label}</span>
                    </label>
                  {/each}
                </div>

                <div class="check-block">
                  <span class="lbl">Самопроверка · Внешняя и внутренняя критика (до 9 б.)</span>
                  {#each SOURCE_CRITERIA as label, i (i)}
                    <label class="chk-row" class:checked={sourceChecks[i]}>
                      <input
                        type="checkbox"
                        checked={sourceChecks[i]}
                        disabled={finished}
                        onchange={() => toggleSourceCheck(i)}
                      />
                      <span>{label}</span>
                    </label>
                  {/each}
                </div>

                <div class="step-foot row-between">
                  <Button size="sm" variant="secondary" icon={ArrowLeft} onclick={() => (step = 1)}>
                    Назад
                  </Button>
                  <Button size="sm" icon={ArrowRight} onclick={() => (step = 3)}>
                    Шаг 3: Задачи ({activeTasks.length})
                  </Button>
                </div>
              {/if}
            </Card>
          {:else if step === 3}
            <Card padding="md" class="step-card">
              <div class="block-head">
                <span class="eyebrow">Шаг 3 · Основная часть — задачи проекта (до 18 б.)</span>
                <h3>Ответьте с опорой на цитаты и контекст</h3>
                <p class="muted xs">
                  {#if activeTasks[0]?.isSynthetic}
                    Для этого источника сформированы 2 базовые исследовательские задачи ВсОШ: реконструкция по тексту и критика достоверности.
                  {:else}
                    Каждый тезис подкрепляйте конкретной деталью из отрывка и фоновыми историческими знаниями.
                  {/if}
                </p>
              </div>

              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions a11y_no_static_element_interactions -->
              <ol class="tasks-list" onclick={openRef}>
                {#each activeTasks as task, i (i)}
                  <li class="task-item">
                    <p class="task-q"><strong>Задача {i + 1}.</strong> {@html lessonInline(task.q)}</p>
                    {#if shownAnswers[i]}
                      <div class="task-a">
                        <span class="lbl">Эталон ответа</span>
                        <p>{@html lessonInline(task.a)}</p>
                      </div>
                      <div class="grade-row">
                        <span class="muted xs">Оцените ответ честно:</span>
                        <div class="grade-btns">
                          <button
                            type="button"
                            class="g-btn ok"
                            class:picked={taskGrades[i] === true}
                            disabled={finished}
                            onclick={() => (taskGrades = { ...taskGrades, [i]: true })}
                          >
                            <Check size={14} /> Зачтено
                          </button>
                          <button
                            type="button"
                            class="g-btn no"
                            class:picked={taskGrades[i] === false}
                            disabled={finished}
                            onclick={() => (taskGrades = { ...taskGrades, [i]: false })}
                          >
                            <X size={14} /> Не дотянул(а)
                          </button>
                        </div>
                      </div>
                    {:else}
                      <button
                        type="button"
                        class="reveal-btn"
                        onclick={() => (shownAnswers = { ...shownAnswers, [i]: true })}
                      >
                        <Eye size={14} /> Показать эталон ответа
                      </button>
                    {/if}
                  </li>
                {/each}
              </ol>

              <div class="step-foot row-between">
                <Button size="sm" variant="secondary" icon={ArrowLeft} onclick={() => (step = 2)}>
                  Назад
                </Button>
                <Button
                  size="sm"
                  icon={ArrowRight}
                  disabled={!allTasksGraded}
                  onclick={() => (step = 4)}
                >
                  Шаг 4: Итоговый вывод
                </Button>
              </div>
            </Card>
          {:else}
            <Card padding="md" class="step-card">
              <div class="block-head">
                <span class="eyebrow">Шаг 4 · Заключение и ведомость ВсОШ (до 7 б.)</span>
                <h3>Сформулируйте общий вывод и значение источника</h3>
                <p class="muted xs">
                  В заключении ВсОШ жюри проверяет, свели ли вы наблюдения к проблеме эпохи и оценили ли информационный потенциал документа.
                </p>
              </div>

              {#if !finished}
                <textarea
                  class="draft-area"
                  rows="3"
                  bind:value={conclusionDraft}
                  placeholder="Краткий вывод: что этот документ позволяет понять об эпохе, и с какими источниками его нужно сопоставлять?"
                ></textarea>

                <div class="check-block">
                  <span class="lbl">Самопроверка заключения (4 б. + 3 б. = 7 б.)</span>
                  {#each CONCLUSION_CRITERIA as label, i (i)}
                    <label class="chk-row" class:checked={conclusionChecks[i]}>
                      <input
                        type="checkbox"
                        checked={conclusionChecks[i]}
                        onchange={() => toggleConclusionCheck(i)}
                      />
                      <span>{label}</span>
                    </label>
                  {/each}
                </div>

                <div class="step-foot row-between">
                  <Button size="sm" variant="secondary" icon={ArrowLeft} onclick={() => (step = 3)}>
                    Назад
                  </Button>
                  <Button size="sm" icon={CircleCheck} onclick={finishProject}>
                    Подвести итог (50 баллов)
                  </Button>
                </div>
              {:else if wsoshResult}
                <div class="scorecard">
                  <div class="sc-top">
                    <div class="sc-num num">
                      <strong>{wsoshResult.points}</strong><span>/ 50</span>
                    </div>
                    <div class="grow">
                      <strong class="sc-title">Ведомость исторического проекта</strong>
                      <p class="muted xs">{wsoshResult.verdict}</p>
                    </div>
                    <span class="sc-xp num">+{wsoshResult.xp} опыта</span>
                  </div>

                  <table class="sc-table">
                    <tbody>
                      <tr>
                        <td>1. Момент и датировка</td>
                        <td class="num sc-pts">{wsoshResult.breakdown.moment} / 10</td>
                      </tr>
                      <tr>
                        <td>2. Критика источника (вид + анализ)</td>
                        <td class="num sc-pts">{wsoshResult.breakdown.source} / 15</td>
                      </tr>
                      <tr>
                        <td>3. Исследовательские задачи</td>
                        <td class="num sc-pts">{wsoshResult.breakdown.tasks} / 18</td>
                      </tr>
                      <tr>
                        <td>4. Заключение и потенциал</td>
                        <td class="num sc-pts">{wsoshResult.breakdown.conclusion} / 7</td>
                      </tr>
                    </tbody>
                  </table>

                  <div class="sc-links">
                    {#if current.source && kb.get(current.source)}
                      <button
                        type="button"
                        class="link-btn"
                        onclick={() => openEntity(current!.source!)}
                      >
                        <ExternalLink size={14} /> Карточка источника
                      </button>
                    {/if}
                    <a class="link-btn" href="#/lesson/{current.lessonId}">
                      <BookOpen size={14} /> Урок: {current.lessonTitle}
                    </a>
                  </div>

                  <div class="sc-acts">
                    <Button size="sm" variant="secondary" icon={RotateCcw} onclick={() => loadProject(current)}>
                      Пройти заново
                    </Button>
                    <Button size="sm" icon={ArrowRight} onclick={loadNext}>
                      Следующий документ
                    </Button>
                  </div>
                </div>
              {/if}
            </Card>
          {/if}
        </section>
      </div>
    {/if}
  {:else if mode === 'catalog'}
    <div class="catalog-head">
      <label class="cat-search">
        <Search size={15} class="cs-ico" />
        <input
          type="text"
          inputmode="search"
          bind:value={query}
          placeholder="Найти документ, автора, дату или слово-улику…"
        />
        {#if query}
          <button type="button" class="cs-clr" aria-label="Очистить" onclick={() => (query = '')}>
            <X size={14} />
          </button>
        {/if}
      </label>
    </div>

    {#if scopedProjects.length === 0}
      <EmptyState title="Ничего не найдено" text="Попробуйте изменить запрос или сбросить фильтры.">
        <Button size="sm" onclick={clearFilters}>Сбросить фильтры</Button>
      </EmptyState>
    {:else}
      <div class="cat-list">
        {#each scopedProjects as doc (doc.id)}
          {@const rec = doneMap[doc.id]}
          {@const period = kb.periodById.get(doc.period)}
          <div class="cat-row">
            <div class="cat-main">
              <div class="cat-top">
                <span class="cat-meta">
                  {GENRES[doc.genre].label} · {doc.date ?? doc.year ?? 'без даты'}
                  {#if period} · {period.short}{/if}
                </span>
                {#if rec}
                  <span class="cat-score num" class:good={(rec.bestPoints ?? Math.round(rec.bestScore * 50)) >= 35}>
                    {rec.bestPoints ?? Math.round(rec.bestScore * 50)}/50
                  </span>
                {/if}
              </div>
              <strong class="cat-title">{doc.title}</strong>
              <p class="cat-ex muted">{doc.excerpt}</p>
            </div>
            <div class="cat-act">
              <Button
                size="sm"
                variant={rec ? 'secondary' : 'primary'}
                onclick={() => {
                  loadProject(doc);
                  mode = 'train';
                }}
              >
                {rec ? 'Повторить' : 'Разобрать'}
              </Button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- Tab 3: Authoritative WSOSh Historical Project Handbook -->
    <div class="guide-wrap">
      <Card padding="md">
        <span class="eyebrow">ЦПМК ВсОШ · Д. А. Хитров, Д. А. Черненко, А. А. Талызина</span>
        <h2 class="g-h2">Критерии «Исторического проекта» (50 баллов)</h2>
        <p class="muted g-lead">
          Исторический проект на региональном и заключительном этапах ВсОШ — это самостоятельное мини-исследование по
          источнику. Жюри оценивает не пересказ учебника, а <strong>внешнюю и внутреннюю критику текста</strong> и
          доказательность выводов.
        </p>

        <table class="crit-tbl">
          <tbody>
            {#each WSOSH_CRITERIA_TABLE as row (row.id)}
              <tr>
                <td>
                  <strong>{row.part}</strong>
                  <small>{row.note}</small>
                </td>
                <td class="num crit-pts">{row.points} б.</td>
              </tr>
            {/each}
            <tr class="crit-sum">
              <td>Максимум за исторический проект</td>
              <td class="num crit-pts">50 б.</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card padding="md">
        <span class="eyebrow">ВШЭ · И. Н. Данилевский и др. «Источниковедение»</span>
        <h2 class="g-h2">11 видов источников — по цели создания</h2>
        <p class="muted g-lead">
          Главный вопрос атрибуции — <strong>«Зачем автор написал этот текст?»</strong>, а не как он называется.
        </p>
        <dl class="genre-dl">
          {#each Object.entries(GENRES) as [key, g] (key)}
            <div class="g-row">
              <dt>{g.label}</dt>
              <dd>{g.purpose}</dd>
            </div>
          {/each}
        </dl>
      </Card>

      <Card padding="md">
        <span class="eyebrow">Различение пограничных жанров</span>
        <h2 class="g-h2">7 главных ловушек ВсОШ</h2>
        <div class="traps-list">
          {#each WSOSH_GENRE_TRAPS as t (t.title)}
            <div class="trap-item">
              <strong>{t.title}</strong>
              <p>{t.tip}</p>
            </div>
          {/each}
        </div>
      </Card>

      <Card padding="md">
        <span class="eyebrow">Как не потерять баллы на проверке</span>
        <h2 class="g-h2">Типичные ошибки участников</h2>
        <div class="mistakes-list">
          {#each WSOSH_COMMON_MISTAKES as m, i (i)}
            <div class="m-pair">
              <div class="m-box bad">
                <span class="m-lbl"><ThumbsDown size={13} /> Ошибка</span>
                <p>{m.bad}</p>
              </div>
              <div class="m-box good">
                <span class="m-lbl"><ThumbsUp size={13} /> Как требует ВсОШ</span>
                <p>{m.good}</p>
              </div>
            </div>
          {/each}
        </div>
      </Card>
    </div>
  {/if}
</div>

<style>
  .projects-page { max-width: 1120px; }

  .top-strip { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--sp-3); }
  .top-meta { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); flex-wrap: wrap; }
  .small { font-size: var(--text-sm); }
  .xs { font-size: var(--text-xs); }

  .filter-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 640;
    cursor: pointer;
  }
  .filter-btn.active {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  }

  .mode-bar { margin-bottom: var(--sp-3); }

  :global(.filters-card) { margin-bottom: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-3); }
  .f-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); }
  @media (max-width: 560px) { .f-grid { grid-template-columns: minmax(0, 1fr); } }
  .f-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .f-lbl { font-size: var(--text-xs); font-weight: 650; color: var(--ink-2); }
  .f-select, .f-input {
    width: 100%;
    padding: 9px 11px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line-strong);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-sm);
  }
  .f-bottom { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); flex-wrap: wrap; }
  .f-check { display: inline-flex; align-items: center; gap: 8px; font-size: var(--text-sm); cursor: pointer; }
  .f-reset {
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 650;
    cursor: pointer;
    padding: 4px 0;
  }

  /* ——— 2-column responsive trainer workspace ——— */
  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-4);
    align-items: start;
  }
  @media (min-width: 940px) {
    .workspace {
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    }
    .paper-col { position: sticky; top: var(--sp-3); }
  }

  .paper-card {
    border: 1px solid var(--line-strong);
    border-radius: var(--r-lg);
    background: var(--surface);
    padding: var(--sp-4);
    box-shadow: var(--shadow-1);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .paper-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-2); flex-wrap: wrap; }
  .paper-meta { flex: 1; min-width: 200px; }
  .paper-tag {
    display: block;
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 3px;
  }
  .paper-title { margin: 0; font-size: var(--text-lg); line-height: 1.25; }
  .paper-sub { margin: 4px 0 0; font-size: var(--text-xs); color: var(--ink-2); }

  .paper-tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 620;
    cursor: pointer;
  }
  .tool-btn.on {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 9%, var(--bg));
  }

  .excerpt {
    margin: 0;
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--bg) 70%, var(--surface));
    border: 1px solid var(--line);
    font-family: var(--font-read);
    font-size: 1rem;
    line-height: 1.65;
    color: var(--ink);
    white-space: pre-wrap;
  }
  .clue-mark {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: inherit;
    padding: 1px 3px;
    border-radius: 4px;
    box-decoration-break: clone;
  }

  .hints-box {
    padding: 10px 12px;
    border-radius: var(--r-sm);
    border: 1px dashed var(--line-strong);
    background: var(--bg);
    font-size: var(--text-xs);
    color: var(--ink-2);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .hints-box p { margin: 0; }

  .clues-strip {
    padding-top: var(--sp-2);
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lbl {
    display: block;
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .clues-list {
    margin: 0;
    padding-left: 1.15em;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--text-xs);
    line-height: 1.45;
    color: var(--ink-2);
  }

  /* ——— Stepper & right workbench ——— */
  .work-col { display: flex; flex-direction: column; gap: var(--sp-3); min-width: 0; }

  .stepper {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .step-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 8px 6px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 640;
    cursor: pointer;
    min-width: 0;
  }
  .step-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .step-btn.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    color: var(--accent);
  }
  .step-btn.done:not(.active) {
    border-color: color-mix(in srgb, var(--success) 45%, var(--line));
    color: var(--ink);
  }
  .sn {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    background: var(--bg);
    flex: none;
  }
  .step-btn.active .sn { background: var(--accent); color: var(--on-accent); }
  .sl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  :global(.step-card) { display: flex; flex-direction: column; gap: var(--sp-3); }
  .block-head { display: flex; flex-direction: column; gap: 4px; }
  .block-head h3 { margin: 0; font-size: var(--text-md); line-height: 1.3; }
  .block-head p { margin: 0; }

  .genre-list { display: flex; flex-direction: column; gap: 6px; }
  .genre-opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 620;
    text-align: left;
    cursor: pointer;
    transition: border-color var(--dur-2), background var(--dur-2);
  }
  .genre-opt:hover:not(:disabled) { border-color: var(--accent); }
  .genre-opt:disabled { cursor: default; }
  .genre-opt.correct {
    border-color: var(--success);
    background: var(--success-soft);
    color: var(--ink);
  }
  .genre-opt.wrong {
    border-color: var(--danger);
    background: var(--danger-soft);
  }

  .feedback {
    padding: 10px 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--bg);
    font-size: var(--text-sm);
    line-height: 1.45;
  }
  .feedback.ok { border-color: color-mix(in srgb, var(--success) 45%, var(--line)); background: var(--success-soft); }
  .feedback.bad { border-color: color-mix(in srgb, var(--danger) 45%, var(--line)); background: var(--danger-soft); }
  .feedback strong { display: block; margin-bottom: 3px; }
  .feedback p { margin: 0; font-size: var(--text-xs); color: var(--ink-2); }
  .trap-tip { margin-top: 6px !important; padding-top: 6px; border-top: 1px solid var(--line); color: var(--ink) !important; }

  .sep { border: 0; border-top: 1px solid var(--line); margin: 2px 0; }

  .dating-form { display: flex; flex-direction: column; gap: var(--sp-2); }
  .prefilter-note {
    margin: 0;
    padding: 8px 10px;
    border-radius: var(--r-sm);
    background: var(--bg);
    border: 1px solid var(--line);
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
  .year-row { display: flex; align-items: flex-end; gap: var(--sp-2); }

  .draft-area {
    width: 100%;
    padding: 10px 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-sm);
    line-height: 1.5;
    resize: vertical;
  }

  .canon-grid { display: flex; flex-direction: column; gap: var(--sp-2); }
  .canon-box {
    padding: 11px 13px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--bg);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  .canon-box p { margin: 4px 0 0; font-family: var(--font-read); }

  .check-block { display: flex; flex-direction: column; gap: 6px; }
  .chk-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 9px 11px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--bg);
    font-size: var(--text-sm);
    line-height: 1.4;
    cursor: pointer;
  }
  .chk-row.checked {
    border-color: color-mix(in srgb, var(--success) 50%, var(--line));
    background: var(--success-soft);
  }
  .chk-row input { margin-top: 3px; flex: none; accent-color: var(--accent); }

  .tasks-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .task-item {
    padding: 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .task-q { margin: 0; font-size: var(--text-sm); line-height: 1.45; }
  .task-a {
    padding-top: 8px;
    border-top: 1px solid var(--line);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  .task-a p { margin: 4px 0 0; font-family: var(--font-read); white-space: pre-line; }

  .reveal-btn {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 11px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 640;
    cursor: pointer;
  }

  .grade-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .grade-btns { display: flex; gap: 6px; }
  .g-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 640;
    cursor: pointer;
  }
  .g-btn.ok.picked { border-color: var(--success); background: var(--success-soft); color: var(--success); }
  .g-btn.no.picked { border-color: var(--danger); background: var(--danger-soft); color: var(--danger); }

  .step-foot { padding-top: 4px; }
  .row-between { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }

  /* ——— Step 4 WSOSh 50-point scorecard ——— */
  .scorecard { display: flex; flex-direction: column; gap: var(--sp-3); }
  .sc-top { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
  .sc-num {
    display: flex;
    align-items: baseline;
    gap: 2px;
    padding: 8px 12px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--accent) 12%, var(--bg));
    color: var(--accent);
    flex: none;
  }
  .sc-num strong { font-size: 1.5rem; line-height: 1; }
  .sc-num span { font-size: var(--text-xs); opacity: 0.8; }
  .sc-title { display: block; font-size: var(--text-md); }
  .sc-xp { font-size: var(--text-xs); font-weight: 700; color: var(--success); }

  .sc-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .sc-table td { padding: 7px 0; border-bottom: 1px solid var(--line); }
  .sc-table tr:last-child td { border-bottom: 0; }
  .sc-pts { text-align: right; font-weight: 700; color: var(--ink); white-space: nowrap; }

  .sc-links { display: flex; flex-wrap: wrap; gap: 8px; }
  .link-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--accent);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 640;
    text-decoration: none;
    cursor: pointer;
  }
  .sc-acts { display: flex; justify-content: flex-end; gap: var(--sp-2); flex-wrap: wrap; }

  /* ——— Catalog ——— */
  .catalog-head { margin-bottom: var(--sp-3); }
  .cat-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--surface);
  }
  .cat-search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--text-sm);
    outline: none;
  }
  .cs-clr { border: 0; background: none; color: var(--ink-3); cursor: pointer; display: grid; place-items: center; padding: 2px; }

  .cat-list { display: flex; flex-direction: column; gap: 8px; }
  .cat-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 12px 14px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--surface);
    box-shadow: var(--shadow-1);
  }
  @media (max-width: 560px) {
    .cat-row { flex-direction: column; align-items: stretch; }
    .cat-act { align-self: flex-end; }
  }
  .cat-main { flex: 1; min-width: 0; }
  .cat-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 3px; }
  .cat-meta { font-size: var(--text-xs); color: var(--ink-3); }
  .cat-score { font-size: var(--text-xs); font-weight: 700; color: var(--ink-2); }
  .cat-score.good { color: var(--success); }
  .cat-title { display: block; font-size: var(--text-md); line-height: 1.25; }
  .cat-ex {
    margin: 4px 0 0;
    font-size: var(--text-xs);
    font-family: var(--font-read);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .cat-act { flex: none; }

  /* ——— WSOSh Handbook tab ——— */
  .guide-wrap { display: flex; flex-direction: column; gap: var(--sp-4); }
  .g-h2 { margin: 4px 0 var(--sp-2); font-size: var(--text-lg); line-height: 1.25; }
  .g-lead { margin: 0 0 var(--sp-3); font-size: var(--text-sm); font-family: var(--font-read); line-height: 1.55; }

  .crit-tbl { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .crit-tbl td { padding: 8px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  .crit-tbl small { display: block; margin-top: 2px; color: var(--ink-2); font-size: var(--text-xs); line-height: 1.45; }
  .crit-pts { text-align: right; font-weight: 700; color: var(--accent); white-space: nowrap; padding-left: var(--sp-3); }
  .crit-sum td { border-bottom: 0; font-weight: 700; padding-top: 10px; }

  .genre-dl { margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .g-row { padding-bottom: 8px; border-bottom: 1px solid var(--line); }
  .g-row:last-child { border-bottom: 0; padding-bottom: 0; }
  .g-row dt { font-size: var(--text-sm); font-weight: 700; color: var(--ink); }
  .g-row dd { margin: 2px 0 0; font-size: var(--text-xs); color: var(--ink-2); line-height: 1.45; }

  .traps-list { display: flex; flex-direction: column; gap: 10px; }
  .trap-item {
    padding: 10px 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--bg);
  }
  .trap-item strong { display: block; font-size: var(--text-sm); margin-bottom: 3px; }
  .trap-item p { margin: 0; font-size: var(--text-xs); color: var(--ink-2); line-height: 1.45; }

  .mistakes-list { display: flex; flex-direction: column; gap: var(--sp-3); }
  .m-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  @media (max-width: 640px) { .m-pair { grid-template-columns: minmax(0, 1fr); } }
  .m-box { padding: 10px 12px; border-radius: var(--r-md); font-size: var(--text-xs); line-height: 1.45; }
  .m-box.bad { background: var(--danger-soft); }
  .m-box.good { background: var(--success-soft); }
  .m-lbl { display: inline-flex; align-items: center; gap: 5px; font-weight: 700; margin-bottom: 4px; }
  .m-box.bad .m-lbl { color: var(--danger); }
  .m-box.good .m-lbl { color: var(--success); }
  .m-box p { margin: 0; color: var(--ink); }
</style>
