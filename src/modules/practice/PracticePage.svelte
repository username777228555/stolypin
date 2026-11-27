<script lang="ts">
  import { onMount } from 'svelte';
  import { Play, Layers, ChevronRight, ChevronDown } from '@lucide/svelte';
  import PageHeader from '$lib/design/components/PageHeader.svelte';
  import Card from '$lib/design/components/Card.svelte';
  import Button from '$lib/design/components/Button.svelte';
  import Segmented from '$lib/design/components/Segmented.svelte';
  import ProgressRing from '$lib/design/components/ProgressRing.svelte';
  import { entriesFor, type ModuleEntry } from '$lib/core/modules';
  import { buildQueue, forecast } from '$lib/core/srs';
  import { settings } from '$lib/core/settings.svelte';
  import { progress } from '$lib/core/progress.svelte';
  import { QUESTION_TYPES } from '$lib/core/content/schema';
  import { QUESTION_TYPE_INFO } from '$lib/components/questions/registry';
  import { navigate } from '$lib/core/router.svelte';

  type PracticeTab = 'drills' | 'games' | 'formats';

  const OLYMPIAD_HREFS = ['/course/projects', '/essay', '/maps?mode=blind', '/quiz/probes'];

  const allPractice = entriesFor('practice');
  const olympiadTools: ModuleEntry[] = OLYMPIAD_HREFS
    .map((h) => allPractice.find((e) => e.href === h))
    .filter((e): e is ModuleEntry => Boolean(e));
  const coreTools: ModuleEntry[] = allPractice.filter((e) => !OLYMPIAD_HREFS.includes(e.href));
  const games = entriesFor('games');

  let activeTab = $state<PracticeTab>('drills');
  let showForecast = $state(false);
  let due = $state(0);
  let fc = $state<number[]>([]);

  onMount(async () => {
    const q = await buildQueue({ newLimit: settings.newPerDay });
    due = q.due.length + q.fresh.length;
    fc = await forecast(7);
  });

  const maxFc = $derived(Math.max(1, ...fc));
  const days = [
    'Сег',
    'Зав',
    ...Array.from({ length: 5 }, (_, i) =>
      new Date(Date.now() + (i + 2) * 86400000).toLocaleDateString('ru', { weekday: 'short' }),
    ),
  ];
</script>

