<script lang="ts">
  /**
   * High-resolution color raster historical map viewer with mathematically locked 1:1 interactive
   * SVG overlay: calibrated numbered pins, toggleable vector campaign routes, blind-mode label/title
   * masks, smooth zoom & drag-pan, bulletproof relative/root asset loading, and body-portaled
   * fullscreen inspection that sits cleanly above the app's bottom TabBar.
   */
  import {
    Maximize2,
    Minimize2,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    Waypoints,
    MapPin,
    MapPinOff,
    AlertCircle,
    RefreshCw,
  } from '@lucide/svelte';
  import {
    computeBadgeLayouts,
    resolveMapImage,
    ROUTE_LEGEND,
    smoothOverlayPath,
    type BadgeLayout,
    type BlindMapPoint,
    type HistoricalMap,
    type RouteStyle,
  } from './atlas';

  interface Props {
    map: HistoricalMap;
    /** When true, conceals printed titles, legends, and target landmark names on the map image. */
    blind?: boolean;
    /** Currently inspected or chosen point ID. */
    selectedId?: string | null;
    /** Point ID highlighted as correct (emerald ring). */
    correctId?: string | null;
    /** Point ID highlighted as wrong (crimson ring). */
    wrongId?: string | null;
    /** Point ID highlighted with a golden pulsing ring (e.g. "What is point №3?" in blind attribution). */
    targetId?: string | null;
    /** Disable clicking markers when a step is locked. */
    interactive?: boolean;
    /** Show route legend strip below the map. */
    showLegend?: boolean;
    /** Allow hiding numbered pins via toolbar toggle (useful in Atlas mode for inspecting the clean map). */
    allowHideMarkers?: boolean;
    onselect?: (pt: BlindMapPoint) => void;
  }

  let {
    map,
    blind = false,
    selectedId = null,
    correctId = null,
    wrongId = null,
    targetId = null,
    interactive = true,
    showLegend = true,
    allowHideMarkers = false,
    onselect,
  }: Props = $props();

  const VIEW_W = 1000;
  const vbH = $derived(Math.round((VIEW_W * map.height) / map.width));
  const mapAspect = $derived(map.width / map.height);

  let expanded = $state(false);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let dragging = $state(false);
  let dragStart = { x: 0, y: 0, panX: 0, panY: 0 };
  let didDrag = false;
  let routesOverride = $state<boolean | null>(null);
  let markersVisible = $state(true);

  // Bulletproof image loading across relative base (`./`), root (`/`), and transient network blips
  let imgAttempt = $state(0);
  let imgFailed = $state(false);
  let imgLoaded = $state(false);

  const primarySrc = $derived(resolveMapImage(map.image, import.meta.env.BASE_URL));
  const fallbackSrc = $derived(
    primarySrc.startsWith('./')
      ? `/${map.image.replace(/^\/+/, '')}`
      : `./${map.image.replace(/^\/+/, '')}`,
  );
  const imgSrc = $derived.by(() => {
    if (imgAttempt === 0) return primarySrc;
    if (imgAttempt === 1) return fallbackSrc;
    const sep = primarySrc.includes('?') ? '&' : '?';
    return `${primarySrc}${sep}retry=${imgAttempt}`;
  });

  // Reset zoom/pan, overlay defaults, and image state whenever map changes
  $effect(() => {
    void map.id;
    zoom = 1;
    panX = 0;
    panY = 0;
    routesOverride = null;
    markersVisible = true;
    imgAttempt = 0;
    imgFailed = false;
    imgLoaded = false;
  });

  // Close fullscreen on Escape key
  $effect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') expanded = false;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /**
   * Portals the fullscreen `.atlas-frame` directly onto `document.body` so it escapes `<main class="view">`
   * stacking context (`z-index: 1`) and renders cleanly ABOVE the bottom `TabBar` (`z-index: 50`).
   */
  function portalWhenExpanded(node: HTMLElement, active: boolean) {
    let placeholder: Comment | null = null;
    let moved = false;

    function sync(isOn: boolean) {
      if (isOn && !moved) {
        placeholder = document.createComment('map-fullscreen-anchor');
        node.parentNode?.insertBefore(placeholder, node);
        document.body.appendChild(node);
        moved = true;
      } else if (!isOn && moved) {
        if (placeholder?.parentNode) {
          placeholder.parentNode.insertBefore(node, placeholder);
          placeholder.remove();
        }
        placeholder = null;
        moved = false;
      }
    }

    sync(active);
    return {
      update(nextActive: boolean) {
        sync(nextActive);
      },
      destroy() {
        if (moved) {
          placeholder?.remove();
          node.remove();
        }
      },
    };
  }

  const showRoutes = $derived(
    routesOverride !== null ? routesOverride : Boolean(map.routesDefaultOn),
  );
  const showMarkers = $derived(blind || !allowHideMarkers || markersVisible);

  // Compact cartographic callout sizing scaled smoothly across portrait and landscape maps
  const pinScale = $derived(Math.max(0.88, Math.min(1.16, vbH / 960)));
  const badgeR = $derived(Math.round(13.2 * pinScale * 10) / 10);
  const dotR = $derived(Math.round(4.6 * pinScale * 10) / 10);
  const pulseR = $derived(Math.round(21 * pinScale * 10) / 10);
  const hitR = $derived(Math.round(22 * pinScale * 10) / 10);
  const fontSz = $derived(Math.round(12.6 * pinScale * 10) / 10);

  const badgeLayoutMap = $derived.by(() => {
    const layouts = computeBadgeLayouts(map.points, VIEW_W, vbH, badgeR);
    return new Map<string, BadgeLayout>(layouts.map((l) => [l.id, l]));
  });

  const routes = $derived(
    map.routes.map((r, i) => ({
      ...r,
      key: `${map.id}-r${i}`,
      d: smoothOverlayPath(r.coords, VIEW_W, vbH),
      meta: ROUTE_LEGEND[r.style],
    })),
  );

  const usedStyles = $derived(
    [...new Set(map.routes.map((r) => r.style))] as RouteStyle[],
  );

  function toX(pct: number): number {
    return Math.round((pct / 100) * VIEW_W * 10) / 10;
  }

  function toY(pct: number): number {
    return Math.round((pct / 100) * vbH * 10) / 10;
  }

  function handleImageLoad() {
    imgLoaded = true;
    imgFailed = false;
  }

  function handleImageError() {
    if (imgAttempt === 0) {
      imgAttempt = 1;
    } else {
      imgFailed = true;
      imgLoaded = false;
    }
  }

  function retryImage() {
    imgFailed = false;
    imgLoaded = false;
    imgAttempt = Math.max(2, imgAttempt + 1);
  }

  function clampPan(nx: number, ny: number, z: number): { x: number; y: number } {
    if (z <= 1) return { x: 0, y: 0 };
    const maxPct = ((z - 1) / (2 * z)) * 100 + 8;
    return {
      x: Math.max(-maxPct, Math.min(maxPct, nx)),
      y: Math.max(-maxPct, Math.min(maxPct, ny)),
    };
  }

  function adjustZoom(delta: number) {
    const next = Math.max(1, Math.min(3, Math.round((zoom + delta) * 10) / 10));
    zoom = next;
    const c = clampPan(panX, panY, next);
    panX = c.x;
    panY = c.y;
  }

  function resetView() {
    zoom = 1;
    panX = 0;
    panY = 0;
  }

  function onPointerDown(e: PointerEvent) {
    if (zoom <= 1) return;
    if ((e.target as HTMLElement)?.closest('button, .pin')) return;
    dragging = true;
    didDrag = false;
    dragStart = { x: e.clientX, y: e.clientY, panX, panY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (Math.hypot(dx, dy) > 4) didDrag = true;
    const nx = dragStart.panX + (dx / rect.width) * (100 / zoom);
    const ny = dragStart.panY + (dy / rect.height) * (100 / zoom);
    const c = clampPan(nx, ny, zoom);
    panX = c.x;
    panY = c.y;
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore if capture already released
    }
  }

  function handleSelect(pt: BlindMapPoint) {
    if (didDrag || !interactive || !onselect) return;
    onselect(pt);
  }

  function handleKey(e: KeyboardEvent, pt: BlindMapPoint) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!interactive || !onselect) return;
      onselect(pt);
    }
  }

  function markerState(id: string): 'correct' | 'wrong' | 'target' | 'selected' | 'idle' {
    if (correctId === id) return 'correct';
    if (wrongId === id) return 'wrong';
    if (targetId === id) return 'target';
    if (selectedId === id) return 'selected';
    return 'idle';
  }
