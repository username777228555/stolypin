<script lang="ts">
  /**
   * «Губернии 1856» — the card set of К. М. Грибанов (data.ts). Modes:
   *   · «Карточки» — search by name, town or people, filter by part of the empire, grid of cards → /gubernii/:id;
   *   · «Чей герб?» — the coat of arms cut out of the card, four governorates to choose from;
   *   · «Чья карта?» — the same with the map (outline, neighbours and the main town).
   * `?mode=arms` opens a quiz straight away (the tile in «Игры»).
   */
  import { fade, fly, scale } from 'svelte/transition';
  import { Search, ArrowRight, Trophy, Check, Map as MapIcon } from '@lucide/svelte';
  import PageHeader from '$lib/design/components/PageHeader.svelte';
  import Segmented from '$lib/design/components/Segmented.svelte';
  import Chip from '$lib/design/components/Chip.svelte';
  import Button from '$lib/design/components/Button.svelte';
  import TextField from '$lib/design/components/TextField.svelte';
  import Ornament from '$lib/design/components/Ornament.svelte';
  import CardCrop from './CardCrop.svelte';
  import { gubernii, regions, scan, shortName, setInfo, type Gubernia } from './data';
  import { router, navigate } from '$lib/core/router.svelte';
  import { normalize } from '$lib/core/utils/text';
  import { sample, shuffle } from '$lib/core/utils/random';
  import { pluralN, WORDS } from '$lib/core/utils/format';
  import { record, saveResult, bestResult } from '$lib/core/progress.svelte';
  import { haptic } from '$lib/core/platform';
  import { reveal, more } from '$lib/design/motion';
  import { burst } from '$lib/design/confetti';

  type Mode = 'look' | 'arms' | 'map';
  const asked = router.query.get('mode');
  let mode = $state<Mode>(asked === 'arms' || asked === 'map' ? asked : 'look');
  let query = $state('');
  let region = $state<string | null>(null);

  const haystack = (g: Gubernia) => normalize([g.name, g.center, g.peoples, g.rivers, g.today, ...(g.cities ?? [])].filter(Boolean).join(' '));
  const shown = $derived.by(() => {
    const q = normalize(query);
    return gubernii.filter((g) => (!region || g.region === region) && (!q || haystack(g).includes(q)));
  });
  const STEP = 18;
  let limit = $state(STEP);
  $effect(() => {
    void query;
    void region;
    limit = STEP;
  });

  // ——— Quizzes ———
  const ROUNDS = 10;
  interface Round {
    g: Gubernia;
    options: Gubernia[];
  }
  let rounds = $state<Round[]>([]);
  let qi = $state(0);
  let picked = $state<string | null>(null);
  let score = $state(0);
  let best = $state(0);
  let over = $state(false);
  const ref = $derived(`gubernii-${mode}`);

  function buildRounds(): Round[] {
    // Cards with an empty coat-of-arms box can't be asked by the arms; as options they are fine.
    const askable = mode === 'arms' ? gubernii.filter((g) => !g.noArms) : gubernii;
    const inRegion = askable.filter((g) => g.region === region);
    const pool = region && inRegion.length >= 4 ? inRegion : askable;
    return sample(pool, Math.min(ROUNDS, pool.length)).map((g) => {
      // Neighbours in the same part of the empire are the hard (and useful) distractors.
      const near = shuffle(gubernii.filter((o) => o.id !== g.id && o.region === g.region));
      const far = shuffle(gubernii.filter((o) => o.id !== g.id && o.region !== g.region));
      const others = [...near.slice(0, 2), ...far].slice(0, 3);
      return { g, options: shuffle([g, ...others]) };
    });
  }
  async function startQuiz() {
    rounds = buildRounds();
    qi = 0;
    score = 0;
    picked = null;
    over = false;
    best = await bestResult(ref);
  }
  function answer(id: string) {
    if (picked) return;
    picked = id;
    const ok = id === rounds[qi]!.g.id;
    if (ok) score++;
    haptic(ok ? 'success' : 'error');
  }
  async function nextRound() {
    if (qi + 1 >= rounds.length) {
      over = true;
      const prev = best;
      best = Math.max(best, score);
      await saveResult({ kind: 'game', ref, score, total: rounds.length });
      await record({ games: 1, xp: 5 + score * 2 });
      if (score > prev && score > 0) burst();
      return;
    }
    qi++;
    picked = null;
  }
  let lastKey = '';
  $effect(() => {
    const key = `${mode}|${region}`;
    if (mode !== 'look' && key !== lastKey) {
      lastKey = key;
      void startQuiz();
    }
  });
  const round = $derived(rounds[qi]);
  const fmt = (n: number) => n.toLocaleString('ru-RU');
</script>