<div class="page">
  <PageHeader title="Практика" eyebrow="Учить и проверять себя" large />

  <Card padding="md" class="today-card">
    <div class="today-row">
      <ProgressRing value={progress.today.xp / Math.max(1, settings.dailyGoal)} size={54} stroke={6}>
        <span class="num xp">{progress.today.xp}</span>
      </ProgressRing>
      <div class="grow today-info">
        <strong>Цель дня: {settings.dailyGoal} опыта</strong>
        <p class="muted">{due ? `К повторению: ${due}` : 'Повторений на сегодня нет'}</p>
      </div>
      <div class="today-acts">
        <Button size="sm" icon={due ? Play : Layers} href={due ? '/cards/session' : '/cards'}>
          {due ? 'Повторить' : 'Колоды'}
        </Button>
      </div>
    </div>

    {#if fc.length}
      <div class="fc-foot">
        <button
          type="button"
          class="fc-toggle"
          aria-expanded={showForecast}
          onclick={() => (showForecast = !showForecast)}
        >
          <span>Прогноз повторений на 7 дней</span>
          <ChevronDown size={14} class={showForecast ? 'rot' : ''} />
        </button>
      </div>
      {#if showForecast}
        <div class="fc" aria-label="Прогноз повторений на неделю">
          {#each fc as n, i (i)}
            <div class="col">
              <span class="bar" style:height="{(n / maxFc) * 100}%"></span>
              <b class="num">{n}</b>
              <small>{days[i]}</small>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </Card>

  <div class="hub-tabs">
    <Segmented
      bind:value={activeTab}
      options={[
        { value: 'drills', label: 'Тренажёры', count: allPractice.length },
        { value: 'games', label: 'Игры', count: games.length },
        { value: 'formats', label: 'По форматам', count: QUESTION_TYPES.length },
      ]}
    />
  </div>

  {#if activeTab === 'drills'}
    {#if olympiadTools.length}
      <section class="group">
        <h2 class="group-title">Олимпиада и разбор</h2>
        <div class="hub-grid">
          {#each olympiadTools as e (e.href)}
            {@const Icon = e.icon}
            <a class="hub-row" href="#{e.href}" style:--t={e.tint ?? 'var(--accent)'}>
              <span class="hr-ico" aria-hidden="true"><Icon size={18} /></span>
              <span class="hr-body">
                <strong>{e.title}</strong>
                {#if e.description}<small>{e.description}</small>{/if}
              </span>
              <ChevronRight size={16} class="hr-arr" aria-hidden="true" />
            </a>
          {/each}
        </div>
      </section>
    {/if}

    {#if coreTools.length}
      <section class="group">
        <h2 class="group-title">Закрепление и диагностика</h2>
        <div class="hub-grid">
          {#each coreTools as e (e.href)}
            {@const Icon = e.icon}
            <a class="hub-row" href="#{e.href}" style:--t={e.tint ?? 'var(--accent)'}>
              <span class="hr-ico" aria-hidden="true"><Icon size={18} /></span>
              <span class="hr-body">
                <strong>{e.title}</strong>
                {#if e.description}<small>{e.description}</small>{/if}
              </span>
              <ChevronRight size={16} class="hr-arr" aria-hidden="true" />
            </a>
          {/each}
        </div>
      </section>
    {/if}
  {:else if activeTab === 'games'}
    <section class="group">
      <div class="hub-grid">
        {#each games as e (e.href)}
          {@const Icon = e.icon}
          <a class="hub-row" href="#{e.href}" style:--t={e.tint ?? 'var(--accent)'}>
            <span class="hr-ico" aria-hidden="true"><Icon size={18} /></span>
            <span class="hr-body">
              <strong>{e.title}</strong>
              {#if e.description}<small>{e.description}</small>{/if}
            </span>
            <ChevronRight size={16} class="hr-arr" aria-hidden="true" />
          </a>
        {/each}
      </div>
    </section>
  {:else}
    <section class="group">
      <p class="muted fmt-note">Короткая тренировка из 10 вопросов одного олимпиадного формата.</p>
      <div class="fmt-grid">
        {#each QUESTION_TYPES as t (t)}
          <button type="button" class="fmt-btn" onclick={() => navigate(`/quiz/run?src=type&t=${t}`)}>
            <span class="fmt-title">{QUESTION_TYPE_INFO[t].title}</span>
            <ChevronRight size={15} class="hr-arr" aria-hidden="true" />
          </button>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  :global(.today-card) { display: flex; flex-direction: column; gap: var(--sp-2); }
  .today-row { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
  .today-info { min-width: 140px; }
  .today-info strong { display: block; font-size: var(--text-md); line-height: 1.2; }
  .today-info p { margin: 2px 0 0; font-size: var(--text-xs); }
  .today-acts { flex: none; }
  .xp { font-family: var(--font-display); font-weight: 700; font-size: var(--text-md); }

  .fc-foot {
    padding-top: 6px;
    border-top: 1px solid var(--line);
    display: flex;
    justify-content: flex-start;
  }
  .fc-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
  }
  .fc-toggle:hover { color: var(--ink); }
  .fc-toggle :global(.rot) { transform: rotate(180deg); }

  .fc {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;
    height: 86px;
    padding-top: 4px;
  }
  .col { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 2px; }
  .bar {
    width: 68%;
    min-height: 3px;
    border-radius: 5px 5px 2px 2px;
    background: linear-gradient(var(--accent), color-mix(in srgb, var(--accent) 48%, transparent));
    transition: height var(--dur-4) var(--ease-out);
  }
  .col b { font-size: var(--text-xs); }
  .col small { font-size: 10px; color: var(--ink-3); }

  .hub-tabs { margin-top: var(--sp-4); }

  .group { margin-top: var(--sp-4); }
  .group-title {
    margin: 0 0 var(--sp-2);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .hub-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
  @media (min-width: 640px) {
    .hub-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  .hub-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    text-decoration: none;
    box-shadow: var(--shadow-1);
    transition: border-color var(--dur-2), transform var(--dur-2), background var(--dur-2);
    min-width: 0;
  }
  .hub-row:hover {
    border-color: color-mix(in srgb, var(--t) 45%, var(--line));
    background: color-mix(in srgb, var(--t) 4%, var(--surface));
  }
  .hub-row:active { transform: scale(0.985); }

  .hr-ico {
    width: 38px;
    height: 38px;
    flex: none;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--t) 13%, transparent);
    color: var(--t);
  }
  .hr-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hr-body strong {
    font-size: var(--text-md);
    font-weight: 680;
    line-height: 1.2;
  }
  .hr-body small {
    font-size: var(--text-xs);
    color: var(--ink-2);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .hub-row :global(.hr-arr),
  .fmt-btn :global(.hr-arr) {
    flex: none;
    color: var(--ink-3);
    opacity: 0.7;
  }

  .fmt-note {
    margin: 0 0 var(--sp-3);
    font-size: var(--text-sm);
  }
  .fmt-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  @media (max-width: 440px) {
    .fmt-grid { grid-template-columns: minmax(0, 1fr); }
  }
  .fmt-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 11px 13px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    box-shadow: var(--shadow-1);
    transition: border-color var(--dur-2), transform var(--dur-2);
  }
  .fmt-btn:hover { border-color: var(--line-strong); }
  .fmt-btn:active { transform: scale(0.985); }
  .fmt-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
</style>
