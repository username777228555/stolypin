<script lang="ts">
  /**
   * «Споры историков» — dedicated revision and active-recall deck built from every `debate` block across
   * deep course lessons. Two modes: «Конспект» (browse & search by epoch, historian or work) and
   * «Тренировка» (flashcards: given the debate question + historian & work, recall the thesis and proof).
   */
  import { Scale, Search, X, Eye, RotateCcw, Shuffle, Check, ArrowRight, CircleCheck } from '@lucide/svelte';
  import PageHeader from '$lib/design/components/PageHeader.svelte';
  import Card from '$lib/design/components/Card.svelte';
  import Button from '$lib/design/components/Button.svelte';
  import Chip from '$lib/design/components/Chip.svelte';
  import Segmented from '$lib/design/components/Segmented.svelte';
  import ProgressBar from '$lib/design/components/ProgressBar.svelte';
  import EmptyState from '$lib/design/components/EmptyState.svelte';
  import EntityPreview from '$lib/components/EntityPreview.svelte';
  import { kb } from '$lib/core/content/kb.svelte';
  import { router } from '$lib/core/router.svelte';
  import { openSheet } from '$lib/core/ui.svelte';
  import { pluralN, WORDS } from '$lib/core/utils/format';
  import { extractLessonDebates, filterDebates, flattenDebateCards, type DebateFlashcard } from './filter';
  import { lessonInline } from './text';

  type Mode = 'list' | 'train';

  const allDebates = $derived(extractLessonDebates(kb.lessons));
  const periodsWithDebates = $derived(
    kb.periods.filter((p) => allDebates.some((d) => d.period === p.id)),
  );

  let mode = $state<Mode>('list');
  let selectedPeriod = $state<string | null>(router.query.get('period') || null);
  let query = $state('');

  const filtered = $derived(filterDebates(allDebates, { period: selectedPeriod, query }));
  const cards = $derived(flattenDebateCards(filtered));

  // Training session queue: card IDs remaining to recall.
  let queue = $state<DebateFlashcard[]>([]);
  let sessionTotal = $state(0);
  let known = $state(0);
  let revealed = $state(false);
  let shuffled = $state(false);

  function startSession(shuffle = false) {
    const list = [...cards];
    if (shuffle) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j]!, list[i]!];
      }
    }
    shuffled = shuffle;
    queue = list;
    sessionTotal = list.length;
    known = 0;
    revealed = false;
  }

  $effect(() => {
    // Reset training queue whenever filter or mode changes into 'train'.
    void selectedPeriod;
    void query;
    void cards;
    if (mode === 'train') startSession(shuffled);
  });

  const current = $derived(queue[0]);

  function markKnown() {
    if (!current) return;
    known++;
    queue = queue.slice(1);
    revealed = false;
  }

  function markAgain() {
    if (!current) return;
    const [head, ...rest] = queue;
    // Re-insert a few cards ahead (or at end) so the student retries it soon.
    const pos = Math.min(rest.length, 3);
    queue = [...rest.slice(0, pos), head!, ...rest.slice(pos)];
    revealed = false;
  }

  function openRef(ev: MouseEvent) {
    const id = (ev.target as HTMLElement).closest<HTMLElement>('[data-ref]')?.dataset.ref;
    if (!id) return;
    ev.preventDefault();
    openSheet({ component: EntityPreview, props: { id, from: 'Споры историков' } });
  }
</script>

