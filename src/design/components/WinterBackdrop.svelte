<script lang="ts">
  /**
   * «Русская зима» — 100% плоский 2D орнаментальный слой в стиле русской народной росписи (Гжель и Хохлома):
   * 1) Детализированный бесшовный векторный фоновый узор по всему экрану (никаких фото, 3D и глянца);
   * 2) Спокойные плоские 6-лучевые резные снежинки за карточками.
   */
  import { activeWinter, motionOK } from '$lib/core/settings.svelte';
  import { GZHEL_BG, KHOKHLOMA_BG } from '$lib/design/winter/patterns';

  interface Flake {
    x: number;
    size: number;
    dur: number;
    delay: number;
    dx: number;
    op: number;
  }

  const FLAKES: Flake[] = [
    { x: 7, size: 13, dur: 18, delay: -2, dx: 16, op: 0.28 },
    { x: 18, size: 10, dur: 23, delay: -9, dx: -14, op: 0.22 },
    { x: 30, size: 14, dur: 16, delay: -5, dx: 18, op: 0.32 },
    { x: 44, size: 11, dur: 21, delay: -14, dx: -15, op: 0.22 },
    { x: 58, size: 13, dur: 19, delay: -3, dx: 14, op: 0.28 },
    { x: 72, size: 10, dur: 25, delay: -17, dx: -18, op: 0.2 },
    { x: 84, size: 14, dur: 17, delay: -7, dx: 16, op: 0.3 },
    { x: 93, size: 11, dur: 22, delay: -12, dx: -14, op: 0.24 },
  ];

  const winter = $derived(activeWinter());
</script>

{#if winter !== 'off'}
  <!-- Плоский бесшовный векторный фон по всему экрану -->
  <div
    class="wallpaper {winter}"
    style:background-image={winter === 'khokhloma' ? KHOKHLOMA_BG : GZHEL_BG}
    aria-hidden="true"
  ></div>

  {#if motionOK()}
    <div class="snow {winter}" aria-hidden="true">
      {#each FLAKES as f, i (i)}
        <svg
          class="flake"
          viewBox="0 0 24 24"
          style:--x="{f.x}%"
          style:--sz="{f.size}px"
          style:--dur="{f.dur}s"
          style:--delay="{f.delay}s"
          style:--dx="{f.dx}px"
          style:--op={f.op}
        >
          <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none">
            <path d="M12 2 V22 M3.34 7 L20.66 17 M20.66 7 L3.34 17" />
            <path d="M10 5 L12 7 L14 5 M10 19 L12 17 L14 19" />
            <path d="M6.2 6.8 L7.5 9.2 L5.1 10.2 M17.8 17.2 L16.5 14.8 L18.9 13.8" />
            <path d="M17.8 6.8 L16.5 9.2 L18.9 10.2 M6.2 17.2 L7.5 14.8 L5.1 13.8" />
          </g>
        </svg>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .wallpaper {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background-repeat: repeat;
  }
  /* Гжель: плоский 2D кобальтовый узор на матовом фарфоре */
  .wallpaper.gzhel {
    background-size: 256px 256px;
    opacity: 0.15;
  }
  :global([data-theme='dark']) .wallpaper.gzhel {
    opacity: 0.22;
    filter: brightness(2.5) saturate(0.75);
  }
  /* Хохлома: непрерывная плоская 2D хохломская вязь с ягодами и травкой на чёрном лаке / бересте */
  .wallpaper.khokhloma {
    background-size: 264px 264px;
    opacity: 0.18;
  }
  :global([data-theme='dark']) .wallpaper.khokhloma {
    opacity: 0.33;
  }

  .snow {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  }
  .flake {
    position: absolute;
    top: -24px;
    left: var(--x);
    width: var(--sz);
    height: var(--sz);
    color: var(--winter-snow, var(--winter-orn-2));
    opacity: var(--op);
    will-change: transform;
    animation: winter-fall var(--dur) linear var(--delay) infinite;
  }
  @keyframes winter-fall {
    0% {
      transform: translate3d(0, -16px, 0) rotate(0deg);
    }
    50% {
      transform: translate3d(var(--dx), 52vh, 0) rotate(180deg);
    }
    100% {
      transform: translate3d(0, 108vh, 0) rotate(360deg);
    }
  }
</style>
