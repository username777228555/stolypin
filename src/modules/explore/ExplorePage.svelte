<script lang="ts">
  import { onMount } from 'svelte';
  import { Search, BookOpen, Play, RotateCcw, ArrowRight, ChevronRight, ChevronDown } from '@lucide/svelte';
  import PageHeader from '$lib/design/components/PageHeader.svelte';
  import IconButton from '$lib/design/components/IconButton.svelte';
  import Card from '$lib/design/components/Card.svelte';
  import Badge from '$lib/design/components/Badge.svelte';
  import Button from '$lib/design/components/Button.svelte';
  import ProgressBar from '$lib/design/components/ProgressBar.svelte';
  import PeriodCard from '$lib/components/PeriodCard.svelte';
  import { kb } from '$lib/core/content/kb.svelte';
  import type { LessonItem } from '$lib/core/content/schema';
  import { entriesFor, type ModuleEntry } from '$lib/core/modules';
  import { navigate } from '$lib/core/router.svelte';
  import { pluralN, WORDS } from '$lib/core/utils/format';
  import { duePlan, type LessonState } from '$lib/modules/course/progress';
  import { courseStats } from '$lib/modules/course/filter';

  const PRIMARY_HREFS = [
    '/maps?mode=atlas',
    '/timeline',
    '/rulers',
    '/course/themes',
    '/course/debates',
    '/dates',
  ];

  const allTools = entriesFor('explore').filter((t) => t.href !== '/course');
  const primaryTools: ModuleEntry[] = PRIMARY_HREFS
    .map((h) => allTools.find((t) => t.href === h))
    .filter((t): t is ModuleEntry => Boolean(t));
  const extraTools: ModuleEntry[] = allTools.filter((t) => !PRIMARY_HREFS.includes(t.href));

  let showAllTools = $state(false);
  let prog = $state<Record<string, LessonState>>({});
  let due = $state<LessonItem[]>([]);
  let next = $state<LessonItem | undefined>();

  onMount(async () => {
    ({ state: prog, due, next } = await duePlan());
  });

  const visibleTools = $derived(showAllTools ? [...primaryTools, ...extraTools] : primaryTools);
  const stats = $derived(courseStats(kb.lessons, prog));
  const target = $derived(due[0] ?? next);
  const targetIsDue = $derived(due.length > 0);
  const targetStarted = $derived(!targetIsDue && !!target && prog[target.id]?.at !== undefined);
</script>

