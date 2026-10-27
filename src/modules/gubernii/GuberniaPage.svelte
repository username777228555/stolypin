<script lang="ts">
  /**
   * One card of the 1856 set: both sides (tap «Перевернуть»), full-screen zoom to read the small print, and the
   * card's text in modern spelling — town, peoples, climate, rivers, population, towns and trades. Arrows and
   * swipes go to the neighbouring cards in the order of the set.
   */
  import { fade, scale } from 'svelte/transition';
  import { RefreshCw, ZoomIn, X, ChevronLeft, ChevronRight } from '@lucide/svelte';
  import PageHeader from '$lib/design/components/PageHeader.svelte';
  import Button from '$lib/design/components/Button.svelte';
  import ZoomImage from '$lib/design/components/ZoomImage.svelte';
  import { gubernii, byId, scan, setInfo } from './data';
  import { router, navigate } from '$lib/core/router.svelte';
  import { haptic } from '$lib/core/platform';

  const g = $derived(byId.get(router.params.id ?? ''));
  const index = $derived(g ? gubernii.indexOf(g) : -1);
  let side = $state<'front' | 'back'>('front');
  let zoom = $state(false);
  let zoomBusy = $state(false);
  $effect(() => {
    void g;
    side = 'front';
  });
  const src = $derived(g ? scan(side === 'front' ? g.front : g.back) ?? scan(g.front) : undefined);
  const hasBack = $derived(!!g && !!scan(g.back));

  function go(step: number) {
    if (index < 0) return;
    haptic('tap');
    const next = gubernii[(index + step + gubernii.length) % gubernii.length]!;
    navigate(`/gubernii/${next.id}`, { replace: true });
  }
  let downX = 0;
  const fmt = (n: number) => n.toLocaleString('ru-RU');
  const facts = $derived(
    g
      ? ([
          ['Губернский город', g.center],
          ['Где сейчас', g.today],
          ['Жителей', g.population ? `${fmt(g.population)} душ обоего пола` : undefined],
          ['Пространство', g.area ? `${fmt(g.area)} квадратных вёрст` : undefined],
          ['Народы', g.peoples],
          ['Климат', g.climate],
          ['Почва', g.soil],
          ['Реки', g.rivers],
          ['Море', g.sea],
          ['Города', g.cities?.join(', ')],
          ['Особенности', g.features?.join(', ')],
          ['Расстояние', g.spb && g.moscow ? `до Петербурга ${fmt(g.spb)} вёрст, до Москвы ${fmt(g.moscow)}` : undefined],
          ['На обороте', g.note],
        ].filter(([, v]) => !!v) as [string, string][])
      : [],
  );
</script>

<div class="page">
  {#if g && src}
    <PageHeader title={g.name} eyebrow="Губернии 1856 · {g.region}" back="/gubernii" />
    <div class="stage" onpointerdown={(e) => (downX = e.clientX)} onpointerup={(e) => { const dx = e.clientX - downX; if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1); }} role="presentation">
      {#key src}
        <button class="scan" in:scale={{ start: 0.97, duration: 260 }} onclick={() => (zoom = true)} aria-label="Увеличить">
          <img {src} alt={side === 'front' ? g.name : `${g.name}: особенности`} draggable="false" />
          <span class="zoom-badge"><ZoomIn size={16} /></span>
        </button>
      {/key}
    </div>
    <div class="row tools">
      <Button variant="secondary" size="sm" icon={ChevronLeft} onclick={() => go(-1)}>Назад</Button>
      {#if hasBack}
        <Button size="sm" icon={RefreshCw} onclick={() => { haptic('tap'); side = side === 'front' ? 'back' : 'front'; }}>{side === 'front' ? 'Оборот' : 'Лицевая'}</Button>
      {/if}
      <Button variant="secondary" size="sm" iconRight={ChevronRight} onclick={() => go(1)}>Далее</Button>
    </div>
    <p class="pos muted num">{index + 1} из {gubernii.length}</p>

    {#if facts.length}
      <dl class="facts">
        {#each facts as [k, v] (k)}
          <div><dt>{k}</dt><dd>{v}</dd></div>
        {/each}
      </dl>
    {/if}
    <p class="credit muted">Сведения — как на карточке 1856 года, в современном написании; некоторые из них устарели или неточны. {setInfo.author}. {setInfo.title}, {setInfo.year}. Оригинал — в {setInfo.holder}. {setInfo.license}.</p>
  {:else}
    <PageHeader title="Губернии 1856" back="/gubernii" />
    <p class="muted">Такой карточки нет.</p>
  {/if}
</div>

{#if zoom && g && src}
  <div class="viewer" transition:fade={{ duration: 200 }} role="dialog" tabindex="-1" aria-modal="true" aria-label={g.name}>
    <button class="close" aria-label="Закрыть" onclick={() => (zoom = false)}><X size={22} /></button>
    <ZoomImage {src} alt={g.name} height="calc(100dvh - var(--safe-top) - var(--safe-bottom) - 96px)" bind:busy={zoomBusy} />
    <p class="zoom-tip">Дважды коснитесь или разведите пальцы, чтобы приблизить</p>
  </div>
{/if}

<style>
  .stage { display: flex; justify-content: center; margin-top: var(--sp-2); touch-action: pan-y; }
  .scan { position: relative; border: 0; padding: 0; background: none; cursor: zoom-in; width: min(100%, 440px); }
  .scan img { display: block; width: 100%; aspect-ratio: 0.687; object-fit: contain; border-radius: var(--r-md); box-shadow: var(--shadow-3, var(--shadow-2)); background: #efe2c4; user-select: none; }
  .zoom-badge { position: absolute; right: 10px; bottom: 10px; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: rgba(20, 14, 9, 0.55); color: #f3eadb; }
  .tools { justify-content: center; gap: var(--sp-2); margin-top: var(--sp-3); flex-wrap: wrap; }
  .pos { text-align: center; font-size: var(--text-xs); margin: 4px 0 0; }
  .facts { margin: var(--sp-4) 0 0; display: flex; flex-direction: column; gap: 2px; }
  .facts div { display: grid; grid-template-columns: 9.5em 1fr; gap: var(--sp-3); padding: 8px 0; border-bottom: 1px solid var(--line); }
  dt { color: var(--ink-3); font-size: var(--text-xs); font-weight: 650; text-transform: uppercase; letter-spacing: 0.03em; padding-top: 2px; }
  dd { margin: 0; font-family: var(--font-read); font-size: var(--text-sm); line-height: 1.5; color: var(--ink); }
  .credit { margin-top: var(--sp-4); font-size: var(--text-2xs); line-height: 1.5; }
  .viewer { position: fixed; inset: 0; z-index: 80; background: radial-gradient(120% 90% at 50% 20%, #2b2016, #0d0906); padding: calc(var(--safe-top) + 56px) var(--sp-3) calc(var(--safe-bottom) + var(--sp-3)); }
  .zoom-tip { margin: var(--sp-2) 0 0; text-align: center; font-size: var(--text-2xs); color: rgba(243, 234, 219, 0.55); }
  .close { position: fixed; z-index: 81; top: calc(var(--safe-top) + 10px); right: 12px; width: 42px; height: 42px; border-radius: 50%; border: 1px solid rgba(255, 240, 210, 0.2); background: rgba(20, 14, 9, 0.55); color: #f3eadb; display: grid; place-items: center; cursor: pointer; }
</style>
