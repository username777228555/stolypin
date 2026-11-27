<script lang="ts">
  /**
   * «Визуальная атрибуция» — olympiad monument & artwork attribution trainer built directly
   * over real `kb.culture` items that carry both an image and explicit `features` («признаки»).
   * Teaches students to distinguish architectural styles, painters, sculptors, and epochs by detail.
   */
  import { Eye, ArrowRight, Sparkles, Check, X, ExternalLink, Landmark } from '@lucide/svelte';
  import Card from '$lib/design/components/Card.svelte';
  import Button from '$lib/design/components/Button.svelte';
  import Chip from '$lib/design/components/Chip.svelte';
  import Segmented from '$lib/design/components/Segmented.svelte';
  import EmptyState from '$lib/design/components/EmptyState.svelte';
  import EntityPreview from '$lib/components/EntityPreview.svelte';
  import { kb } from '$lib/core/content/kb.svelte';
  import { openSheet } from '$lib/core/ui.svelte';
  import { logAnswer } from '$lib/core/mastery';
  import { record } from '$lib/core/progress.svelte';
  import { haptic } from '$lib/core/platform';
  import { formatSpan } from '$lib/core/utils/format';
  import { buildAttributionRound, type AttributionItem, type AttributionRound } from './atlas';

  type KindFilter = 'all' | 'architecture' | 'painting' | 'sculpture_icon';
  type QuizAsk = 'title' | 'period';

  const ALLOWED_KINDS = new Set(['architecture', 'painting', 'sculpture', 'icon']);

  let kindFilter = $state<KindFilter>('architecture');
  let askMode = $state<QuizAsk>('title');
  let round = $state<AttributionRound | undefined>();
  let pickedId = $state<string | null>(null);
  let showHint = $state(false);
  let streak = $state(0);
  let answered = $state(0);
  let hits = $state(0);

  const allItems = $derived.by((): AttributionItem[] => {
    void kb.version;
    const out: AttributionItem[] = [];
    for (const c of kb.culture) {
      if (!ALLOWED_KINDS.has(c.kind) || c.imageQuiz === false) continue;
      if (!c.features?.length) continue;
      const ent = kb.get(c.id);
      const src = c.image && ent ? kb.imageOf(ent) : undefined;
      if (!src) continue;
      const author = c.authorName ?? (c.authors?.length ? c.authors.map((a) => kb.title(a)).join(', ') : undefined);
      out.push({
        id: c.id,
        title: c.title,
        kind: c.kind,
        period: c.period,
        year: c.year,
        author,
        place: c.place,
        summary: c.summary,
        features: c.features,
        src,
      });
    }
    return out;
  });

  const pool = $derived(
    allItems.filter((it) => {
      if (kindFilter === 'all') return true;
      if (kindFilter === 'sculpture_icon') return it.kind === 'sculpture' || it.kind === 'icon';
      return it.kind === kindFilter;
    }),
  );

  function nextRound(excludeId?: string) {
    pickedId = null;
    showHint = false;
    round = buildAttributionRound(pool, {
      mode: askMode,
      excludeId,
      periodLabel: (pid) => kb.periodById.get(pid)?.short ?? pid,
    });
  }

  $effect(() => {
    void pool;
    void askMode;
    nextRound();
  });

  function choose(optionId: string) {
    if (!round || pickedId) return;
    pickedId = optionId;
    const ok = optionId === round.correctOptionId;
    answered++;
    if (ok) {
      hits++;
      streak++;
      haptic('success');
    } else {
      streak = 0;
      haptic('error');
    }
    logAnswer({
      period: round.item.period,
      skill: 'culture',
      entity: round.item.id,
      type: 'single',
      score: ok ? 1 : 0,
      src: 'attribution',
    });
    void record({ xp: ok ? 14 : 4, questions: 1, correct: ok ? 1 : 0 });
  }

  function openEntity(id: string) {
    openSheet({ component: EntityPreview, props: { id, from: 'Визуальная атрибуция' } });
  }

  const kindLabel = (k: AttributionItem['kind']) =>
    k === 'architecture' ? 'Архитектура' : k === 'painting' ? 'Живопись' : k === 'icon' ? 'Иконопись' : 'Скульптура';
