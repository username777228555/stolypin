<script lang="ts">
  /**
   * «Слепые карты и визуальная атрибуция» — map-first olympiad cartography studio with 4 modes:
   *  1) «Атлас» — explore all 58 full-color historical maps (32 campaigns + 26 battle/siege plans)
   *     with toggleable blind mode, clickable pins, 5-second olympiad clues, and entity previews;
   *  2) «Точки» — blind pin-finding drill directly on the map (+ quick number buttons);
   *  3) «Схема» — full WSOSh/EGE 3-part blind-map exam (identify campaign + decode pin + 3 T/F statements);
   *  4) «Атрибуция» — visual attribution of real monuments, paintings, sculptures, and icons.
   */
  import { onMount } from 'svelte';
  import {
    Map as MapIcon,
    Eye,
    EyeOff,
    Target,
    Sparkles,
    Check,
    X,
    ArrowLeft,
    ArrowRight,
    RotateCcw,
    Shuffle,
    CircleCheck,
    ExternalLink,
    Compass,
    Search,
    Swords,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    SlidersHorizontal,
  } from '@lucide/svelte';
  import IconButton from '$lib/design/components/IconButton.svelte';
  import Card from '$lib/design/components/Card.svelte';
  import Button from '$lib/design/components/Button.svelte';
  import Badge from '$lib/design/components/Badge.svelte';
  import Segmented from '$lib/design/components/Segmented.svelte';
  import ProgressBar from '$lib/design/components/ProgressBar.svelte';
  import EntityPreview from '$lib/components/EntityPreview.svelte';
  import { kb } from '$lib/core/content/kb.svelte';
  import { kvGet, kvSet } from '$lib/core/db';
  import { logAnswer } from '$lib/core/mastery';
  import { record, saveResult } from '$lib/core/progress.svelte';
  import { haptic } from '$lib/core/platform';
  import { router } from '$lib/core/router.svelte';
  import { openSheet } from '$lib/core/ui.svelte';
  import MapCanvas from './MapCanvas.svelte';
  import AttributionPanel from './AttributionPanel.svelte';
  import {
    buildBlindCampaignRound,
    buildLocateQueue,
    filterMaps,
    findMapById,
    HISTORICAL_MAPS,
    mapScope,
    mapStats,
    scoreBlindCampaign,
    type BlindCampaignRound,
    type BlindMapPoint,
    type HistoricalMap,
    type MapProgressMap,
    type MapScope,
  } from './atlas';

  const KV_KEY = 'maps-progress-v1';
  type Mode = 'atlas' | 'locate' | 'blind' | 'attribution';

  const initialMode = (router.query.get('mode') as Mode | null) ?? 'atlas';
  let mode = $state<Mode>(
    ['atlas', 'locate', 'blind', 'attribution'].includes(initialMode) ? initialMode : 'atlas',
  );
  let periodFilter = $state<string | null>(router.query.get('period') || null);
  let scopeFilter = $state<MapScope | null>(null);
  let searchQuery = $state('');
  let progress = $state<MapProgressMap>({});

  // Collapsible drawers keep filters compact so the map starts immediately above the fold
  let catalogOpen = $state(false);
  let drillFiltersOpen = $state(false);

  const visibleMaps = $derived(
    filterMaps(HISTORICAL_MAPS, { period: periodFilter, scope: scopeFilter, query: searchQuery }),
  );
  const periodScopedMaps = $derived(
    filterMaps(HISTORICAL_MAPS, { period: periodFilter, query: searchQuery }),
  );
  const campaignCount = $derived(periodScopedMaps.filter((m) => mapScope(m) === 'campaign').length);
  const battleCount = $derived(periodScopedMaps.filter((m) => mapScope(m) === 'battle').length);
  const periodsWithMaps = $derived(
    kb.periods.filter((p) => HISTORICAL_MAPS.some((m) => m.period === p.id)),
  );
  const stats = $derived(mapStats(HISTORICAL_MAPS, progress));
  const hasActiveFilter = $derived(Boolean(periodFilter || scopeFilter || searchQuery.trim()));

  // ——— Mode 1: Atlas explore ———
  let activeMapId = $state<string>(router.query.get('map') || HISTORICAL_MAPS[0]!.id);
  let atlasBlind = $state(false);
  let selectedPointId = $state<string | null>(null);

  const activeMap = $derived(
    visibleMaps.find((m) => m.id === activeMapId) ??
      visibleMaps[0] ??
      findMapById(activeMapId) ??
      HISTORICAL_MAPS[0]!,
  );
  const activeMapIndex = $derived(
    Math.max(0, visibleMaps.findIndex((m) => m.id === activeMap.id)),
  );
  const selectedPoint = $derived(
    activeMap.points.find((p) => p.id === selectedPointId) ?? activeMap.points[0]!,
  );

  function selectMap(m: HistoricalMap, closeDrawer = false) {
    activeMapId = m.id;
    selectedPointId = m.points[0]?.id ?? null;
    if (closeDrawer) catalogOpen = false;
    if (mode === 'locate') startLocate(m);
  }

  function stepMap(delta: number) {
    if (visibleMaps.length <= 1) return;
    const nextIdx = (activeMapIndex + delta + visibleMaps.length) % visibleMaps.length;
    const next = visibleMaps[nextIdx];
    if (next) selectMap(next);
  }

  function applyFilterSelection(nextPeriod: string | null, nextScope: MapScope | null) {
    periodFilter = nextPeriod;
    scopeFilter = nextScope;
    const first = filterMaps(HISTORICAL_MAPS, {
      period: nextPeriod,
      scope: nextScope,
      query: searchQuery,
    })[0];
    if (first && !filterMaps(HISTORICAL_MAPS, { period: nextPeriod, scope: nextScope, query: searchQuery }).some((m) => m.id === activeMapId)) {
      activeMapId = first.id;
      selectedPointId = first.points[0]?.id ?? null;
      if (mode === 'locate') startLocate(first);
    }
  }

  function clearFilters() {
    periodFilter = null;
    scopeFilter = null;
    searchQuery = '';
  }

  // ——— Mode 2: Locate-on-map drill ———
  let locateQueue = $state<BlindMapPoint[]>([]);
  let locateIndex = $state(0);
  let locatePicked = $state<string | null>(null);
  let locateHits = $state(0);
  let locateDone = $state(false);

  const currentLocate = $derived(locateQueue[locateIndex]);

  function startLocate(map: HistoricalMap = activeMap) {
    activeMapId = map.id;
    locateQueue = buildLocateQueue(map);
    locateIndex = 0;
    locatePicked = null;
    locateHits = 0;
    locateDone = false;
    mode = 'locate';
  }

  function pickLocatePoint(pt: BlindMapPoint) {
    if (!currentLocate || locatePicked) return;
    locatePicked = pt.id;
    const ok = pt.id === currentLocate.id;
    if (ok) {
      locateHits++;
      haptic('success');
    } else {
      haptic('error');
    }
    logAnswer({
      period: activeMap.period,
      skill: 'dates',
      entity: currentLocate.entityId,
      type: 'single',
      score: ok ? 1 : 0,
      src: 'map-locate',
    });
  }

  async function nextLocateStep() {
    if (locateIndex + 1 < locateQueue.length) {
      locateIndex++;
      locatePicked = null;
      return;
    }
    locateDone = true;
    const ratio = locateQueue.length ? Math.round((locateHits / locateQueue.length) * 100) / 100 : 0;
    const xp = Math.max(10, Math.round(10 + ratio * 22));
    const prev = progress[activeMap.id];
    const nextProgress: MapProgressMap = {
      ...progress,
      [activeMap.id]: {
        locateBest: Math.max(prev?.locateBest ?? 0, ratio),
        blindSolved: Boolean(prev?.blindSolved),
        attempts: (prev?.attempts ?? 0) + 1,
        lastAt: Date.now(),
      },
    };
    progress = nextProgress;
    await kvSet(KV_KEY, nextProgress);
    await record({ xp, questions: locateQueue.length, correct: locateHits, games: 1 });
    await saveResult({ kind: 'game', ref: `map-locate:${activeMap.id}`, score: locateHits, total: locateQueue.length });
  }

  // ——— Mode 3: Blind campaign exam («Узнай схему») ———
  let blindRound = $state<BlindCampaignRound | undefined>();
  let pickedCampaignId = $state<string | null>(null);
  let pickedPointLabel = $state<string | null>(null);
  let statementAnswers = $state<Record<number, boolean>>({});
  let blindSubmitted = $state(false);

  function startBlindExam(excludeId?: string) {
    const pool = visibleMaps.length ? visibleMaps : HISTORICAL_MAPS;
    const candidates = pool.length > 1 && excludeId ? pool.filter((m) => m.id !== excludeId) : [...pool];
    const chosen = candidates[Math.floor(Math.random() * candidates.length)]!;
    blindRound = buildBlindCampaignRound(chosen, HISTORICAL_MAPS);
    pickedCampaignId = null;
    pickedPointLabel = null;
    statementAnswers = {};
    blindSubmitted = false;
    mode = 'blind';
  }

  function startBlindForMap(map: HistoricalMap) {
    blindRound = buildBlindCampaignRound(map, HISTORICAL_MAPS);
    pickedCampaignId = null;
    pickedPointLabel = null;
    statementAnswers = {};
    blindSubmitted = false;
    mode = 'blind';
  }

  const blindReadyToSubmit = $derived.by(() => {
    if (!blindRound) return false;
    return (
      pickedCampaignId !== null &&
      pickedPointLabel !== null &&
      blindRound.map.statements.every((_, i) => statementAnswers[i] !== undefined)
    );
  });

  const blindResult = $derived.by(() => {
    if (!blindRound || !blindSubmitted) return undefined;
    const campaignCorrect = pickedCampaignId === blindRound.map.id;
    const pointCorrect = pickedPointLabel === blindRound.targetPoint.label;
    let statementsCorrect = 0;
    blindRound.map.statements.forEach((st, i) => {
      if (statementAnswers[i] === st.correct) statementsCorrect++;
    });
    return {
      campaignCorrect,
      pointCorrect,
      statementsCorrect,
      statementsTotal: blindRound.map.statements.length,
      ...scoreBlindCampaign({
        campaignCorrect,
        pointCorrect,
        statementsCorrect,
        statementsTotal: blindRound.map.statements.length,
      }),
    };
  });

  async function submitBlindExam() {
    if (!blindRound || !blindReadyToSubmit || blindSubmitted) return;
    blindSubmitted = true;
    const res = blindResult!;
    haptic(res.score >= 0.7 ? 'success' : 'error');

    logAnswer({
      period: blindRound.map.period,
      skill: 'analysis',
      type: 'single',
      score: res.score,
      src: 'map-blind',
    });

    const prev = progress[blindRound.map.id];
    const nextProgress: MapProgressMap = {
      ...progress,
      [blindRound.map.id]: {
        locateBest: prev?.locateBest ?? 0,
        blindSolved: Boolean(prev?.blindSolved || res.score >= 0.7),
        attempts: (prev?.attempts ?? 0) + 1,
        lastAt: Date.now(),
      },
    };
    progress = nextProgress;
    await kvSet(KV_KEY, nextProgress);
    await record({
      xp: res.xp,
      questions: 2 + res.statementsTotal,
      correct: (res.campaignCorrect ? 1 : 0) + (res.pointCorrect ? 1 : 0) + res.statementsCorrect,
      quizzes: 1,
    });
    await saveResult({
      kind: 'quiz',
      ref: `map-blind:${blindRound.map.id}`,
      score: Math.round(res.score * 10),
      total: 10,
    });
  }

  onMount(async () => {
    progress = await kvGet<MapProgressMap>(KV_KEY, {});
    if (mode === 'locate') startLocate(activeMap);
    else if (mode === 'blind') startBlindExam();
  });

  $effect(() => {
    if (mode === 'locate' && locateQueue.length === 0) startLocate(activeMap);
    if (mode === 'blind' && !blindRound) startBlindExam();
  });

  function openEntity(id: string) {
    openSheet({ component: EntityPreview, props: { id, from: 'Исторические карты' } });
  }
