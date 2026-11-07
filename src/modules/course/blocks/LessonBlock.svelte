<script lang="ts">
  /**
   * One block of a lesson section besides its text (schema `LessonBlockSchema`): a comparison table, a document worked
   * like an olympiad project, a dispute of historians, a chain of causes, «не путать», numbers with a conclusion,
   * a model essay task (тезис → факт → анализ → вывод) and a quote taken apart into tasks.
   * Text takes `**bold**` and `[[id|links]]`; a tap on a link is handled by the lesson page (`data-ref`).
   */
  import { ScrollText, Scale, ArrowDown, TriangleAlert, ChartColumn, PenLine, Quote, Table2, Eye, EqualNot } from '@lucide/svelte';
  import type { LessonBlock } from '$lib/core/content/schema';
  import { kb } from '$lib/core/content/kb.svelte';
  import { lessonInline as h } from '../text';
  import { GENRES } from './genres';

  let { b }: { b: LessonBlock } = $props();
  /** Revealed answers of a document's questions. */
  let shown = $state<Record<number, boolean>>({});
  /** The essay block hides its tasks until the student tries to set them. */
  let tasks = $state(false);
</script>

{#if b.type === 'table'}
  <figure class="blk table">
    {#if b.title}<figcaption class="cap"><Table2 size={16} /> {@html h(b.title)}</figcaption>{/if}
    <div class="scroll">
      <table style:--cols={b.head.length}>
        <thead><tr>{#each b.head as c, i (i)}<th>{@html h(c)}</th>{/each}</tr></thead>
        <tbody>
          {#each b.rows as r, i (i)}<tr>{#each r as c, j (j)}<td>{@html h(c)}</td>{/each}</tr>{/each}
        </tbody>
      </table>
    </div>
    {#if b.note}<p class="note">{@html h(b.note)}</p>{/if}
  </figure>
{:else if b.type === 'document'}
  {@const g = GENRES[b.genre]}
  <article class="blk doc">
    <header>
      <span class="eyebrow"><ScrollText size={14} /> Документ</span>
      <h3 class="doc-t">{#if b.source && kb.get(b.source)}<a class="ref" href="#/entity/{b.source}" data-ref={b.source}>{b.title}</a>{:else}{b.title}{/if}</h3>
      {#if b.author || b.date}<p class="meta">{[b.author, b.date].filter(Boolean).join(' · ')}</p>{/if}
      <p class="genre"><strong>{g.label}</strong> — {g.purpose}</p>
    </header>
    <blockquote class="paper">{b.excerpt}</blockquote>
    {#if b.moment}<div class="part"><span class="lbl">Характеристика момента</span><p>{@html h(b.moment)}</p></div>{/if}
    {#if b.about}<div class="part"><span class="lbl">Характеристика источника</span><p>{@html h(b.about)}</p></div>{/if}
    {#if b.clues?.length}
      <div class="part">
        <span class="lbl">По каким словам узнать</span>
        <ul class="clues">{#each b.clues as c, i (i)}<li>{@html h(c)}</li>{/each}</ul>
      </div>
    {/if}
    {#if b.questions?.length}
      <div class="part">
        <span class="lbl">Вопросы к документу — сначала ответьте сами</span>
        <ol class="qs">
          {#each b.questions as q, i (i)}
            <li>
              <p class="q">{@html h(q.q)}</p>
              {#if shown[i]}<p class="a">{@html h(q.a)}</p>{:else}<button type="button" class="reveal" onclick={() => (shown[i] = true)}><Eye size={14} /> Показать ответ</button>{/if}
            </li>
          {/each}
        </ol>
      </div>
    {/if}
  </article>
{:else if b.type === 'debate'}
  <section class="blk debate">
    <span class="eyebrow"><Scale size={14} /> Спор историков</span>
    <p class="dq">{@html h(b.question)}</p>
    <div class="pos">
      {#each b.positions as p, i (i)}
        <div class="p" style:--k={i}>
          <p class="who">
            {#if p.person && kb.get(p.person)}<a class="ref" href="#/entity/{p.person}" data-ref={p.person}>{p.who}</a>{:else}{p.who}{/if}
            <span class="work">«{p.work}»{#if p.year}, {p.year}{/if}</span>
          </p>
          <p class="thesis">{@html h(p.thesis)}</p>
          <p class="proof"><span class="lbl">Чем доказывает</span> {@html h(p.argument)}</p>
        </div>
      {/each}
    </div>
    {#if b.note}<p class="note">{@html h(b.note)}</p>{/if}
  </section>
{:else if b.type === 'chain'}
  <figure class="blk chain">
    {#if b.title}<figcaption class="cap">{@html h(b.title)}</figcaption>{/if}
    <ol>
      {#each b.steps as s, i (i)}
        <li>
          <div class="step"><strong>{@html h(s.label)}</strong>{#if s.text}<span>{@html h(s.text)}</span>{/if}</div>
          {#if i < b.steps.length - 1}<span class="arrow" aria-hidden="true"><ArrowDown size={18} /></span>{/if}
        </li>
      {/each}
    </ol>
  </figure>
{:else if b.type === 'pitfalls'}
  <section class="blk pit">
    <span class="eyebrow"><TriangleAlert size={14} /> Не путать</span>
    {#each b.items as x, i (i)}
      <div class="pair">
        <div class="ab"><span>{@html h(x.a)}</span><EqualNot size={18} /><span>{@html h(x.b)}</span></div>
        <p class="how">{@html h(x.how)}</p>
      </div>
    {/each}
  </section>
{:else if b.type === 'numbers'}
  <figure class="blk nums">
    <figcaption class="cap"><ChartColumn size={16} /> {#if b.title}{@html h(b.title)}{:else}Цифры{/if}</figcaption>
    <div class="grid">
      {#each b.items as x, i (i)}<div class="n"><strong>{x.value}</strong><span>{@html h(x.label)}</span></div>{/each}
    </div>
    <p class="concl">{@html h(b.conclusion)}</p>
  </figure>
{:else if b.type === 'argument'}
  <section class="blk arg">
    <span class="eyebrow"><PenLine size={14} /> Образец: как раскрыть задачу эссе</span>
    <p class="task"><span class="lbl">Задача</span> {@html h(b.task)}</p>
    <p class="th"><span class="lbl">Тезис</span> {@html h(b.thesis)}</p>
    <ol class="args">
      {#each b.args as a, i (i)}
        <li>
          <p><span class="tag f">Факт</span> {@html h(a.fact)}</p>
          <p><span class="tag an">Анализ</span> {@html h(a.analysis)}</p>
          {#if a.view}<p><span class="tag v">Точка зрения</span> {@html h(a.view)}</p>{/if}
          <p><span class="tag c">Вывод</span> {@html h(a.conclusion)}</p>
        </li>
      {/each}
    </ol>
    <p class="th"><span class="lbl">Микровывод по задаче</span> {@html h(b.conclusion)}</p>
  </section>
{:else if b.type === 'essay'}
  <section class="blk essay">
    <span class="eyebrow"><Quote size={14} /> Цитата для эссе: разбор</span>
    <blockquote class="paper">{b.quote}<footer>— {b.who}{#if b.work}, «{b.work}»{/if}</footer></blockquote>
    <p class="muted">Делим цитату на смысловые блоки, пересказываем идею автора («Автор говорит о том, что…») и ставим нейтральную задачу — с глагола, без готовой оценки.</p>
    <ol class="parts">
      {#each b.parts as p, i (i)}
        <li>
          <p class="part-q">«{p.part}»</p>
          <p><span class="lbl">Идея автора</span> {@html h(p.idea)}</p>
          {#if tasks}<p class="t"><span class="lbl">Задача</span> {@html h(p.task)}</p>{/if}
        </li>
      {/each}
    </ol>
    {#if tasks}
      <p class="th"><span class="lbl">Проблема</span> {@html h(b.problem)}</p>
    {:else}
      <button type="button" class="reveal" onclick={() => (tasks = true)}><Eye size={14} /> Сформулируйте задачи сами — потом сверьте</button>
    {/if}
  </section>
{/if}

<style>
  .blk { margin: var(--sp-3) 0; font-size: var(--text-sm); line-height: 1.5; }
  .eyebrow { display: inline-flex; align-items: center; gap: 5px; font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--c); }
  .cap { display: flex; align-items: center; gap: 6px; margin-bottom: var(--sp-2); font-weight: 700; color: var(--ink); }
  .lbl { display: inline-block; font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: var(--ink-3); }
  .note { margin: var(--sp-2) 0 0; color: var(--ink-2); font-size: var(--text-xs); }
  .muted { color: var(--ink-2); }
  p { margin: 0; }

  /* Table: scrolls sideways on a narrow screen instead of squeezing the columns. */
  .table { margin-inline: 0; }
  .scroll { overflow-x: auto; border-radius: var(--r-md); border: 1px solid var(--line); }
  /* Up to three columns fit a phone; wider tables scroll. */
  table { border-collapse: collapse; width: 100%; min-width: calc(var(--cols) * 108px); background: var(--surface); }
  th, td { padding: 8px 10px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
  th { background: color-mix(in srgb, var(--c) 12%, var(--surface)); font-weight: 700; }
  td:first-child { font-weight: 650; }
  tbody tr:last-child td { border-bottom: 0; }

  /* Document: a sheet of paper with its card. */
  .doc { padding: var(--sp-3); border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--line); display: flex; flex-direction: column; gap: var(--sp-2); }
  .doc-t { margin: 2px 0 0; font-family: var(--font-display); font-size: var(--text-lg); line-height: 1.25; }
  .meta { color: var(--ink-2); }
  .genre { padding: 6px 10px; border-radius: var(--r-sm, 8px); background: color-mix(in srgb, var(--c) 8%, var(--surface)); }
  .paper { margin: 0; padding: var(--sp-3); border-left: 3px solid var(--c); border-radius: 0 var(--r-md) var(--r-md) 0; background: color-mix(in srgb, var(--gold) 10%, var(--surface-2)); font-family: var(--font-read); font-size: var(--text-md, 1rem); line-height: 1.6; white-space: pre-line; }
  .paper footer { margin-top: var(--sp-2); font-size: var(--text-sm); color: var(--ink-2); text-align: right; }
  .part { display: flex; flex-direction: column; gap: 4px; }
  .clues { margin: 0; padding-left: 1.1em; display: flex; flex-direction: column; gap: 2px; }
  .qs { margin: 0; padding-left: 1.2em; display: flex; flex-direction: column; gap: var(--sp-2); }
  .q { font-weight: 650; }
  .a { margin-top: 4px; padding: 6px 10px; border-radius: var(--r-sm, 8px); background: color-mix(in srgb, var(--success) 10%, var(--surface)); }
  .reveal { display: inline-flex; align-items: center; gap: 5px; margin-top: 4px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--c); font: inherit; font-size: var(--text-xs); font-weight: 650; cursor: pointer; }

  /* Debate: one card per position, each with its own tint. */
  .debate { display: flex; flex-direction: column; gap: var(--sp-2); }
  .dq { font-weight: 700; font-size: var(--text-md, 1rem); }
  .pos { display: flex; flex-direction: column; gap: var(--sp-2); }
  .p { --tone: color-mix(in srgb, var(--c) calc(100% - var(--k) * 30%), var(--gold)); padding: var(--sp-3); border-radius: var(--r-md); border-left: 4px solid var(--tone); background: var(--surface); display: flex; flex-direction: column; gap: 4px; }
  .who { font-weight: 700; }
  .work { font-weight: 400; color: var(--ink-2); }
  .thesis { font-family: var(--font-read); font-size: var(--text-md, 1rem); }
  .proof { color: var(--ink-2); }

  /* Chain of causes: boxes with arrows between them. */
  .chain ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; align-items: stretch; }
  .chain li { display: flex; flex-direction: column; align-items: center; }
  .step { width: 100%; padding: var(--sp-2) var(--sp-3); border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 2px; }
  .step span { color: var(--ink-2); }
  .arrow { color: var(--c); line-height: 0; padding: 4px 0; }

  /* Pitfalls. */
  .pit { padding: var(--sp-3); border-radius: var(--r-md); background: color-mix(in srgb, var(--warning) 9%, var(--surface)); border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent); display: flex; flex-direction: column; gap: var(--sp-2); }
  .pit .eyebrow { color: var(--warning); }
  .ab { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; font-weight: 650; }
  .ab :global(svg) { color: var(--warning); }
  .how { color: var(--ink-2); margin-top: 2px; }

  /* Numbers. */
  .nums .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: var(--sp-2); }
  .n { padding: var(--sp-2) var(--sp-3); border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 2px; }
  .n strong { font-family: var(--font-display); font-size: var(--text-xl); color: var(--c); line-height: 1.1; }
  .n span { color: var(--ink-2); font-size: var(--text-xs); }
  .concl { margin-top: var(--sp-2); font-weight: 650; }

  /* Model essay task. */
  section.arg, section.essay { display: flex; flex-direction: column; gap: var(--sp-2); }
  section.arg { padding: var(--sp-3); border-radius: var(--r-md); border: 1px dashed color-mix(in srgb, var(--c) 55%, transparent); background: color-mix(in srgb, var(--c) 4%, var(--surface)); }
  .task, .th { font-weight: 600; }
  .args { margin: 0; padding-left: 1.2em; display: flex; flex-direction: column; gap: var(--sp-2); }
  .args li { display: flex; flex-direction: column; gap: 3px; }
  .tag { display: inline-block; padding: 0 6px; border-radius: 6px; font-size: var(--text-xs); font-weight: 700; color: #fff; }
  .tag.f { background: var(--info); }
  .tag.an { background: var(--c); }
  .tag.v { background: var(--gold); color: var(--ink); }
  .tag.c { background: var(--success); }

  /* Quote taken apart. */
  section.essay { padding: var(--sp-3); border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--line); }
  .parts { margin: 0; padding-left: 1.2em; display: flex; flex-direction: column; gap: var(--sp-2); }
  .parts li { display: flex; flex-direction: column; gap: 3px; }
  .part-q { font-family: var(--font-read); font-style: italic; }
  .t { padding: 4px 8px; border-radius: var(--r-sm, 8px); background: color-mix(in srgb, var(--success) 10%, var(--surface)); }
</style>
