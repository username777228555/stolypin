<script lang="ts">
  /**
   * A part of a 1856 card scan — the coat of arms or the map (CROPS in data.ts) — shown without the rest of the
   * card, so the name printed under the arms does not give the answer away in the quizzes.
   *
   *   <CardCrop src={scan(g.front)} part="arms" />
   */
  import { CROPS, type CropName } from './data';

  interface Props {
    src: string;
    part: CropName;
    alt?: string;
  }
  let { src, part, alt = '' }: Props = $props();
  /** Width : height of a card (the scans are 720 × ~1048). */
  const CARD = 0.687;
  const c = $derived(CROPS[part]);
</script>

<div class="crop" style:aspect-ratio={(c.w * CARD) / c.h}>
  <img {src} {alt} draggable="false" style:width="{100 / c.w}%" style:left="{(-c.x / c.w) * 100}%" style:top="{(-c.y / c.h) * 100}%" />
</div>

<style>
  .crop { position: relative; overflow: hidden; width: 100%; border-radius: var(--r-md); background: #efe2c4; box-shadow: var(--shadow-1); }
  img { position: absolute; max-width: none; height: auto; user-select: none; }
</style>