<div class="page">
  <PageHeader title="Эпохи" eyebrow="История России" large>
    {#snippet actions()}
      <IconButton icon={Search} label="Поиск" variant="surface" onclick={() => navigate('/search')} />
    {/snippet}
  </PageHeader>

  {#if kb.lessons.length}
    <Card tone="gold" padding="md" class="course-card">
      <div class="course-top">
        <span class="course-ico"><BookOpen size={20} /></span>
        <div class="grow course-head">
          <span class="eyebrow">Учебный курс</span>
          <strong class="display">Курс истории России</strong>
        </div>
        {#if stats.due > 0}
          <Badge tone="danger">Повтор: {stats.due}</Badge>
        {:else}
          <span class="num course-cnt">{stats.done} / {stats.total}</span>
        {/if}
      </div>

      <ProgressBar value={stats.total ? stats.done / stats.total : 0} color="var(--accent)" height={6} label="Прогресс курса" />

      <p class="muted course-sub">
        {#if target}
          {targetIsDue ? 'Пора повторить' : targetStarted ? 'Продолжить урок' : 'Следующий урок'}:
          <strong>{target.title}</strong>
          {#if kb.periodById.get(target.period)}
            · {kb.periodById.get(target.period)!.short}
          {/if}
        {:else}
          Пройдены все {pluralN(stats.total, WORDS.lesson)} курса.
        {/if}
      </p>

      <div class="course-acts">
        {#if target}
          <Button
            size="sm"
            icon={targetIsDue ? RotateCcw : Play}
            href="/lesson/{target.id}"
          >
            {targetIsDue ? 'Повторить' : targetStarted ? 'Продолжить' : 'Начать урок'}
          </Button>
        {/if}
        <Button size="sm" variant="secondary" icon={ArrowRight} href="/course">
          Все {pluralN(stats.total, WORDS.lesson)}
        </Button>
      </div>
    </Card>
  {/if}

  <section class="tools-sec" aria-label="Справочники и инструменты">
    <div class="tools-head">
      <h2>Справочники</h2>
      {#if extraTools.length}
        <button
          type="button"
          class="tools-toggle"
          aria-expanded={showAllTools}
          onclick={() => (showAllTools = !showAllTools)}
        >
          <span>{showAllTools ? 'Свернуть' : `Все ${allTools.length}`}</span>
          <ChevronDown size={15} class={showAllTools ? 'rot' : ''} />
        </button>
      {/if}
    </div>

    <div class="tools-grid">
      {#each visibleTools as t (t.href)}
        {@const Icon = t.icon}
        <a class="tool-link" href="#{t.href}" style:--t={t.tint ?? 'var(--accent)'}>
          <span class="tl-ico" aria-hidden="true"><Icon size={16} /></span>
          <span class="tl-title">{t.title}</span>
          <ChevronRight size={14} class="tl-arr" aria-hidden="true" />
        </a>
      {/each}
    </div>
  </section>

  <section class="periods-sec">
    <div class="section-title"><h2>По эпохам</h2></div>
    <div class="stack periods">
      {#each kb.periods as p, i (p.id)}
        <PeriodCard period={p} variant="wide" index={i} />
      {/each}
    </div>
  </section>
</div>

<style>
  :global(.course-card) { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-2); }
  .course-top { display: flex; align-items: center; gap: var(--sp-3); }
  .course-ico { width: 42px; height: 42px; flex: none; border-radius: 12px; display: grid; place-items: center; background: var(--accent); color: var(--on-accent); box-shadow: var(--shadow-1); }
  .course-head { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .course-head strong { font-size: var(--text-xl); line-height: 1.15; }
  .course-cnt { flex: none; white-space: nowrap; font-size: var(--text-sm); font-weight: 700; color: var(--ink-2); }
  .course-sub { margin: 0; font-size: var(--text-sm); line-height: 1.4; }
  .course-sub strong { color: var(--ink); font-weight: 650; }
  .course-acts { display: flex; flex-wrap: wrap; gap: var(--sp-2); }

  .tools-sec { margin-top: var(--sp-5); }
  .tools-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    margin-bottom: var(--sp-2);
  }
  .tools-head h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 700;
    color: var(--ink);
  }
  .tools-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    background: var(--surface);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 650;
    cursor: pointer;
    transition: border-color var(--dur-2), color var(--dur-2);
  }
  .tools-toggle:hover { border-color: var(--line-strong); color: var(--ink); }
  .tools-toggle :global(.rot) { transform: rotate(180deg); }

  .tools-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  @media (min-width: 640px) {
    .tools-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  .tool-link {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 46px;
    padding: 8px 10px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    text-decoration: none;
    box-shadow: var(--shadow-1);
    transition: border-color var(--dur-2), transform var(--dur-2), background var(--dur-2);
    min-width: 0;
  }
  .tool-link:hover {
    border-color: color-mix(in srgb, var(--t) 45%, var(--line));
    background: color-mix(in srgb, var(--t) 4%, var(--surface));
  }
  .tool-link:active { transform: scale(0.98); }
  .tl-ico {
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 9px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--t) 13%, transparent);
    color: var(--t);
  }
  .tl-title {
    flex: 1;
    min-width: 0;
    font-size: var(--text-sm);
    font-weight: 640;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tool-link :global(.tl-arr) {
    flex: none;
    color: var(--ink-3);
    opacity: 0.7;
  }

  .periods-sec { margin-top: var(--sp-5); }
  .periods { --gap: var(--sp-4); }
</style>
