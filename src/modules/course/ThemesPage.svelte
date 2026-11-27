<script lang="ts">
  /**
   * «Сквозные линии истории» — hub of 11 olympiad cross-century trajectories (IX–XX centuries),
   * showing live progress across each theme's lessons, chronological span, central essay problem,
   * and aggregated counts of milestones, documents, and historian debates.
   */
  import { onMount } from 'svelte';
  import { Search, X, ArrowRight, Route, BookOpen, ScrollText, Scale } from '@lucide/svelte';
  import PageHeader from '$lib/design/components/PageHeader.svelte';
  import Chip from '$lib/design/components/Chip.svelte';
  import ProgressBar from '$lib/design/components/ProgressBar.svelte';
  import EmptyState from '$lib/design/components/EmptyState.svelte';
  import { kb } from '$lib/core/content/kb.svelte';
  import { pluralN, WORDS } from '$lib/core/utils/format';
  import { duePlan, type LessonState } from './progress';
  import {
    buildThemeBundle,
    CROSS_THEMES,
    filterThemes,
    THEME_CATEGORIES,
    type ThemeCategory,
  } from './themes';

  let prog = $state<Record<string, LessonState>>({});
  let category = $state<ThemeCategory | 'all'>('all');
  let query = $state('');

  onMount(async () => {
    ({ state: prog } = await duePlan());
  });

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

  const visible = $derived(filterThemes(CROSS_THEMES, { category, query }));
  const cards = $derived(visible.map((t) => buildThemeBundle(t, kbData, prog)));
</script>

<div class="page">
  <PageHeader title="Сквозные линии" eyebrow="Маршруты через все века для эссе" back="/course" />

  <p class="muted small intro">
    {pluralN(CROSS_THEMES.length, WORDS.theme)} от Древней Руси до XX века: этапы эволюции, таблицы сравнения эпох, документы, споры историков и хронологический тренажёр.
  </p>

  <div class="controls">
    <div class="search-box surface">
      <Search size={16} class="s-ico" />
      <input
        type="search"
        bind:value={query}
        placeholder="Тема, реформа, Витте, земство, Пугачёв…"
        aria-label="Поиск по сквозным линиям"
      />
      {#if query}
        <button type="button" class="clear-btn" aria-label="Очистить" onclick={() => (query = '')}>
          <X size={15} />
        </button>
      {/if}
    </div>

    <div class="hscroll cat-chips">
      {#each THEME_CATEGORIES as cat (cat.id)}
        <Chip selected={category === cat.id} onclick={() => (category = cat.id)}>{cat.label}</Chip>
      {/each}
    </div>
  </div>

  {#if !cards.length}
    <EmptyState icon={Route} title="Линий не найдено" text="Попробуйте изменить поисковый запрос или выбрать другую сферу." />
  {:else}
    <div class="theme-grid">
      {#each cards as b (b.theme.id)}
        <a class="theme-card surface" href="#/course/themes/{b.theme.id}" style:--c={b.theme.color}>
          <div class="tc-top">
            <span class="tc-span">{b.theme.span}</span>
            <span class="tc-arrow" aria-hidden="true"><ArrowRight size={15} /></span>
          </div>
          <h2 class="tc-title">{b.theme.title}</h2>
          <p class="tc-sub">{b.theme.subtitle}</p>
          <p class="tc-q">«{b.theme.essayQuestion}»</p>

          <div class="tc-meta">
            <span><BookOpen size={12} /> {pluralN(b.stats.totalLessons, WORDS.lesson)}</span>
            <span><ScrollText size={12} /> {pluralN(b.stats.documents, WORDS.document)}</span>
            <span><Scale size={12} /> {pluralN(b.stats.debates, WORDS.debate)}</span>
          </div>

          <div class="tc-prog">
            <div class="row prog-lbl">
              <small class="muted">Пройдено {b.stats.doneLessons} из {b.stats.totalLessons}</small>
              <small class="muted num">{Math.round(b.stats.ratio * 100)}%</small>
            </div>
            <ProgressBar value={b.stats.ratio} color={b.theme.color} height={4} />
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .intro { margin: 0 0 var(--sp-3); font-size: var(--text-sm); line-height: 1.5; }
  .controls { display: flex; flex-direction: column; gap: var(--sp-2); margin-bottom: var(--sp-4); }
  .search-box {
    display: flex; align-items: center; gap: var(--sp-2); padding: 0 var(--sp-3); height: 44px; border-radius: var(--r-md);
  }
  .search-box :global(.s-ico) { color: var(--ink-3); flex: none; }
  .search-box input { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: var(--text-sm); outline: none; }
  .clear-btn { border: 0; background: none; color: var(--ink-3); padding: 4px; display: grid; place-items: center; cursor: pointer; }

  .theme-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: var(--sp-3);
    padding-bottom: var(--sp-6);
  }
  .theme-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: var(--sp-4);
    border-radius: var(--r-lg);
    border-left: 4px solid var(--c);
    color: var(--ink);
    text-decoration: none;
    transition: transform 0.14s ease, box-shadow 0.14s ease;
  }
  .theme-card:hover { transform: translateY(-1px); }
  .tc-top { display: flex; align-items: center; justify-content: space-between; }
  .tc-span { font-size: var(--text-xs); font-weight: 750; color: var(--c); letter-spacing: 0.03em; }
  .tc-arrow { color: var(--ink-3); }
  .tc-title { margin: 0; font-family: var(--font-display); font-size: var(--text-xl); line-height: 1.2; }
  .tc-sub { margin: 0; font-size: var(--text-xs); color: var(--ink-2); }
  .tc-q {
    margin: 2px 0;
    font-family: var(--font-read);
    font-size: var(--text-xs);
    color: var(--ink-2);
    line-height: 1.45;
    padding-left: 10px;
    border-left: 2px solid color-mix(in srgb, var(--c) 45%, transparent);
  }
  .tc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    font-size: 11px;
    color: var(--ink-3);
    margin-top: auto;
    padding-top: 4px;
  }
  .tc-meta span { display: inline-flex; align-items: center; gap: 4px; }
  .tc-prog { display: flex; flex-direction: column; gap: 4px; }
  .prog-lbl { justify-content: space-between; font-size: 11px; }
</style>
