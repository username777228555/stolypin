<script lang="ts">
  /**
   * Pictures inside a lesson text, after the paragraph that mentions them (`lessonFigures` in text.ts): a work of
   * culture, an event, a portrait. Each fills the width at its own proportions (up to most of the screen height);
   * several in a row scroll sideways. A tap opens it full screen with zoom and the credit; «Карточка» opens the
   * entity sheet, as a link in the text does.
   *
   *   <LessonFigures figs={figures[i][k]} onopen={(id) => openSheet(…)} />
   */
  import { fade, scale } from 'svelte/transition';
  import { X, ChevronLeft, ChevronRight, ArrowRight } from '@lucide/svelte';
  import Button from '$lib/design/components/Button.svelte';
  import ZoomImage from '$lib/design/components/ZoomImage.svelte';
  import ImageCredit from '$lib/components/ImageCredit.svelte';
  import { kb } from '$lib/core/content/kb.svelte';
  import { formatSpan } from '$lib/core/utils/format';
  import { haptic } from '$lib/core/platform';
  import type { Figure } from './text';

  interface Props {
    figs: Figure[];
    /** Open the entity sheet (same as a `[[link]]` in the text). */
    onopen: (id: string) => void;
  }
  let { figs, onopen }: Props = $props();
  let open = $state<number | null>(null);
  let busy = $state(false);
  let downX = 0;
  const cur = $derived(open === null ? undefined : figs[open]);
  function show(i: number) {
    haptic('tap');
    open = (i + figs.length) % figs.length;
  }
  function onKey(e: KeyboardEvent) {
    if (open === null) return;
    if (e.key === 'Escape') open = null;
    else if (e.key === 'ArrowRight') show(open + 1);
    else if (e.key === 'ArrowLeft') show(open - 1);
  }
  /** «Иван Шишкин, 1889» — who made it and when; an event — its year, a portrait — the years of life. */
  function sub(f: Figure): string {
    const e = kb.get(f.id);
    if (!e) return '';
    if (e.kind === 'culture') {
      const c = e.item;
      const who = c.authorName ?? (c.authors?.length ? c.authors.map((a) => kb.title(a)).join(', ') : '');
      return [who, formatSpan(c.year, c.endYear, c.circa)].filter(Boolean).join(', ');
    }
    if (e.kind === 'event') return String(e.item.year);
    if (e.kind === 'person' && (e.item.born || e.item.died)) return `${e.item.born ?? '?'}–${e.item.died ?? ''}`;
    return '';
  }
</script>

<svelte:window onkeydown={onKey} />

{#if figs.length}
  <div class="figs" class:one={figs.length === 1}>
    {#each figs as f, i (f.id)}
      <figure>
        <button type="button" class="pic" onclick={() => show(i)} aria-label="Открыть: {f.title}">
          <img src={f.src} alt={f.title} loading="lazy" decoding="async" />
          {#if figs.length > 1}<span class="count num">{i + 1} / {figs.length}</span>{/if}
        </button>
        <figcaption><b>{f.title}</b>{#if sub(f)}<span class="muted"> · {sub(f)}</span>{/if}</figcaption>
      </figure>
    {/each}
  </div>
{/if}

{#if cur && open !== null}
  <div class="viewer" transition:fade={{ duration: 180 }} role="dialog" tabindex="-1" aria-modal="true" aria-label={cur.title}
    onpointerdown={(e) => (downX = e.clientX)}
    onpointerup={(e) => { const dx = e.clientX - downX; if (!busy && figs.length > 1 && Math.abs(dx) > 60) show(open! + (dx < 0 ? 1 : -1)); }}>
    <button class="close" aria-label="Закрыть" onclick={() => (open = null)}><X size={22} /></button>
    {#key cur.id}
      <div class="stage" in:scale={{ start: 0.97, duration: 240 }}>
        <ZoomImage src={cur.src} alt={cur.title} height="min(64dvh, 600px)" bind:busy />
        <div class="info">
          <h3>{cur.title}</h3>
          {#if sub(cur)}<p class="date num">{sub(cur)}</p>{/if}
          <ImageCredit info={cur.info} light shown={[cur.title, sub(cur)]} />
          <Button variant="gold" size="sm" iconRight={ArrowRight} onclick={() => { const id = cur.id; open = null; onopen(id); }}>Карточка</Button>
        </div>
      </div>
    {/key}
    {#if figs.length > 1}
      <button class="nav prev" aria-label="Предыдущая" onclick={() => show(open! - 1)}><ChevronLeft size={26} /></button>
      <button class="nav next" aria-label="Следующая" onclick={() => show(open! + 1)}><ChevronRight size={26} /></button>
    {/if}
  </div>
{/if}

<style>
  /* Full width at the picture's own proportions; several — sideways, the next one peeking out. */
  .figs { display: flex; align-items: flex-start; gap: var(--sp-3); overflow-x: auto; scroll-snap-type: x mandatory; margin: var(--sp-1) calc(-1 * var(--sp-1)) var(--sp-5); padding: 2px var(--sp-1) 6px; scrollbar-width: none; font-family: var(--font-ui, inherit); }
  .figs::-webkit-scrollbar { display: none; }
  figure { margin: 0; flex: 0 0 88%; scroll-snap-align: center; display: flex; flex-direction: column; gap: 6px; }
  .one figure { flex-basis: 100%; }
  .pic { position: relative; display: block; width: 100%; padding: 0; border: 0; border-radius: var(--r-md); overflow: hidden; cursor: zoom-in; background: var(--surface-2, var(--surface)); box-shadow: var(--shadow-2); }
  .pic img { display: block; width: 100%; height: auto; max-height: min(72dvh, 760px); object-fit: contain; }
  .count { position: absolute; right: 8px; top: 8px; padding: 2px 8px; border-radius: var(--r-full); background: rgba(20, 14, 9, 0.6); color: #f3eadb; font-size: var(--text-2xs); font-weight: 700; }
  figcaption { font-size: var(--text-sm); line-height: 1.35; color: var(--ink-2); }
  figcaption b { color: var(--ink); font-weight: 650; }
  .viewer { position: fixed; inset: 0; z-index: 80; background: radial-gradient(120% 90% at 50% 20%, #2b2016, #0d0906); overflow-y: auto; padding: calc(var(--safe-top) + 56px) var(--sp-4) calc(var(--safe-bottom) + var(--sp-6)); touch-action: pan-y; }
  .stage { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-3); }
  .info { color: #f3eadb; display: flex; flex-direction: column; gap: var(--sp-2); align-items: flex-start; }
  .info h3 { font-family: var(--font-display); font-size: var(--text-xl); color: #fff8ea; margin: 0; }
  .info .date { margin: 0; font-weight: 700; color: #f0cf82; }
  .close, .nav { position: fixed; z-index: 81; border: 1px solid rgba(255, 240, 210, 0.2); background: rgba(20, 14, 9, 0.55); color: #f3eadb; display: grid; place-items: center; cursor: pointer; backdrop-filter: blur(8px); }
  .close { top: calc(var(--safe-top) + 10px); right: 12px; width: 42px; height: 42px; border-radius: 50%; }
  .nav { top: 38%; width: 40px; height: 56px; border-radius: 14px; }
  .prev { left: 6px; }
  .next { right: 6px; }
</style>
