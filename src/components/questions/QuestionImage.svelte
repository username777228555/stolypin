<script lang="ts">
  /**
   * The picture of a task: full width at its own proportions (up to `max` high), zoomed with two fingers or a double tap.
   * «Во весь экран» opens it over the whole screen — maps, tables and family trees with small print are read there.
   *
   *   <QuestionImage src={kb.questionImage(q)} />
   */
  import { fade } from 'svelte/transition';
  import { Maximize2, X } from '@lucide/svelte';
  import ZoomImage from '$lib/design/components/ZoomImage.svelte';
  import { router } from '$lib/core/router.svelte';

  interface Props {
    src: string;
    alt?: string;
    max?: string;
  }
  let { src, alt = '', max = 'min(74dvh, 860px)' }: Props = $props();

  let full = $state(false);
  // Android «Назад» closes the full-screen picture, not the quiz.
  $effect(() => {
    if (!full) return;
    return router.addBackGuard(() => ((full = false), true));
  });

  /** The full-screen layer lives in <body>: the quiz card slides in with a transform, which would trap a fixed layer. */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
</script>

<div class="qimg">
  <ZoomImage {src} {alt} height={max} fit />
  <button class="expand" aria-label="Во весь экран" onclick={() => (full = true)}><Maximize2 size={17} /></button>
</div>

{#if full}
  <div class="full" use:portal in:fade={{ duration: 160 }} role="dialog" aria-modal="true" aria-label={alt || 'Картинка задания'}>
    <ZoomImage {src} {alt} height="calc(100dvh - var(--safe-top) - var(--safe-bottom) - 24px)" />
    <button class="close" aria-label="Закрыть" onclick={() => (full = false)}><X size={22} /></button>
  </div>
{/if}

<svelte:window onkeydown={(e) => { if (full && e.key === 'Escape') full = false; }} />

<style>
  .qimg { position: relative; }
  .expand, .close {
    position: absolute;
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 1px solid rgba(255, 240, 210, 0.25);
    background: rgba(20, 14, 9, 0.6);
    color: #f3eadb;
    cursor: pointer;
    backdrop-filter: blur(6px);
  }
  .expand { top: 10px; right: 10px; width: 38px; height: 38px; }
  .full {
    position: fixed;
    inset: 0;
    z-index: 160;
    background: #0d0906;
    padding: calc(var(--safe-top) + 12px) 0 calc(var(--safe-bottom) + 12px);
  }
  .close { position: fixed; top: calc(var(--safe-top) + 10px); right: 12px; width: 42px; height: 42px; }
</style>