<div class="page">
  <PageHeader title="Губернии 1856" eyebrow="Географические карточки империи" back="/explore" />
  <Segmented bind:value={mode} options={[{ value: 'look', label: 'Карточки', count: gubernii.length }, { value: 'arms', label: 'Чей герб?' }, { value: 'map', label: 'Чья карта?' }]} />

  <div class="hscroll chips">
    <Chip size="sm" selected={!region} onclick={() => (region = null)}>Вся империя</Chip>
    {#each regions as r (r)}
      <Chip size="sm" selected={region === r} onclick={() => (region = r)}>{r}</Chip>
    {/each}
  </div>

  {#if !gubernii.length}
    <p class="muted empty"><MapIcon size={18} /> Карточки ещё не загружены.</p>
  {:else if mode === 'look'}
    <TextField bind:value={query} icon={Search} placeholder="Губерния, город, народ, река…" inputmode="search" />
    <p class="lead">
      Набор карточек — по одной на губернию или область империи. Его составил {setInfo.author}, в {setInfo.year} году
      он вышел в Петербурге. Оригинал хранится в {setInfo.holder}.
    </p>
    <div class="grid">
      {#each shown.slice(0, limit) as g, i (g.id)}
        <a class="card" href="#/gubernii/{g.id}" use:reveal={{ delay: (i % 6) * 40 }}>
          <img src={scan(g.front)} alt={g.name} loading="lazy" decoding="async" />
          <span class="name">{g.name}</span>
          {#if g.center}<small class="muted">{g.center}</small>{/if}
        </a>
      {/each}
    </div>
    {#if limit < shown.length}<div class="more" use:more={() => (limit += STEP)}></div>{/if}
    {#if !shown.length}<p class="muted empty">Ничего не нашлось.</p>{/if}
  {:else if over}
    <div class="over" in:scale={{ start: 0.92 }}>
      <Trophy size={44} class="gold" />
      <h1>{score} из {rounds.length}</h1>
      <Ornament variant="flourish" width={200} />
      <p class="secondary">Рекорд: {best}</p>
      <Button full onclick={startQuiz}>Ещё раз</Button>
    </div>
  {:else if round}
    {#key `${mode}-${qi}`}
      <div class="quiz" in:fly={{ y: 20, duration: 300 }}>
        <div class="qhead"><span class="eyebrow">{mode === 'arms' ? 'Чей это герб?' : 'Чья это карта?'} · {qi + 1} из {rounds.length}</span><strong class="num qscore">{score}</strong></div>
        <div class="pic" class:arms={mode === 'arms'}>
          <CardCrop src={scan(round.g.front)!} part={mode === 'arms' ? 'arms' : 'map'} />
        </div>
        <div class="opts">
          {#each round.options as o, k (o.id)}
            {@const ok = picked && o.id === round.g.id}
            {@const bad = picked === o.id && !ok}
            <button class="opt" class:ok class:bad disabled={!!picked} onclick={() => answer(o.id)} in:fly={{ y: 12, delay: 80 + k * 50 }}>
              <span>{shortName(o)}</span>{#if ok}<Check size={18} />{/if}
            </button>
          {/each}
        </div>
        {#if picked}
          <div class="about" in:fade>
            <b>{round.g.name}</b>
            <p>
              {#if round.g.center}Губернский город — {round.g.center}.{/if}
              {#if round.g.population}Жителей — {fmt(round.g.population)} душ обоего пола.{/if}
              {#if round.g.today}Сейчас — {round.g.today}.{/if}
            </p>
          </div>
          <div class="row actions">
            <Button variant="secondary" onclick={() => navigate(`/gubernii/${round.g.id}`)}>Карточка</Button>
            <Button iconRight={ArrowRight} onclick={nextRound}>{qi + 1 >= rounds.length ? 'Итоги' : 'Дальше'}</Button>
          </div>
        {/if}
      </div>
    {/key}
  {:else}
    <p class="muted empty">Для викторины нужно хотя бы четыре карточки — выберите всю империю.</p>
  {/if}
  {#if mode === 'look' && gubernii.length}
    <p class="credit muted">{pluralN(gubernii.length, WORDS.card)} · {setInfo.title} · {setInfo.license}</p>
  {/if}
</div>

<style>
  .chips { margin-top: var(--sp-3); }
  .lead { margin: var(--sp-3) 0; font-family: var(--font-read); font-size: var(--text-sm); color: var(--ink-2); line-height: 1.55; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); }
  @media (min-width: 640px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  .card { display: flex; flex-direction: column; gap: 4px; text-decoration: none; color: var(--ink); }
  .card img { width: 100%; aspect-ratio: 0.687; object-fit: cover; border-radius: var(--r-md); box-shadow: var(--shadow-2); background: #efe2c4; }
  .name { font-size: var(--text-xs); font-weight: 650; line-height: 1.25; }
  .card small { font-size: var(--text-2xs); }
  .more { height: 1px; }
  .empty { display: flex; gap: 8px; align-items: center; justify-content: center; margin-top: var(--sp-6); text-align: center; }
  .credit { margin-top: var(--sp-5); font-size: var(--text-2xs); text-align: center; }
  .quiz { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-3); }
  .qhead { display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-2); }
  .qscore { font-family: var(--font-display); font-size: var(--text-2xl); color: var(--accent); }
  .pic { width: 100%; max-width: 520px; align-self: center; }
  .pic.arms { max-width: 240px; }
  .opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .opt { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-radius: var(--r-md); border: 1.5px solid var(--line); background: var(--surface); text-align: left; cursor: pointer; font-size: var(--text-sm); box-shadow: var(--shadow-1); transition: border-color var(--dur-2), background-color var(--dur-2); }
  .opt span { flex: 1; line-height: 1.3; }
  .opt.ok { border-color: var(--success); background: var(--success-soft); color: var(--success); }
  .opt.ok span { color: var(--ink); }
  .opt.bad { border-color: var(--danger); background: var(--danger-soft); animation: shake 420ms; }
  .about { display: flex; flex-direction: column; gap: 4px; font-size: var(--text-sm); color: var(--ink-2); line-height: 1.5; }
  .about p { font-family: var(--font-read); margin: 0; }
  .actions { gap: var(--sp-2); justify-content: flex-end; }
  .over { display: flex; flex-direction: column; align-items: center; gap: var(--sp-3); text-align: center; padding: var(--sp-6) 0; }
  .over h1 { font-size: var(--text-3xl); }
  .over :global(.gold) { color: var(--gold); }
</style>
