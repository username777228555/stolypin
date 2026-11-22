<script lang="ts">
  import { onMount } from 'svelte';
  import { Search, BookOpen, Play, RotateCcw, ArrowRight } from '@lucide/svelte';
  import PageHeader from '$lib/design/components/PageHeader.svelte';
  import IconButton from '$lib/design/components/IconButton.svelte';
  import Tile from '$lib/design/components/Tile.svelte';
  import Card from '$lib/design/components/Card.svelte';
  import Badge from '$lib/design/components/Badge.svelte';
  import Button from '$lib/design/components/Button.svelte';
  import ProgressBar from '$lib/design/components/ProgressBar.svelte';
  import PeriodCard from '$lib/components/PeriodCard.svelte';
  import { kb } from '$lib/core/content/kb.svelte';
  import type { LessonItem } from '$lib/core/content/schema';
  import { entriesFor } from '$lib/core/modules';
  import { navigate } from '$lib/core/router.svelte';
  import { pluralN, WORDS } from '$lib/core/utils/format';
  import { duePlan, type LessonState } from '$lib/modules/course/progress';
  import { courseStats } from '$lib/modules/course/filter';

  const tools = entriesFor('explore').filter((t) => t.href !== '/course');
  let prog = $state<Record<string, LessonState>>({});
  let due = $state<LessonItem[]>([]);
  let next = $state<LessonItem | undefined>();

  onMount(async () => {
    ({ state: prog, due, next } = await duePlan());
  });

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

  <div class="hscroll tools">
    {#each tools as t (t.href)}
      <div class="tool"><Tile title={t.title} description={t.description} icon={t.icon} href={t.href} tint={t.tint} /></div>
    {/each}
  </div>

  <div class="stack periods">
    {#each kb.periods as p, i (p.id)}
      <PeriodCard period={p} variant="wide" index={i} />
    {/each}
  </div>
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
  .tools { margin-top: var(--sp-4); }
  .tool { width: 172px; }
  .tool :global(.card) { height: 100%; }
  .periods { --gap: var(--sp-4); margin-top: var(--sp-4); }
</style>
