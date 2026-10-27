<script lang="ts">
  /**
   * Pictures under a lesson section: the works of culture linked in its text (a building, a painting, an icon,
   * a title page), or exactly the section's `figures` (any entity with a picture; `[]` — none). One picture
   * fills the width, several scroll sideways. A tap opens it full screen with zoom and the credit; «Карточка»
   * opens the entity sheet, as a link in the text does.
   *
   *   <LessonFigures section={sec} onopen={(id) => openSheet(…)} />
   */
  import { fade, scale } from 'svelte/transition';
  import { X, ChevronLeft, ChevronRight, ArrowRight } from '@lucide/svelte';
  import Button from '$lib/design/components/Button.svelte';
  import ZoomImage from '$lib/design/components/ZoomImage.svelte';
  import ImageCredit from '$lib/components/ImageCredit.svelte';
  import { kb } from '$lib/core/content/kb.svelte';
  import { formatSpan } from '$lib/core/utils/format';
  import { haptic } from '$lib/core/platform';
  import { figuresOf, type Figure } from './text';

  interface Props {
    section: { text: string; figures?: string[] };
    /** Open the entity sheet (same as a `[[link]]` in the text). */
    onopen: (id: string) => void;
  }
  let { section, onopen }: Props = $props();

  const figs = $derived<Figure[]>(figuresOf(section));
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
  /** «Иван Шишкин, 1889» — who made it and when; events and portraits get their year. */
  function sub(f: Figure): string {
    const e = kb.get(f.id);
    if (!e) return '';
    if (e.kind === 'culture') {
      const c = e.item;
      const who = c.authorName ?? (c.authors?.length ? c.authors.map((a) => kb.title(a)).join(', ') : '');
      return [who, formatSpan(c.year, c.endYear, c.circa)].filter(Boolean).join(', ');
    }
    if (e.kind === 'event') return String(e.item.year);
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
  .figs { display: flex; gap: var(--sp-3); overflow-x: auto; scroll-snap-type: x mandatory; margin: var(--sp-2) calc(-1 * var(--sp-1)) var(--sp-3); padding: 2px var(--sp-1) 6px; scrollbar-width: none; }
  .figs::-webkit-scrollbar { display: none; }
  figure { margin: 0; flex: 0 0 min(76%, 300px); scroll-snap-align: start; display: flex; flex-direction: column; gap: 6px; }
  .one figure { flex-basis: 100%; }
  .pic { display: block; width: 100%; padding: 0; border: 0; border-radius: var(--r-md); overflow: hidden; cursor: zoom-in; background: var(--surface-2, var(--surface)); box-shadow: var(--shadow-2); }
  .pic img { display: block; width: 100%; height: 190px; object-fit: contain; }
  .one .pic img { height: clamp(200px, 52vw, 320px); }
  figcaption { font-size: var(--text-xs); line-height: 1.35; color: var(--ink-2); }
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