</script>

{#snippet filterControls(compact: boolean)}
  <div class="cat-filters" class:compact>
    <label class="map-search">
      <Search size={14} class="ms-ico" />
      <input
        type="text"
        inputmode="search"
        bind:value={searchQuery}
        placeholder="Найти карту: Севастополь, Бородино, 1812…"
        aria-label="Поиск исторических карт"
      />
      {#if searchQuery}
        <button type="button" class="ms-clear" aria-label="Очистить поиск" onclick={() => (searchQuery = '')}>
          <X size={13} />
        </button>
      {/if}
    </label>

    <div class="scope-chips" role="group" aria-label="Тип карт">
      <button
        type="button"
        class="scope-pill"
        class:active={scopeFilter === null}
        onclick={() => applyFilterSelection(periodFilter, null)}
      >
        Все ({periodScopedMaps.length})
      </button>
      <button
        type="button"
        class="scope-pill"
        class:active={scopeFilter === 'campaign'}
        onclick={() => applyFilterSelection(periodFilter, scopeFilter === 'campaign' ? null : 'campaign')}
      >
        Кампании ({campaignCount})
      </button>
      <button
        type="button"
        class="scope-pill"
        class:active={scopeFilter === 'battle'}
        onclick={() => applyFilterSelection(periodFilter, scopeFilter === 'battle' ? null : 'battle')}
      >
        <Swords size={12} /> Битвы ({battleCount})
      </button>
    </div>

    <div class="period-row">
      <select
        class="period-select"
        aria-label="Фильтр по эпохе"
        value={periodFilter ?? ''}
        onchange={(e) => {
          const v = (e.currentTarget as HTMLSelectElement).value || null;
          applyFilterSelection(v, scopeFilter);
        }}
      >
        <option value="">Все эпохи ({HISTORICAL_MAPS.length})</option>
        {#each periodsWithMaps as p (p.id)}
          {@const cnt = HISTORICAL_MAPS.filter((m) => m.period === p.id).length}
          <option value={p.id}>{p.short} ({cnt})</option>
        {/each}
      </select>
      {#if hasActiveFilter}
        <button type="button" class="reset-link" onclick={clearFilters}>Сбросить</button>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet catalogList(closeOnPick: boolean)}
  {#if visibleMaps.length === 0}
    <div class="empty-list">
      <p class="muted small">По фильтру карты не найдены.</p>
      <Button size="sm" variant="secondary" onclick={clearFilters}>
        Показать все {HISTORICAL_MAPS.length} карт
      </Button>
    </div>
  {:else}
    <div class="map-list" role="listbox" aria-label="Список исторических карт">
      {#each visibleMaps as m (m.id)}
        {@const rec = progress[m.id]}
        {@const mp = kb.periodById.get(m.period)}
        {@const isBattle = mapScope(m) === 'battle'}
        {@const isActive = activeMap.id === m.id}
        <button
          type="button"
          role="option"
          aria-selected={isActive}
          class="map-item"
          class:active={isActive}
          style:--c={mp?.color ?? 'var(--accent)'}
          onclick={() => selectMap(m, closeOnPick)}
        >
          <span class="mi-top">
            <span class="mi-span">{m.span}</span>
            <span class="mi-flags">
              {#if isBattle}
                <Swords size={11} class="mt-battle" aria-label="План битвы" />
              {/if}
              {#if rec && (rec.locateBest >= 0.8 || rec.blindSolved)}
                <CircleCheck size={13} class="mt-ok" />
              {/if}
            </span>
          </span>
          <strong class="mi-title">{m.shortTitle}</strong>
        </button>
      {/each}
    </div>
  {/if}
{/snippet}

<div class="page maps-page">
  <!-- Compact 1-row top bar so the map begins immediately near the top of the viewport -->
  <header class="maps-topbar">
    <div class="tb-left">
      <IconButton
        icon={ArrowLeft}
        label="Назад"
        variant="glass"
        onclick={() => router.back(initialMode === 'atlas' ? '/explore' : '/practice')}
      />
      <div class="tb-title">
        <h1>{mode === 'atlas' ? 'Исторический атлас' : 'Слепые карты'}</h1>
        <span class="tb-stat num" title="Освоено карт">
          {stats.mastered}/{stats.total}
          {#if stats.blindSolved > 0}· схем: {stats.blindSolved}{/if}
        </span>
      </div>
    </div>

    <div class="tb-modes">
      <Segmented
        bind:value={mode}
        options={[
          { value: 'atlas', label: 'Атлас' },
          { value: 'locate', label: 'Точки' },
          { value: 'blind', label: 'Схема' },
          { value: 'attribution', label: 'Атрибуция' },
        ]}
      />
    </div>
  </header>

  {#if mode === 'atlas'}
    <!-- Compact mobile/tablet map switcher bar (replaces 3 stacked filter rows above the map) -->
    <div class="mobile-picker">
      <button
        type="button"
        class="step-btn"
        aria-label="Предыдущая карта"
        disabled={visibleMaps.length <= 1}
        onclick={() => stepMap(-1)}
      >
        <ChevronLeft size={17} />
      </button>
      <button
        type="button"
        class="picker-trigger"
        aria-expanded={catalogOpen}
        onclick={() => (catalogOpen = !catalogOpen)}
      >
        <span class="pt-idx num">
          {visibleMaps.length ? `${activeMapIndex + 1}/${visibleMaps.length}` : '0'}
        </span>
        <span class="pt-label">{activeMap.shortTitle}</span>
        {#if hasActiveFilter}
          <span class="filter-dot" aria-label="Применён фильтр"></span>
        {/if}
        <ChevronDown size={15} class={catalogOpen ? 'rot open' : 'rot'} />
      </button>
      <button
        type="button"
        class="step-btn"
        aria-label="Следующая карта"
        disabled={visibleMaps.length <= 1}
        onclick={() => stepMap(1)}
      >
        <ChevronRight size={17} />
      </button>
    </div>

    {#if catalogOpen}
      <div class="mobile-drawer">
        {@render filterControls(true)}
        {@render catalogList(true)}
      </div>
    {/if}

    {@const curPeriod = kb.periodById.get(activeMap.period)}
    <div class="atlas-workspace">
      <!-- Desktop left catalog sidebar (hidden on <960px where mobile-picker drawer handles selection) -->
      <aside class="atlas-sidebar" aria-label="Каталог карт">
        {@render filterControls(false)}
        {@render catalogList(false)}
      </aside>

      <!-- Main prominent map canvas + point inspection + olympiad clues -->
      <section class="atlas-main" style:--c={curPeriod?.color ?? 'var(--accent)'}>
        <div class="map-head">
          <div class="grow">
            <span class="eyebrow" style:color={curPeriod?.color ?? 'var(--accent)'}>
              {curPeriod?.short ?? ''} · {activeMap.span} · {mapScope(activeMap) === 'battle' ? 'План битвы' : 'Кампания'}
            </span>
            <h2 class="map-title">{activeMap.title}</h2>
          </div>
          <button
            type="button"
            class="blind-toggle"
            class:on={atlasBlind}
            aria-pressed={atlasBlind}
            onclick={() => (atlasBlind = !atlasBlind)}
          >
            {#if atlasBlind}<Eye size={14} /> Подписи{:else}<EyeOff size={14} /> Слепой вид{/if}
          </button>
        </div>

        <MapCanvas
          map={activeMap}
          blind={atlasBlind}
          allowHideMarkers={!atlasBlind}
          selectedId={selectedPoint?.id ?? null}
          onselect={(pt) => {
            haptic('tap');
            selectedPointId = pt.id;
          }}
        />

        <!-- Quick numbered pills to inspect points cleanly on touchscreens -->
        <div class="point-pills" aria-label="Объекты на карте">
          {#each activeMap.points as pt (pt.id)}
            <button
              type="button"
              class="pt-pill"
              class:active={selectedPoint?.id === pt.id}
              onclick={() => (selectedPointId = pt.id)}
            >
              <span class="pt-num">{pt.num}</span>
              <span>{atlasBlind ? `Объект ${pt.num}` : pt.label}</span>
            </button>
          {/each}
        </div>

        <!-- Selected point card -->
        {#if selectedPoint}
          <Card padding="md" class="point-card">
            <div class="row pc-head">
              <span class="pc-badge">{selectedPoint.num}</span>
              <div class="grow">
                <strong>{selectedPoint.label}</strong>
                {#if selectedPoint.year}<small class="muted">{selectedPoint.year}</small>{/if}
              </div>
              {#if selectedPoint.entityId && kb.get(selectedPoint.entityId)}
                <button type="button" class="link-pill" onclick={() => openEntity(selectedPoint.entityId!)}>
                  В базе <ExternalLink size={12} />
                </button>
              {/if}
            </div>
            <p class="pc-note">{selectedPoint.note}</p>
          </Card>
        {/if}

        <!-- 5-second olympiad clues -->
        <Card padding="md" class="clues-card">
          <span class="eyebrow"><Sparkles size={13} /> Как узнать карту на олимпиаде за 5 секунд</span>
          <p class="map-sum">{activeMap.summary}</p>
          <ul class="clue-list">
            {#each activeMap.clues as clue, i (i)}
              <li>{clue}</li>
            {/each}
          </ul>
          <div class="action-grid">
            <Button full icon={Target} onclick={() => startLocate(activeMap)}>Найти точки на карте</Button>
            <Button full variant="secondary" icon={Compass} onclick={() => startBlindForMap(activeMap)}>Проверить слепую схему</Button>
          </div>
        </Card>
      </section>
    </div>

  {:else if mode === 'locate'}
    <!-- Mode 2: Interactive blind pin-finding drill (2-column on desktop so map & prompt sit side by side) -->
    <div class="drill-workspace">
      <div class="drill-map-col">
        <div class="row drill-bar">
          <div class="grow">
            <span class="eyebrow">Покажи точку на слепой карте</span>
            <strong class="drill-map-name">{activeMap.title}</strong>
          </div>
          <div class="row drill-actions">
            <button
              type="button"
              class="mini-btn"
              class:on={drillFiltersOpen || hasActiveFilter}
              aria-expanded={drillFiltersOpen}
              onclick={() => (drillFiltersOpen = !drillFiltersOpen)}
            >
              <SlidersHorizontal size={13} /> Фильтр
            </button>
            <button
              type="button"
              class="mini-btn"
              onclick={() => {
                const pool = visibleMaps.length ? visibleMaps : HISTORICAL_MAPS;
                const others = pool.filter((m) => m.id !== activeMap.id);
                const nextM = others.length ? others[Math.floor(Math.random() * others.length)]! : activeMap;
                startLocate(nextM);
              }}
            >
              <Shuffle size={13} /> Другая
            </button>
          </div>
        </div>

        {#if drillFiltersOpen}
          <div class="inline-filters">
            {@render filterControls(true)}
          </div>
        {/if}

        {#if !locateDone && currentLocate}
          <!-- Mobile-only compact prompt banner directly above map -->
          <div class="mobile-prompt">
            <span class="mp-badge">Точка {locateIndex + 1}/{locateQueue.length}{#if currentLocate.year} · {currentLocate.year}{/if}</span>
            <p class="mp-text">{currentLocate.prompt}</p>
          </div>
        {/if}

        <MapCanvas
          map={activeMap}
          blind={!locatePicked}
          correctId={locatePicked ? currentLocate?.id ?? null : null}
          wrongId={locatePicked && currentLocate && locatePicked !== currentLocate.id ? locatePicked : null}
          interactive={!locateDone && !locatePicked}
          onselect={pickLocatePoint}
        />
      </div>

      <aside class="drill-side">
        <ProgressBar
          value={locateQueue.length ? (locateDone ? 1 : locateIndex / locateQueue.length) : 0}
          color="var(--accent)"
          height={6}
          label="Прогресс по точкам карты"
        />

        {#if locateDone}
          <Card tone="gold" padding="lg">
            <div class="stack done-box">
              <CircleCheck size={34} class="done-ico" />
              <h2 class="display">Карта пройдена: {locateHits} из {locateQueue.length}</h2>
              <p class="muted small">
                {locateHits === locateQueue.length
                  ? 'Безошибочная ориентировка по слепой карте!'
                  : 'Отличная тренировка! Можно пройти эту карту ещё раз или перейти к слепой атрибуции.'}
              </p>
              <div class="action-grid">
                <Button full icon={RotateCcw} onclick={() => startLocate(activeMap)}>Повторить карту</Button>
                <Button full variant="secondary" icon={Compass} onclick={() => startBlindForMap(activeMap)}>Узнай схему</Button>
              </div>
            </div>
          </Card>
        {:else if currentLocate}
          <Card padding="md" class="prompt-card desktop-prompt">
            <div class="row pr-top">
              <Badge tone="accent">Точка {locateIndex + 1} из {locateQueue.length}</Badge>
              {#if currentLocate.year}<span class="muted small num">{currentLocate.year}</span>{/if}
            </div>
            <p class="prompt-text">{currentLocate.prompt}</p>
            <p class="muted hint-line">Нажмите на цифру прямо на карте или на кнопку ниже.</p>
          </Card>

          <!-- Touch-friendly number pad so small phones never mis-tap -->
          <div class="num-pad" aria-label="Выбор номера объекта на карте">
            {#each activeMap.points as pt (pt.id)}
              {@const isRight = locatePicked !== null && pt.id === currentLocate.id}
              {@const isWrong = locatePicked === pt.id && pt.id !== currentLocate.id}
              <button
                type="button"
                class="num-btn"
                class:ok={isRight}
                class:bad={isWrong}
                disabled={locatePicked !== null}
                onclick={() => pickLocatePoint(pt)}
              >
                №{pt.num}
              </button>
            {/each}
          </div>

          {#if locatePicked}
            {@const ok = locatePicked === currentLocate.id}
            <Card padding="md" class={ok ? 'fb-card ok' : 'fb-card bad'}>
              <div class="row fb-head">
                {#if ok}<Check size={18} class="ico-ok" />{:else}<X size={18} class="ico-bad" />{/if}
                <strong>{ok ? 'Верно!' : `Правильный объект — №${currentLocate.num}: ${currentLocate.label}`}</strong>
              </div>
              <p class="fb-note">{currentLocate.note}</p>
              <Button full icon={ArrowRight} onclick={nextLocateStep}>
                {locateIndex + 1 < locateQueue.length ? 'Следующая точка' : 'Показать итог'}
              </Button>
            </Card>
          {/if}
        {/if}
      </aside>
    </div>

  {:else if mode === 'blind' && blindRound}
    <!-- Mode 3: Full WSOSh 3-part blind campaign exam (sticky map beside exam questions on desktop) -->
    <div class="blind-workspace">
      <div class="blind-map-col">
        <div class="row drill-bar">
          <div class="grow">
            <span class="eyebrow">Олимпиадная слепая схема</span>
            <strong class="drill-map-name">
              {blindSubmitted ? blindRound.map.title : 'Определите кампанию и объекты'}
            </strong>
          </div>
          <div class="row drill-actions">
            <button
              type="button"
              class="mini-btn"
              class:on={drillFiltersOpen || hasActiveFilter}
              aria-expanded={drillFiltersOpen}
              onclick={() => (drillFiltersOpen = !drillFiltersOpen)}
            >
              <SlidersHorizontal size={13} /> Фильтр
            </button>
            <button type="button" class="mini-btn" onclick={() => startBlindExam(blindRound?.map.id)}>
              <Shuffle size={13} /> Новая
            </button>
          </div>
        </div>

        {#if drillFiltersOpen}
          <div class="inline-filters">
            {@render filterControls(true)}
          </div>
        {/if}

        <MapCanvas
          map={blindRound.map}
          blind={!blindSubmitted}
          targetId={!blindSubmitted ? blindRound.targetPoint.id : null}
          correctId={blindSubmitted ? blindRound.targetPoint.id : null}
          interactive={false}
        />
      </div>

      <div class="blind-steps-col">
        <!-- Part 1: Identify campaign -->
        <Card padding="md" class="exam-step">
          <span class="eyebrow">Шаг 1 · Какая война или кампания изображена?</span>
          <div class="options">
            {#each blindRound.titleOptions as opt (opt.id)}
              {@const chosen = pickedCampaignId === opt.id}
              {@const right = opt.id === blindRound.map.id}
              <button
                type="button"
                class="opt"
                class:selected={!blindSubmitted && chosen}
                class:ok={blindSubmitted && right}
                class:bad={blindSubmitted && chosen && !right}
                disabled={blindSubmitted}
                onclick={() => (pickedCampaignId = opt.id)}
              >
                <span class="opt-txt">
                  <strong>{opt.label}</strong>
                  <small class="muted">{opt.span}</small>
                </span>
                {#if blindSubmitted && right}<Check size={16} class="ico-ok" />
                {:else if blindSubmitted && chosen && !right}<X size={16} class="ico-bad" />{/if}
              </button>
            {/each}
          </div>
        </Card>

        <!-- Part 2: Decode highlighted numbered pin -->
        <Card padding="md" class="exam-step">
          <span class="eyebrow">Шаг 2 · Какой объект выделен золотым кольцом (№{blindRound.targetPoint.num})?</span>
          <div class="options grid-2">
            {#each blindRound.pointOptions as lbl (lbl)}
              {@const chosen = pickedPointLabel === lbl}
              {@const right = lbl === blindRound.targetPoint.label}
              <button
                type="button"
                class="opt"
                class:selected={!blindSubmitted && chosen}
                class:ok={blindSubmitted && right}
                class:bad={blindSubmitted && chosen && !right}
                disabled={blindSubmitted}
                onclick={() => (pickedPointLabel = lbl)}
              >
                <strong>{lbl}</strong>
                {#if blindSubmitted && right}<Check size={16} class="ico-ok" />
                {:else if blindSubmitted && chosen && !right}<X size={16} class="ico-bad" />{/if}
              </button>
            {/each}
          </div>
        </Card>

        <!-- Part 3: 3 True/False statements -->
        <Card padding="md" class="exam-step">
          <span class="eyebrow">Шаг 3 · Верны ли суждения по схеме? (формат ВсОШ / ЕГЭ)</span>
          <div class="tf-list">
            {#each blindRound.map.statements as st, i (i)}
              {@const ans = statementAnswers[i]}
              {@const ok = blindSubmitted && ans === st.correct}
              {@const bad = blindSubmitted && ans !== st.correct}
              <div class="tf-item" class:ok class:bad>
                <p class="tf-text">{i + 1}. {st.text}</p>
                <div class="tf-btns">
                  <button
                    type="button"
                    class="tf-btn"
                    class:active={ans === true}
                    disabled={blindSubmitted}
                    onclick={() => (statementAnswers = { ...statementAnswers, [i]: true })}
                  >
                    Верно
                  </button>
                  <button
                    type="button"
                    class="tf-btn"
                    class:active={ans === false}
                    disabled={blindSubmitted}
                    onclick={() => (statementAnswers = { ...statementAnswers, [i]: false })}
                  >
                    Неверно
                  </button>
                </div>
                {#if blindSubmitted}
                  <p class="tf-exp">
                    <strong>{st.correct ? 'Верно.' : 'Неверно.'}</strong> {st.explain}
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        </Card>

        {#if !blindSubmitted}
          <Button full disabled={!blindReadyToSubmit} icon={Check} onclick={submitBlindExam}>
            Проверить ответы по схеме
          </Button>
        {:else if blindResult}
          <Card tone="gold" padding="lg">
            <div class="stack done-box">
              <CircleCheck size={32} class="done-ico" />
              <h2 class="display">Результат: {blindResult.percent}% (+{blindResult.xp} XP)</h2>
              <p class="muted small">
                Кампания: {blindResult.campaignCorrect ? 'верно' : 'ошибка'} ·
                Объект №{blindRound.targetPoint.num}: {blindResult.pointCorrect ? 'верно' : 'ошибка'} ·
                Суждения: {blindResult.statementsCorrect} из {blindResult.statementsTotal}
              </p>
              <ul class="clue-list left">
                {#each blindRound.map.clues as clue, i (i)}
                  <li>{clue}</li>
                {/each}
              </ul>
              <div class="action-grid">
                <Button full icon={ArrowRight} onclick={() => startBlindExam(blindRound?.map.id)}>Следующая схема</Button>
                <Button
                  full
                  variant="secondary"
                  icon={MapIcon}
                  onclick={() => {
                    if (blindRound) {
                      activeMapId = blindRound.map.id;
                      atlasBlind = false;
                      mode = 'atlas';
                    }
                  }}
                >
                  Открыть в атласе
                </Button>
              </div>
            </div>
          </Card>
        {/if}
      </div>
    </div>

  {:else}
    <!-- Mode 4: Visual monument/artwork attribution -->
    <div class="attribution-wrap">
      <AttributionPanel />
    </div>
  {/if}
</div>

<style>
  .maps-page {
    padding-top: calc(var(--safe-top) + var(--sp-2) + var(--winter-top-pad, 0px));
  }
  @media (min-width: 960px) {
    .maps-page {
      max-width: 1120px;
    }
  }

  /* Compact single-row header on desktop, 2 compact rows on mobile */
  .maps-topbar {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-bottom: var(--sp-2);
  }
  .tb-left {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-width: 0;
  }
  .tb-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    flex-wrap: wrap;
  }
  .tb-title h1 {
    font-size: var(--text-xl);
    line-height: 1.15;
    white-space: nowrap;
  }
  .tb-stat {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: var(--r-full);
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink-2);
    font-size: var(--text-xs);
    font-weight: 650;
    white-space: nowrap;
  }
  .tb-modes {
    width: 100%;
  }
  @media (max-width: 440px) {
    .tb-modes :global(.seg button) {
      font-size: var(--text-xs);
      padding: 0 3px;
    }
  }
  @media (min-width: 960px) {
    .maps-topbar {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-4);
      margin-bottom: var(--sp-3);
    }
    .tb-modes {
      width: auto;
      min-width: 390px;
      flex: none;
    }
  }

  /* Compact mobile map switcher + expandable drawer (< 960px) */
  .mobile-picker {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: var(--sp-2);
  }
  .step-btn {
    width: 36px;
    height: 36px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .step-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .picker-trigger {
    flex: 1;
    min-width: 0;
    height: 36px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 650;
    cursor: pointer;
    text-align: left;
  }
  .pt-idx {
    flex: none;
    padding: 2px 6px;
    border-radius: var(--r-xs);
    background: var(--surface-2);
    color: var(--accent);
    font-size: 11px;
    font-weight: 750;
  }
  .pt-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .filter-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    flex: none;
  }
  .picker-trigger :global(.rot) {
    flex: none;
    color: var(--ink-3);
    transition: transform 0.16s ease;
  }
  .picker-trigger :global(.rot.open) {
    transform: rotate(180deg);
  }

  .mobile-drawer {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    margin-bottom: var(--sp-3);
    border-radius: var(--r-lg);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    box-shadow: var(--shadow-2);
  }
  .mobile-drawer .map-list {
    max-height: 240px;
  }

  /* Desktop 2-column Atlas workspace */
  .atlas-workspace {
    display: block;
  }
  .atlas-sidebar {
    display: none;
  }
  @media (min-width: 960px) {
    .mobile-picker,
    .mobile-drawer {
      display: none;
    }
    .atlas-workspace {
      display: grid;
      grid-template-columns: 295px minmax(0, 1fr);
      gap: var(--sp-4);
      align-items: start;
    }
    .atlas-sidebar {
      position: sticky;
      top: var(--sp-3);
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      padding: var(--sp-3);
      border-radius: var(--r-lg);
      border: 1px solid var(--line);
      background: var(--surface);
      box-shadow: var(--shadow-1);
    }
  }

  /* Shared catalog filters & scrollable map list */
  .cat-filters {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .map-search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--surface-2);
    color: var(--ink-3);
  }
  .map-search:focus-within {
    border-color: var(--accent);
    background: var(--surface);
  }
  .map-search input {
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: var(--text-xs);
  }
  .map-search input::placeholder {
    color: var(--ink-3);
  }
  .ms-clear {
    border: none;
    background: transparent;
    color: var(--ink-3);
    padding: 2px;
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  .scope-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .scope-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 9px;
    border-radius: var(--r-full);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink-2);
    font: inherit;
    font-size: 11.5px;
    font-weight: 650;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
  }
  .scope-pill.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .period-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .period-select {
    flex: 1;
    min-width: 0;
    height: 32px;
    padding: 0 8px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
  }
  .reset-link {
    border: none;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 650;
    cursor: pointer;
    padding: 4px;
    white-space: nowrap;
  }

  .map-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    max-height: clamp(320px, 56dvh, 520px);
    overflow-y: auto;
    padding-right: 2px;
  }
  .map-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px 10px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
    border-left: 3px solid var(--c);
    background: var(--surface);
    color: var(--ink);
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition: border-color 0.14s ease, background 0.14s ease;
  }
  .map-item:hover {
    border-color: var(--c);
  }
  .map-item.active {
    border-color: var(--c);
    background: color-mix(in srgb, var(--c) 11%, var(--surface));
  }
  .mi-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 10.5px;
    color: var(--ink-3);
    font-weight: 650;
  }
  .mi-flags {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .map-item :global(.mt-battle) {
    color: var(--accent);
    opacity: 0.85;
  }
  .map-item :global(.mt-ok) {
    color: var(--success);
  }
  .mi-title {
    font-size: var(--text-xs);
    line-height: 1.28;
  }

  .empty-list {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 2px;
  }
  .empty-list p {
    margin: 0;
  }

  /* Main Atlas column */
  .atlas-main {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-bottom: var(--sp-6);
    min-width: 0;
  }
  .map-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
  }
  .map-head .grow {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .map-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(1.05rem, 2.2vw, 1.32rem);
    line-height: 1.2;
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .small {
    font-size: var(--text-sm);
    line-height: 1.45;
  }
  .blind-toggle,
  .mini-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 11px;
    border-radius: var(--r-full);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 650;
    cursor: pointer;
    white-space: nowrap;
    flex: none;
  }
  .blind-toggle.on,
  .mini-btn.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .point-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
  }
  .pt-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 5px;
    border-radius: var(--r-full);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
  }
  .pt-pill.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  }
  .pt-num {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--ink);
    font-weight: 800;
    font-size: 11px;
    display: grid;
    place-items: center;
  }
  .pt-pill.active .pt-num {
    background: var(--accent);
    color: #fff;
  }

  .pc-head {
    align-items: center;
    gap: var(--sp-2);
    margin-bottom: 6px;
  }
  .pc-head .grow {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .pc-badge {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-weight: 800;
    font-size: var(--text-sm);
    display: grid;
    place-items: center;
    flex: none;
  }
  .pc-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-2);
    line-height: 1.5;
  }
  .link-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: var(--r-full);
    border: 1px solid var(--line-strong);
    background: var(--surface-2);
    color: var(--accent);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 650;
    cursor: pointer;
  }

  .map-sum {
    margin: 6px 0 8px;
    font-size: var(--text-sm);
    color: var(--ink-2);
    line-height: 1.5;
  }
  .clue-list {
    margin: 0 0 var(--sp-3);
    padding-left: 1.15em;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--text-sm);
    line-height: 1.48;
  }
  .clue-list.left {
    text-align: left;
    width: 100%;
  }
  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    width: 100%;
  }

  /* Locate & Blind workspaces (side-by-side on desktop so the map is ALWAYS visible) */
  .drill-workspace,
  .blind-workspace {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding-bottom: var(--sp-6);
  }
  .drill-map-col,
  .blind-map-col,
  .drill-side,
  .blind-steps-col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-width: 0;
  }
  @media (min-width: 960px) {
    .drill-workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 335px;
      gap: var(--sp-4);
      align-items: start;
    }
    .blind-workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 375px;
      gap: var(--sp-4);
      align-items: start;
    }
    .drill-map-col,
    .blind-map-col {
      position: sticky;
      top: var(--sp-3);
    }
  }

  .inline-filters {
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--surface);
  }

  .drill-bar {
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
  }
  .drill-bar .grow {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .drill-actions {
    flex: none;
    gap: 6px;
  }
  .drill-map-name {
    font-family: var(--font-display);
    font-size: clamp(1rem, 2vw, 1.18rem);
    line-height: 1.22;
  }

  /* Compact prompt banner above map on mobile; full Card beside map on desktop */
  .mobile-prompt {
    padding: 8px 12px;
    border-radius: var(--r-md);
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-left: 3px solid var(--accent);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .mp-badge {
    font-size: 11px;
    font-weight: 750;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .mp-text {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1.35;
  }
  :global(.desktop-prompt) {
    display: none;
  }
  @media (min-width: 960px) {
    .mobile-prompt {
      display: none;
    }
    :global(.desktop-prompt) {
      display: block;
    }
  }

  .pr-top {
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .prompt-text {
    margin: 0 0 4px;
    font-family: var(--font-read);
    font-size: var(--text-md, 1rem);
    font-weight: 600;
    line-height: 1.45;
  }
  .hint-line {
    margin: 0;
    font-size: var(--text-xs);
  }

  .num-pad {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
    gap: 6px;
  }
  .num-btn {
    padding: 10px 6px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 750;
    cursor: pointer;
  }
  .num-btn:not(:disabled):hover {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  }
  .num-btn.ok {
    background: var(--success);
    border-color: var(--success);
    color: #fff;
  }
  .num-btn.bad {
    background: var(--danger);
    border-color: var(--danger);
    color: #fff;
  }

  .fb-head {
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .fb-note {
    margin: 0 0 var(--sp-3);
    font-size: var(--text-sm);
    color: var(--ink-2);
    line-height: 1.48;
  }
  :global(.fb-card.ok) {
    border-left: 4px solid var(--success);
  }
  :global(.fb-card.bad) {
    border-left: 4px solid var(--danger);
  }

  :global(.exam-step) {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
  }
  .options.grid-2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
  .opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 11px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    text-align: left;
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .opt-txt {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .opt-txt small {
    font-size: var(--text-xs);
  }
  .opt.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  }
  .opt.ok {
    border-color: var(--success);
    background: color-mix(in srgb, var(--success) 12%, var(--surface));
  }
  .opt.bad {
    border-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 11%, var(--surface));
  }
  :global(.ico-ok) {
    color: var(--success);
    flex: none;
  }
  :global(.ico-bad) {
    color: var(--danger);
    flex: none;
  }

  .tf-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 6px;
  }
  .tf-item {
    padding: 10px 12px;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .tf-item.ok {
    border-color: var(--success);
    background: color-mix(in srgb, var(--success) 8%, var(--surface-2));
  }
  .tf-item.bad {
    border-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 8%, var(--surface-2));
  }
  .tf-text {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.45;
  }
  .tf-btns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .tf-btn {
    padding: 7px 10px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 700;
    cursor: pointer;
  }
  .tf-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .tf-exp {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--ink-2);
    line-height: 1.45;
  }

  .done-box {
    align-items: center;
    text-align: center;
    --gap: var(--sp-2);
  }
  .done-box :global(.done-ico) {
    color: var(--success);
  }

  .attribution-wrap {
    max-width: 760px;
    margin: 0 auto;
  }
</style>
