<script lang="ts">
  /**
   * «Сквозная линия» detail view (`/course/themes/:id`):
   *  - Hero card with essay problem question, overarching thesis arc, progress bar, and 1-click launch
   *    into «Исторический проект по линии» (`/course/projects?theme=<id>`).
   *  - 4 tabs:
   *    1) «Эволюция» — vertical chronological stages (Problem -> Solution -> Outcome + clickable real
   *       milestones), comparative stage table, and expandable «Сравни эпохи» essay models;
   *    2) «Уроки» — chronological theme lessons with completion status;
   *    3) «Для эссе» — WSOSh essay tasks, aggregated historian debates, «Не путать» pitfalls, and key
   *       persons/terms/monuments;
   *    4) «Тренировка» — interactive «Хронология линии» ordering drill with instant scoring & XP.
   */
  import { onMount } from 'svelte';
  import {
    BookOpen,
    ScrollText,
    Scale,
    TriangleAlert,
    CircleCheck,
    Circle,
    ArrowUp,
    ArrowDown,
    Check,
    Shuffle,
    ChevronDown,
    EqualNot,
    Route,
    PenLine,
  } from '@lucide/svelte';
  import PageHeader from '$lib/design/components/PageHeader.svelte';
  import Card from '$lib/design/components/Card.svelte';
  import Button from '$lib/design/components/Button.svelte';
  import Badge from '$lib/design/components/Badge.svelte';
  import Segmented from '$lib/design/components/Segmented.svelte';
  import ProgressBar from '$lib/design/components/ProgressBar.svelte';
  import EmptyState from '$lib/design/components/EmptyState.svelte';
  import EntityPreview from '$lib/components/EntityPreview.svelte';
  import { kb } from '$lib/core/content/kb.svelte';
  import type { EventItem } from '$lib/core/content/schema';
  import { logAnswer } from '$lib/core/mastery';
  import { record } from '$lib/core/progress.svelte';
  import { haptic } from '$lib/core/platform';
  import { router } from '$lib/core/router.svelte';
  import { openSheet } from '$lib/core/ui.svelte';
  import { formatSpan, pluralN, WORDS } from '$lib/core/utils/format';
  import { duePlan, type LessonState } from './progress';
  import { lessonInline } from './text';
  import {
    buildThemeBundle,
    createChronologyDrill,
    evaluateChronologyDrill,
    findThemeById,
    type ChronologyDrillResult,
  } from './themes';

  type Tab = 'evolution' | 'lessons' | 'essay' | 'drill';

  let tab = $state<Tab>('evolution');
  let prog = $state<Record<string, LessonState>>({});
  let openCompare = $state<Record<number, boolean>>({ 0: true });

  const theme = $derived(findThemeById(router.params.id ?? ''));
  const kbData = $derived.by(() => {
    void kb.version;
    return {
      lessons: kb.lessons,
      eventsById: new Map(kb.events.map((e) => [e.id, e])),
      personsById: new Map(kb.persons.map((p) => [p.id, p])),
      termsById: new Map(kb.terms.map((t) => [t.id, t])),
      cultureById: new Map(kb.culture.map((c) => [c.id, c])),
    };
  });

  const bundle = $derived(theme ? buildThemeBundle(theme, kbData, prog) : undefined);

  // ——— Chronology Drill State ———
  let drillItems = $state<EventItem[]>([]);
  let drillChecked = $state<ChronologyDrillResult | null>(null);

  function startDrill() {
    if (!bundle) return;
    drillItems = createChronologyDrill(bundle.milestones, Math.min(5, bundle.milestones.length));
    drillChecked = null;
  }

  function moveItem(index: number, delta: -1 | 1) {
    const next = index + delta;
    if (next < 0 || next >= drillItems.length || drillChecked) return;
    const copy = [...drillItems];
    [copy[index], copy[next]] = [copy[next]!, copy[index]!];
    drillItems = copy;
    haptic('tap');
  }

  async function checkDrill() {
    if (!bundle || !drillItems.length || drillChecked) return;
    const res = evaluateChronologyDrill(
      drillItems.map((e) => e.id),
      drillItems,
    );
    drillChecked = res;
    haptic(res.allCorrect ? 'success' : 'error');
    logAnswer({
      period: drillItems[0]?.period,
      skill: 'dates',
      type: 'order',
      score: res.score,
      src: `theme:${bundle.theme.id}`,
    });
    await record({ xp: res.xp, questions: res.total, correct: res.exactMatches, games: 1 });
  }

  onMount(async () => {
    ({ state: prog } = await duePlan());
    startDrill();
  });

  $effect(() => {
    if (bundle && drillItems.length === 0) startDrill();
  });

  function openEntity(id: string) {
    openSheet({ component: EntityPreview, props: { id, from: theme?.title ?? 'Сквозная линия' } });
  }

  function openRef(ev: MouseEvent) {
    const id = (ev.target as HTMLElement).closest<HTMLElement>('[data-ref]')?.dataset.ref;
    if (!id) return;
    ev.preventDefault();
    openEntity(id);
  }
