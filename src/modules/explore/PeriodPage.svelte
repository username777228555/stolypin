<script lang="ts">
  import { onMount } from 'svelte';
  import { Layers, Sparkles, ChartGantt, Network, Star, ExternalLink, BookOpen, CircleCheck, Circle, ChevronDown, ArrowRight, ScrollText, LibraryBig, Compass } from '@lucide/svelte';
  import PageHeader from '$lib/design/components/PageHeader.svelte';
  import Segmented from '$lib/design/components/Segmented.svelte';
  import Chip from '$lib/design/components/Chip.svelte';
  import Card from '$lib/design/components/Card.svelte';
  import Button from '$lib/design/components/Button.svelte';
  import ProgressBar from '$lib/design/components/ProgressBar.svelte';
  import EmptyState from '$lib/design/components/EmptyState.svelte';
  import EntityRow from '$lib/components/EntityRow.svelte';
  import { kb, type Entity } from '$lib/core/content/kb.svelte';
  import { coreBooksFor, guideFor } from '$lib/core/guides';
  import { EVENT_TAG_LABELS, CULTURE_KIND_LABELS, type LessonItem } from '$lib/core/content/schema';
  import { router } from '$lib/core/router.svelte';
  import { century, pluralN, toRoman, WORDS } from '$lib/core/utils/format';
  import { courseState, daysUntil, type LessonState } from '$lib/modules/course/progress';
  import { isDeepLesson, isLessonDue } from '$lib/modules/course/filter';

  type Tab = 'events' | 'persons' | 'culture' | 'terms';
  const period = $derived(kb.periodById.get(router.params.id ?? ''));
  let tab = $state<Tab>((router.query.get('tab') as Tab) ?? 'events');
  let tag = $state<string | null>(null);
  let keyOnly = $state(false);
  let prog = $state<Record<string, LessonState>>({});
  let showAllLessons = $state(false);

  onMount(async () => {
    prog = await courseState();
  });

  const lessons = $derived(period ? kb.lessonsIn(period.id) : []);
  const lessonsDone = $derived(lessons.filter((l) => prog[l.id]?.done).length);
  const visibleLessons = $derived(showAllLessons ? lessons : lessons.slice(0, 4));
  const nextPeriodLesson = $derived(
    lessons.find((l) => isLessonDue(prog[l.id])) ??
      lessons.find((l) => prog[l.id]?.at !== undefined && !prog[l.id]?.done) ??
      lessons.find((l) => !prog[l.id]?.done),
  );

  const lessonStatus = (l: LessonItem) => {
    const s = prog[l.id];
    if (!s?.done) return s?.at ? 'начат' : '';
    if (!s.due) return 'выучен';
    return s.due <= Date.now() ? 'пора повторить' : `повтор через ${pluralN(daysUntil(s.due), WORDS.day)}`;
  };

  const events = $derived(period ? kb.eventsIn(period.id) : []);
  const persons = $derived(period ? kb.personsIn(period.id) : []);
  const culture = $derived(period ? kb.cultureIn(period.id) : []);
  const terms = $derived(period ? kb.termsIn(period.id) : []);
  const quizzes = $derived(period ? kb.quizzesIn(period.id) : []);
  // Sources are either books of the «Книжная полка» (a file name in `note`) or excerpts of historical documents (хрестоматия).
  const isBook = (s: { note?: string }) => !!s.note;
  const books = $derived(period ? kb.sources.filter((s) => s.period === period.id && isBook(s)) : []);
  const docs = $derived(period ? kb.sources.filter((s) => s.period === period.id && !isBook(s)).sort((a, b) => (a.year ?? 0) - (b.year ?? 0)) : []);
  const guide = $derived(period ? guideFor(period.id) : null);
  const core = $derived(period ? coreBooksFor(period.id) : []);
  const hasPlan = $derived(!!guide && (core.length + guide.read.length + guide.watch.length + guide.do.length > 0));

  const tags = $derived.by(() => {
    const src: string[] = tab === 'events' ? events.flatMap((e) => e.tags ?? []) : tab === 'culture' ? culture.map((c) => c.kind) : [];
    return [...new Set(src)];
  });
  const tagLabel = (t: string) => (tab === 'culture' ? CULTURE_KIND_LABELS[t as keyof typeof CULTURE_KIND_LABELS] : EVENT_TAG_LABELS[t as keyof typeof EVENT_TAG_LABELS]) ?? t;

  const items = $derived.by((): Entity[] => {
    const ent = (id: string) => kb.get(id)!;
    const imp = (x: { importance?: number }) => !keyOnly || (x.importance ?? 2) >= 3;
    if (tab === 'events') return events.filter((e) => imp(e) && (!tag || e.tags?.includes(tag as never))).map((e) => ent(e.id));
    if (tab === 'persons') return persons.filter(imp).map((p) => ent(p.id));
    if (tab === 'culture') return culture.filter((c) => imp(c) && (!tag || c.kind === tag)).map((c) => ent(c.id));
    return terms.map((t) => ent(t.id));
  });

  $effect(() => {
    void tab;
    tag = null;
  });