<div class="page">
  <PageHeader title="Споры историков" eyebrow="Историография для эссе" back="/course" />

  <p class="muted small intro">
    {pluralN(filtered.length, WORDS.debate)} · {pluralN(cards.length, WORDS.position)} с работами из глубоких уроков курса.
  </p>

  <div class="controls">
    <Segmented
      bind:value={mode}
      options={[
        { value: 'list', label: 'Конспект', count: filtered.length },
        { value: 'train', label: 'Тренировка', count: cards.length },
      ]}
    />

    <div class="search-box surface">
      <Search size={16} class="s-ico" />
      <input
        type="search"
        bind:value={query}
        placeholder="Историк, работа или тема…"
        aria-label="Поиск по спорам историков"
      />
      {#if query}
        <button type="button" class="clear-btn" aria-label="Очистить" onclick={() => (query = '')}>
          <X size={15} />
        </button>
      {/if}
    </div>

    <div class="hscroll period-chips">
      <Chip selected={selectedPeriod === null} onclick={() => (selectedPeriod = null)}>Все эпохи</Chip>
      {#each periodsWithDebates as p (p.id)}
        <Chip
          selected={selectedPeriod === p.id}
          color={p.color}
          onclick={() => (selectedPeriod = selectedPeriod === p.id ? null : p.id)}
        >
          {p.short}
        </Chip>
      {/each}
    </div>
  </div>

  {#if !filtered.length}
    <EmptyState
      icon={Scale}
      title="Споров не найдено"
      text="Попробуйте изменить запрос или выбрать другую эпоху."
    />
  {:else if mode === 'list'}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="stack debate-list" onclick={openRef}>
      {#each filtered as d (d.id)}
        {@const p = kb.periodById.get(d.period)}
        <article class="debate-card surface" style:--c={p?.color ?? 'var(--accent)'}>
          <header class="d-head">
            <div class="grow">
              <span class="eyebrow" style:color={p?.color ?? 'var(--accent)'}>{p?.short ?? ''} · урок {d.lessonOrder}</span>
              <h2 class="d-q">{@html lessonInline(d.question)}</h2>
              <small class="muted">{d.lessonTitle}</small>
            </div>
            <a class="lesson-link" href="#/lesson/{d.lessonId}?sec={d.sectionIndex}">
              К уроку <ArrowRight size={13} />
            </a>
          </header>

          <div class="positions">
            {#each d.positions as pos, i (pos.who + pos.work + i)}
              <div class="pos" style:--k={i}>
                <p class="who">
                  {#if pos.person && kb.get(pos.person)}
                    <a class="ref" href="#/entity/{pos.person}" data-ref={pos.person}>{pos.who}</a>
                  {:else}
                    {pos.who}
                  {/if}
                  <span class="work">«{pos.work}»{#if pos.year}, {pos.year}{/if}</span>
                </p>
                <p class="thesis">{@html lessonInline(pos.thesis)}</p>
                <p class="proof"><span class="lbl">Довод</span> {@html lessonInline(pos.argument)}</p>
              </div>
            {/each}
          </div>

          {#if d.note}
            <p class="note muted">{@html lessonInline(d.note)}</p>
          {/if}
        </article>
      {/each}
    </div>
  {:else}
    <!-- Active recall training mode -->
    <div class="train">
      <div class="row train-bar">
        <span class="muted small">Вспомнили {known} из {sessionTotal}</span>
        <button type="button" class="shuffle-btn" onclick={() => startSession(true)}>
          <Shuffle size={14} /> Перемешать
        </button>
      </div>
      <ProgressBar value={sessionTotal ? known / sessionTotal : 0} color="var(--accent)" height={6} label="Прогресс тренировки" />

      {#if !current}
        <Card tone="gold" padding="lg" class="done-card">
          <div class="stack done-inner">
            <CircleCheck size={34} class="done-ico" />
            <h2 class="display">Сессия завершена</h2>
            <p class="muted small">Вы повторили {pluralN(sessionTotal, WORDS.position)} историков. Можно перемешать колоду или переключиться на другую эпоху.</p>
            <Button icon={RotateCcw} onclick={() => startSession(true)}>Повторить в новом порядке</Button>
          </div>
        </Card>
      {:else}
        {@const cp = kb.periodById.get(current.period)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <Card padding="lg" class="flash" style="--c: {cp?.color ?? 'var(--accent)'}">
          <div class="stack flash-body" onclick={openRef}>
            <div class="row f-top">
              <span class="eyebrow" style:color={cp?.color ?? 'var(--accent)'}>{cp?.short ?? ''}</span>
              <a class="lesson-link" href="#/lesson/{current.lessonId}">Урок <ArrowRight size={13} /></a>
            </div>
            <p class="f-q">{@html lessonInline(current.question)}</p>

            <div class="historian-box">
              <span class="lbl">Историк и работа</span>
              <strong class="h-name">{current.position.who}</strong>
              <span class="h-work">«{current.position.work}»{#if current.position.year}, {current.position.year}{/if}</span>
            </div>

            {#if !revealed}
              <p class="muted small hint">Вспомните тезис автора и чем он его доказывает, затем откройте ответ.</p>
              <Button full icon={Eye} onclick={() => (revealed = true)}>Показать тезис и довод</Button>
            {:else}
              <div class="answer-box">
                <p class="thesis"><span class="lbl">Тезис</span> {@html lessonInline(current.position.thesis)}</p>
                <p class="proof"><span class="lbl">Чем доказывает</span> {@html lessonInline(current.position.argument)}</p>
              </div>
              <div class="rate-row">
                <Button full variant="secondary" icon={RotateCcw} onclick={markAgain}>Повторить ещё</Button>
                <Button full icon={Check} onclick={markKnown}>Вспомнил</Button>
              </div>
            {/if}
          </div>
        </Card>
      {/if}
    </div>
  {/if}
</div>

<style>
  .intro { margin: 0 0 var(--sp-3); font-size: var(--text-sm); }
  .small { font-size: var(--text-sm); line-height: 1.45; }
  .controls { display: flex; flex-direction: column; gap: var(--sp-3); margin-bottom: var(--sp-4); }
  .search-box {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-3);
    height: 44px;
    border-radius: var(--r-md);
  }
  .search-box :global(.s-ico) { color: var(--ink-3); flex: none; }
  .search-box input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--text-sm);
    outline: none;
  }
  .clear-btn {
    border: 0;
    background: none;
    color: var(--ink-3);
    padding: 4px;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .debate-list { --gap: var(--sp-3); padding-bottom: var(--sp-6); }
  .debate-card {
    padding: var(--sp-4);
    border-radius: var(--r-lg);
    border-left: 3px solid var(--c);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .d-head { display: flex; align-items: flex-start; gap: var(--sp-2); }
  .d-head .grow { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .d-q { font-family: var(--font-display); font-size: var(--text-lg); line-height: 1.25; margin: 0; }
  .lesson-link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex: none;
    font-size: var(--text-xs);
    font-weight: 650;
    color: var(--accent);
    white-space: nowrap;
    padding: 4px 0;
  }
  .positions { display: flex; flex-direction: column; gap: var(--sp-2); }
  .pos {
    --tone: color-mix(in srgb, var(--c) calc(100% - var(--k) * 28%), var(--gold));
    padding: var(--sp-3);
    border-radius: var(--r-md);
    border-left: 3px solid var(--tone);
    background: color-mix(in srgb, var(--surface-2) 65%, var(--surface));
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--text-sm);
    line-height: 1.48;
  }
  .pos p { margin: 0; }
  .who { font-weight: 700; }
  .work { font-weight: 400; color: var(--ink-2); }
  .thesis { font-family: var(--font-read); }
  .proof { color: var(--ink-2); font-size: var(--text-xs); line-height: 1.45; }
  .lbl {
    display: inline-block;
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-right: 4px;
  }
  .note { margin: 0; font-size: var(--text-xs); line-height: 1.45; }
  .page :global(.ref) {
    color: var(--c);
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 3px;
  }

  .train { display: flex; flex-direction: column; gap: var(--sp-3); padding-bottom: var(--sp-6); }
  .train-bar { justify-content: space-between; align-items: center; }
  .shuffle-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-2);
    border-radius: var(--r-full);
    padding: 5px 11px;
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
  }
  .flash-body { --gap: var(--sp-3); }
  .f-top { justify-content: space-between; align-items: center; }
  .f-q { margin: 0; font-family: var(--font-display); font-size: var(--text-xl); line-height: 1.28; }
  .historian-box {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: var(--sp-3);
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--c) 8%, var(--surface-2));
    border-left: 4px solid var(--c);
  }
  .h-name { font-size: var(--text-md, 1.05rem); }
  .h-work { font-size: var(--text-sm); color: var(--ink-2); }
  .hint { margin: 0; }
  .answer-box {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--success) 7%, var(--surface-2));
    border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  .answer-box p { margin: 0; }
  .rate-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2); }
  .done-inner { align-items: center; text-align: center; --gap: var(--sp-2); }
  .done-inner :global(.done-ico) { color: var(--success); }
</style>