</script>

<div class="attr-wrap">
  <div class="attr-controls">
    <div class="hscroll kind-chips">
      <Chip selected={kindFilter === 'architecture'} onclick={() => (kindFilter = 'architecture')}>Архитектура</Chip>
      <Chip selected={kindFilter === 'painting'} onclick={() => (kindFilter = 'painting')}>Живопись</Chip>
      <Chip selected={kindFilter === 'sculpture_icon'} onclick={() => (kindFilter = 'sculpture_icon')}>Скульптура и иконы</Chip>
      <Chip selected={kindFilter === 'all'} onclick={() => (kindFilter = 'all')}>Всё ({allItems.length})</Chip>
    </div>

    <Segmented
      bind:value={askMode}
      options={[
        { value: 'title', label: 'Узнать памятник' },
        { value: 'period', label: 'Определить эпоху' },
      ]}
    />
  </div>

  {#if !round}
    <EmptyState icon={Landmark} title="Нет памятников с иллюстрациями" text="Попробуйте переключить фильтр категории." />
  {:else}
    {@const it = round.item}
    {@const p = kb.periodById.get(it.period)}
    {@const isAnswered = pickedId !== null}
    {@const isCorrect = pickedId === round.correctOptionId}

    <div class="row score-strip">
      <span class="muted small">{kindLabel(it.kind)} · в базе {pool.length}</span>
      {#if answered > 0}
        <span class="muted small num">Точность: {hits}/{answered}{#if streak >= 2} · серия {streak}{/if}</span>
      {/if}
    </div>

    <Card padding="md" class="attr-card">
      <div class="img-box">
        <img src={it.src} alt={isAnswered ? it.title : 'Памятник культуры для атрибуции'} loading="eager" />
        {#if !isAnswered}
          <span class="blind-badge">Слепая атрибуция</span>
        {:else}
          <span class="blind-badge revealed" style:background={p?.color ?? 'var(--accent)'}>{formatSpan(it.year)}</span>
        {/if}
      </div>

      {#if !isAnswered && it.features.length > 0}
        {#if showHint}
          <div class="hint-box">
            <span class="lbl"><Sparkles size={12} /> Признак для атрибуции</span>
            <p>{it.features[0]}</p>
          </div>
        {:else}
          <button type="button" class="hint-trigger" onclick={() => (showHint = true)}>
            <Eye size={14} /> Подсказка по деталям
          </button>
        {/if}
      {/if}

      <p class="ask-title">
        {askMode === 'title' ? 'Что за памятник изображён на иллюстрации?' : 'К какой эпохе относится этот памятник?'}
      </p>

      <div class="options">
        {#each round.options as opt (opt.id)}
          {@const chosen = pickedId === opt.id}
          {@const right = opt.id === round.correctOptionId}
          <button
            type="button"
            class="opt"
            class:ok={isAnswered && right}
            class:bad={isAnswered && chosen && !right}
            disabled={isAnswered}
            onclick={() => choose(opt.id)}
          >
            <span class="opt-txt">
              <strong>{opt.label}</strong>
              {#if opt.sub && askMode === 'title'}<small class="muted">{opt.sub}</small>{/if}
            </span>
            {#if isAnswered && right}
              <Check size={17} class="ico-ok" />
            {:else if isAnswered && chosen && !right}
              <X size={17} class="ico-bad" />
            {/if}
          </button>
        {/each}
      </div>

      {#if isAnswered}
        <div class="reveal-box" class:is-ok={isCorrect} class:is-bad={!isCorrect}>
          <div class="row rev-head">
            <div class="grow">
              <strong class="rev-title">{it.title}</strong>
              <small class="muted">
                {[p?.short, formatSpan(it.year), it.author, it.place].filter(Boolean).join(' · ')}
              </small>
            </div>
            <button type="button" class="open-card-btn" onclick={() => openEntity(it.id)}>
              Карточка <ExternalLink size={13} />
            </button>
          </div>
          <p class="rev-sum">{it.summary}</p>
          {#if it.features.length}
            <div class="feat-list">
              <span class="lbl">По каким деталям узнать на олимпиаде</span>
              <ul>
                {#each it.features as f, i (i)}
                  <li>{f}</li>
                {/each}
              </ul>
            </div>
          {/if}
          <Button full icon={ArrowRight} onclick={() => nextRound(it.id)}>Следующий памятник</Button>
        </div>
      {/if}
    </Card>
  {/if}
</div>

<style>
  .attr-wrap { display: flex; flex-direction: column; gap: var(--sp-3); padding-bottom: var(--sp-6); }
  .attr-controls { display: flex; flex-direction: column; gap: var(--sp-2); }
  .score-strip { justify-content: space-between; align-items: center; }
  .small { font-size: var(--text-xs); }
  .img-box {
    position: relative;
    border-radius: var(--r-md);
    overflow: hidden;
    background: var(--surface-2);
    aspect-ratio: 16 / 10;
    display: grid;
    place-items: center;
    margin-bottom: var(--sp-3);
  }
  .img-box img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .blind-badge {
    position: absolute;
    left: 10px;
    top: 10px;
    padding: 4px 10px;
    border-radius: var(--r-full);
    background: color-mix(in srgb, var(--ink) 78%, transparent);
    color: #fff;
    font-size: var(--text-xs);
    font-weight: 700;
  }
  .hint-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: var(--sp-2);
    padding: 5px 12px;
    border-radius: var(--r-full);
    border: 1px solid var(--line-strong);
    background: var(--surface-2);
    color: var(--accent);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 650;
    cursor: pointer;
  }
  .hint-box {
    padding: 8px 12px;
    margin-bottom: var(--sp-3);
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--gold) 12%, var(--surface-2));
    border-left: 3px solid var(--gold);
    font-size: var(--text-sm);
  }
  .hint-box p { margin: 2px 0 0; }
  .lbl {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .ask-title {
    margin: 0 0 var(--sp-2);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    line-height: 1.25;
  }
  .options { display: flex; flex-direction: column; gap: 8px; }
  .opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    width: 100%;
    text-align: left;
    padding: 11px 13px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
    transition: border-color 0.14s ease, background 0.14s ease;
  }
  .opt:not(:disabled):hover {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 5%, var(--surface));
  }
  .opt-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .opt-txt small { font-size: var(--text-xs); }
  .opt.ok {
    border-color: var(--success);
    background: color-mix(in srgb, var(--success) 12%, var(--surface));
  }
  .opt.bad {
    border-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 11%, var(--surface));
  }
  .opt :global(.ico-ok) { color: var(--success); flex: none; }
  .opt :global(.ico-bad) { color: var(--danger); flex: none; }

  .reveal-box {
    margin-top: var(--sp-3);
    padding: var(--sp-3);
    border-radius: var(--r-md);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    font-size: var(--text-sm);
    line-height: 1.48;
  }
  .reveal-box.is-ok {
    background: color-mix(in srgb, var(--success) 8%, var(--surface-2));
    border: 1px solid color-mix(in srgb, var(--success) 28%, transparent);
  }
  .reveal-box.is-bad {
    background: color-mix(in srgb, var(--warning) 9%, var(--surface-2));
    border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
  }
  .rev-head { align-items: flex-start; gap: var(--sp-2); }
  .rev-head .grow { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .rev-title { font-family: var(--font-display); font-size: var(--text-lg); line-height: 1.2; }
  .open-card-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--accent);
    border-radius: var(--r-full);
    padding: 5px 10px;
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 650;
    cursor: pointer;
  }
  .rev-sum { margin: 0; color: var(--ink-2); }
  .feat-list ul { margin: 4px 0 0; padding-left: 1.15em; display: flex; flex-direction: column; gap: 3px; }
</style>