</script>

{#if period}
  {@const cover = kb.periodCover(period)}
  <div class="page" style:--c={period.color}>
    <PageHeader title={period.short} back="/explore" />
    <section class="hero" style:--c={period.color}>
      {#if cover}<img src={cover} alt="" />{/if}
      <div class="shade"></div>
      <span class="numeral" aria-hidden="true">{toRoman(century(Math.max(1, period.from) + 1))}</span>
      <div class="txt">
        <span class="eyebrow light">{period.range}</span>
        <h1>{period.title}</h1>
        <p>{period.description}</p>
      </div>
    </section>

    <div class="actions">
      {#if lessons.length}
        <Button size="sm" icon={BookOpen} href={nextPeriodLesson ? `/lesson/${nextPeriodLesson.id}` : `/course?period=${period.id}`}>
          {lessonsDone > 0 ? 'Продолжить уроки' : 'Уроки'}
        </Button>
      {/if}
      <Button size="sm" variant="soft" icon={Layers} href="/cards/deck/auto:{period.id}:dates">Карточки</Button>
      <Button size="sm" variant="soft" icon={Sparkles} href="/quiz/run?src=gen&periods={period.id}">Тест</Button>
      <Button size="sm" variant="soft" icon={ChartGantt} href="/timeline?period={period.id}">Лента</Button>
      <Button size="sm" variant="soft" icon={Network} href="/graph?period={period.id}">Граф</Button>
    </div>

    {#if lessons.length}
      <section class="lessons-sec">
        <div class="section-title">
          <h2>Уроки эпохи</h2>
          <a href="#/course?period={period.id}" class="more">{lessonsDone} из {lessons.length} <ArrowRight size={14} /></a>
        </div>
        <ProgressBar value={lessonsDone / lessons.length} color={period.color} height={5} label="Пройдено уроков" />
        <div class="stack l-list">
          {#each visibleLessons as l (l.id)}
            {@const st = lessonStatus(l)}
            {@const deep = isDeepLesson(l)}
            <a class="l-item surface" href="#/lesson/{l.id}">
              <span class="l-ico">{#if prog[l.id]?.done}<CircleCheck size={19} />{:else}<Circle size={19} />{/if}</span>
              <span class="grow l-txt">
                <strong>{l.order}. {l.title}</strong>
                {#if st || deep}
                  <span class="l-meta">
                    {#if deep}<small class="deep-tag">глубокий</small>{/if}
                    {#if st}<small class:due={st === 'пора повторить'}>{st}</small>{/if}
                  </span>
                {/if}
              </span>
              {#if l.minutes}<small class="muted num dur">{l.minutes} мин</small>{/if}
            </a>
          {/each}
        </div>
        {#if lessons.length > 4}
          <button type="button" class="toggle-lessons" onclick={() => (showAllLessons = !showAllLessons)}>
            {showAllLessons ? 'Свернуть список' : `Показать все ${pluralN(lessons.length, WORDS.lesson)}`}
            <ChevronDown size={15} class={showAllLessons ? 'rot' : ''} />
          </button>
        {/if}
      </section>
    {/if}

    {#if quizzes.length || docs.length || books.length || hasPlan}
      <div class="stack disclosures">
        {#if quizzes.length}
          <details class="disc surface">
            <summary>
              <span class="d-ico gold"><Sparkles size={17} /></span>
              <strong class="grow">Тесты эпохи</strong>
              <span class="muted num dur">{pluralN(quizzes.length, WORDS.test)}</span>
              <ChevronDown size={16} class="d-chev" />
            </summary>
            <div class="stack disc-body">
              {#each quizzes as q (q.id)}
                <Card href="/quiz/run?src=pack&id={q.id}" padding="sm" tone="gold">
                  <div class="row quiz-row">
                    <Sparkles size={17} class="q-ico" />
                    <strong class="grow">{q.title}</strong>
                    <span class="muted num dur">{pluralN(q.questions.length, WORDS.question)}</span>
                  </div>
                </Card>
              {/each}
            </div>
          </details>
        {/if}

        {#if docs.length}
          <details class="disc surface">
            <summary>
              <span class="d-ico"><ScrollText size={17} /></span>
              <strong class="grow">Источники (хрестоматия)</strong>
              <span class="muted num dur">{pluralN(docs.length, WORDS.source)}</span>
              <ChevronDown size={16} class="d-chev" />
            </summary>
            <div class="disc-body">
              {#each docs as d (d.id)}
                {@const de = kb.get(d.id)}
                {#if de}<EntityRow entity={de} compact />{/if}
              {/each}
            </div>
          </details>
        {/if}

        {#if books.length}
          <details class="disc surface">
            <summary>
              <span class="d-ico"><LibraryBig size={17} /></span>
              <strong class="grow">Книги по эпохе</strong>
              <span class="muted num dur">{pluralN(books.length, WORDS.book)}</span>
              <ChevronDown size={16} class="d-chev" />
            </summary>
            <div class="disc-body">
              {#each books as b (b.id)}
                {@const be = kb.get(b.id)}
                {#if be}<EntityRow entity={be} compact />{/if}
              {/each}
            </div>
          </details>
        {/if}

        {#if hasPlan && guide}
          <details class="disc surface">
            <summary>
              <span class="d-ico"><Compass size={17} /></span>
              <strong class="grow">План подготовки</strong>
              <ChevronDown size={16} class="d-chev" />
            </summary>
            <div class="stack disc-body plan">
              {#if core.length}
                <h3 class="eyebrow">Главные книги</h3>
                <ul class="plan-list">
                  {#each core as b (b.author + b.title)}<li><strong>{b.author} — «{b.title}»</strong>{#if b.detail}<span class="muted"> — {b.detail}</span>{/if}</li>{/each}
                </ul>
                <a class="all-books" href="#/reading">Весь список по эпохам →</a>
              {/if}
              {#if guide.read.length}
                <h3 class="eyebrow">{core.length ? 'Дополнительно' : 'Прочитать'}</h3>
                <ul class="plan-list">
                  {#each guide.read as r (r.title)}<li><strong>{r.title}</strong>{#if r.detail}<span class="muted"> — {r.detail}</span>{/if}</li>{/each}
                </ul>
              {/if}
              {#if guide.watch.length}
                <h3 class="eyebrow">Посмотреть</h3>
                <ul class="plan-list">
                  {#each guide.watch as w (w.title)}<li>
                    {#if w.url}<a href={w.url} target="_blank" rel="noreferrer">{w.title} <ExternalLink size={12} /></a>{:else}<strong>{w.title}</strong>{/if}{#if w.detail}<span class="muted"> — {w.detail}</span>{/if}
                  </li>{/each}
                </ul>
              {/if}
              {#if guide.do.length}
                <h3 class="eyebrow">Сделать</h3>
                <ul class="plan-list">
                  {#each guide.do as d (d.title)}<li>
                    {#if d.url}<a href={d.url} target="_blank" rel="noreferrer">{d.title} <ExternalLink size={12} /></a>{:else}<strong>{d.title}</strong>{/if}{#if d.detail}<span class="muted"> — {d.detail}</span>{/if}
                  </li>{/each}
                </ul>
              {/if}
              <p class="muted net-note">Ссылки открываются в браузере и требуют интернета.</p>
            </div>
          </details>
        {/if}
      </div>
    {/if}

    <div class="tabs">
      <Segmented
        bind:value={tab}
        options={[
          { value: 'events', label: 'События', count: events.length },
          { value: 'persons', label: 'Люди', count: persons.length },
          { value: 'culture', label: 'Культура', count: culture.length },
          { value: 'terms', label: 'Термины', count: terms.length },
        ]}
      />
    </div>

    {#if tab !== 'terms'}
      <div class="hscroll filters">
        <Chip selected={keyOnly} onclick={() => (keyOnly = !keyOnly)}><Star size={14} /> Главное</Chip>
        {#each tags as t (t)}
          <Chip selected={tag === t} color={period.color} onclick={() => (tag = tag === t ? null : t)}>{tagLabel(t)}</Chip>
        {/each}
      </div>
    {/if}

    {#if items.length}
      <Card padding="sm">
        {#each items as e (e.item.id)}
          <EntityRow entity={e} />
        {/each}
      </Card>
    {:else}
      <EmptyState title="Пока пусто" text="Материалы по этому разделу ещё не добавлены." />
    {/if}
  </div>
{:else}
  <div class="page"><PageHeader title="Период не найден" back="/explore" /></div>
{/if}

<style>
  .hero {
    position: relative;
    overflow: hidden;
    border-radius: var(--r-xl);
    min-height: 220px;
    color: #fff;
    background: linear-gradient(145deg, color-mix(in srgb, var(--c) 90%, #fff), color-mix(in srgb, var(--c) 65%, #000));
    box-shadow: var(--shadow-2);
  }
  .hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; animation: kenburns 18s ease-out both; }
  @keyframes kenburns { from { transform: scale(1.12); } to { transform: scale(1); } }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0, 0, 0, 0.05) 0%, color-mix(in srgb, var(--c) 50%, rgba(8, 5, 3, 0.92)) 100%); }
  .numeral { position: absolute; right: 14px; top: 0; font-family: var(--font-display); font-weight: 700; font-size: 120px; line-height: 1; color: rgba(255, 255, 255, 0.14); }
  .txt { position: relative; padding: var(--sp-6) var(--sp-5) var(--sp-5); display: flex; flex-direction: column; gap: 6px; min-height: 220px; justify-content: flex-end; }
  .txt h1 { font-size: var(--text-3xl); text-shadow: 0 2px 16px rgba(0, 0, 0, 0.3); }
  .txt p { font-size: var(--text-sm); opacity: 0.92; line-height: 1.45; }
  .eyebrow.light { color: rgba(255, 255, 255, 0.8); }
  .actions { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin: var(--sp-4) 0; }
  .lessons-sec { margin-bottom: var(--sp-4); }
  .more { display: inline-flex; align-items: center; gap: 4px; font-size: var(--text-sm); font-weight: 600; white-space: nowrap; }
  .l-list { --gap: var(--sp-2); margin-top: var(--sp-3); }
  .l-item { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3); border-radius: var(--r-md); color: var(--ink); text-decoration: none; border-left: 3px solid var(--c); }
  .l-ico { color: var(--c); display: flex; flex: none; }
  .l-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: var(--text-sm); }
  .l-txt strong { line-height: 1.3; }
  .l-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .l-txt small { font-size: var(--text-xs); color: var(--ink-3); }
  .l-txt small.deep-tag { color: var(--gold); font-weight: 650; }
  .l-txt small.due { color: var(--danger); font-weight: 650; }
  .dur { white-space: nowrap; flex: none; font-size: var(--text-xs); }
  .toggle-lessons {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    margin-top: var(--sp-2);
    padding: 10px 12px;
    border-radius: var(--r-md);
    border: 1px dashed var(--line-strong);
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .toggle-lessons :global(.rot) { transform: rotate(180deg); }
  .disclosures { --gap: var(--sp-2); margin-bottom: var(--sp-4); }
  .disc { border-radius: var(--r-lg); overflow: hidden; }
  .disc summary {
    list-style: none;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    cursor: pointer;
    font-size: var(--text-sm);
    user-select: none;
  }
  .disc summary::-webkit-details-marker { display: none; }
  .d-ico { width: 32px; height: 32px; flex: none; border-radius: 9px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
  .d-ico.gold { background: var(--gold-soft); color: var(--gold); }
  .disc :global(.d-chev) { flex: none; color: var(--ink-3); transition: transform var(--dur-2) var(--ease-out); }
  .disc[open] :global(.d-chev) { transform: rotate(180deg); }
  .disc-body { padding: 0 var(--sp-3) var(--sp-3); --gap: var(--sp-2); }
  .plan { --gap: var(--sp-2); padding: 0 var(--sp-4) var(--sp-4); }
  .plan-list { margin: 0; padding-left: 18px; font-size: var(--text-sm); display: flex; flex-direction: column; gap: 6px; }
  .plan-list a { font-weight: 600; }
  .all-books { display: inline-block; margin-top: var(--sp-1); font-size: var(--text-sm); font-weight: 650; color: var(--accent); }
  .net-note { font-size: var(--text-xs); margin: 0; }
  .quiz-row { color: var(--gold); gap: var(--sp-2); }
  .quiz-row :global(.q-ico) { flex: none; }
  .quiz-row strong { color: var(--ink); font-size: var(--text-sm); line-height: 1.3; }
  .tabs { position: sticky; top: calc(var(--safe-top) + var(--header-h) + var(--sp-3)); z-index: 5; margin-bottom: var(--sp-3); }
  .filters { margin-bottom: var(--sp-2); }
</style>
