<script lang="ts">
  /**
   * «Курс» — lessons by epoch in course order: what to read next, what is due for review, what is learnt.
   * Supports `?period=<id>` deep-linking from PeriodPage, epoch chips, status filtering, and collapsible groups.
   */
  import { onMount, tick } from 'svelte';
  import { BookOpen, RotateCcw, CircleCheck, Circle, Play, ChevronDown, Sparkles, Scale, ArrowRight, Route, ScrollText, Compass } from '@lucide/svelte';
  import PageHeader from '$lib/design/components/PageHeader.svelte';
  import Card from '$lib/design/components/Card.svelte';
  import Badge from '$lib/design/components/Badge.svelte';
  import Chip from '$lib/design/components/Chip.svelte';
  import Segmented from '$lib/design/components/Segmented.svelte';
  import EmptyState from '$lib/design/components/EmptyState.svelte';
  import ProgressBar from '$lib/design/components/ProgressBar.svelte';
  import { kb } from '$lib/core/content/kb.svelte';
  import type { LessonItem } from '$lib/core/content/schema';
  import { router } from '$lib/core/router.svelte';
  import { pluralN, WORDS } from '$lib/core/utils/format';
  import { duePlan, daysUntil, type LessonState } from './progress';
  import { courseStats, extractLessonDebates, filterLessons, isDeepLesson, type LessonFilter } from './filter';
  import { extractDocumentProjects } from './projects';
  import { CROSS_THEMES } from './themes';

  let prog = $state<Record<string, LessonState>>({});
  let due = $state<LessonItem[]>([]);
  let next = $state<LessonItem | undefined>();
  let selectedPeriod = $state<string | null>(router.query.get('period') || null);
  let statusFilter = $state<LessonFilter>('all');
  let deepOnly = $state(false);
  let expanded = $state<Record<string, boolean>>({});
  let chipsEl = $state<HTMLElement | null>(null);

  onMount(async () => {
    ({ state: prog, due, next } = await duePlan());
    const initial = selectedPeriod ?? due[0]?.period ?? next?.period ?? kb.periods[0]?.id;
    if (initial) expanded[initial] = true;
    if (selectedPeriod) {
      await tick();
      chipsEl?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  });

  const stats = $derived(courseStats(kb.lessons, prog));
  const debatesCount = $derived(extractLessonDebates(kb.lessons).length);
  const projectsCount = $derived(extractDocumentProjects(kb.lessons).length);
  const periodsWithLessons = $derived(kb.periods.filter((p) => kb.lessonsIn(p.id).length > 0));
  const scopeLessons = $derived.by(() => {
    const base = selectedPeriod ? kb.lessonsIn(selectedPeriod) : kb.lessons;
    return deepOnly ? base.filter((l) => isDeepLesson(l)) : base;
  });
  const deepInScope = $derived(
    (selectedPeriod ? kb.lessonsIn(selectedPeriod) : kb.lessons).filter((l) => isDeepLesson(l)).length,
  );
  const activeNext = $derived.by(() => {
    if (!selectedPeriod && !deepOnly) return next;
    return scopeLessons.find((l) => prog[l.id]?.at !== undefined && !prog[l.id]?.done) ?? scopeLessons.find((l) => !prog[l.id]?.done);
  });
  const filtered = $derived(filterLessons(kb.lessons, prog, { period: selectedPeriod, filter: statusFilter, deepOnly }));
  const groups = $derived(
    periodsWithLessons
      .map((p) => ({
        p,
        all: kb.lessonsIn(p.id),
        lessons: filtered.filter((l) => l.period === p.id),
      }))
      .filter((g) => g.lessons.length > 0),
  );

  const isExpanded = (pid: string) => !!selectedPeriod || statusFilter !== 'all' || deepOnly || !!expanded[pid];
  const toggleGroup = (pid: string) => {
    expanded[pid] = !expanded[pid];
  };

  const doneIn = (ls: LessonItem[]) => ls.filter((l) => prog[l.id]?.done).length;
  const status = (l: LessonItem) => {
    const s = prog[l.id];
    if (!s?.done) return s?.at ? 'начат' : '';
    if (!s.due) return 'выучен';
    return s.due <= Date.now() ? 'пора повторить' : `повтор через ${pluralN(daysUntil(s.due), WORDS.day)}`;
  };
</script>

<div class="page">
  <PageHeader title="Курс" eyebrow="Уроки по эпохам" back="/explore" />

  {#if !kb.lessons.length}
    <EmptyState icon={BookOpen} title="Уроков пока нет" text="Они появятся с обновлением материалов." />
  {:else}
    <div class="summary-bar">
      <div class="row summary-row">
        <span class="muted small">Пройдено {stats.done} из {stats.total}</span>
        {#if stats.due > 0}<Badge tone="danger">К повторению: {stats.due}</Badge>{/if}
      </div>
      <ProgressBar value={stats.total ? stats.done / stats.total : 0} color="var(--accent)" height={6} label="Общий прогресс курса" />
    </div>

    {#if due.length}
      <Card href="/lesson/{due[0]!.id}" padding="md" class="banner">
        <div class="row head"><RotateCcw size={20} class="acc" /><span class="grow"><strong>Повторить: {due[0]!.title}</strong><small class="muted">{due.length > 1 ? `и ещё ${pluralN(due.length - 1, WORDS.lesson)}` : 'вспомнить по памяти, потом проверка'}</small></span><Badge tone="danger">{due.length}</Badge></div>
      </Card>
    {/if}
    {#if activeNext}
      <Card tone="gold" padding="lg" href="/lesson/{activeNext.id}" class="banner">
        <div class="row head"><Play size={22} class="play-ico" /><span class="grow"><span class="eyebrow">{prog[activeNext.id]?.at ? 'Продолжить' : 'Следующий урок'}</span><strong class="display big">{activeNext.title}</strong><small class="muted">{kb.periodById.get(activeNext.period)?.short} · урок {activeNext.order}{activeNext.minutes ? ` · ${activeNext.minutes} мин` : ''}</small></span></div>
      </Card>
    {/if}

    <div class="controls">
      <div class="hscroll period-chips" bind:this={chipsEl}>
        <Chip selected={selectedPeriod === null} onclick={() => (selectedPeriod = null)}>Все эпохи</Chip>
        {#each periodsWithLessons as p (p.id)}
          <Chip
            selected={selectedPeriod === p.id}
            color={p.color}
            onclick={() => {
              selectedPeriod = selectedPeriod === p.id ? null : p.id;
              expanded[p.id] = true;
            }}
          >
            {p.short}
          </Chip>
        {/each}
      </div>

      <div class="quick-row hscroll">
        <Chip selected={deepOnly} onclick={() => (deepOnly = !deepOnly)}>
          <Sparkles size={13} /> Глубокие ({deepInScope})
        </Chip>
        <a class="debates-link surface" href="#/course/themes">
          <Route size={14} class="gold-ico" />
          <span>Линии</span>
          <small class="muted num">{CROSS_THEMES.length}</small>
          <ArrowRight size={13} />
        </a>
        {#if projectsCount > 0}
          <a class="debates-link surface" href="#/course/projects{selectedPeriod ? `?period=${selectedPeriod}` : ''}">
            <ScrollText size={14} class="gold-ico" />
            <span>Проекты</span>
            <small class="muted num">{projectsCount}</small>
            <ArrowRight size={13} />
          </a>
        {/if}
        <a class="debates-link surface" href="#/maps">
          <Compass size={14} class="gold-ico" />
          <span>Карты</span>
          <ArrowRight size={13} />
        </a>
        {#if debatesCount > 0}
          <a class="debates-link surface" href="#/course/debates{selectedPeriod ? `?period=${selectedPeriod}` : ''}">
            <Scale size={14} class="gold-ico" />
            <span>Споры</span>
            <small class="muted num">{debatesCount}</small>
            <ArrowRight size={13} />
          </a>
        {/if}
      </div>

      <Segmented
        bind:value={statusFilter}
        options={[
          { value: 'all', label: 'Все', count: scopeLessons.length },
          { value: 'todo', label: 'Новые' },
          { value: 'due', label: 'Повтор', count: stats.due || undefined },
          { value: 'done', label: 'Пройдены', count: stats.done || undefined },
        ]}
      />
    </div>

    {#if !groups.length}
      <EmptyState
        icon={BookOpen}
        title="По фильтру уроков нет"
        text={deepOnly ? 'В этой эпохе глубоких уроков пока нет — снимите фильтр или выберите XIX–XX век.' : statusFilter === 'due' ? 'На сегодня повторений нет — можно перейти к новым урокам.' : 'Попробуйте выбрать другую эпоху или статус.'}
      />
    {:else}
      {#each groups as g (g.p.id)}
        {@const open = isExpanded(g.p.id)}
        {@const done = doneIn(g.all)}
        <section class="group" style:--c={g.p.color}>
          <button
            type="button"
            class="group-head"
            aria-expanded={open}
            onclick={() => toggleGroup(g.p.id)}
          >
            <span class="dot" aria-hidden="true"></span>
            <span class="grow g-title">
              <strong>{g.p.title}</strong>
              <small class="muted">{done} из {g.all.length} · {g.p.range}</small>
            </span>
            <ChevronDown size={18} class={open ? 'chev open' : 'chev'} />
          </button>
          <ProgressBar value={g.all.length ? done / g.all.length : 0} color={g.p.color} height={4} />
          {#if open}
            <div class="stack list">
              {#each g.lessons as l (l.id)}
                {@const s = status(l)}
                {@const deep = isDeepLesson(l)}
                <a class="item surface" href="#/lesson/{l.id}">
                  <span class="ico">{#if prog[l.id]?.done}<CircleCheck size={20} />{:else}<Circle size={20} />{/if}</span>
                  <span class="grow">
                    <strong>{l.order}. {l.title}</strong>
                    {#if s || deep}
                      <span class="meta-line">
                        {#if deep}<small class="deep-tag">глубокий</small>{/if}
                        {#if s}<small class:due={s === 'пора повторить'}>{s}</small>{/if}
                      </span>
                    {/if}
                  </span>
                  {#if l.minutes}<small class="muted num dur">{l.minutes} мин</small>{/if}
                </a>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    {/if}

    <p class="muted small note">Курс охватывает все эпохи — от Древней Руси до 2020-х годов. Глубокие уроки включают документы по схеме олимпиадного проекта, споры историков с работами и разбор задач эссе.</p>
  {/if}
</div>

<style>
  .summary-bar { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--sp-3); }
  .summary-row { justify-content: space-between; }
  :global(.banner) { margin-bottom: var(--sp-3); }
  .head { gap: var(--sp-3); align-items: center; }
  .head .grow { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .head :global(.play-ico) { flex: none; }
  .big { font-size: var(--text-xl); }
  .small { font-size: var(--text-sm); }
  .controls { display: flex; flex-direction: column; gap: var(--sp-3); margin: var(--sp-2) 0 var(--sp-4); }
  .quick-row { display: flex; align-items: center; gap: var(--sp-2); }
  .debates-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 7px 11px;
    border-radius: var(--r-full);
    color: var(--ink);
    font-size: var(--text-xs);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
    flex: none;
  }
  .debates-link :global(.gold-ico) { color: var(--gold); flex: none; }
  .debates-link :global(.acc-ico) { color: var(--accent); flex: none; }
  .debates-link :global(.map-ico) { color: var(--info, #2b4c7e); flex: none; }
  .group { margin-top: var(--sp-4); }
  .group-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    padding: 6px 2px var(--sp-2);
    border: 0;
    background: none;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }
  .dot { width: 10px; height: 10px; flex: none; border-radius: 50%; background: var(--c); }
  .g-title { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .g-title strong { font-family: var(--font-display); font-size: var(--text-xl); line-height: 1.15; }
  .g-title small { font-size: var(--text-xs); }
  .group-head :global(.chev) { flex: none; color: var(--ink-3); transition: transform var(--dur-2) var(--ease-out); }
  .group-head :global(.chev.open) { transform: rotate(180deg); }
  .list { --gap: var(--sp-2); margin-top: var(--sp-3); }
  .item { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3); border-radius: var(--r-md); color: var(--ink); text-decoration: none; border-left: 3px solid var(--c); }
  .item .grow { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: var(--text-sm); }
  .item strong { line-height: 1.3; }
  .meta-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .item small { font-size: var(--text-xs); color: var(--ink-3); }
  .item small.deep-tag { color: var(--gold); font-weight: 650; }
  .item small.due { color: var(--danger); font-weight: 650; }
  .dur { white-space: nowrap; flex: none; }
  .ico { color: var(--c); display: flex; flex: none; }
  .note { margin-top: var(--sp-5); line-height: 1.5; }
  :global(.acc) { color: var(--accent); flex: none; }
</style>