</script>

<div class="page" style:--c={theme?.color ?? 'var(--accent)'}>
  {#if !bundle || !theme}
    <PageHeader title="Линия не найдена" back="/course/themes" />
    <EmptyState icon={Route} title="Такой линии нет" text="Выберите сквозную линию из списка." />
  {:else}
    <PageHeader title={theme.title} eyebrow="Сквозная линия · {theme.span}" back="/course/themes" />

    <!-- Hero synthesis card -->
    <Card padding="lg" class="hero-card">
      <p class="hero-q">{theme.essayQuestion}</p>
      <p class="hero-arc">{theme.thesisArc}</p>

      <div class="hero-prog">
        <div class="row prog-row">
          <small class="muted">Уроки линии: {bundle.stats.doneLessons} из {bundle.stats.totalLessons}</small>
          <small class="muted num">{Math.round(bundle.stats.ratio * 100)}%</small>
        </div>
        <ProgressBar value={bundle.stats.ratio} color={theme.color} height={6} />
      </div>

      <div class="hero-actions">
        {#if bundle.stats.documents > 0}
          <Button href="/course/projects?theme={theme.id}" icon={ScrollText} full>
            Источники линии ({bundle.stats.documents})
          </Button>
        {/if}
        <Button variant="secondary" icon={Shuffle} full onclick={() => { tab = 'drill'; startDrill(); }}>
          Тренировать хронологию
        </Button>
      </div>
    </Card>

    <div class="tab-bar">
      <Segmented
        bind:value={tab}
        options={[
          { value: 'evolution', label: 'Этапы', count: theme.stages.length },
          { value: 'lessons', label: 'Уроки', count: bundle.lessons.length },
          { value: 'essay', label: 'Эссе', count: bundle.debates.length },
          { value: 'drill', label: 'Тест' },
        ]}
      />
    </div>

    {#if tab === 'evolution'}
      <div class="stack content-area">
        <!-- Vertical stage cards -->
        {#each theme.stages as st, i (st.id)}
          {@const stageMilestones = st.milestoneIds.map((id) => kbData.eventsById.get(id)).filter((x): x is EventItem => Boolean(x))}
          <article class="stage-card surface">
            <header class="st-head">
              <span class="st-num">{i + 1}</span>
              <div class="grow">
                <span class="st-years">{st.years}</span>
                <h2 class="st-title">{st.title}</h2>
              </div>
            </header>

            <div class="st-grid">
              <div><span class="lbl">Вызов эпохи</span><p>{st.problem}</p></div>
              <div><span class="lbl">Ключевые меры</span><p>{st.solution}</p></div>
              <div><span class="lbl">Итог и противоречие</span><p>{st.outcome}</p></div>
            </div>

            {#if stageMilestones.length}
              <div class="ms-row">
                {#each stageMilestones as ev (ev.id)}
                  <button type="button" class="ms-chip" onclick={() => openEntity(ev.id)}>
                    <strong class="num">{formatSpan(ev.year, ev.endYear, ev.circa)}</strong>
                    <span>{ev.title}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </article>
        {/each}

        <!-- Comparative table across centuries -->
        <section class="comp-table-wrap">
          <h3 class="sec-h">Сравнительная таблица этапов</h3>
          <div class="table-scroll surface">
            <table>
              <thead>
                <tr>
                  <th>Этап</th>
                  <th>Проблема</th>
                  <th>Решение</th>
                  <th>Итог</th>
                </tr>
              </thead>
              <tbody>
                {#each theme.stages as st (st.id)}
                  <tr>
                    <td><strong>{st.years}</strong><br /><small class="muted">{st.title}</small></td>
                    <td>{st.problem}</td>
                    <td>{st.solution}</td>
                    <td>{st.outcome}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Compare pairs for essay -->
        {#if theme.comparePairs.length}
          <section class="stack compare-sec">
            <h3 class="sec-h">Сравни эпохи (готовые аргументы для эссе)</h3>
            {#each theme.comparePairs as cp, i (cp.title)}
              {@const isOpen = Boolean(openCompare[i])}
              <Card padding="md" class="cp-card">
                <button
                  type="button"
                  class="cp-toggle"
                  aria-expanded={isOpen}
                  onclick={() => (openCompare = { ...openCompare, [i]: !isOpen })}
                >
                  <strong class="grow">{cp.title}</strong>
                  <ChevronDown size={17} class={isOpen ? 'rot' : ''} />
                </button>
                {#if isOpen}
                  <div class="cp-body">
                    <div class="cp-ab">
                      <span>{cp.a}</span>
                      <span class="vs">vs</span>
                      <span>{cp.b}</span>
                    </div>
                    <p><span class="lbl">Сходство</span> {cp.similarity}</p>
                    <p><span class="lbl">Различие</span> {cp.difference}</p>
                    <p class="takeaway"><span class="lbl">Вывод для эссе</span> {cp.essayTakeaway}</p>
                  </div>
                {/if}
              </Card>
            {/each}
          </section>
        {/if}
      </div>

    {:else if tab === 'lessons'}
      <div class="stack content-area">
        {#each bundle.lessons as entry (entry.lesson.id)}
          {@const p = kb.periodById.get(entry.lesson.period)}
          <a class="lesson-row surface" href="#/lesson/{entry.lesson.id}" style:--lc={p?.color ?? theme.color}>
            <span class="l-ico">
              {#if entry.done}<CircleCheck size={20} />{:else}<Circle size={20} />{/if}
            </span>
            <div class="grow">
              <small class="l-stage">{p?.short ?? ''} · {entry.stageTitle}</small>
              <strong>{entry.lesson.title}</strong>
            </div>
            {#if entry.due}
              <Badge tone="danger">Повтор</Badge>
            {:else if entry.lesson.minutes}
              <small class="muted num">{entry.lesson.minutes} мин</small>
            {/if}
          </a>
        {/each}
      </div>

    {:else if tab === 'essay'}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="stack content-area" onclick={openRef}>
        <!-- Essay tasks -->
        <Card padding="md">
          <span class="eyebrow"><PenLine size={13} /> Задачи плана эссе (нейтральные формулировки ВсОШ)</span>
          <ol class="tasks-ol">
            {#each theme.essayTasks as t, i (i)}
              <li>{t}</li>
            {/each}
          </ol>
        </Card>

        <!-- Key persons / terms / monuments -->
        {#if bundle.persons.length || bundle.terms.length || bundle.culture.length}
          <Card padding="md">
            <span class="eyebrow">Опорные имена, понятия и памятники линии</span>
            {#if bundle.persons.length}
              <div class="ent-group">
                <span class="lbl">Персоналии</span>
                <div class="ent-chips">
                  {#each bundle.persons as p (p.id)}
                    <button type="button" class="ent-chip" onclick={() => openEntity(p.id)}>{p.short}</button>
                  {/each}
                </div>
              </div>
            {/if}
            {#if bundle.terms.length}
              <div class="ent-group">
                <span class="lbl">Понятия</span>
                <div class="ent-chips">
                  {#each bundle.terms as t (t.id)}
                    <button type="button" class="ent-chip" onclick={() => openEntity(t.id)}>{t.term}</button>
                  {/each}
                </div>
              </div>
            {/if}
            {#if bundle.culture.length}
              <div class="ent-group">
                <span class="lbl">Памятники культуры</span>
                <div class="ent-chips">
                  {#each bundle.culture as c (c.id)}
                    <button type="button" class="ent-chip" onclick={() => openEntity(c.id)}>{c.title}</button>
                  {/each}
                </div>
              </div>
            {/if}
          </Card>
        {/if}

        <!-- Aggregated historian debates -->
        {#if bundle.debates.length}
          <section class="stack">
            <h3 class="sec-h"><Scale size={16} /> Историография линии ({pluralN(bundle.debates.length, WORDS.debate)})</h3>
            {#each bundle.debates.slice(0, 10) as d (d.id)}
              <Card padding="md" class="deb-card">
                <small class="muted">{d.lessonTitle}</small>
                <strong class="deb-q">{@html lessonInline(d.question)}</strong>
                <div class="deb-pos">
                  {#each d.positions as pos, i (pos.who + i)}
                    <div class="dp">
                      <p class="dp-who">
                        <strong>{pos.who}</strong>
                        <span class="muted"> «{pos.work}»{#if pos.year}, {pos.year}{/if}</span>
                      </p>
                      <p class="dp-th">{@html lessonInline(pos.thesis)}</p>
                    </div>
                  {/each}
                </div>
              </Card>
            {/each}
          </section>
        {/if}

        <!-- Aggregated pitfalls -->
        {#if bundle.pitfalls.length}
          <section class="stack">
            <h3 class="sec-h"><TriangleAlert size={16} /> Не перепутать ({pluralN(bundle.pitfalls.length, WORDS.pitfall)})</h3>
            {#each bundle.pitfalls.slice(0, 12) as pit (pit.id)}
              <div class="pit-card">
                <div class="pit-ab">
                  <span>{@html lessonInline(pit.a)}</span>
                  <EqualNot size={16} />
                  <span>{@html lessonInline(pit.b)}</span>
                </div>
                <p class="pit-how">{@html lessonInline(pit.how)}</p>
              </div>
            {/each}
          </section>
        {/if}
      </div>

    {:else}
      <!-- Chronology Drill Tab -->
      <div class="stack content-area">
        {#if drillItems.length < 2}
          <EmptyState
            icon={BookOpen}
            title="Для этой линии мало датированных вех"
            text="Потренируйте источники линии или изучите сравнительную таблицу этапов."
          />
        {:else}
          <Card padding="md">
            <div class="row drill-head">
              <div class="grow">
                <span class="eyebrow">Хронология линии</span>
                <strong>Расставьте события от самого раннего к самому позднему</strong>
              </div>
              <button type="button" class="mini-btn" onclick={startDrill}>
                <Shuffle size={14} /> Новый набор
              </button>
            </div>

            <div class="drill-list">
              {#each drillItems as ev, idx (ev.id)}
                {@const isRightPos = drillChecked !== null && drillChecked.correctIds[idx] === ev.id}
                <div class="drill-row" class:ok={drillChecked !== null && isRightPos} class:bad={drillChecked !== null && !isRightPos}>
                  <span class="d-idx">{idx + 1}</span>
                  <div class="grow">
                    <strong>{ev.title}</strong>
                    {#if drillChecked}
                      <small class="d-year num">{formatSpan(ev.year, ev.endYear, ev.circa)}</small>
                    {/if}
                  </div>
                  {#if !drillChecked}
                    <div class="move-btns">
                      <button type="button" class="mv-btn" aria-label="Выше" disabled={idx === 0} onclick={() => moveItem(idx, -1)}>
                        <ArrowUp size={15} />
                      </button>
                      <button type="button" class="mv-btn" aria-label="Ниже" disabled={idx === drillItems.length - 1} onclick={() => moveItem(idx, 1)}>
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>

            {#if !drillChecked}
              <Button full icon={Check} onclick={checkDrill}>Проверить порядок</Button>
            {:else}
              <div class="drill-res">
                <strong>
                  {drillChecked.allCorrect
                    ? `Безупречно! (+${drillChecked.xp} XP)`
                    : `Точность порядка: ${Math.round(drillChecked.score * 100)}% (+${drillChecked.xp} XP)`}
                </strong>
                {#if !drillChecked.allCorrect}
                  <p class="muted xs">
                    Верный порядок: {[...drillItems].sort((a, b) => a.year - b.year).map((e) => `${e.year} — ${e.title}`).join(' → ')}
                  </p>
                {/if}
                <Button full icon={Shuffle} onclick={startDrill}>Ещё один раунд</Button>
              </div>
            {/if}
          </Card>
        {/if}

        {#if bundle.stats.documents > 0}
          <Card tone="gold" padding="md">
            <div class="row proj-cta">
              <div class="grow">
                <strong>Исторические проекты по линии</strong>
                <small class="muted">{pluralN(bundle.stats.documents, WORDS.document)} из уроков этой темы в слепом режиме</small>
              </div>
              <Button href="/course/projects?theme={theme.id}" icon={ScrollText}>Открыть</Button>
            </div>
          </Card>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  :global(.hero-card) { border-left: 4px solid var(--c); margin-bottom: var(--sp-3); }
  .hero-q { margin: 0 0 8px; font-family: var(--font-display); font-size: var(--text-xl); line-height: 1.26; }
  .hero-arc { margin: 0 0 var(--sp-3); font-size: var(--text-sm); color: var(--ink-2); line-height: 1.52; }
  .hero-prog { display: flex; flex-direction: column; gap: 5px; margin-bottom: var(--sp-3); }
  .prog-row { justify-content: space-between; font-size: var(--text-xs); }
  .hero-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
  .tab-bar { margin-bottom: var(--sp-4); }
  .content-area { --gap: var(--sp-3); padding-bottom: var(--sp-6); }

  .stage-card { padding: var(--sp-4); border-radius: var(--r-lg); border-left: 3px solid var(--c); display: flex; flex-direction: column; gap: var(--sp-3); }
  .st-head { display: flex; align-items: center; gap: var(--sp-3); }
  .st-num {
    width: 30px; height: 30px; border-radius: 50%; background: var(--c); color: #fff; font-weight: 800; font-size: var(--text-sm);
    display: grid; place-items: center; flex: none;
  }
  .st-head .grow { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .st-years { font-size: var(--text-xs); font-weight: 700; color: var(--c); }
  .st-title { margin: 0; font-family: var(--font-display); font-size: var(--text-lg); line-height: 1.25; }
  .st-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--sp-2); font-size: var(--text-sm); line-height: 1.48; }
  .st-grid p { margin: 2px 0 0; color: var(--ink-2); }
  .lbl {
    display: inline-block; font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: var(--ink-3);
  }
  .ms-row { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 4px; border-top: 1px solid var(--line); }
  .ms-chip {
    display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: var(--r-full);
    border: 1px solid var(--line-strong); background: var(--surface-2); color: var(--ink); font: inherit; font-size: var(--text-xs); cursor: pointer;
  }
  .ms-chip strong { color: var(--c); }

  .sec-h { display: flex; align-items: center; gap: 6px; margin: var(--sp-2) 0 0; font-family: var(--font-display); font-size: var(--text-xl); }
  .table-scroll { overflow-x: auto; border-radius: var(--r-md); border: 1px solid var(--line); margin-top: var(--sp-2); }
  table { border-collapse: collapse; width: 100%; min-width: 560px; font-size: var(--text-xs); line-height: 1.45; }
  th, td { padding: 9px 10px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
  th { background: color-mix(in srgb, var(--c) 12%, var(--surface)); font-weight: 700; }
  tbody tr:last-child td { border-bottom: 0; }

  .cp-toggle {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 0; border: 0; background: none; color: var(--ink);
    font: inherit; font-size: var(--text-md, 1rem); text-align: left; cursor: pointer;
  }
  .cp-toggle :global(.rot) { transform: rotate(180deg); }
  .cp-body { margin-top: var(--sp-3); display: flex; flex-direction: column; gap: 8px; font-size: var(--text-sm); line-height: 1.5; }
  .cp-body p { margin: 0; }
  .cp-ab {
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px;
    padding: 8px 10px; border-radius: var(--r-md); background: var(--surface-2); font-weight: 650; font-size: var(--text-xs);
  }
  .vs { color: var(--c); font-weight: 800; text-transform: uppercase; }
  .takeaway { padding: 8px 10px; border-radius: var(--r-md); background: color-mix(in srgb, var(--gold) 12%, var(--surface-2)); }

  .lesson-row {
    display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3); border-radius: var(--r-md);
    border-left: 3px solid var(--lc); color: var(--ink); text-decoration: none;
  }
  .l-ico { color: var(--lc); display: flex; flex: none; }
  .lesson-row .grow { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .l-stage { font-size: 11px; color: var(--ink-3); }

  .eyebrow { display: inline-flex; align-items: center; gap: 5px; font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--c); }
  .tasks-ol { margin: 8px 0 0; padding-left: 1.2em; display: flex; flex-direction: column; gap: 6px; font-size: var(--text-sm); line-height: 1.48; }
  .ent-group { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
  .ent-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .ent-chip {
    padding: 5px 10px; border-radius: var(--r-full); border: 1px solid var(--line-strong);
    background: var(--surface-2); color: var(--ink); font: inherit; font-size: var(--text-xs); font-weight: 600; cursor: pointer;
  }

  :global(.deb-card) { display: flex; flex-direction: column; gap: 8px; }
  .deb-q { font-family: var(--font-display); font-size: var(--text-lg); line-height: 1.25; }
  .deb-pos { display: flex; flex-direction: column; gap: 8px; }
  .dp { padding: 8px 10px; border-radius: var(--r-md); background: var(--surface-2); border-left: 3px solid var(--c); font-size: var(--text-xs); line-height: 1.48; }
  .dp p { margin: 0; }
  .dp-th { margin-top: 4px !important; font-family: var(--font-read); font-size: var(--text-sm); }

  .pit-card {
    padding: var(--sp-3); border-radius: var(--r-md);
    background: color-mix(in srgb, var(--warning) 9%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
    font-size: var(--text-sm);
  }
  .pit-ab { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; font-weight: 650; }
  .pit-ab :global(svg) { color: var(--warning); }
  .pit-how { margin: 4px 0 0; color: var(--ink-2); font-size: var(--text-xs); line-height: 1.45; }

  .drill-head { align-items: center; gap: 8px; margin-bottom: var(--sp-3); }
  .drill-head .grow { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .mini-btn {
    display: inline-flex; align-items: center; gap: 5px; padding: 6px 11px; border-radius: var(--r-full);
    border: 1px solid var(--line-strong); background: var(--surface-2); color: var(--ink); font: inherit; font-size: var(--text-xs); font-weight: 650; cursor: pointer;
  }
  .drill-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: var(--sp-3); }
  .drill-row {
    display: flex; align-items: center; gap: var(--sp-2); padding: 10px 12px; border-radius: var(--r-md);
    background: var(--surface-2); border: 1px solid var(--line); font-size: var(--text-sm);
  }
  .drill-row.ok { border-color: var(--success); background: color-mix(in srgb, var(--success) 10%, var(--surface-2)); }
  .drill-row.bad { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 9%, var(--surface-2)); }
  .d-idx {
    width: 24px; height: 24px; border-radius: 50%; background: var(--surface); border: 1px solid var(--line-strong);
    display: grid; place-items: center; font-weight: 800; font-size: var(--text-xs); flex: none;
  }
  .drill-row .grow { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .d-year { color: var(--c); font-weight: 700; font-size: var(--text-xs); }
  .move-btns { display: flex; gap: 4px; flex: none; }
  .mv-btn {
    width: 30px; height: 30px; border-radius: var(--r-sm, 8px); border: 1px solid var(--line-strong);
    background: var(--surface); color: var(--ink); display: grid; place-items: center; cursor: pointer;
  }
  .mv-btn:disabled { opacity: 0.35; cursor: default; }
  .drill-res { display: flex; flex-direction: column; gap: 8px; padding-top: 6px; }
  .xs { font-size: var(--text-xs); line-height: 1.45; margin: 0; }
  .proj-cta { align-items: center; gap: var(--sp-3); }
  .proj-cta .grow { display: flex; flex-direction: column; gap: 2px; }
</style>