</script>

<div class="atlas-frame" class:expanded use:portalWhenExpanded={expanded}>
  <div class="toolbar">
    <div class="tool-group">
      <button
        type="button"
        class="tool-btn"
        aria-label="Увеличить карту"
        disabled={zoom >= 3}
        onclick={() => adjustZoom(0.5)}
      >
        <ZoomIn size={15} />
      </button>
      <button
        type="button"
        class="tool-btn"
        aria-label="Уменьшить карту"
        disabled={zoom <= 1}
        onclick={() => adjustZoom(-0.5)}
      >
        <ZoomOut size={15} />
      </button>
      {#if zoom > 1}
        <button type="button" class="tool-btn txt" aria-label="Сбросить масштаб" onclick={resetView}>
          <RotateCcw size={13} /> {zoom.toFixed(1)}×
        </button>
      {/if}
    </div>

    <div class="tool-group">
      {#if allowHideMarkers && !blind}
        <button
          type="button"
          class="tool-btn txt"
          class:active={showMarkers}
          aria-pressed={showMarkers}
          onclick={() => (markersVisible = !markersVisible)}
        >
          {#if showMarkers}<MapPin size={14} />{:else}<MapPinOff size={14} />{/if} Метки
        </button>
      {/if}
      {#if map.routes.length > 0}
        <button
          type="button"
          class="tool-btn txt"
          class:active={showRoutes}
          aria-pressed={showRoutes}
          onclick={() => (routesOverride = !showRoutes)}
        >
          <Waypoints size={14} /> Стрелки
        </button>
      {/if}
      <button
        type="button"
        class="tool-btn"
        class:active={expanded}
        aria-label={expanded ? 'Свернуть карту' : 'Развернуть карту на весь экран'}
        onclick={() => (expanded = !expanded)}
      >
        {#if expanded}<Minimize2 size={15} />{:else}<Maximize2 size={15} />{/if}
      </button>
    </div>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="viewport"
    class:zoomed={zoom > 1}
    class:dragging
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <div
      class="stage"
      style:--map-ar={mapAspect}
      style:aspect-ratio="{map.width} / {map.height}"
      style:transform="scale({zoom}) translate({panX}%, {panY}%)"
    >
      {#if imgFailed}
        <div class="img-error" role="alert">
          <AlertCircle size={24} />
          <p>Не удалось загрузить изображение карты.</p>
          <button type="button" class="tool-btn txt" onclick={retryImage}>
            <RefreshCw size={13} /> Повторить загрузку
          </button>
        </div>
      {:else}
        <img
          class="raster-img"
          class:loading={!imgLoaded}
          src={imgSrc}
          width={map.width}
          height={map.height}
          alt={blind ? 'Слепая историческая карта' : `Историческая карта: ${map.title}`}
          draggable="false"
          onload={handleImageLoad}
          onerror={handleImageError}
        />

        <svg
          class="overlay-svg"
          viewBox="0 0 {VIEW_W} {vbH}"
          preserveAspectRatio="none"
          aria-label={blind ? 'Интерактивный слой слепой карты' : `Интерактивные объекты: ${map.title}`}
        >
          <defs>
            {#each Object.entries(ROUTE_LEGEND) as [styleKey, info] (styleKey)}
              <marker
                id="ov-arrow-{map.id}-{styleKey}"
                viewBox="0 0 12 12"
                refX="9"
                refY="6"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto-start-reverse"
              >
                <path d="M 1 1.5 L 10.5 6 L 1 10.5 z" fill={info.color} stroke="#ffffff" stroke-width="1" />
              </marker>
            {/each}
          </defs>

          <!-- Blind-mode masks concealing map title, legend, and target landmark inscriptions -->
          {#if blind}
            <g class="blind-masks" aria-hidden="true">
              {#each map.blindMasks ?? [] as m, idx (`bm-${idx}`)}
                <rect
                  x={toX(m.x)}
                  y={toY(m.y)}
                  width={toX(m.w)}
                  height={toY(m.h)}
                  rx="6"
                  class="mask-box mask-title"
                />
              {/each}
              {#each map.points as pt (pt.id)}
                {#if pt.mask && markerState(pt.id) !== 'correct'}
                  <rect
                    x={toX(pt.mask.x)}
                    y={toY(pt.mask.y)}
                    width={toX(pt.mask.w)}
                    height={toY(pt.mask.h)}
                    rx="4"
                    class="mask-box mask-label"
                  />
                {/if}
              {/each}
            </g>
          {/if}

          <!-- Calibrated interactive campaign arrows overlaid on the real color map -->
          {#if showRoutes}
            <g class="routes" aria-hidden="true">
              {#each routes as r (r.key)}
                <path d={r.d} class="route-halo" />
                <path
                  d={r.d}
                  class="route-line"
                  stroke={r.meta.color}
                  stroke-dasharray={r.meta.dashed ? '11 7' : undefined}
                  marker-end="url(#ov-arrow-{map.id}-{r.style})"
                />
              {/each}
            </g>
          {/if}

          <!-- Calibrated cartographic callout markers: exact dot on city + leader line + offset numbered badge -->
          {#if showMarkers}
            {@const orderedPoints = [...map.points].sort((a, b) => {
              const sa = markerState(a.id) === 'idle' ? 0 : 1;
              const sb = markerState(b.id) === 'idle' ? 0 : 1;
              return sa - sb;
            })}
            <g class="markers">
              {#each orderedPoints as pt (pt.id)}
                {@const layout = badgeLayoutMap.get(pt.id)}
                {@const px = layout ? layout.px : toX(pt.x)}
                {@const py = layout ? layout.py : toY(pt.y)}
                {@const bx = layout ? layout.bx : px}
                {@const by = layout ? layout.by : py}
                {@const st = markerState(pt.id)}
                <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
                <g
                  class="pin state-{st} kind-{pt.kind}"
                  class:clickable={interactive && Boolean(onselect)}
                  role={interactive && onselect ? 'button' : undefined}
                  tabindex={interactive && onselect ? 0 : undefined}
                  aria-label={blind ? `Объект №${pt.num}` : `${pt.num}. ${pt.label}`}
                  onclick={() => handleSelect(pt)}
                  onkeydown={(e) => handleKey(e, pt)}
                >
                  {#if bx !== px || by !== py}
                    <line x1={px} y1={py} x2={bx} y2={by} class="pin-leader-halo" />
                    <line x1={px} y1={py} x2={bx} y2={by} class="pin-leader" />
                  {/if}
                  <!-- Exact landmark dot (never hides the printed city label) -->
                  <circle cx={px} cy={py} r={hitR * 0.8} class="pin-hit" fill="transparent" fill-opacity="0" />
                  <circle cx={px} cy={py} r={dotR + 2} class="pin-dot-halo" />
                  <circle cx={px} cy={py} r={dotR} class="pin-dot" />
                  <!-- Offset numbered callout badge -->
                  <g transform="translate({bx}, {by})">
                    {#if st === 'target' || st === 'selected' || st === 'correct'}
                      <circle r={pulseR} class="pin-pulse" />
                    {/if}
                    <circle r={hitR} class="pin-hit" fill="transparent" fill-opacity="0" />
                    <circle r={badgeR + 2.2} class="pin-halo" />
                    <circle r={badgeR} class="pin-circle" />
                    <text y={Math.round(fontSz * 0.36)} text-anchor="middle" font-size={fontSz} class="pin-num">
                      {pt.num}
                    </text>
                  </g>
                </g>
              {/each}
            </g>
          {/if}
        </svg>
      {/if}
    </div>
  </div>

  {#if showLegend && showRoutes && usedStyles.length}
    <div class="legend" aria-label="Условные обозначения интерактивных линий">
      {#if blind}
        {#each usedStyles as styleKey (styleKey)}
          <span class="leg-item">
            <span
              class="leg-swatch"
              class:dashed={ROUTE_LEGEND[styleKey].dashed}
              style:--sw={ROUTE_LEGEND[styleKey].color}
            ></span>
            <span>{ROUTE_LEGEND[styleKey].label}</span>
          </span>
        {/each}
      {:else}
        {#each map.routes as r, i (i)}
          <span class="leg-item">
            <span
              class="leg-swatch"
              class:dashed={ROUTE_LEGEND[r.style].dashed}
              style:--sw={ROUTE_LEGEND[r.style].color}
            ></span>
            <span>{r.label}</span>
          </span>
        {/each}
      {/if}
    </div>
  {/if}

  {#if !blind}
    <div class="credit-line">
      <span>Карта: {map.credit} ({map.license})</span>
      {#if zoom === 1}
        <span class="hint">Приблизьте кнопкой «+» для мелких подписей</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .atlas-frame {
    display: flex;
    flex-direction: column;
    gap: 6px;
    --stage-max-h: clamp(320px, 60dvh, 540px);
  }
  .atlas-frame.expanded {
    position: fixed;
    inset: 0;
    z-index: 120;
    background: var(--bg);
    padding: calc(var(--safe-top, 0px) + var(--sp-3)) var(--sp-3) calc(var(--safe-bottom, 0px) + var(--sp-3));
    justify-content: center;
    --stage-max-h: calc(100dvh - 102px - var(--safe-top, 0px) - var(--safe-bottom, 0px));
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .tool-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .tool-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 32px;
    height: 30px;
    padding: 0 8px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 650;
    cursor: pointer;
    transition: border-color 0.14s ease, background 0.14s ease;
  }
  .tool-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .tool-btn:not(:disabled):hover {
    border-color: var(--accent);
  }
  .tool-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .viewport {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: var(--r-lg);
    border: 1px solid var(--line-strong);
    background: var(--surface-2);
    box-shadow: var(--shadow-1, 0 2px 12px rgba(0, 0, 0, 0.1));
    touch-action: manipulation;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .viewport.zoomed {
    cursor: grab;
    touch-action: none;
  }
  .viewport.dragging {
    cursor: grabbing;
  }
  .expanded .viewport {
    flex: 1;
    min-height: 0;
  }

  /*
   * Exact 1:1 stage sizing: width is capped by BOTH container width (100%) and the exact width
   * corresponding to `--stage-max-h` for the map's aspect ratio. Combined with `aspect-ratio`,
   * `.stage`, `.raster-img`, and `.overlay-svg` always share pixel-identical bounding boxes.
   */
  .stage {
    position: relative;
    width: min(100%, calc(var(--stage-max-h) * var(--map-ar)));
    max-width: 100%;
    flex: none;
    transform-origin: center center;
    transition: transform 0.16s ease-out;
  }
  .viewport.dragging .stage {
    transition: none;
  }

  .raster-img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: fill;
    pointer-events: none;
    transition: opacity 0.18s ease;
  }
  .raster-img.loading {
    opacity: 0.2;
  }

  .img-error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 20px;
    text-align: center;
    color: var(--ink-2);
    font-size: var(--text-sm);
  }
  .img-error p {
    margin: 0;
  }

  .overlay-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }

  /* Blind-mode cartographic cover patches (warm parchment in light themes, deep slate in dark) */
  .mask-box {
    fill: color-mix(in srgb, var(--gold) 18%, var(--surface));
    stroke: color-mix(in srgb, var(--ink) 28%, transparent);
    stroke-width: 1.5;
  }
  .mask-title {
    fill: color-mix(in srgb, var(--gold) 14%, var(--surface-2));
    stroke-dasharray: 4 3;
  }
  .mask-label {
    fill: color-mix(in srgb, var(--gold) 24%, var(--surface));
  }

  .route-halo {
    fill: none;
    stroke: rgba(255, 255, 255, 0.88);
    stroke-width: 8.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .route-line {
    fill: none;
    stroke-width: 4.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .pin.clickable {
    cursor: pointer;
    outline: none;
  }
  .pin-hit {
    fill: transparent;
    fill-opacity: 0;
    stroke: none;
  }
  .pin-leader-halo {
    stroke: rgba(255, 255, 255, 0.92);
    stroke-width: 4.4;
    stroke-linecap: round;
    pointer-events: none;
  }
  .pin-leader {
    stroke: #292018;
    stroke-width: 1.9;
    stroke-linecap: round;
    pointer-events: none;
    transition: stroke 0.14s ease, stroke-width 0.14s ease;
  }
  .pin-dot-halo {
    fill: rgba(255, 255, 255, 0.95);
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
    pointer-events: none;
  }
  .pin-dot {
    fill: #9b1c2c;
    stroke: #ffffff;
    stroke-width: 1.4;
    transition: fill 0.14s ease;
  }
  .pin.kind-treaty .pin-dot {
    fill: #b47412;
  }
  .pin.kind-city .pin-dot {
    fill: #1d4ed8;
  }
  .pin-halo {
    fill: rgba(255, 255, 255, 0.95);
    filter: drop-shadow(0 1.5px 3.5px rgba(0, 0, 0, 0.32));
  }
  .pin-circle {
    fill: #ffffff;
    stroke: #9b1c2c;
    stroke-width: 2.8;
    transition: fill 0.14s ease, stroke 0.14s ease, stroke-width 0.14s ease;
  }
  .pin.kind-treaty .pin-circle {
    stroke: #b47412;
  }
  .pin.kind-city .pin-circle {
    stroke: #1d4ed8;
  }
  .pin.clickable.state-idle:hover .pin-circle,
  .pin.clickable.state-idle:focus-visible .pin-circle {
    fill: #fef3c7;
    stroke-width: 3.6;
  }
  .pin.clickable.state-idle:hover .pin-leader,
  .pin.clickable.state-idle:focus-visible .pin-leader {
    stroke: #9b1c2c;
    stroke-width: 2.5;
  }
  .pin-num {
    fill: #18130e;
    font-family: var(--font-sans);
    font-weight: 800;
    pointer-events: none;
  }

  .pin.state-selected .pin-circle {
    fill: var(--accent);
    stroke: #ffffff;
    stroke-width: 2.8;
  }
  .pin.state-selected .pin-dot {
    fill: var(--accent);
  }
  .pin.state-selected .pin-leader {
    stroke: var(--accent);
    stroke-width: 2.5;
  }
  .pin.state-selected .pin-num {
    fill: #ffffff;
  }
  .pin.state-target .pin-circle {
    fill: #eab308;
    stroke: #1c1917;
    stroke-width: 2.8;
  }
  .pin.state-target .pin-dot {
    fill: #ca8a04;
  }
  .pin.state-target .pin-leader {
    stroke: #1c1917;
    stroke-width: 2.5;
  }
  .pin.state-target .pin-num {
    fill: #1c1917;
  }
  .pin.state-correct .pin-circle {
    fill: #15803d;
    stroke: #ffffff;
    stroke-width: 2.8;
  }
  .pin.state-correct .pin-dot {
    fill: #15803d;
  }
  .pin.state-correct .pin-leader {
    stroke: #15803d;
    stroke-width: 2.5;
  }
  .pin.state-correct .pin-num {
    fill: #ffffff;
  }
  .pin.state-wrong .pin-circle {
    fill: #b91c1c;
    stroke: #ffffff;
    stroke-width: 2.8;
  }
  .pin.state-wrong .pin-dot {
    fill: #b91c1c;
  }
  .pin.state-wrong .pin-leader {
    stroke: #b91c1c;
    stroke-width: 2.5;
  }
  .pin.state-wrong .pin-num {
    fill: #ffffff;
  }

  .pin-pulse {
    fill: rgba(234, 179, 8, 0.32);
    stroke: #eab308;
    stroke-width: 2.2;
    animation: pulse-ring 1.6s ease-in-out infinite;
  }
  .pin.state-correct .pin-pulse {
    fill: rgba(21, 128, 61, 0.26);
    stroke: #15803d;
    animation: none;
  }
  .pin.state-selected .pin-pulse {
    fill: color-mix(in srgb, var(--accent) 24%, transparent);
    stroke: var(--accent);
    animation: none;
  }
  @keyframes pulse-ring {
    0%, 100% { opacity: 0.95; transform: scale(0.9); }
    50% { opacity: 0.32; transform: scale(1.18); }
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    padding: 8px 12px;
    border-radius: var(--r-md);
    background: var(--surface);
    border: 1px solid var(--line);
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
  .leg-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    line-height: 1.3;
  }
  .leg-swatch {
    width: 20px;
    height: 3.5px;
    border-radius: 2px;
    background: var(--sw);
    flex: none;
  }
  .leg-swatch.dashed {
    background: repeating-linear-gradient(
      90deg,
      var(--sw) 0 6px,
      transparent 6px 10px
    );
  }

  .credit-line {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 12px;
    font-size: 11px;
    color: var(--ink-3);
    padding: 0 2px;
  }
  .credit-line .hint {
    font-style: italic;
  }
</style>
