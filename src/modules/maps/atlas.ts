/**
 * «Слепые карты и визуальная атрибуция» — 58 real full-color historical maps (IX–XX centuries):
 * 32 strategic campaign/war maps + 26 tactical battle & siege plans sourced from Wikimedia Commons
 * and stored locally in `public/content/maps/*.webp` for 100% offline use.
 * Every map carries visually calibrated (x%, y%) landmark dots, non-overlapping callout numbered
 * badges, blind-mode label/title masks, calibrated vector routes, 5-second clues, and WSOSh/EGE statements.
 */
import type { CultureItem } from '$lib/core/content/schema';
import { EXTRA_HISTORICAL_MAPS } from './atlas-extra';
import { BATTLE_HISTORICAL_MAPS } from './atlas-battles';

export type RouteStyle = 'russian' | 'enemy' | 'rebel' | 'retreat' | 'naval';
export type PointKind = 'city' | 'battle' | 'fortress' | 'treaty';
export type BadgeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'center';
export type MapScope = 'campaign' | 'battle';

/** Normalized percentage coordinate [x%, y%] in 0..100 relative to the map image dimensions. */
export type PctCoord = readonly [number, number];

/** Percentage bounding box covering a printed map title, legend, or city label in blind mode. */
export interface MapMask {
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: 'title' | 'label';
}

export interface MapRoute {
  label: string;
  style: RouteStyle;
  coords: readonly PctCoord[];
}

export interface BlindMapPoint {
  num: number;
  id: string;
  label: string;
  /** Calibrated exact landmark X coordinate (0..100%) on the real map image. */
  x: number;
  /** Calibrated exact landmark Y coordinate (0..100%) on the real map image. */
  y: number;
  /** Preferred offset direction for the numbered callout badge so it never covers the printed city name. */
  dir?: BadgeDir;
  kind: PointKind;
  year?: string;
  prompt: string;
  note: string;
  entityId?: string;
  /** Optional mask hiding the printed label of this landmark in blind mode. */
  mask?: MapMask;
}

export interface BadgeLayout {
  id: string;
  /** Exact landmark anchor X in SVG viewBox units. */
  px: number;
  /** Exact landmark anchor Y in SVG viewBox units. */
  py: number;
  /** Offset numbered badge center X in SVG viewBox units. */
  bx: number;
  /** Offset numbered badge center Y in SVG viewBox units. */
  by: number;
}

export interface MapStatement {
  text: string;
  correct: boolean;
  explain: string;
}

export interface HistoricalMap {
  id: string;
  title: string;
  shortTitle: string;
  period: string;
  /** Distinguishes broad war/campaign maps from tactical battle or siege plans. */
  scope?: MapScope;
  span: string;
  /** Local offline path to the real full-color historical map image in public/content/maps/. */
  image: string;
  /** Intrinsic image width in pixels. */
  width: number;
  /** Intrinsic image height in pixels. */
  height: number;
  /** Source / author attribution (Wikimedia Commons / historical atlas). */
  credit: string;
  license: string;
  /** Whether interactive vector route arrows are enabled by default in Atlas mode. */
  routesDefaultOn?: boolean;
  summary: string;
  clues: readonly string[];
  /** Masks hiding printed title/legend spoilers in blind mode. */
  blindMasks?: readonly MapMask[];
  routes: readonly MapRoute[];
  points: readonly BlindMapPoint[];
  statements: readonly MapStatement[];
}

export interface MapProgressRecord {
  locateBest: number;
  blindSolved: boolean;
  attempts: number;
  lastAt: number;
}

export type MapProgressMap = Record<string, MapProgressRecord>;

export interface AttributionItem {
  id: string;
  title: string;
  kind: CultureItem['kind'];
  period: string;
  year: number;
  author?: string;
  place?: string;
  summary: string;
  features: readonly string[];
  src: string;
}

export const ROUTE_LEGEND: Record<RouteStyle, { label: string; color: string; dashed?: boolean }> = {
  russian: { label: 'Походы / наступление русских войск', color: '#c81e32' },
  enemy: { label: 'Наступление противника', color: '#1d4ed8' },
  rebel: { label: 'Движение восставших / ополчения', color: '#d97706' },
  retreat: { label: 'Отступление / манёвр', color: '#6d28d9', dashed: true },
  naval: { label: 'Водный / морской путь', color: '#0e7490', dashed: true },
};

/**
 * Converts normalized percentage route points [x%, y%] into a smooth quadratic SVG path
 * inside the exact aspect-locked overlay viewBox (0..viewW, 0..viewH).
 */
export function smoothOverlayPath(
  coords: readonly PctCoord[],
  viewW: number,
  viewH: number,
): string {
  if (coords.length < 2) return '';
  const pts = coords.map(([px, py]) => ({
    x: Math.round((px / 100) * viewW * 10) / 10,
    y: Math.round((py / 100) * viewH * 10) / 10,
  }));
  if (pts.length === 2) {
    return `M ${pts[0]!.x} ${pts[0]!.y} L ${pts[1]!.x} ${pts[1]!.y}`;
  }
  const parts: string[] = [`M ${pts[0]!.x} ${pts[0]!.y}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = Math.round(((pts[i]!.x + pts[i + 1]!.x) / 2) * 10) / 10;
    const midY = Math.round(((pts[i]!.y + pts[i + 1]!.y) / 2) * 10) / 10;
    parts.push(`Q ${pts[i]!.x} ${pts[i]!.y} ${midX} ${midY}`);
  }
  const last = pts[pts.length - 1]!;
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(' ');
}

const DIR_VECTORS: Record<Exclude<BadgeDir, 'center'>, readonly [number, number]> = {
  ne: [0.74, -0.68],
  nw: [-0.74, -0.68],
  se: [0.74, 0.68],
  sw: [-0.74, 0.68],
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
};

const ALL_DIRS: readonly Exclude<BadgeDir, 'center'>[] = ['ne', 'nw', 'se', 'sw', 'n', 's', 'e', 'w'];

/**
 * Computes non-overlapping cartographic leader-line badge positions around exact landmark dots.
 * Keeps the small anchor dot dead-center on `(x%, y%)` while offsetting each compact numbered badge
 * away from printed city label masks, neighboring landmarks, other badges, and map borders.
 */
export function computeBadgeLayouts(
  points: readonly BlindMapPoint[],
  viewW: number,
  viewH: number,
  badgeR = 13,
): BadgeLayout[] {
  const margin = badgeR + 6;
  const dist = Math.max(28, badgeR * 2.35);
  const anchors = points.map((pt) => ({
    pt,
    px: Math.round((pt.x / 100) * viewW * 10) / 10,
    py: Math.round((pt.y / 100) * viewH * 10) / 10,
  }));

  const labelBoxes = points
    .filter((p) => p.mask)
    .map((p) => ({
      x1: (p.mask!.x / 100) * viewW,
      y1: (p.mask!.y / 100) * viewH,
      x2: ((p.mask!.x + p.mask!.w) / 100) * viewW,
      y2: ((p.mask!.y + p.mask!.h) / 100) * viewH,
    }));

  const placed: BadgeLayout[] = [];

  for (let i = 0; i < anchors.length; i++) {
    const { pt, px, py } = anchors[i]!;
    if (pt.dir === 'center') {
      placed.push({ id: pt.id, px, py, bx: px, by: py });
      continue;
    }

    let bestBx = Math.max(margin, Math.min(viewW - margin, px));
    let bestBy = Math.max(margin, Math.min(viewH - margin, py - dist));
    let bestPenalty = Infinity;

    for (const d of ALL_DIRS) {
      const [ux, uy] = DIR_VECTORS[d];
      const cx = px + ux * dist;
      const cy = py + uy * dist;

      let penalty = pt.dir === d ? -25 : 0;

      // Stay strictly inside the map frame
      if (cx < margin || cx > viewW - margin || cy < margin || cy > viewH - margin) {
        penalty += 10_000;
      }

      // Avoid overlapping any already-placed numbered badges
      for (const prev of placed) {
        const gap = Math.hypot(cx - prev.bx, cy - prev.by);
        const minGap = badgeR * 2.35;
        if (gap < minGap) penalty += 2_500 + (minGap - gap) * 60;
      }

      // Avoid covering any other landmark's anchor dot
      for (let j = 0; j < anchors.length; j++) {
        if (j === i) continue;
        const gap = Math.hypot(cx - anchors[j]!.px, cy - anchors[j]!.py);
        const minDotGap = badgeR * 1.65;
        if (gap < minDotGap) penalty += 600 + (minDotGap - gap) * 35;
      }

      // Avoid covering printed city label boxes on the raster map
      for (const box of labelBoxes) {
        const nearestX = Math.max(box.x1, Math.min(cx, box.x2));
        const nearestY = Math.max(box.y1, Math.min(cy, box.y2));
        const dBox = Math.hypot(cx - nearestX, cy - nearestY);
        if (dBox < badgeR * 0.9) penalty += 140 + (badgeR - dBox) * 12;
      }

      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestBx = Math.max(margin, Math.min(viewW - margin, Math.round(cx * 10) / 10));
        bestBy = Math.max(margin, Math.min(viewH - margin, Math.round(cy * 10) / 10));
      }
    }

    placed.push({ id: pt.id, px, py, bx: bestBx, by: bestBy });
  }

  // Final micro-separation pass so even tightly clustered historic regions never overlap badges
  const minSep = badgeR * 2.25;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const dx = b.bx - a.bx;
        const dy = b.by - a.by;
        const d = Math.hypot(dx, dy);
        if (d < minSep) {
          const push = (minSep - d) / 2 + 1;
          const nx = d > 0.01 ? dx / d : 1;
          const ny = d > 0.01 ? dy / d : 0;
          a.bx = Math.max(margin, Math.min(viewW - margin, Math.round((a.bx - nx * push) * 10) / 10));
          a.by = Math.max(margin, Math.min(viewH - margin, Math.round((a.by - ny * push) * 10) / 10));
          b.bx = Math.max(margin, Math.min(viewW - margin, Math.round((b.bx + nx * push) * 10) / 10));
          b.by = Math.max(margin, Math.min(viewH - margin, Math.round((b.by + ny * push) * 10) / 10));
        }
      }
    }
  }

  return placed;
}

const CORE_HISTORICAL_MAPS: readonly HistoricalMap[] = [
  {
    id: 'map-varangians',
    title: 'Торговые пути и походы первых князей (IX–X вв.)',
    shortTitle: 'Первые князья (IX–X вв.)',
    period: 'ancient',
    span: '882–988',
    image: '/content/maps/varangians.webp',
    width: 1180,
    height: 1280,
    credit: 'Nikolay Omonov / Wikimedia Commons',
    license: 'CC0',
    routesDefaultOn: false,
    summary:
      'Складывание Древнерусского государства вдоль двух главных водных магистралей — пути «из варяг в греки» и Волжского пути, походы Олега на Киев и Царьград, разгром Святославом Хазарии и взятие Корсуни Владимиром.',
    clues: [
      'Две яркие торговые дуги из Новгорода: фиолетовая вниз по Днепру к Чёрному морю («из варяг в греки») и красная по Волге к Булгару и Итилю.',
      'На карте отмечены восточнославянские племена (поляне, словене, кривичи, вятичи) и соседи — печенеги, хазары, Волжская Булгария.',
    ],
    blindMasks: [{ x: 43, y: 0, w: 57, h: 27, kind: 'title' }],
    routes: [
      {
        label: 'Путь «из варяг в греки» (Новгород → Смоленск → Киев → Чёрное море)',
        style: 'naval',
        coords: [[36.5, 32.0], [33.9, 37.8], [30.5, 47.0], [33.0, 53.0], [28.0, 62.0], [27.2, 70.4], [39.5, 80.5], [22.0, 91.0], [16.5, 98.5]],
      },
      {
        label: 'Восточный поход Святослава (964–966): Булгар → Итиль → Белая Вежа',
        style: 'russian',
        coords: [[27.2, 70.4], [46.0, 59.5], [63.0, 50.0], [76.3, 51.4], [70.0, 74.0], [78.5, 87.8], [60.9, 82.8]],
      },
    ],
    points: [
      { num: 1, id: 'novgorod', label: 'Новгород', x: 33.9, y: 37.8, dir: 'w', kind: 'city', year: '862', prompt: 'Северный центр земли словен на Волхове, откуда Олег в 882 г. выступил на Киев.', note: 'Крупнейший торговый центр на севере пути «из варяг в греки».', mask: { x: 35.0, y: 36.2, w: 9.5, h: 2.6 } },
      { num: 2, id: 'smolensk', label: 'Смоленск', x: 33.0, y: 53.0, dir: 'sw', kind: 'city', year: '882', prompt: 'Центр кривичей в верховьях Днепра, взятый Олегом по пути из Новгорода в Киев.', note: 'Контролировал ключевой волок между Западной Двиной и Днепром.', mask: { x: 33.2, y: 51.0, w: 8.5, h: 2.2 } },
      { num: 3, id: 'kiev', label: 'Киев', x: 27.2, y: 70.4, dir: 'sw', kind: 'city', year: '882', prompt: '«Мать городов русских» в земле полян — столица, объединённая Олегом с Новгородом.', note: 'Отсюда совершались походы на Царьград, Хазарию и Дунай.', mask: { x: 28.0, y: 69.2, w: 5.5, h: 2.4 } },
      { num: 4, id: 'bulgar', label: 'Булгар', x: 76.3, y: 51.4, dir: 'nw', kind: 'city', year: '965', prompt: 'Торговый центр Волжской Булгарии на слиянии Волги и Камы — важный узел Волжского пути.', note: 'Пострадал во время восточного похода Святослава Игоревича.', mask: { x: 76.8, y: 51.4, w: 6.0, h: 2.2 } },
      { num: 5, id: 'sarkel', label: 'Белая Вежа (Саркел)', x: 60.9, y: 82.8, dir: 'ne', kind: 'fortress', year: '965', prompt: 'Хазарская крепость на Дону, взятая Святославом и ставшая русским форпостом.', note: 'Контролировала Волго-Донскую переволоку.', entityId: 'e-razgrom-hazarskogo-kaganata', mask: { x: 58.5, y: 83.6, w: 8.0, h: 2.0 } },
      { num: 6, id: 'itil', label: 'Итиль', x: 78.5, y: 87.8, dir: 'ne', kind: 'fortress', year: '965', prompt: 'Столица Хазарского каганата в дельте Волги, разгромленная Святославом.', note: 'Разгром Хазарии открыл южные степи для печенегов.', entityId: 'e-razgrom-hazarskogo-kaganata', mask: { x: 71.5, y: 86.8, w: 6.5, h: 2.4 } },
      { num: 7, id: 'korsun', label: 'Херсон (Корсунь)', x: 34.5, y: 94.3, dir: 'ne', kind: 'treaty', year: '988', prompt: 'Византийский город на юго-западе Крыма, осада которого князем Владимиром связана с Крещением Руси.', note: 'По летописной традиции здесь Владимир принял крещение и женился на царевне Анне.', entityId: 'e-osada-korsuni-988', mask: { x: 26.2, y: 93.0, w: 6.8, h: 3.4 } },
    ],
    statements: [
      { text: 'В результате восточного похода князя Святослава была разгромлена столица Хазарии, обозначенная цифрой 6.', correct: true, explain: 'Под цифрой 6 — Итиль, столица Хазарского каганата, взятая Святославом в 965 г.' },
      { text: 'Город, обозначенный цифрой 1, располагался в земле племенного союза полян.', correct: false, explain: 'Под цифрой 1 — Новгород (ильменские словене); центром полян был Киев (цифра 3).' },
      { text: 'С осадой города под цифрой 7 летописи связывают принятие христианства князем Владимиром в 988 году.', correct: true, explain: 'Под цифрой 7 — Херсонес Таврический (Корсунь) в Крыму.' },
    ],
  },
  {
    id: 'map-batu',
    title: 'Русь накануне и в годы нашествия Батыя (1237–1240)',
    shortTitle: 'Нашествие Батыя (1237–1240)',
    period: 'udel',
    span: '1237–1240',
    image: '/content/maps/batu.webp',
    width: 1180,
    height: 1280,
    credit: 'Hellerick / Wikimedia Commons',
    license: 'CC BY-SA 3.0',
    routesDefaultOn: true,
    summary:
      'Политическая раздробленность русских земель к 1237 году и два опустошительных похода Батыя: зимний удар по Северо-Восточной Руси (Рязань, Владимир, Торжок, Козельск) и южный поход 1239–1240 гг. на Чернигов и Киев.',
    clues: [
      'Русь поделена на цветные удельные княжества (Новгородская земля, Владимиро-Суздальское, Черниговское, Галицко-Волынское) — карта эпохи раздробленности перед 1237 г.',
      'Стрелка нашествия резко поворачивает на юг после Торжка, не доходя ~100 вёрст до Новгорода.',
    ],
    routes: [
      {
        label: 'Поход Батыя на Северо-Восточную Русь (1237–1238)',
        style: 'enemy',
        coords: [[76.5, 51.5], [64.0, 55.5], [55.2, 55.6], [48.0, 51.5], [54.8, 48.2], [47.5, 42.5], [41.8, 44.5], [41.5, 57.5], [55.0, 74.0]],
      },
      {
        label: 'Поход на Южную Русь и Киев (1239–1240)',
        style: 'enemy',
        coords: [[55.0, 74.0], [40.0, 67.0], [30.5, 65.5], [27.5, 70.5], [10.0, 73.0]],
      },
    ],
    points: [
      { num: 1, id: 'ryazan', label: 'Рязань', x: 55.2, y: 55.6, kind: 'battle', year: 'дек. 1237', prompt: 'Первый русский город, принявший удар войска Батыя в декабре 1237 года.', note: 'Пал после шестидневного штурма; подвиг Евпатия Коловрата.', entityId: 'e-razorenie-ryazani-1237', mask: { x: 55.8, y: 55.2, w: 8.0, h: 2.4 } },
      { num: 2, id: 'vladimir', label: 'Владимир', x: 54.8, y: 48.2, kind: 'battle', year: 'фев. 1238', prompt: 'Столица Северо-Восточной Руси, взятая штурмом 7 февраля 1238 года.', note: 'Князь Юрий Всеволодович в это время собирал войско на реке Сити.', entityId: 'e-vzyatie-vladimira-1238', mask: { x: 54.5, y: 46.2, w: 10.5, h: 2.5 } },
      { num: 3, id: 'torzhok', label: 'Торжок', x: 41.8, y: 44.5, kind: 'fortress', year: 'март 1238', prompt: 'Новгородский пригород, двухнедельная оборона которого задержала Батыя перед весенней распутицей.', note: 'После Торжка монголы повернули на юг у Игнач-креста, не дойдя до Новгорода.', mask: { x: 39.2, y: 42.6, w: 6.0, h: 2.0 } },
      { num: 4, id: 'kozelsk', label: 'Козельск', x: 41.5, y: 57.5, kind: 'fortress', year: 'весна 1238', prompt: 'Небольшой город Черниговской земли, державший 7-недельную осаду и прозванный «Злым городом».', note: 'Оборону возглавлял малолетний князь Василий.', entityId: 'e-oborona-kozelska', mask: { x: 39.2, y: 55.5, w: 6.5, h: 2.0 } },
      { num: 5, id: 'chernigov', label: 'Чернигов', x: 30.5, y: 65.5, kind: 'battle', year: 'окт. 1239', prompt: 'Крупный южнорусский центр на Десне, взятый войсками Батыя на пути к Киеву.', note: 'Защитники отчаянно сражались у городских стен и в детинце.', mask: { x: 31.0, y: 64.2, w: 9.0, h: 2.2 } },
      { num: 6, id: 'kiev', label: 'Киев', x: 27.5, y: 70.5, kind: 'battle', year: 'дек. 1240', prompt: 'Древняя столица Руси, обороной которой руководил воевода Дмитр в конце 1240 года.', note: 'Последний очаг обороны — Десятинная церковь.', entityId: 'e-vzyatie-kieva-1240', mask: { x: 22.0, y: 69.5, w: 5.5, h: 2.4 } },
      { num: 7, id: 'novgorod', label: 'Новгород', x: 34.0, y: 38.0, kind: 'city', year: '1238', prompt: 'Крупнейший северный центр Руси, избежавший прямого разорения Батыем благодаря распутице.', note: 'Позднее всё равно признал зависимость от Орды и перепись.', mask: { x: 35.0, y: 36.2, w: 9.5, h: 2.6 } },
    ],
    statements: [
      { text: 'Город, обозначенный цифрой 7, избежал прямого разорения в ходе нашествия 1237–1238 годов.', correct: true, explain: 'Новгород не был взят: весной 1238 г. Батый повернул на юг у Игнач-креста после осады Торжка.' },
      { text: 'Город под цифрой 4 летописи и сам хан Батый прозвали «Злым городом» за семинедельную оборону.', correct: true, explain: 'Под цифрой 4 — Козельск (весна 1238 г.).' },
      { text: 'Походы, показанные на схеме, возглавлял хан Тохтамыш в конце XIV века.', correct: false, explain: 'Нашествие 1237–1240 гг. возглавлял хан Батый; Тохтамыш сжёг Москву в 1382 году.' },
    ],
  },
  {
    id: 'map-moscow-rise',
    title: 'Рост Московского княжества и собирание земель (1300–1462)',
    shortTitle: 'Возвышение Москвы (1300–1462)',
    period: 'udel',
    span: '1300–1462',
    image: '/content/maps/moscow-rise.webp',
    width: 1280,
    height: 1068,
    credit: 'Ю. Б. Коряков / Wikimedia Commons',
    license: 'CC BY-SA 3.0',
    routesDefaultOn: false,
    summary:
      'Поэтапное расширение Московского княжества от небольшого удела Даниила Александровича (Коломна 1301, Переяславль 1302, Можайск 1303) через «купли» Ивана Калиты и присоединение Нижнего Новгорода Василием I до рубежей начала правления Ивана III.',
    clues: [
      'Концентрические оттенки зелёного и жёлтого вокруг Москвы с датами 1301, 1302, 1303, 1362–1389, 1393 — классическая схема роста Московского княжества.',
      'На северо-западе — Новгородская республика и Тверь, на западе — Великое княжество Литовское со Смоленском, на востоке — Казанское ханство (с 1438 г.).',
    ],
    blindMasks: [
      { x: 0, y: 0, w: 54, h: 5.5, kind: 'title' },
      { x: 0, y: 5.2, w: 29.5, h: 39.5, kind: 'title' },
    ],
    routes: [
      {
        label: 'Восточное направление: Владимир → Нижний Новгород (1392)',
        style: 'russian',
        coords: [[43.2, 76.2], [58.5, 71.2], [78.5, 69.0]],
      },
      {
        label: 'Северные приобретения: Ярославль, Галич и Белоозеро',
        style: 'russian',
        coords: [[43.2, 76.2], [55.5, 53.0], [69.5, 43.8], [55.5, 32.0]],
      },
    ],
    points: [
      { num: 1, id: 'moscow', label: 'Москва', x: 43.2, y: 76.2, kind: 'city', year: '1300', prompt: 'Вотчина Даниила Александровича и центр собирания Северо-Восточной Руси.', note: 'К 1303 г. присоединила всё течение Москвы-реки (Коломну и Можайск).', mask: { x: 42.5, y: 72.5, w: 9.5, h: 3.5 } },
      { num: 2, id: 'tver', label: 'Тверь', x: 33.5, y: 62.6, kind: 'city', year: '1317–1485', prompt: 'Главный соперник Москвы в борьбе за ярлык на великое княжение в XIV веке.', note: 'Присоединена окончательно только при Иване III в 1485 году.', mask: { x: 33.8, y: 59.5, w: 7.0, h: 3.2 } },
      { num: 3, id: 'vladimir', label: 'Владимир', x: 58.5, y: 71.2, kind: 'city', year: '1328 / 1389', prompt: 'Столица великого княжества, закреплённая Дмитрием Донским за Москвой по завещанию 1389 года.', note: 'С Ивана Калиты ярлык на великое княжение почти постоянно оставался у московских князей.', mask: { x: 53.5, y: 71.2, w: 10.5, h: 3.2 } },
      { num: 4, id: 'nizhny', label: 'Нижний Новгород', x: 78.5, y: 69.0, kind: 'city', year: '1392', prompt: 'Волжский центр, присоединённый к Москве Василием I с помощью ордынского ярлыка.', note: 'Открыл Москве прямой контроль над слиянием Оки и Волги.', mask: { x: 78.2, y: 65.5, w: 11.0, h: 6.5 } },
      { num: 5, id: 'yaroslavl', label: 'Ярославль', x: 55.5, y: 53.0, kind: 'city', year: '1463', prompt: 'Верхневолжское княжество, долго сохранявшее автономию и присоединённое в начале правления Ивана III.', note: 'Ярославские князья перешли на московскую службу.', mask: { x: 55.0, y: 53.5, w: 10.5, h: 3.2 } },
      { num: 6, id: 'smolensk', label: 'Смоленск', x: 11.8, y: 87.2, kind: 'fortress', year: '1404', prompt: 'Западный русский город, захваченный Витовтом и вошедший в Великое княжество Литовское.', note: 'Возвращён в состав Русского государства Василием III лишь в 1514 году.', mask: { x: 12.5, y: 85.2, w: 10.0, h: 3.2 } },
      { num: 7, id: 'ryazan', label: 'Переяславль-Рязанский', x: 55.0, y: 89.2, kind: 'city', year: '1521', prompt: 'Столица самостоятельного Рязанского княжества, остававшегося независимым от Москвы до 1521 года.', note: 'Последнее присоединённое княжество Северо-Восточной Руси (при Василии III).', mask: { x: 49.0, y: 89.8, w: 15.0, h: 6.5 } },
    ],
    statements: [
      { text: 'Город под цифрой 4 был присоединён к Московскому княжеству при сыне Дмитрия Донского — Василии I в 1392 году.', correct: true, explain: 'Василий I получил ярлык на Нижегородское княжество в Орде в 1392 г.' },
      { text: 'Город под цифрой 2 являлся главным соперником Москвы в борьбе за великое княжение Владимирское в XIV веке.', correct: true, explain: 'Тверские и московские князья вели ожесточённую борьбу за ярлык (Бортенево 1317, восстание 1327 г.).' },
      { text: 'К 1462 году в состав Московского княжества уже вошли и Тверь (цифра 2), и Переяславль-Рязанский (цифра 7).', correct: false, explain: 'Тверь была присоединена в 1485 г. (Иван III), а Рязань — в 1521 г. (Василий III).' },
    ],
  },
  {
    id: 'map-livonian',
    title: 'Ливонская война Ивана Грозного (1558–1583)',
    shortTitle: 'Ливонская война (1558–1583)',
    period: 'muscovy',
    span: '1558–1583',
    image: '/content/maps/livonian.webp',
    width: 1115,
    height: 1280,
    credit: 'Ю. Б. Коряков / Wikimedia Commons',
    license: 'CC BY-SA 3.0',
    routesDefaultOn: false,
    summary:
      '25-летняя борьба Русского царства за выход к Балтийскому морю: взятие Нарвы, Дерпта и Полоцка, распад Ливонского ордена, вступление Речи Посполитой и Швеции, героическая оборона Пскова от Стефана Батория и тяжёлые Ям-Запольское (1582) и Плюсское (1583) перемирия.',
    clues: [
      'Русскоязычная цветная карта Восточной Прибалтики: сиреневые земли отошли Швеции по Плюсскому перемирию (1583), розовые — Речи Посполитой по Ям-Запольскому (1582).',
      'Ключевые ориентиры: Ревель, Ямбург, Дерпт, Псков, Рига, Полоцк и Смоленск.',
    ],
    blindMasks: [
      { x: 0, y: 0, w: 100, h: 4.5, kind: 'title' },
      { x: 0, y: 4.5, w: 46, h: 23, kind: 'title' },
    ],
    routes: [
      {
        label: 'Наступление войск Ивана IV в Ливонию и на Полоцк (1558–1577)',
        style: 'russian',
        coords: [[80.8, 47.2], [58.5, 56.0], [45.5, 49.0], [30.3, 35.1]],
      },
      {
        label: 'Поход Стефана Батория на Полоцк и осада Пскова (1579–1581)',
        style: 'enemy',
        coords: [[34.0, 93.0], [61.5, 84.5], [59.5, 76.0], [58.5, 56.0]],
      },
    ],
    points: [
      { num: 1, id: 'reval', label: 'Ревель (Таллин)', x: 30.3, y: 35.1, dir: 'se', kind: 'fortress', year: '1570, 1577', prompt: 'Шведская крепость на Финском заливе, которую русские войска дважды безуспешно осаждали.', note: 'Удержание Ревеля позволило Швеции закрепиться в Эстляндии.', mask: { x: 21.0, y: 32.0, w: 11.0, h: 3.0 } },
      { num: 2, id: 'yamburg', label: 'Ям (Ямбург)', x: 60.2, y: 35.9, dir: 'se', kind: 'treaty', year: '1583', prompt: 'Русская крепость на подступах к Финскому заливу, уступленная Швеции вместе с Копорьем и Ивангородом по Плюсскому перемирию.', note: 'Потеря этих крепостей фактически отрезала Россию от Балтики до Петра I.', entityId: 'e-livonskaya-voyna', mask: { x: 58.0, y: 32.8, w: 10.0, h: 2.8 } },
      { num: 3, id: 'dorpat', label: 'Дерпт (Юрьев)', x: 45.5, y: 49.0, dir: 'sw', kind: 'fortress', year: 'июль 1558', prompt: 'Бывший древнерусский Юрьев — центр епископства, взятый в первый год Ливонской войны.', note: 'Поводом к войне послужила неуплата «юрьевской дани».', entityId: 'e-livonskaya-voyna', mask: { x: 38.0, y: 45.8, w: 9.0, h: 2.8 } },
      { num: 4, id: 'pskov', label: 'Псков', x: 58.5, y: 56.0, dir: 'sw', kind: 'fortress', year: '1581–1582', prompt: 'Русская крепость, пятимесячная оборона которой под руководством И. П. Шуйского остановила Батория.', note: 'Привела к Ям-Запольскому перемирию 1582 года.', entityId: 'e-oborona-pskova-1581', mask: { x: 59.0, y: 54.5, w: 8.5, h: 2.8 } },
      { num: 5, id: 'riga', label: 'Рига', x: 24.2, y: 66.8, dir: 'ne', kind: 'city', year: '1561 / 1581', prompt: 'Крупнейший порт в устье Западной Двины, перешедший под власть Речи Посполитой.', note: 'Один из главных торговых узлов Восточной Балтики.', mask: { x: 18.0, y: 64.2, w: 7.5, h: 2.6 } },
      { num: 6, id: 'polotsk', label: 'Полоцк', x: 61.5, y: 84.5, dir: 'sw', kind: 'battle', year: '1563, 1579', prompt: 'Мощная литовская крепость на Западной Двине — главный успех Ивана IV (1563), отбитый Баторием в 1579 г.', note: 'Взятие Полоцка 1563 г. стало пиком военных успехов России в войне.', entityId: 'e-livonskaya-voyna', mask: { x: 52.5, y: 84.5, w: 10.5, h: 2.8 } },
      { num: 7, id: 'smolensk', label: 'Смоленск', x: 86.8, y: 92.6, dir: 'nw', kind: 'city', year: '1558–1583', prompt: 'Важнейшая западная крепость Русского царства, сохранённая Россией по итогам войны.', note: 'Оставалась щитом на московском направлении до Смутного времени.', mask: { x: 82.0, y: 92.5, w: 13.5, h: 2.8 } },
    ],
    statements: [
      { text: 'Героическая оборона крепости под цифрой 4 в 1581–1582 годах под руководством И. П. Шуйского спасла Россию от полного поражения.', correct: true, explain: 'Пятимесячная осада Пскова заставила Стефана Батория заключить Ям-Запольское перемирие.' },
      { text: 'Взятие крепости под цифрой 6 в 1563 году стало крупнейшим военным успехом Ивана IV в этой войне.', correct: true, explain: 'Под цифрой 6 — Полоцк, взятый в феврале 1563 г. и потерянный в 1579 г.' },
      { text: 'По итогам Плюсского перемирия 1583 года Россия закрепила за собой крепости под цифрами 1 и 2.', correct: false, explain: 'Наоборот: Россия потеряла и Ревель (1), и Ям (2), Копорье, Ивангород и Нарву.' },
    ],
  },
  {
    id: 'map-smuta',
    title: 'Россия в Смутное время и поход Второго ополчения (1604–1613)',
    shortTitle: 'Смута и ополчения (1604–1613)',
    period: 'c17',
    span: '1604–1613',
    image: '/content/maps/smuta.webp',
    width: 1067,
    height: 1280,
    credit: 'Е. Е. Замысловский (исторический атлас, XIX в.)',
    license: 'Public domain',
    routesDefaultOn: true,
    summary:
      'Русское государство к 1610 году: походы Лжедмитрия I и Болотникова с юго-запада (Путивль), польская интервенция и 20-месячная оборона Смоленска, шведский захват северо-запада и освободительная дуга Второго ополчения Минина и Пожарского из Нижнего Новгорода через Ярославль на Москву.',
    clues: [
      'Характерная северная дуга по Волге: Нижний Новгород → Ярославль → Москва — безошибочный маркер Второго ополчения 1612 года.',
      'С юго-запада к Москве идёт стрелка от Путивля (Лжедмитрий I и И. Болотников), с запада — через Смоленск (Сигизмунд III).',
    ],
    blindMasks: [
      { x: 3, y: 2.5, w: 18, h: 15, kind: 'title' },
      { x: 2, y: 75, w: 16, h: 20, kind: 'title' },
    ],
    routes: [
      {
        label: 'Поход Второго ополчения Минина и Пожарского (1612)',
        style: 'rebel',
        coords: [[60.2, 46.0], [54.5, 41.5], [51.0, 41.5], [49.5, 45.2], [48.5, 48.5]],
      },
      {
        label: 'Походы Лжедмитрия I и И. Болотникова (1604–1606)',
        style: 'enemy',
        coords: [[38.5, 61.0], [43.5, 56.5], [47.5, 52.0], [48.5, 48.5]],
      },
      {
        label: 'Интервенция Сигизмунда III (1609–1611)',
        style: 'enemy',
        coords: [[31.0, 52.0], [37.0, 50.5], [43.0, 49.5], [48.5, 48.5]],
      },
    ],
    points: [
      { num: 1, id: 'nizhny', label: 'Нижний Новгород', x: 60.2, y: 46.0, kind: 'city', year: 'осень 1611', prompt: 'Волжский город, где земский староста Кузьма Минин призвал собрать Второе ополчение.', note: 'Военным предводителем пригласили князя Дмитрия Пожарского.', entityId: 'e-vtoroe-opolchenie' },
      { num: 2, id: 'yaroslavl', label: 'Ярославль', x: 51.0, y: 41.5, kind: 'city', year: 'апр.–июль 1612', prompt: 'Город на Верхней Волге, где ополчение простояло 4 месяца и учредило «Совет всея земли».', note: 'Фактическая временная столица России весной–летом 1612 года.', entityId: 'e-vtoroe-opolchenie' },
      { num: 3, id: 'moscow', label: 'Москва', x: 48.5, y: 48.5, kind: 'battle', year: 'окт. 1612', prompt: 'Столица, освобождённая Вторым ополчением от польского гарнизона в октябре 1612 года.', note: 'В феврале 1613 г. Земский собор избрал здесь царя Михаила Романова.', entityId: 'e-vtoroe-opolchenie' },
      { num: 4, id: 'smolensk', label: 'Смоленск', x: 37.0, y: 50.5, kind: 'fortress', year: '1609–1611', prompt: 'Западный форпост на Днепре, 20 месяцев державший осаду Сигизмунда III под командованием М. Б. Шеина.', note: 'Отошёл Речи Посполитой по Деулинскому перемирию 1618 года.' },
      { num: 5, id: 'pskov', label: 'Псков', x: 30.5, y: 40.5, kind: 'fortress', year: '1615', prompt: 'Северо-западная крепость, отстоявшая себя от осады шведского короля Густава II Адольфа.', note: 'Позволила заключить Столбовский мир 1617 года без потери Новгорода и Пскова.' },
      { num: 6, id: 'putivl', label: 'Путивль', x: 38.5, y: 61.0, kind: 'fortress', year: '1604–1606', prompt: 'Пограничный город Северщины — главная опорная база Лжедмитрия I и Ивана Болотникова.', note: 'Отсюда самозванцы и повстанцы начинали походы на Москву.' },
      { num: 7, id: 'astrakhan', label: 'Астрахань', x: 79.5, y: 76.0, kind: 'city', year: '1613–1614', prompt: 'Нижневолжский центр, где дольше всего удерживались атаман Заруцкий и Марина Мнишек.', note: 'Освобождена царскими войсками летом 1614 года.' },
    ],
    statements: [
      { text: 'В городе под цифрой 2 весной–летом 1612 года действовало временное правительство — «Совет всея земли».', correct: true, explain: 'В Ярославле Второе ополчение сформировало органы власти и чеканило монету.' },
      { text: 'Обороной западной крепости под цифрой 4 в 1609–1611 годах руководил воевода М. Б. Шеин.', correct: true, explain: 'Смоленск держался 20 месяцев против армии Сигизмунда III.' },
      { text: 'Второе ополчение Минина и Пожарского было созвано в городе под цифрой 6.', correct: false, explain: 'Второе ополчение возникло в Нижнем Новгороде (цифра 1), а под цифрой 6 — Путивль.' },
    ],
  },
  {
    id: 'map-razin',
    title: 'Восстание Степана Разина (1670–1671)',
    shortTitle: 'Восстание Разина (1670–1671)',
    period: 'c17',
    span: '1667–1671',
    image: '/content/maps/razin.webp',
    width: 1280,
    height: 908,
    credit: 'Cossrad / Wikimedia Commons',
    license: 'CC BY-SA 4.0',
    routesDefaultOn: false,
    summary:
      'Кульминация крестьянско-казацкого восстания под предводительством Степана Разина: движение вверх по Волге через Саратов и Самару к Симбирску, охват Среднего Поволжья (Саранск, Пенза, Алатырь) и разгром под Симбирском войсками Ю. Н. Барятинского.',
    clues: [
      'Движение восставших идёт ВВЕРХ по Волге с юга (Саратов → Самара → Симбирск) и НЕ доходит до Урала и Оренбурга — главное отличие от карты Пугачёва!',
      'Красной окружностью выделен район восстания в Среднем Поволжье с центром осады у Симбирска.',
    ],
    blindMasks: [{ x: 0, y: 85.2, w: 100, h: 14.8, kind: 'title' }],
    routes: [
      {
        label: 'Поход С. Разина вверх по Волге к Симбирску (1670)',
        style: 'rebel',
        coords: [[72.4, 63.8], [88.8, 48.0], [80.8, 37.3]],
      },
      {
        label: 'Наступление царских полков к Симбирску',
        style: 'russian',
        coords: [[41.4, 24.5], [63.0, 26.5], [68.7, 40.3], [80.8, 37.3]],
      },
    ],
    points: [
      { num: 1, id: 'moscow', label: 'Москва', x: 41.4, y: 24.5, kind: 'city', year: 'июнь 1671', prompt: 'Столица Русского царства, откуда направлялись карательные полки и где был казнён Разин.', note: 'Разин был четвертован на Болотной площади 6 июня 1671 года.', mask: { x: 30.5, y: 26.5, w: 11.5, h: 3.5 } },
      { num: 2, id: 'nizhny', label: 'Нижний Новгород', x: 65.6, y: 21.2, kind: 'city', year: '1670', prompt: 'Крупный город у северной границы восстания, ставший базой сбора правительственных войск.', note: 'Не перешёл на сторону восставших, удержав северный рубеж Волги.', mask: { x: 60.5, y: 12.2, w: 11.5, h: 8.2 } },
      { num: 3, id: 'kazan', label: 'Казань', x: 83.0, y: 24.8, kind: 'city', year: '1670', prompt: 'Волжская крепость севернее Симбирска, откуда к осаждённому городу подошёл корпус Ю. Н. Барятинского.', note: 'Удержание Казани не позволило разинцам выйти на Верхнюю Волгу.', mask: { x: 82.0, y: 26.5, w: 9.5, h: 3.5 } },
      { num: 4, id: 'simbirsk', label: 'Симбирск', x: 80.8, y: 37.3, kind: 'battle', year: 'сент.–окт. 1670', prompt: 'Ключевая крепость, под стенами которой войско Разина потерпело решающее поражение.', note: 'Обороной крепости руководил И. Б. Милославский, деблокировал город Ю. Н. Барятинский.', entityId: 'e-vosstanie-razina', mask: { x: 82.0, y: 33.2, w: 11.5, h: 3.8 } },
      { num: 5, id: 'samara', label: 'Самара', x: 88.8, y: 48.0, kind: 'city', year: 'авг. 1670', prompt: 'Город на Самарской Луке, открывший ворота разинцам накануне похода на Симбирск.', note: 'Здесь было введено казацкое самоуправление.', mask: { x: 88.5, y: 50.0, w: 10.5, h: 3.5 } },
      { num: 6, id: 'saratov', label: 'Саратов', x: 72.4, y: 63.8, kind: 'city', year: 'авг. 1670', prompt: 'Волжский город, сдавшийся восставшим без боя при подъёме вверх от Царицына.', note: 'Важный плацдарм разинского похода вверх по Волге.', mask: { x: 61.0, y: 63.0, w: 10.5, h: 3.8 } },
      { num: 7, id: 'saransk', label: 'Саранск', x: 68.7, y: 40.3, kind: 'city', year: 'осень 1670', prompt: 'Уездный центр Правобережья, ставший очагом крестьянского движения соратников Разина.', note: 'Рядом действовали отряды Алёны Арзамасской и Фёдора Шелудяка.', mask: { x: 58.0, y: 39.8, w: 10.0, h: 3.8 } },
    ],
    statements: [
      { text: 'Решающее поражение главным силам восставших было нанесено под крепостью, обозначенной цифрой 4.', correct: true, explain: 'В октябре 1670 г. под Симбирском войска Ю. Барятинского разбили отряды С. Разина.' },
      { text: 'На карте изображена Крестьянская война под предводительством Е. И. Пугачёва.', correct: false, explain: 'Это восстание С. Разина (1670–1671): движение идёт вверх по Волге к Симбирску, без Яика и Оренбурга.' },
      { text: 'В том же десятилетии, когда произошло это восстание, в России правил царь Алексей Михайлович.', correct: true, explain: 'Алексей Михайлович правил в 1645–1676 годах.' },
    ],
  },
  {
    id: 'map-northern-war',
    title: 'Северная война: от Нарвы до Полтавы (1700–1709)',
    shortTitle: 'Северная война (1700–1721)',
    period: 'c18',
    span: '1700–1721',
    image: '/content/maps/northern-war.webp',
    width: 918,
    height: 1280,
    credit: 'S. Bollmann / Wikimedia Commons',
    license: 'CC BY-SA 3.0',
    routesDefaultOn: false,
    summary:
      'Борьба Петра I со Швецией за выход к Балтике: от поражения под Нарвой (1700) и основания Санкт-Петербурга (1703) — через разгром корпуса Левенгаупта у деревни Лесной (1708) — к генеральной победе под Полтавой (1709) и бегству Карла XII в Бендеры.',
    clues: [
      'Два далёких театра на одной карте: Финский залив на севере (Петербург, Нарва, Рига) и глубокий рейд красной шведской стрелки на юг в Украину (Лесная → Полтава → Бендеры)!',
      'Оранжевым окрашена Шведская империя по обе стороны Балтики, жёлтым — Речь Посполитая.',
    ],
    blindMasks: [
      { x: 0, y: 76.5, w: 42.5, h: 23.5, kind: 'title' },
      { x: 0, y: 0, w: 26, h: 26, kind: 'title' },
    ],
    routes: [
      {
        label: 'Поход Карла XII на Украину к Полтаве (1708–1709)',
        style: 'enemy',
        coords: [[42.0, 65.0], [52.0, 58.0], [64.0, 58.0], [74.0, 57.0], [78.5, 67.0], [82.5, 72.5]],
      },
      {
        label: 'Разгром корпуса Левенгаупта у Лесной и манёвр к Полтаве',
        style: 'russian',
        coords: [[75.5, 55.0], [70.8, 60.5], [75.0, 70.0], [82.5, 72.5]],
      },
    ],
    points: [
      { num: 1, id: 'spb', label: 'Санкт-Петербург', x: 73.8, y: 34.0, kind: 'city', year: '16 мая 1703', prompt: 'Новая столица и крепость в устье Невы, заложенная Петром I прямо в разгар войны.', note: 'Ключевой порт России на Балтийском море.', mask: { x: 63.0, y: 33.8, w: 10.5, h: 2.0 } },
      { num: 2, id: 'narva', label: 'Нарва', x: 63.2, y: 37.0, kind: 'battle', year: '1700, 1704', prompt: 'Крепость, под которой русская армия потерпела «конфузию» в 1700 г., но взяла реванш штурмом в 1704 г.', note: 'Дала толчок реформе армии и переливке колоколов на пушки.', entityId: 'e-narvskaya-bitva', mask: { x: 63.5, y: 35.8, w: 6.5, h: 2.0 } },
      { num: 3, id: 'riga', label: 'Рига', x: 51.2, y: 47.0, kind: 'fortress', year: '1710', prompt: 'Главный город Лифляндии, взятый фельдмаршалом Б. П. Шереметевым после Полтавы.', note: 'Отошла к России по Ништадтскому миру 1721 года.', entityId: 'e-nishtadtskiy-mir', mask: { x: 52.0, y: 46.0, w: 6.0, h: 2.0 } },
      { num: 4, id: 'polotsk', label: 'Полоцк', x: 65.6, y: 52.2, kind: 'city', year: '1705–1708', prompt: 'Город на Западной Двине, служивший важной базой русской армии в польско-литовской кампании.', note: 'Прикрывал пути к Смоленску и Пскову.', mask: { x: 66.2, y: 51.3, w: 5.5, h: 1.8 } },
      { num: 5, id: 'lesnaya', label: 'Деревня Лесная', x: 70.8, y: 60.5, kind: 'battle', year: '28 сент. 1708', prompt: 'Место разгрома обоза Левенгаупта, названное Петром I «матерью Полтавской баталии».', note: 'Карл XII лишился 16-тысячного подкрепления и артиллерии.', mask: { x: 71.5, y: 59.5, w: 6.5, h: 2.0 } },
      { num: 6, id: 'poltava', label: 'Полтава', x: 82.5, y: 72.5, kind: 'battle', year: '27 июня 1709', prompt: 'Генеральное сражение, переломившее ход Северной войны и сокрушившее шведскую сухопутную армию.', note: 'После поражения у Переволочны сдались остатки армии Карла XII.', entityId: 'e-poltavskaya-bitva', mask: { x: 82.0, y: 73.0, w: 6.5, h: 2.0 } },
      { num: 7, id: 'bender', label: 'Бендеры', x: 68.5, y: 81.8, kind: 'fortress', year: '1709–1713', prompt: 'Османская крепость на Днестре, куда бежал Карл XII после Полтавы и откуда склонил Турцию к войне.', note: 'Привела к Прутскому походу Петра I в 1711 году.', mask: { x: 66.5, y: 82.0, w: 6.0, h: 2.0 } },
    ],
    statements: [
      { text: 'Победу у населённого пункта под цифрой 5 Пётр I назвал «матерью Полтавской баталии».', correct: true, explain: 'Битва у деревни Лесной (28 сентября 1708 г.) состоялась ровно за 9 месяцев до Полтавы.' },
      { text: 'В генеральном сражении под цифрой 6 в июне 1709 года русская армия разгромила войско Карла XII.', correct: true, explain: 'Полтавская битва (27 июня 1709 г.) стала коренным переломом Северной войны.' },
      { text: 'Город под цифрой 1 был основан Екатериной II в 1783 году.', correct: false, explain: 'Санкт-Петербург (цифра 1) основан Петром I 16 мая 1703 года.' },
    ],
  },
  {
    id: 'map-pugachev',
    title: 'Крестьянская война Е. И. Пугачёва (1773–1775)',
    shortTitle: 'Восстание Пугачёва (1773–1775)',
    period: 'c18',
    span: '1773–1775',
    image: '/content/maps/pugachev.webp',
    width: 1280,
    height: 1009,
    credit: 'Ю. Б. Коряков / Wikimedia Commons',
    license: 'CC BY 2.5',
    routesDefaultOn: false,
    summary:
      'Три этапа крупнейшего восстания XVIII века: от Яицкого городка и шестимесячной осады Оренбурга — через Южный Урал, Башкирию (Салават Юлаев) и взятие посада Казани — вниз по правому берегу Волги к Саратову и Царицыну.',
    clues: [
      'Огромная петля с ВОСТОКА на ЗАПАД: старт на реке Яик и у Оренбурга, дуга через Уфу и Урал к Казани, а затем спуск ВНИЗ по Волге к Царицыну (полная противоположность Разину!).',
      'Флажок ставки Пугачёва стоит в Бердской слободе прямо у Оренбурга.',
    ],
    blindMasks: [
      { x: 0, y: 0, w: 34, h: 8.5, kind: 'title' },
      { x: 67, y: 67.5, w: 33, h: 32.5, kind: 'title' },
    ],
    routes: [
      {
        label: 'Этап I–II: Яик → Оренбург → Южный Урал → Казань (1773–1774)',
        style: 'rebel',
        coords: [[40.5, 60.5], [54.5, 56.8], [65.5, 44.0], [70.5, 29.0], [66.5, 14.5], [52.0, 10.0], [43.5, 22.0], [31.8, 22.0]],
      },
      {
        label: 'Этап III: рейд вниз по правому берегу Волги (1774)',
        style: 'rebel',
        coords: [[31.8, 22.0], [19.5, 21.5], [16.0, 35.5], [15.5, 46.0], [19.5, 58.2], [13.2, 80.5]],
      },
    ],
    points: [
      { num: 1, id: 'yaik', label: 'Яицкий городок (Уральск)', x: 40.5, y: 60.5, kind: 'fortress', year: 'сент. 1773', prompt: 'Казачий центр, близ которого Пугачёв объявил себя «императором Петром III».', note: 'В 1775 г. Екатерина II переименовала реку Яик в Урал, а городок — в Уральск.', entityId: 'e-vosstanie-pugacheva', mask: { x: 30.0, y: 59.5, w: 10.5, h: 2.5 } },
      { num: 2, id: 'orenburg', label: 'Оренбург', x: 54.5, y: 56.8, kind: 'fortress', year: 'окт. 1773 – март 1774', prompt: 'Губернская крепость, полугодовая осада которой сковала главные силы повстанцев.', note: 'Ставка Пугачёва располагалась рядом — в Бердской слободе.', mask: { x: 52.5, y: 56.8, w: 8.5, h: 2.8 } },
      { num: 3, id: 'ufa', label: 'Уфа', x: 59.0, y: 31.0, kind: 'city', year: '1773–1774', prompt: 'Центр Башкирии, осаждённый соратниками Пугачёва (включая Салавата Юлаева).', note: 'Деблокирована корпусом И. И. Михельсона весной 1774 года.', mask: { x: 55.5, y: 30.2, w: 4.5, h: 2.8 } },
      { num: 4, id: 'kazan', label: 'Казань', x: 31.8, y: 22.0, kind: 'battle', year: 'июль 1774', prompt: 'Крупный поволжский город, посад которого Пугачёв взял, но был разбит корпусом Михельсона.', note: 'После Казани Пугачёв ушёл на правый берег Волги и издал манифест о вольности крестьян.', entityId: 'e-vosstanie-pugacheva', mask: { x: 28.5, y: 19.2, w: 7.5, h: 3.0 } },
      { num: 5, id: 'samara', label: 'Самара', x: 35.5, y: 43.8, kind: 'city', year: 'дек. 1773', prompt: 'Волжский город, занятый отрядом атамана Арапова в конце 1773 года.', note: 'Вскоре был отбит правительственными войсками.', mask: { x: 31.0, y: 44.5, w: 7.5, h: 2.8 } },
      { num: 6, id: 'saratov', label: 'Саратов', x: 19.5, y: 58.2, kind: 'city', year: 'авг. 1774', prompt: 'Город на правом берегу Волги, занятый Пугачёвым во время третьего этапа восстания.', note: 'Повстанцы стремились прорваться на Дон за новой поддержкой.', mask: { x: 19.8, y: 58.0, w: 7.0, h: 2.8 } },
      { num: 7, id: 'tsaritsyn', label: 'Царицын (Чёрный Яр)', x: 13.2, y: 80.5, kind: 'battle', year: 'авг. 1774', prompt: 'Нижневолжский рубеж, южнее которого у Солениковой ватаги войско Пугачёва было окончательно разбито.', note: 'Вскоре заговорщики выдали Пугачёва властям; казнён в Москве в январе 1775 г.', mask: { x: 13.0, y: 79.0, w: 8.0, h: 3.2 } },
    ],
    statements: [
      { text: 'После подавления восстания река, на которой стоит городок под цифрой 1, была переименована из Яика в Урал.', correct: true, explain: 'Указ Екатерины II 1775 года стремился стереть память о бунте яицкого казачества.' },
      { text: 'На третьем этапе отряды Пугачёва двигались ВВЕРХ по Волге — от Царицына к Казани.', correct: false, explain: 'Наоборот: Пугачёв шёл ВНИЗ по правому берегу Волги — от Казани к Саратову и Царицыну.' },
      { text: 'Масштаб этого восстания стал одной из главных причин Губернской реформы 1775 года.', correct: true, explain: 'Екатерина II разукрупнила губернии для усиления контроля на местах.' },
    ],
  },
  {
    id: 'map-turkish-c18',
    title: 'Россия при Екатерине II: Причерноморье и разделы Польши (1762–1795)',
    shortTitle: 'Внешняя политика Екатерины II',
    period: 'c18',
    span: '1762–1795',
    image: '/content/maps/turkish-c18.webp',
    width: 1044,
    height: 1280,
    credit: 'Н. Н. Торнау, Учебный атлас по русской истории (СПб., 1910)',
    license: 'Public domain',
    routesDefaultOn: true,
    summary:
      'Территориальные итоги екатерининского царствования: выход к Чёрному морю по Кючук-Кайнарджийскому (1774) и Ясскому (1791) мирам, присоединение Крыма и основание Севастополя (1783), а также три раздела Речи Посполитой (1772, 1793, 1795).',
    clues: [
      'Красным контуром выделены ключевые приобретения XVIII в.: Кинбурн, Керчь и Еникале, Азов, Крым и западные земли трёх разделов Польши (I, II, III).',
      'На карте одновременно видны оба главных направления Екатерины II — турецкое (юг) и польское (запад).',
    ],
    blindMasks: [
      { x: 36, y: 82.5, w: 28, h: 14.5, kind: 'title' },
      { x: 4, y: 5.5, w: 41.5, h: 25.5, kind: 'title' },
    ],
    routes: [
      {
        label: 'Южное направление: Кинбурн → Крым → Севастополь (1768–1791)',
        style: 'russian',
        coords: [[54.8, 47.0], [44.2, 68.2], [48.5, 72.2]],
      },
      {
        label: 'Западное направление: три раздела Речи Посполитой (1772, 1793, 1795)',
        style: 'russian',
        coords: [[42.0, 45.0], [34.5, 51.0], [27.0, 54.0]],
      },
    ],
    points: [
      { num: 1, id: 'spb', label: 'Санкт-Петербург', x: 45.2, y: 36.2, kind: 'city', year: '1762–1796', prompt: 'Столица Российской империи, откуда направлялась дипломатия и войны Екатерины II.', note: 'Сюда привозили ключи от взятых турецких крепостей.', mask: { x: 43.0, y: 36.0, w: 10.0, h: 2.5 } },
      { num: 2, id: 'moscow', label: 'Москва', x: 54.8, y: 47.0, kind: 'city', year: '1775', prompt: 'Древняя столица, где на Ходынском поле пышно отпраздновали Кючук-Кайнарджийский мир.', note: 'Крупнейший внутренний центр империи.', mask: { x: 54.5, y: 46.0, w: 7.5, h: 2.5 } },
      { num: 3, id: 'warsaw', label: 'Варшава (разделы Речи Посполитой)', x: 25.0, y: 50.5, kind: 'treaty', year: '1772, 1793, 1795', prompt: 'Столица Речи Посполитой, прекратившей существование после трёх разделов между Россией, Пруссией и Австрией.', note: 'К России отошли Правобережная Украина, Белоруссия, Литва и Курляндия.', mask: { x: 24.0, y: 50.2, w: 7.5, h: 2.2 } },
      { num: 4, id: 'kinburn', label: 'Кинбурн и устье Днепра', x: 44.2, y: 68.2, kind: 'battle', year: '1774, 1787', prompt: 'Крепость в устье Днепра, полученная по Кючук-Кайнарджийскому миру и защищённая Суворовым в 1787 г.', note: 'Первый твёрдый плацдарм России на Чёрном море.', entityId: 'e-kyuchuk-kaynardzhiyskiy-mir', mask: { x: 41.0, y: 67.8, w: 7.0, h: 2.4 } },
      { num: 5, id: 'crimea', label: 'Крым (Севастополь, Керчь)', x: 48.5, y: 72.2, kind: 'fortress', year: '1783', prompt: 'Полуостров, включённый в состав России манифестом 1783 года; здесь был основан Севастополь.', note: 'Окончательно признан за Россией по Ясскому миру 1791 года.', entityId: 'e-osnovanie-sevastopolya', mask: { x: 47.5, y: 70.5, w: 9.0, h: 3.0 } },
      { num: 6, id: 'azov', label: 'Азов', x: 56.8, y: 68.0, kind: 'fortress', year: '1774', prompt: 'Крепость в устье Дона, окончательно закреплённая за Россией по Кючук-Кайнарджийскому миру.', note: 'Открыла беспрепятственный выход из Азовского моря в Чёрное.', entityId: 'e-kyuchuk-kaynardzhiyskiy-mir', mask: { x: 55.5, y: 67.5, w: 6.5, h: 2.2 } },
      { num: 7, id: 'constantinople', label: 'Константинополь (проливы)', x: 31.5, y: 79.0, kind: 'treaty', year: '1774, 1791', prompt: 'Столица Османской империи — ключ к Босфору и Дарданеллам, открытым для русских торговых судов в 1774 г.', note: 'Центр амбициозного «Греческого проекта» Екатерины II.', entityId: 'e-yasskiy-mir', mask: { x: 28.0, y: 78.2, w: 10.5, h: 2.5 } },
    ],
    statements: [
      { text: 'Полуостров под цифрой 5 был окончательно присоединён к Российской империи в 1783 году.', correct: true, explain: '8 апреля 1783 г. Екатерина II подписала манифест о принятии Крыма в состав России.' },
      { text: 'В результате трёх разделов государства со столицей под цифрой 3 к России отошли земли Белоруссии, Литвы и Правобережной Украины.', correct: true, explain: 'Разделы Речи Посполитой прошли в 1772, 1793 и 1795 годах.' },
      { text: 'По Кючук-Кайнарджийскому миру 1774 года граница России с Турцией установилась по реке Днестр.', correct: false, explain: 'Границу по Днестру закрепил Ясский мир 1791 года, а в 1774 г. — по Южному Бугу.' },
    ],
  },
  {
    id: 'map-1812',
    title: 'Отечественная война 1812 года',
    shortTitle: 'Отечественная война 1812 г.',
    period: 'c19',
    span: 'июнь–дек. 1812',
    image: '/content/maps/war-1812.webp',
    width: 1157,
    height: 901,
    credit: 'USMA West Point Military Atlas',
    license: 'Public domain',
    routesDefaultOn: false,
    summary:
      'Вторжение Великой армии Наполеона через Неман (Ковно), соединение армий Барклая де Толли и Багратиона у Смоленска, Бородино, Тарутинский фланговый манёвр Кутузова, сражение при Малоярославце и гибель армии Наполеона при переправе через Березину.',
    clues: [
      'Чёткий коридор с востока на запад от Москвы через Малоярославец, Вязьму, Смоленск и реку Березину к Вильне и Ковно.',
      'Синие стрелки показывают отступление Великой армии, красные — параллельное преследование армии Кутузова южнее.',
    ],
    blindMasks: [{ x: 0.5, y: 0.5, w: 23.5, h: 14.5, kind: 'title' }],
    routes: [
      {
        label: 'Наступление Наполеона на Москву (июнь–сент. 1812)',
        style: 'enemy',
        coords: [[39.8, 49.5], [45.5, 52.8], [66.5, 48.0], [73.8, 52.5], [90.0, 43.2], [96.2, 40.2]],
      },
      {
        label: 'Тарутинский манёвр и изгнание Великой армии (окт.–дек. 1812)',
        style: 'russian',
        coords: [[96.2, 40.2], [93.2, 45.2], [83.5, 48.0], [73.8, 52.5], [60.2, 56.5], [45.5, 52.8]],
      },
    ],
    points: [
      { num: 1, id: 'kovno', label: 'Ковно (Неман)', x: 39.8, y: 49.5, kind: 'battle', year: '12 июня 1812', prompt: 'Пограничный город на реке Неман, где Великая армия вторглась в пределы России.', note: 'Отсюда начался поход 600-тысячной армии Наполеона.', mask: { x: 40.0, y: 47.5, w: 5.5, h: 2.2 } },
      { num: 2, id: 'vilna', label: 'Вильна', x: 45.5, y: 52.8, kind: 'city', year: 'июнь / дек. 1812', prompt: 'Крупный центр Западного края, где находился Александр I в начале войны и через который бежали остатки французов.', note: 'Здесь Наполеон оставил армию и уехал в Париж.', mask: { x: 45.8, y: 51.2, w: 5.0, h: 2.2 } },
      { num: 3, id: 'berezina', label: 'Река Березина', x: 60.2, y: 56.5, kind: 'battle', year: '14–16 нояб. 1812', prompt: 'Река в Белоруссии, при переправе через которую Великая армия фактически перестала существовать.', note: 'Французы потеряли здесь десятки тысяч солдат, обозы и артиллерию.', entityId: 'e-berezina-1812', mask: { x: 66.5, y: 56.5, w: 10.0, h: 4.0 } },
      { num: 4, id: 'smolensk', label: 'Смоленск', x: 73.8, y: 52.5, kind: 'battle', year: '4–6 авг. 1812', prompt: 'Город, под которым соединились 1-я армия Барклая де Толли и 2-я армия Багратиона.', note: 'Сорвал план Наполеона разбить русские армии поодиночке.', mask: { x: 72.5, y: 52.5, w: 6.5, h: 2.5 } },
      { num: 5, id: 'borodino', label: 'Бородино', x: 90.0, y: 43.2, kind: 'battle', year: '26 авг. 1812', prompt: 'Поле под Можайском — место генерального сражения Отечественной войны 1812 года.', note: 'Багратионовы флеши и батарея Раевского обескровили Великую армию.', entityId: 'e-borodinskoe-srazhenie-1812', mask: { x: 87.0, y: 41.8, w: 6.0, h: 2.2 } },
      { num: 6, id: 'moscow', label: 'Москва', x: 96.2, y: 40.2, kind: 'city', year: '2 сент. 1812', prompt: 'Древняя столица, оставленная без боя по решению совета в Филях и охваченная пожаром.', note: 'Стала стратегической ловушкой для Наполеона.', mask: { x: 91.5, y: 38.8, w: 6.0, h: 2.4 } },
      { num: 7, id: 'maloyaroslavets', label: 'Малоярославец (Тарутино)', x: 93.2, y: 45.2, kind: 'battle', year: '12 окт. 1812', prompt: 'Город, 8 раз переходивший из рук в руки; закрыл Наполеону дорогу на богатые южные губернии.', note: 'Заставил французов отступать по разорённой Старой Смоленской дороге.', entityId: 'e-maloyaroslavets-1812', mask: { x: 91.0, y: 44.5, w: 8.5, h: 2.6 } },
    ],
    statements: [
      { text: 'Сражение у города под цифрой 7 заставило Наполеона отступать по разорённой Старой Смоленской дороге.', correct: true, explain: 'Сражение при Малоярославце (12 октября 1812 г.) стало стратегическим переломом.' },
      { text: 'При переправе через реку под цифрой 3 Великая армия понесла катастрофические потери и утратила боеспособность.', correct: true, explain: 'Переправа через Березину (14–16 ноября 1812 г.) завершила разгром основных сил французов.' },
      { text: 'Русской армией в генеральном сражении под цифрой 5 командовал А. В. Суворов.', correct: false, explain: 'При Бородине главнокомандующим был М. И. Кутузов (А. В. Суворов умер в 1800 г.).' },
    ],
  },
  {
    id: 'map-crimean',
    title: 'Крымская война (1853–1856)',
    shortTitle: 'Крымская война (1853–1856)',
    period: 'c19',
    span: '1853–1856',
    image: '/content/maps/crimean.webp',
    width: 1280,
    height: 703,
    credit: 'Ю. Б. Коряков / Wikimedia Commons',
    license: 'CC BY 2.5',
    routesDefaultOn: false,
    summary:
      'Война России против коалиции Османской империи, Великобритании, Франции и Сардинии: Дунайский фронт (Силистрия), разгром турецкого флота П. С. Нахимовым при Синопе, высадка союзников в Евпатории, 349-дневная оборона Севастополя и взятие Карса на Кавказском фронте.',
    clues: [
      'Русскоязычная карта всего Чёрного моря: пунктирные морские походы от Стамбула к Евпатории, Севастополю, Керчи, Одессе и Синопу (18.11.1853).',
      'Три театра на одной схеме: Дунайские княжества слева (Бухарест, Силистрия), Крым в центре (Севастополь) и Закавказье справа (Карс, Батум).',
    ],
    blindMasks: [{ x: 0, y: 92.5, w: 36, h: 7.5, kind: 'title' }],
    routes: [
      {
        label: 'Поход эскадры П. С. Нахимова из Севастополя к Синопу (нояб. 1853)',
        style: 'naval',
        coords: [[49.3, 37.5], [55.0, 52.0], [56.9, 65.8]],
      },
      {
        label: 'Экспедиция коалиции из Варны и Стамбула в Крым (сент. 1854)',
        style: 'enemy',
        coords: [[29.5, 76.0], [36.0, 48.0], [48.6, 30.5], [49.3, 37.5]],
      },
    ],
    points: [
      { num: 1, id: 'sinop', label: 'Синоп', x: 56.9, y: 65.8, dir: 'sw', kind: 'battle', year: '18 нояб. 1853', prompt: 'Турецкий порт, где эскадра П. С. Нахимова уничтожила османский флот в последнем крупном бою парусников.', note: 'Ускорила вступление Великобритании и Франции в войну.', entityId: 'e-sinopskoe-srazhenie-1853', mask: { x: 51.5, y: 64.5, w: 12.5, h: 3.5 } },
      { num: 2, id: 'sevastopol', label: 'Севастополь', x: 49.3, y: 37.5, dir: 'sw', kind: 'fortress', year: '1854–1855', prompt: 'Главная база Черноморского флота, выдержавшая 349 дней героической обороны (Корнилов, Нахимов, Тотлебен).', note: 'Ключевая позиция обороны — Малахов курган.', entityId: 'e-oborona-sevastopolya-1854', mask: { x: 40.5, y: 35.5, w: 9.0, h: 5.0 } },
      { num: 3, id: 'evpatoria', label: 'Евпатория', x: 48.6, y: 30.5, dir: 'nw', kind: 'city', year: 'сент. 1854', prompt: 'Крымский порт, где высадился 62-тысячный англо-франко-турецкий экспедиционный корпус.', note: 'С высадки в Евпатории начался Крымский этап войны.', mask: { x: 41.5, y: 27.5, w: 7.5, h: 3.0 } },
      { num: 4, id: 'silistria', label: 'Силистрия (Дунайский фронт)', x: 21.4, y: 43.2, dir: 'se', kind: 'fortress', year: 'май–июнь 1854', prompt: 'Турецкая крепость на Дунае, осаду которой пришлось снять из-за враждебной позиции Австрии.', note: 'Завершение Дунайской кампании 1853–1854 гг.', mask: { x: 19.5, y: 44.0, w: 8.5, h: 3.0 } },
      { num: 5, id: 'odessa', label: 'Одесса', x: 37.1, y: 15.0, dir: 'nw', kind: 'city', year: 'апр. 1854', prompt: 'Крупный черноморский порт, выдержавший бомбардировку англо-французского флота (подвиг батареи Щёголева).', note: 'Не позволил коалиции высадить десант в Новороссии.', mask: { x: 32.0, y: 13.0, w: 5.5, h: 3.0 } },
      { num: 6, id: 'kerch', label: 'Керчь', x: 62.2, y: 28.8, dir: 'ne', kind: 'city', year: 'май 1855', prompt: 'Порт у входа в Азовское море, занятый союзниками для нарушения снабжения Крыма.', note: 'Через Керченский пролив союзные корабли вошли к Таганрогу.', mask: { x: 61.5, y: 26.5, w: 5.5, h: 3.0 } },
      { num: 7, id: 'kars', label: 'Карс (Кавказский фронт)', x: 91.9, y: 80.8, dir: 'sw', kind: 'fortress', year: 'нояб. 1855', prompt: 'Мощная турецкая крепость в Закавказье, взятая Н. Н. Муравьёвым и позволившая смягчить условия мира.', note: 'Обменяна на Севастополь по Парижскому миру 1856 года.', entityId: 'e-parizhskiy-mir-1856', mask: { x: 88.0, y: 79.0, w: 5.0, h: 3.5 } },
    ],
    statements: [
      { text: 'Сражение в бухте под цифрой 1 стало последним крупным боем парусных флотов в мировой истории.', correct: true, explain: 'Синопское сражение (18 ноября 1853 г., вице-адмирал П. С. Нахимов).' },
      { text: 'Взятие крепости под цифрой 7 в ноябре 1855 года позволило России вернуть Севастополь на Парижском конгрессе.', correct: true, explain: 'Капитуляция Карса (цифра 7) укрепила позиции российской дипломатии.' },
      { text: 'По итогам Парижского мира 1856 года Россия получила право держать броненосный флот в Чёрном море.', correct: false, explain: 'Наоборот: нейтрализация Чёрного моря запрещала России военный флот и укрепления до 1871 года.' },
    ],
  },
  {
    id: 'map-turkish-1877',
    title: 'Русско-турецкая война (1877–1878)',
    shortTitle: 'Русско-турецкая (1877–1878)',
    period: 'c19',
    span: '1877–1878',
    image: '/content/maps/turkish-1877.webp',
    width: 1280,
    height: 1095,
    credit: 'Kandi / Wikimedia Commons',
    license: 'CC BY-SA 4.0',
    routesDefaultOn: false,
    summary:
      'Освободительная война на Балканах и Кавказе: форсирование Дуная у Систова, героическая оборона Шипкинского перевала, трёхкратный штурм и блокада Плевны (Тотлебен, Скобелев), зимний переход через Балканы к Адрианополю и Сан-Стефанский мир.',
    clues: [
      'Балканский театр между Дунаем и Мраморным морем (Плевна, Шипка, София, Эдирне, Сан-Стефано) плюс врезка Кавказского фронта (Карс, Батум, Эрзурум) внизу слева!',
      'Дата «3.03.78» у предместья Константинополя — Сан-Стефанский мирный договор.',
    ],
    blindMasks: [
      { x: 0, y: 0, w: 43, h: 7.5, kind: 'title' },
      { x: 39, y: 82.5, w: 61, h: 17.5, kind: 'title' },
    ],
    routes: [
      {
        label: 'Наступление через Дунай, Плевну и Шипку к Сан-Стефано (1877–1878)',
        style: 'russian',
        coords: [[50.5, 7.0], [39.0, 21.0], [31.8, 28.8], [39.2, 40.5], [58.5, 65.0], [90.5, 77.5]],
      },
      {
        label: 'Кавказский фронт: штурм Карса и поход к Эрзуруму',
        style: 'russian',
        coords: [[26.5, 79.5], [20.5, 81.8], [7.0, 89.5]],
      },
    ],
    points: [
      { num: 1, id: 'pleven', label: 'Плевна', x: 31.8, y: 28.8, kind: 'fortress', year: 'июль–нояб. 1877', prompt: 'Турецкий укреплённый лагерь Османа-паши, павший после блокады, организованной Э. И. Тотлебеном.', note: 'Падение Плевны освободило свыше 100 тыс. солдат для броска через Балканы.', entityId: 'e-padenie-plevny-1877', mask: { x: 26.5, y: 25.0, w: 7.5, h: 3.0 } },
      { num: 2, id: 'shipka', label: 'Шипкинский перевал', x: 39.2, y: 40.5, kind: 'battle', year: 'авг.–дек. 1877', prompt: 'Горный перевал через Балканы, который 5 месяцев удерживали русские солдаты и болгарские ополченцы (Столетов, Радецкий).', note: 'Победа у Шипки–Шейново открыла путь на Адрианополь.', entityId: 'e-oborona-shipki-1877', mask: { x: 34.0, y: 41.5, w: 7.5, h: 2.5 } },
      { num: 3, id: 'sofia', label: 'София', x: 14.2, y: 43.2, kind: 'city', year: 'дек. 1877', prompt: 'Будущая столица Болгарии, освобождённая отрядом генерала И. В. Гурко после тяжелейшего зимнего перехода.', note: 'Один из ключевых эпизодов освобождения Болгарии.', mask: { x: 9.5, y: 41.0, w: 5.5, h: 2.5 } },
      { num: 4, id: 'edirne', label: 'Адрианополь (Эдирне)', x: 58.5, y: 65.0, kind: 'city', year: 'янв. 1878', prompt: 'Крупный город во Фракии, занятый авангардом М. Д. Скобелева на подступах к Константинополю.', note: 'Здесь было подписано перемирие с Османской империей.', mask: { x: 58.5, y: 63.8, w: 6.5, h: 2.4 } },
      { num: 5, id: 'san-stefano', label: 'Сан-Стефано', x: 90.5, y: 77.5, kind: 'treaty', year: '19 фев. (3 мар.) 1878', prompt: 'Предместье Константинополя, где подписан предварительный мир, даровавший независимость Сербии, Черногории, Румынии и автономию Болгарии.', note: 'Условия были пересмотрены в ущерб России на Берлинском конгрессе летом 1878 г.', entityId: 'e-san-stefanskiy-mir-1878', mask: { x: 81.0, y: 77.5, w: 9.5, h: 4.0 } },
      { num: 6, id: 'kars-77', label: 'Карс (Кавказский фронт)', x: 20.5, y: 81.8, kind: 'fortress', year: 'нояб. 1877', prompt: 'Крепость в Закавказье, взятая ночным штурмом и присоединённая к России вместе с Батумом и Ардаганом.', note: 'Закреплена за Россией и по Берлинскому трактату.', entityId: 'e-russko-turetskaya-voyna-1877-1878', mask: { x: 16.5, y: 80.5, w: 5.0, h: 2.5 } },
    ],
    statements: [
      { text: 'Инженерную блокаду крепости под цифрой 1, приведшую к капитуляции Османа-паши, организовал Э. И. Тотлебен.', correct: true, explain: 'После трёх неудачных штурмов Плевны Тотлебен сжал город плотным кольцом блокады.' },
      { text: 'В предместье Константинополя под цифрой 5 в феврале (марте) 1878 года был подписан предварительный мирный договор.', correct: true, explain: 'Сан-Стефанский мир (19 февраля / 3 марта 1878 г.).' },
      { text: 'На Берлинском конгрессе 1878 года европейские державы полностью утвердили все условия договора под цифрой 5 без изменений.', correct: false, explain: 'Берлинский конгресс резко урезал территорию Болгарии и ограничил успехи России на Балканах.' },
    ],
  },
  {
    id: 'map-russo-japanese',
    title: 'Русско-японская война (1904–1905)',
    shortTitle: 'Русско-японская (1904–1905)',
    period: 'revolution',
    span: '1904–1905',
    image: '/content/maps/russo-japanese.webp',
    width: 1280,
    height: 911,
    credit: 'Корпус военных топографов (Российская империя, 1904)',
    license: 'Public domain',
    routesDefaultOn: true,
    summary:
      'Подлинная карта театра военных действий на Дальнем Востоке 1904 года: бой «Варяга» у Чемульпо, 329-дневная оборона Порт-Артура, маньчжурские сражения при Ляояне и Мукдене и трагедия 2-й Тихоокеанской эскадры в Цусимском проливе.',
    clues: [
      'Единственная карта в атласе с Японским и Жёлтым морями, Корейским и Ляодунским полуостровами и КВЖД!',
      'Морская стрелка с юга входит прямо в пролив между Кореей и японским островом Кюсю — путь эскадры З. П. Рожественского к Цусиме.',
    ],
    blindMasks: [{ x: 78.5, y: 69, w: 19.5, h: 12.5, kind: 'title' }],
    routes: [
      {
        label: 'Поход 2-й Тихоокеанской эскадры к Цусиме (май 1905)',
        style: 'naval',
        coords: [[40.0, 96.0], [49.0, 86.0], [54.5, 76.0]],
      },
      {
        label: 'Наступление японских армий в Маньчжурию (1904–1905)',
        style: 'enemy',
        coords: [[39.5, 64.0], [27.5, 52.0], [15.1, 49.5], [15.5, 44.5]],
      },
      {
        label: 'Осада Порт-Артура (1904)',
        style: 'enemy',
        coords: [[32.0, 68.0], [21.0, 66.0], [14.6, 72.3]],
      },
    ],
    points: [
      { num: 1, id: 'port-arthur', label: 'Порт-Артур', x: 14.6, y: 72.3, kind: 'fortress', year: 'янв.–дек. 1904', prompt: 'Незамерзающая крепость на Ляодунском полуострове, выдержавшая 11 месяцев осады (Макаров, Кондратенко).', note: 'Сдана генералом А. М. Стесселем в декабре 1904 г. вопреки решению военного совета.', entityId: 'e-oborona-port-artura', mask: { x: 13.0, y: 71.0, w: 6.0, h: 2.8 } },
      { num: 2, id: 'liaoyang', label: 'Ляоян', x: 15.1, y: 49.5, kind: 'battle', year: 'авг. 1904', prompt: 'Первое крупное сухопутное сражение в Маньчжурии, после которого Куропаткин отвёл войска на север.', note: 'Лишила защитников Порт-Артура надежды на деблокаду.', mask: { x: 14.5, y: 48.0, w: 5.5, h: 2.5 } },
      { num: 3, id: 'mukden', label: 'Мукден', x: 15.5, y: 44.5, kind: 'battle', year: 'фев. 1905', prompt: 'Крупнейшее сухопутное сражение войны (свыше 550 тыс. солдат с обеих сторон), завершившееся отступлением русской армии.', note: 'Крупнейшее полевое сражение мировой истории до 1914 года.', entityId: 'e-mukdenskoe-srazhenie', mask: { x: 14.5, y: 43.2, w: 6.0, h: 2.5 } },
      { num: 4, id: 'chemulpo', label: 'Чемульпо (близ Сеула)', x: 39.5, y: 64.0, kind: 'battle', year: '27 янв. 1904', prompt: 'Корейский порт, у которого крейсер «Варяг» и канонерка «Кореец» приняли неравный бой в первый день войны.', note: 'Экипаж затопил «Варяг», не спустив Андреевского флага.', mask: { x: 38.0, y: 62.5, w: 6.0, h: 2.8 } },
      { num: 5, id: 'vladivostok', label: 'Владивосток', x: 44.2, y: 21.0, kind: 'city', year: '1904–1905', prompt: 'Главная российская военно-морская база в Приморье — цель прорыва 2-й Тихоокеанской эскадры.', note: 'Конечная станция Транссибирской магистрали.', mask: { x: 42.5, y: 19.5, w: 7.0, h: 2.5 } },
      { num: 6, id: 'tsushima', label: 'Цусимский пролив', x: 54.5, y: 76.0, kind: 'battle', year: '14–15 мая 1905', prompt: 'Пролив между Кореей и Японией, где погибла 2-я Тихоокеанская эскадра З. П. Рожественского.', note: 'Сделала мирные переговоры в Портсмуте неизбежными.', entityId: 'e-tsusimskoe-srazhenie', mask: { x: 52.0, y: 74.5, w: 7.0, h: 3.0 } },
    ],
    statements: [
      { text: 'Российскую делегацию на Портсмутских мирных переговорах 1905 года возглавлял С. Ю. Витте.', correct: true, explain: 'Витте добился отказа Японии от контрибуции и сохранения Северного Сахалина.' },
      { text: 'В проливе под цифрой 6 в мае 1905 года русский флот одержал решительную победу над адмиралом Того.', correct: false, explain: 'Цусимское сражение завершилось тяжёлым поражением и гибелью 2-й Тихоокеанской эскадры.' },
      { text: 'Крепость под цифрой 1 была арендована Россией у Китая на Ляодунском полуострове в 1898 году.', correct: true, explain: 'Порт-Артур служил незамерзающей базой Тихоокеанской эскадры.' },
    ],
  },
  {
    id: 'map-ww1',
    title: 'Первая мировая война: Брусиловский прорыв (1916)',
    shortTitle: 'Брусиловский прорыв (1916)',
    period: 'revolution',
    span: 'май–авг. 1916',
    image: '/content/maps/ww1.webp',
    width: 714,
    height: 1227,
    credit: 'А. М. Зайончковский / Wikimedia Commons',
    license: 'Public domain',
    routesDefaultOn: false,
    summary:
      'Знаменитое летнее наступление Юго-Западного фронта генерала А. А. Брусилова (22 мая / 4 июня — август 1916): одновременный прорыв австро-венгерской обороны на широком 500-километровом фронте от Луцка и Ковеля до Тарнополя и Черновиц, нанёсший Австро-Венгрии сокрушительный удар и спасший Италию и Верден.',
    clues: [
      'Русская военно-историческая карта Зайончковского: широкая оранжево-красная полоса прорыва с востока на запад от Ровно, Луцка и Тарнополя до Ковеля, Бродов и Черновиц.',
      'Справа обозначены 8-я, 11-я, 7-я и 9-я армии Юго-Западного фронта, одновременно прорвавшие австро-венгерскую оборону.',
    ],
    blindMasks: [{ x: 0, y: 0, w: 58, h: 7, kind: 'title' }],
    routes: [
      {
        label: 'Главный удар 8-й армии А. М. Каледина (Ровно → Луцк → Ковель)',
        style: 'russian',
        coords: [[80.6, 34.4], [54.8, 29.5], [43.2, 15.8]],
      },
      {
        label: 'Прорыв 9-й армии П. А. Лечицкого на Черновицы и Буковину',
        style: 'russian',
        coords: [[75.0, 81.5], [52.5, 89.0], [22.0, 82.0]],
      },
    ],
    points: [
      { num: 1, id: 'kovel', label: 'Ковель', x: 43.2, y: 15.8, dir: 'nw', kind: 'battle', year: 'июль 1916', prompt: 'Важнейший железнодорожный узел на реке Стоход, на подступах к которому немцы срочно бросили резервы с Западного фронта.', note: 'Бои за Ковель сковали крупные германские силы, облегчив положение союзников у Вердена.', entityId: 'e-brusilovskiy-proryv', mask: { x: 37.5, y: 14.5, w: 6.5, h: 2.0 } },
      { num: 2, id: 'lutsk', label: 'Луцк', x: 54.8, y: 29.5, dir: 'nw', kind: 'battle', year: '25 мая (7 июня) 1916', prompt: 'Город, взятый 8-й армией А. М. Каледина на третий день операции — второе название прорыва («Луцкий»).', note: 'Здесь глубина прорыва австро-венгерского фронта достигла 80–120 км.', entityId: 'e-brusilovskiy-proryv', mask: { x: 50.5, y: 28.5, w: 5.5, h: 2.0 } },
      { num: 3, id: 'rovno', label: 'Ровно', x: 80.6, y: 34.4, dir: 'ne', kind: 'city', year: 'май 1916', prompt: 'Исходный тыловой узел 8-й армии на Волыни, откуда наносился главный северный удар.', note: 'Инженерные подкопы и сближение окопов перед наступлением стали новаторством Брусилова.', mask: { x: 81.2, y: 33.0, w: 6.5, h: 2.0 } },
      { num: 4, id: 'brody', label: 'Броды', x: 45.0, y: 44.0, dir: 'nw', kind: 'battle', year: 'июль 1916', prompt: 'Город на границе Волыни и Галиции, взятый 11-й армией на пути к Львову.', note: 'Открыл угрозу тылам австро-венгерских армий в Галиции.', mask: { x: 42.5, y: 42.5, w: 5.5, h: 2.0 } },
      { num: 5, id: 'lvov', label: 'Львов', x: 15.0, y: 46.2, dir: 'sw', kind: 'city', year: '1914 / 1916', prompt: 'Столица Галиции, ранее взятая в Галицийской битве 1914 г. и ставшая стратегической целью 1916 г.', note: 'Австро-Венгрия потеряла за прорыв свыше 1,5 млн человек убитыми, ранеными и пленными.', entityId: 'e-galitsiyskaya-bitva', mask: { x: 15.0, y: 43.8, w: 7.5, h: 2.2 } },
      { num: 6, id: 'tarnopol', label: 'Тарнополь', x: 53.5, y: 58.2, dir: 'se', kind: 'city', year: 'июнь 1916', prompt: 'Опорный пункт в центральной Галиции в полосе наступления 7-й и 11-й русских армий.', note: 'Одновременные удары всех четырёх армий не дали врагу перебрасывать резервы.', mask: { x: 54.5, y: 57.5, w: 9.5, h: 2.0 } },
      { num: 7, id: 'chernovtsy', label: 'Черновицы (Буковина)', x: 52.5, y: 89.0, dir: 'sw', kind: 'battle', year: 'июнь 1916', prompt: 'Центр Буковины на южном фланге прорыва, освобождённый 9-й армией П. А. Лечицкого.', note: 'Победа в Буковине подтолкнула Румынию вступить в войну на стороне Антанты.', entityId: 'e-brusilovskiy-proryv', mask: { x: 44.0, y: 88.2, w: 9.0, h: 2.0 } },
    ],
    statements: [
      { text: 'Операция, изображённая на карте, проводилась летом 1916 года войсками Юго-Западного фронта под командованием А. А. Брусилова.', correct: true, explain: 'Брусиловский (Луцкий) прорыв длился с 22 мая (4 июня) по август 1916 г.' },
      { text: 'Главная тактическая новизна прорыва состояла в одновременном наступлении всех четырёх армий фронта на нескольких участках.', correct: true, explain: 'Это лишило австро-германское командование возможности маневрировать резервами.' },
      { text: 'В результате данного прорыва русская армия вышла из Первой мировой войны и подписала Брестский мир.', correct: false, explain: 'Наоборот, прорыв стал крупнейшим успехом русской армии в 1916 г.; Брестский мир был подписан лишь в марте 1918 г.' },
    ],
  },
  {
    id: 'map-civil-war',
    title: 'Гражданская война в России (1918–1920)',
    shortTitle: 'Гражданская война (1918–1920)',
    period: 'revolution',
    span: '1918–1920',
    image: '/content/maps/civil-war.webp',
    width: 1009,
    height: 1280,
    credit: 'Hoodinski / Wikimedia Commons',
    license: 'CC BY-SA 3.0',
    routesDefaultOn: false,
    summary:
      'Главная панорама Гражданской войны в Европейской России: красное ядро Советской республики вокруг Москвы и Петрограда, «огненное кольцо» фронтов 1918–1919 гг. — наступление А. В. Колчака с Урала, поход А. И. Деникина с юга через Харьков и Воронеж, удары Н. Н. Юденича на Петроград, интервенция на Севере (Миллер), крестьянские движения (Махно, Антонов) и последний оплот П. Н. Врангеля в Крыму.',
    clues: [
      'Красное ядро в центре вокруг Москвы и Петрограда окружено синими стрелками со всех сторон: Колчак (восток), Деникин и Врангель (юг), Юденич (северо-запад), Миллер (Архангельск).',
      'Пунктирная граница показывает сужение советской территории летом 1918 года, а штриховка — максимальное продвижение белых армий в 1919 году.',
    ],
    blindMasks: [{ x: 18, y: 2, w: 81, h: 15, kind: 'title' }],
    routes: [
      {
        label: 'Наступление А. В. Колчака к Волге (весна 1919)',
        style: 'enemy',
        coords: [[87.0, 31.8], [84.8, 43.2], [70.8, 44.3]],
      },
      {
        label: 'Поход А. И. Деникина на Москву (лето–осень 1919)',
        style: 'enemy',
        coords: [[59.5, 76.8], [46.5, 70.5], [46.2, 55.5]],
      },
      {
        label: 'Походы Н. Н. Юденича на Петроград (1919)',
        style: 'enemy',
        coords: [[23.8, 49.0], [26.1, 42.2]],
      },
    ],
    points: [
      { num: 1, id: 'arkhangelsk', label: 'Архангельск (интервенция, Миллер)', x: 40.9, y: 23.8, dir: 'nw', kind: 'fortress', year: '1918–1920', prompt: 'Северный порт, где высадились войска Антанты и действовало Северное правительство генерала Е. К. Миллера.', note: 'Один из ключевых центров иностранной интервенции на Севере России.', entityId: 'e-grazhdanskaya-voyna', mask: { x: 41.5, y: 21.2, w: 14.0, h: 2.5 } },
      { num: 2, id: 'petrograd', label: 'Петроград (походы Юденича)', x: 26.1, y: 42.2, dir: 'nw', kind: 'battle', year: 'май, окт. 1919', prompt: 'Бывшая столица, на подступах к которой (Пулковские высоты) была остановлена Северо-Западная армия Н. Н. Юденича.', note: 'Столица РСФСР была перенесена в Москву ещё в марте 1918 года.', entityId: 'e-grazhdanskaya-voyna', mask: { x: 27.5, y: 41.0, w: 12.0, h: 2.5 } },
      { num: 3, id: 'moscow', label: 'Москва (центр РСФСР)', x: 44.6, y: 52.8, dir: 'nw', kind: 'city', year: '1918–1920', prompt: 'Столица Советской республики, контролировавшая главный железнодорожный узел и промышленную базу страны.', note: 'Внутреннее положение позволяло красным быстро перебрасывать резервы с фронта на фронт.', entityId: 'e-grazhdanskaya-voyna', mask: { x: 40.0, y: 49.5, w: 9.0, h: 2.5 } },
      { num: 4, id: 'ekaterinburg', label: 'Екатеринбург / Урал (Колчак)', x: 87.0, y: 31.8, dir: 'sw', kind: 'battle', year: '1918–1919', prompt: 'Уральский центр, откуда весной 1919 г. армии Верховного правителя России адмирала А. В. Колчака прорвались к Волге.', note: 'Контрнаступление Восточного фронта (Фрунзе, Тухачевский) отбросило Колчака за Урал.', entityId: 'e-omskiy-perevorot', mask: { x: 81.5, y: 28.5, w: 16.0, h: 6.5 } },
      { num: 5, id: 'samara', label: 'Самара (КОМУЧ, 1918)', x: 76.2, y: 52.4, dir: 'nw', kind: 'city', year: 'июнь–окт. 1918', prompt: 'Волжский город, где после выступления Чехословацкого корпуса возник эсеровский Комитет членов Учредительного собрания (КОМУЧ).', note: 'Символ «демократической контрреволюции» лета 1918 года.', mask: { x: 73.0, y: 53.0, w: 9.0, h: 2.4 } },
      { num: 6, id: 'tsaritsyn', label: 'Царицын', x: 68.8, y: 69.5, dir: 'sw', kind: 'battle', year: '1918–1919', prompt: 'Волжский узел, взятый Кавказской армией Врангеля в июне 1919 г., где А. И. Деникин издал «Московскую директиву».', note: 'Осенью 1919 г. войска Деникина дошли до Орла, но были разбиты под Кромами и Воронежем.', entityId: 'e-pohod-denikina-na-moskvu', mask: { x: 70.0, y: 67.2, w: 11.0, h: 2.5 } },
      { num: 7, id: 'kiev', label: 'Киев (Петлюра, Деникин, РККА)', x: 33.4, y: 72.4, dir: 'nw', kind: 'city', year: '1918–1920', prompt: 'Столица Украины, за которую боролись Директория С. Петлюры, белые армии Деникина, Красная армия и польские войска.', note: 'Власть в городе за годы Гражданской войны менялась более десяти раз.', mask: { x: 28.5, y: 69.2, w: 6.5, h: 2.4 } },
      { num: 8, id: 'simferopol', label: 'Крым / Симферополь (Врангель)', x: 46.8, y: 88.2, dir: 'ne', kind: 'battle', year: '1920', prompt: 'Последний оплот Белого движения на юге России под командованием барона П. Н. Врангеля.', note: 'Падение Перекопа в ноябре 1920 г. привело к эвакуации Русской армии из Крыма.', entityId: 'e-evakuatsiya-kryma-1920', mask: { x: 39.5, y: 89.2, w: 15.5, h: 2.6 } },
    ],
    statements: [
      { text: 'На город под цифрой 2 осенью 1919 года наступала Северо-Западная армия генерала Н. Н. Юденича.', correct: true, explain: 'Цифра 2 — Петроград, дважды штурмовавшийся войсками Юденича в 1919 г.' },
      { text: 'В городе под цифрой 6 в июле 1919 года генерал А. И. Деникин издал «Московскую директиву» о походе на столицу.', correct: true, explain: 'Цифра 6 — Царицын, взятый Кавказской армией Врангеля в июне 1919 г.' },
      { text: 'Войска адмирала А. В. Колчака (цифра 4) сумели захватить Москву в 1919 году.', correct: false, explain: 'Колчак был остановлен на подступах к Волге весной 1919 г. и отброшен за Урал в Сибирь.' },
    ],
  },
  {
    id: 'map-ww2-1941',
    title: 'Великая Отечественная война: 1941 год и битва за Москву',
    shortTitle: 'ВОВ: 1941 и Москва',
    period: 'war',
    span: 'июнь–дек. 1941',
    image: '/content/maps/ww2-1941.webp',
    width: 1201,
    height: 920,
    credit: 'User:Gdr / Wikimedia Commons',
    license: 'CC BY-SA 3.0',
    routesDefaultOn: true,
    summary:
      'Трагический и героический первый этап Великой Отечественной войны (22 июня — 5 декабря 1941): оборона Брестской крепости, Смоленское сражение, начало 872-дневной блокады Ленинграда, оборона Киева и Севастополя и историческое контрнаступление под Москвой 5 декабря 1941 года.',
    clues: [
      'Четыре цветные полосы немецкого продвижения слева направо от Бреста до подступов к Ленинграду, Москве и Ростову — но Сталинград ещё глубоко в тылу!',
      'Зелёный рубеж справа (5 декабря 1941) вплотную подходит к Москве — точка старта контрнаступления.',
    ],
    blindMasks: [{ x: 73, y: 0, w: 27, h: 23.5, kind: 'title' }],
    routes: [
      {
        label: 'Контрнаступление Красной армии под Москвой (5 дек. 1941)',
        style: 'russian',
        coords: [[65.8, 26.8], [61.0, 23.0], [58.5, 29.0]],
      },
      {
        label: 'Южный охват под Тулой и Калугой (дек. 1941)',
        style: 'russian',
        coords: [[65.8, 26.8], [64.5, 34.0], [60.0, 35.5]],
      },
    ],
    points: [
      { num: 1, id: 'brest', label: 'Брестская крепость', x: 31.2, y: 47.0, kind: 'fortress', year: 'июнь–июль 1941', prompt: 'Пограничная крепость, гарнизон которой (П. М. Гаврилов, Е. М. Фомин) около месяца сражался в окружении.', note: 'Один из главных символов мужества первых недель войны.', entityId: 'e-oborona-brestskoy-kreposti', mask: { x: 31.5, y: 45.8, w: 4.5, h: 2.2 } },
      { num: 2, id: 'leningrad', label: 'Ленинград (начало блокады)', x: 50.2, y: 3.8, kind: 'fortress', year: '8 сент. 1941', prompt: 'Город, взятый в блокадное кольцо в сентябре 1941 г. и снабжавшийся зимой по «Дороге жизни» через Ладогу.', note: 'Блокада длилась 872 дня.', entityId: 'e-nachalo-blokady-leningrada', mask: { x: 45.0, y: 1.5, w: 6.5, h: 2.5 } },
      { num: 3, id: 'minsk', label: 'Минск', x: 41.2, y: 38.0, kind: 'battle', year: 'июнь 1941', prompt: 'Столица БССР, у стен которой в первые дни войны разгорелось тяжёлое приграничное сражение Западного фронта.', note: 'Захвачена вермахтом 28 июня 1941 года.', mask: { x: 41.5, y: 37.0, w: 4.5, h: 2.2 } },
      { num: 4, id: 'smolensk', label: 'Смоленск', x: 53.5, y: 33.2, kind: 'battle', year: 'июль–сент. 1941', prompt: 'Двухмесячное сражение на центральном направлении, сорвавшее график немецкого блицкрига к Москве.', note: 'Здесь родилась советская гвардия и впервые массово применили «катюши».', mask: { x: 52.5, y: 31.8, w: 5.5, h: 2.2 } },
      { num: 5, id: 'kiev', label: 'Киев', x: 48.8, y: 57.8, kind: 'battle', year: 'июль–сент. 1941', prompt: 'Столица УССР, упорная оборона которой задержала группу армий «Юг» и отвлекла танковую группу Гудериана от Москвы.', note: 'Оборона длилась более 70 дней.', mask: { x: 49.0, y: 56.8, w: 4.0, h: 2.2 } },
      { num: 6, id: 'moscow', label: 'Москва', x: 65.8, y: 26.8, kind: 'battle', year: '5 дек. 1941', prompt: 'Столица СССР, контрнаступление под которой окончательно похоронило гитлеровский план «Барбаросса».', note: 'Первое крупное поражение вермахта во Второй мировой войне.', entityId: 'e-bitva-za-moskvu', mask: { x: 66.0, y: 25.2, w: 5.5, h: 2.2 } },
      { num: 7, id: 'sevastopol', label: 'Севастополь', x: 58.2, y: 90.2, kind: 'fortress', year: '1941–1942', prompt: 'Крымская база Черноморского флота, выдержавшая 250 дней героической обороны в полном окружении.', note: 'Сковывала 11-ю немецкую армию Манштейна до июля 1942 года.', mask: { x: 53.0, y: 89.5, w: 5.5, h: 2.4 } },
    ],
    statements: [
      { text: 'Контрнаступление под городом, обозначенным цифрой 6, началось 5–6 декабря 1941 года и сорвало план «Барбаросса».', correct: true, explain: 'Битва за Москву стала первым крупным стратегическим поражением вермахта.' },
      { text: 'Город под цифрой 2 оказался в блокадном кольце 8 сентября 1941 года.', correct: true, explain: '8 сентября 1941 г. немцы захватили Шлиссельбург, перерезав сухопутную связь Ленинграда со страной.' },
      { text: 'На данной карте отражены события коренного перелома и окружение армии Паулюса под Сталинградом.', correct: false, explain: 'Карта охватывает только 1941 год; линия фронта ещё далеко к западу от Сталинграда.' },
    ],
  },
  {
    id: 'map-ww2-1942',
    title: 'Сталинградская битва: операция «Уран» (1942–1943)',
    shortTitle: 'Сталинград: «Уран» (1942–1943)',
    period: 'war',
    span: 'нояб. 1942 – фев. 1943',
    image: '/content/maps/ww2-1942.webp',
    width: 1168,
    height: 1280,
    credit: 'Alex Rott / Wikimedia Commons',
    license: 'Public domain',
    routesDefaultOn: false,
    summary:
      'Контрнаступление трёх советских фронтов (Юго-Западный — Н. Ф. Ватутин, Донской — К. К. Рокоссовский, Сталинградский — А. И. Ерёменко), начавшееся 19 ноября 1942 г.: встречные удары с плацдармов у Серафимовича и южнее Сталинграда сомкнули кольцо в районе Калача-на-Дону 23 ноября, окружив 330-тысячную группировку фельдмаршала Паулюса.',
    clues: [
      'Две мощные красные стрелы-клещи между Волгой (справа) и Доном (вверху и слева) сходятся точно в точке «Калач-на-Дону · 22 ноября»!',
      'Внутри «котла» — 6-я немецкая армия у Сталинграда, на флангах разбиты 3-я и 4-я румынские армии, а снизу у Котельникова показан рубеж группы армий Гота (деблокада Манштейна).',
    ],
    blindMasks: [
      { x: 28, y: 0, w: 46, h: 5.5, kind: 'title' },
      { x: 0, y: 85, w: 42, h: 15, kind: 'title' },
      { x: 87.5, y: 24.5, w: 12.0, h: 14.5, kind: 'label' },
    ],
    routes: [
      {
        label: 'Северная клешня: Юго-Западный и Донской фронты (Серафимович → Калач-на-Дону)',
        style: 'russian',
        coords: [[38.3, 14.0], [45.0, 32.0], [57.2, 44.0]],
      },
      {
        label: 'Южная клешня: Сталинградский фронт (южнее Сталинграда → Калач-на-Дону)',
        style: 'russian',
        coords: [[84.0, 62.0], [70.0, 54.0], [57.2, 44.0]],
      },
    ],
    points: [
      { num: 1, id: 'serafimovich', label: 'Серафимович (плацдарм)', x: 38.3, y: 14.0, dir: 'nw', kind: 'battle', year: '19 нояб. 1942', prompt: 'Плацдарм на правом берегу Дона, откуда Юго-Западный фронт Н. Ф. Ватутина нанёс сокрушительный удар по 3-й румынской армии.', note: 'Мощная артподготовка в 7:30 утра 19 ноября открыла операцию «Уран».', entityId: 'e-stalingradskaya-bitva', mask: { x: 25.8, y: 14.4, w: 13.0, h: 2.6 } },
      { num: 2, id: 'kremenskaya', label: 'Кременская (Донской фронт)', x: 57.8, y: 17.0, dir: 'nw', kind: 'battle', year: '19 нояб. 1942', prompt: 'Плацдарм Донского фронта К. К. Рокоссовского, обеспечивший внутренний фронт окружения 6-й армии.', note: 'Позднее Донской фронт провёл операцию «Кольцо» по ликвидации окружённой группировки.', entityId: 'e-stalingradskaya-bitva', mask: { x: 57.4, y: 14.8, w: 11.2, h: 2.5 } },
      { num: 3, id: 'kalach', label: 'Калач-на-Дону (смыкание кольца)', x: 57.2, y: 44.0, dir: 'se', kind: 'battle', year: '23 нояб. 1942', prompt: 'Город на Дону, где соединились передовые танковые корпуса Юго-Западного и Сталинградского фронтов, замкнув кольцо окружения.', note: 'В котле оказались 22 дивизии вермахта (~330 тыс. солдат и офицеров).', entityId: 'e-stalingradskaya-bitva', mask: { x: 50.8, y: 41.0, w: 13.6, h: 2.6 } },
      { num: 4, id: 'stalingrad', label: 'Сталинград (62-я армия Чуйкова)', x: 80.1, y: 49.5, dir: 'se', kind: 'fortress', year: '17 июля 1942 – 2 фев. 1943', prompt: 'Город на Волге (Мамаев курган, Дом Павлова), где 2 февраля 1943 г. капитулировала 6-я армия Ф. Паулюса.', note: 'Сталинградская победа положила начало коренному перелому во Второй мировой войне.', entityId: 'e-stalingradskaya-bitva', mask: { x: 84.2, y: 39.6, w: 14.5, h: 3.0 } },
      { num: 5, id: 'kotelnikovo', label: 'Котельниково (удар Манштейна)', x: 48.5, y: 81.8, dir: 'nw', kind: 'battle', year: 'дек. 1942', prompt: 'Железнодорожная станция, откуда танковая группа Гота (операция «Зимняя гроза» Манштейна) пыталась деблокировать Паулюса.', note: 'Остановлена 2-й гвардейской армией Р. Я. Малиновского на реке Мышкове.', entityId: 'e-stalingradskaya-bitva', mask: { x: 48.8, y: 81.4, w: 11.5, h: 2.4 } },
      { num: 6, id: 'morozovsk', label: 'Морозовск', x: 14.9, y: 56.0, dir: 'nw', kind: 'city', year: 'дек. 1942 — янв. 1943', prompt: 'Крупный немецкий аэродром снабжения «воздушного моста» в Сталинград, захваченный Красной армией в операции «Малый Сатурн».', note: 'Окончательно лишил окружённую 6-ю армию поставок по воздуху.', mask: { x: 7.2, y: 56.6, w: 9.8, h: 2.8 } },
    ],
    statements: [
      { text: 'Соединение советских фронтов и замыкание кольца окружения вокруг 6-й армии Паулюса произошло 23 ноября 1942 г. в районе города под цифрой 3.', correct: true, explain: 'Цифра 3 — Калач-на-Дону (встреча частей 4-го танкового и 4-го механизированного корпусов).' },
      { text: 'В декабре 1942 года из района станции под цифрой 5 группа армий Манштейна (4-я танковая армия Гота) пыталась деблокировать окружённых.', correct: true, explain: 'Цифра 5 — Котельниково (немецкая операция «Зимняя гроза», сорванная на реке Мышкове).' },
      { text: 'Окончательная капитуляция окружённой группировки в городе под цифрой 4 произошла в июле 1943 года.', correct: false, explain: 'Капитуляция 6-й армии Паулюса состоялась 31 января — 2 февраля 1943 года.' },
    ],
  },
  {
    id: 'map-ww2-bagration',
    title: 'Операция «Багратион» и освобождение Белоруссии (1944)',
    shortTitle: 'Операция «Багратион» (1944)',
    period: 'war',
    span: 'июнь–авг. 1944',
    image: '/content/maps/ww2-bagration.webp',
    width: 1101,
    height: 1280,
    credit: 'Kl833x9 / Wikimedia Commons',
    license: 'CC BY-SA 3.0',
    routesDefaultOn: false,
    summary:
      'Один из величайших стратегических триумфов Красной армии (23 июня — 29 августа 1944): сокрушительный разгром немецкой группы армий «Центр» силами четырёх фронтов (Жуков, Василевский, Рокоссовский, Черняховский, Баграмян), «котлы» под Витебском, Бобруйском и Минском и выход к Висле и границам Восточной Пруссии.',
    clues: [
      'Крупномасштабная цветная рельефная карта Белоруссии и Прибалтики с датами «22.06», «08.07» и «29.08» и тремя синими кольцами окружений (Витебск, Бобруйск, Минск)!',
      'Мощные красные и оранжевые стрелки идут СПРАВА НАЛЕВО от Днепра к Варшаве и Рижскому заливу.',
    ],
    routes: [
      {
        label: 'Северные клещи на Минск и Вильнюс (3-й Белорусский фронт)',
        style: 'russian',
        coords: [[69.2, 46.2], [54.0, 59.5], [40.0, 52.5]],
      },
      {
        label: 'Южные клещи: Бобруйск → Минск → Брест → Варшава (1-й Белорусский фронт)',
        style: 'russian',
        coords: [[62.5, 66.8], [54.0, 59.5], [29.8, 78.2], [9.2, 75.5]],
      },
    ],
    points: [
      { num: 1, id: 'vitebsk', label: 'Витебск', x: 69.2, y: 46.2, kind: 'battle', year: '26 июня 1944', prompt: 'Северный узел обороны группы армий «Центр», где в первые дни операции были окружены 5 немецких дивизий.', note: 'Взят войсками 1-го Прибалтийского и 3-го Белорусского фронтов.', entityId: 'e-operatsiya-bagration', mask: { x: 70.0, y: 44.0, w: 9.0, h: 2.8 } },
      { num: 2, id: 'bobruisk', label: 'Бобруйск', x: 62.5, y: 66.8, kind: 'battle', year: '29 июня 1944', prompt: 'Южный «котёл» на реке Березине, где 1-й Белорусский фронт К. К. Рокоссовского применил идею двух главных ударов.', note: 'Открыл стремительную дорогу танковым армиям на Минск.', entityId: 'e-operatsiya-bagration', mask: { x: 62.5, y: 65.0, w: 8.5, h: 2.5 } },
      { num: 3, id: 'minsk', label: 'Минск', x: 54.0, y: 59.5, kind: 'battle', year: '3 июля 1944', prompt: 'Столица БССР, восточнее которой в гигантском «Минском котле» оказалось свыше 100 тысяч солдат вермахта.', note: '57 тысяч пленных немцев из этого «котла» провели маршем по Москве 17 июля 1944 г.', entityId: 'e-operatsiya-bagration', mask: { x: 54.0, y: 58.0, w: 8.0, h: 2.8 } },
      { num: 4, id: 'vilnius', label: 'Вильнюс', x: 40.0, y: 52.5, kind: 'battle', year: '13 июля 1944', prompt: 'Столица Литовской ССР, освобождённая войсками 3-го Белорусского фронта И. Д. Черняховского.', note: 'Открыла путь к Неману и границам Восточной Пруссии.', mask: { x: 40.5, y: 50.8, w: 9.5, h: 4.5 } },
      { num: 5, id: 'brest-44', label: 'Брест', x: 29.8, y: 78.2, kind: 'fortress', year: '28 июля 1944', prompt: 'Пограничный город, освобождение которого означало полное очищение территории Белоруссии от захватчиков.', note: 'Символическое возвращение на границу 22 июня 1941 года.', mask: { x: 27.5, y: 76.2, w: 6.5, h: 2.6 } },
      { num: 6, id: 'warsaw-44', label: 'Варшава (рубеж Вислы)', x: 9.2, y: 75.5, kind: 'city', year: 'авг. 1944', prompt: 'Польская столица на Висле, к предместью которой (Прага) советские войска вышли в финале операции.', note: 'На Висле были захвачены Магнушевский и Пулавский плацдармы для удара 1945 года.', mask: { x: 9.8, y: 74.2, w: 9.5, h: 2.6 } },
      { num: 7, id: 'pskov-44', label: 'Псков', x: 55.5, y: 21.5, kind: 'city', year: '23 июля 1944', prompt: 'Древний русский город на северном крыле летнего наступления 1944 года, освобождённый 3-м Прибалтийским фронтом.', note: 'Линия «Пантера» на северо-западе была прорвана.', mask: { x: 56.0, y: 19.5, w: 7.0, h: 2.8 } },
    ],
    statements: [
      { text: 'Операция, изображённая на карте (июнь–август 1944 г.), носила кодовое название «Багратион».', correct: true, explain: 'Белорусская стратегическая операция (23 июня — 29 августа 1944 г.) разгромила группу армий «Центр».' },
      { text: 'В «котле» восточнее столицы под цифрой 3 оказалось окружено свыше 100 тысяч немецких солдат и офицеров.', correct: true, explain: 'Минск был освобождён 3 июля 1944 г., а 17 июля 57 тыс. пленных провели по Садовому кольцу Москвы.' },
      { text: 'В ходе данной летней операции 1944 года советские войска завершили штурм Берлина.', correct: false, explain: 'Операция «Багратион» завершилась выходом к Висле и границам Восточной Пруссии; Берлин взят в мае 1945 г.' },
    ],
  },
  {
    id: 'map-ww2-1945',
    title: 'Победа 1945 года: от Вислы до Берлина и Праги',
    shortTitle: 'Победа в Европе (1945)',
    period: 'war',
    span: 'янв.–май 1945',
    image: '/content/maps/ww2-1945.webp',
    width: 1201,
    height: 921,
    credit: 'User:Gdr / Wikimedia Commons',
    license: 'CC BY-SA 3.0',
    routesDefaultOn: true,
    summary:
      'Завершающие стратегические операции в Европе (1 января — 11 мая 1945): Висло-Одерский бросок через Польшу, штурм Кёнигсберга в Восточной Пруссии, освобождение Будапешта и Вены, штурм Берлина (16 апреля — 2 мая) и Пражская операция.',
    clues: [
      'Вся территория СССР уже полностью свободна — боевые действия идут только на крайнем ЗАПАДЕ карты (Восточная Пруссия, Польша, Германия, Австрия, Чехословакия)!',
      'Оранжевая полоса — Висло-Одерское наступление до марта 1945, зелёная полоса на краю — Берлин, Вена и Прага в апреле–мае 1945.',
    ],
    blindMasks: [{ x: 73, y: 0, w: 27, h: 19.5, kind: 'title' }],
    routes: [
      {
        label: 'Висло-Одерская и Берлинская операции (янв.–май 1945)',
        style: 'russian',
        coords: [[24.2, 45.2], [13.0, 42.5], [4.0, 40.2]],
      },
      {
        label: 'Восточно-Прусская операция и штурм Кёнигсберга (янв.–апр. 1945)',
        style: 'russian',
        coords: [[30.5, 31.5], [25.0, 29.8]],
      },
      {
        label: 'Будапештская, Венская и Пражская операции (1945)',
        style: 'russian',
        coords: [[15.5, 70.8], [9.0, 66.2], [5.2, 54.0]],
      },
    ],
    points: [
      { num: 1, id: 'konigsberg', label: 'Кёнигсберг', x: 25.0, y: 29.8, kind: 'fortress', year: '6–9 апр. 1945', prompt: 'Цитадель Восточной Пруссии, взятая штурмом войск А. М. Василевского за четверо суток.', note: 'По Потсдамской конференции перешёл к СССР (ныне Калининград).', entityId: 'e-shturm-kenigsberga', mask: { x: 22.0, y: 29.0, w: 6.0, h: 2.2 } },
      { num: 2, id: 'warsaw-45', label: 'Варшава (Висло-Одерская операция)', x: 24.2, y: 45.2, kind: 'battle', year: '17 янв. 1945', prompt: 'Столица Польши, освобождённая в начале стремительного броска от Вислы к Одеру.', note: 'За три недели советские войска прошли ~500 км до подступов к Берлину.', mask: { x: 24.5, y: 44.5, w: 5.0, h: 2.2 } },
      { num: 3, id: 'berlin', label: 'Берлин', x: 4.0, y: 40.2, kind: 'battle', year: '16 апр. – 2 мая 1945', prompt: 'Столица Третьего рейха, штурм которой фронтами Жукова, Конева и Рокоссовского завершил войну в Европе.', note: 'В ночь на 9 мая в Карлсхорсте подписан Акт о безоговорочной капитуляции Германии.', entityId: 'e-berlinskaya-operatsiya', mask: { x: 1.5, y: 38.8, w: 5.5, h: 2.4 } },
      { num: 4, id: 'prague', label: 'Прага', x: 5.2, y: 54.0, kind: 'battle', year: '6–11 мая 1945', prompt: 'Столица Чехословакии — последняя крупная наступательная операция Красной армии в Европе.', note: 'Танковые армии И. С. Конева пришли на помощь Пражскому восстанию 9 мая 1945 г.', mask: { x: 5.2, y: 53.0, w: 4.5, h: 2.4 } },
      { num: 5, id: 'vienna', label: 'Вена', x: 9.0, y: 66.2, kind: 'battle', year: '13 апр. 1945', prompt: 'Столица Австрии, освобождённая войсками 2-го и 3-го Украинских фронтов (Малиновский, Толбухин).', note: 'В боях сохранили от подрыва исторические мосты и центр города.', mask: { x: 5.5, y: 64.8, w: 4.5, h: 2.4 } },
      { num: 6, id: 'budapest', label: 'Будапешт', x: 15.5, y: 70.8, kind: 'battle', year: '13 фев. 1945', prompt: 'Столица Венгрии, взятая после ожесточённой 108-дневной операции на Дунае.', note: 'Лишила Германию последнего европейского союзника и венгерской нефти.', mask: { x: 15.8, y: 69.8, w: 5.5, h: 2.4 } },
    ],
    statements: [
      { text: 'Город-крепость под цифрой 1 после Потсдамской конференции вошёл в состав СССР (ныне Калининград).', correct: true, explain: 'Кёнигсберг был взят штурмом 6–9 апреля 1945 г. войсками 3-го Белорусского фронта.' },
      { text: 'Штурм столицы Третьего рейха под цифрой 3 завершился 2 мая 1945 года.', correct: true, explain: 'Берлинская операция длилась с 16 апреля по 2 мая 1945 г.; Знамя Победы водружено над Рейхстагом.' },
      { text: 'Операция по освобождению города под цифрой 4 состоялась в январе 1944 года.', correct: false, explain: 'Пражская операция прошла 6–11 мая 1945 года — это последняя операция в Европе.' },
    ],
  },
];

const CORE_BATTLE_IDS = new Set<string>([
  'map-kulikovo',
  'map-tarutino',
  'map-perekop',
  'map-ww2-1942',
  'map-ww2-kursk',
]);

export function mapScope(map: HistoricalMap): MapScope {
  if (map.scope) return map.scope;
  return CORE_BATTLE_IDS.has(map.id) ? 'battle' : 'campaign';
}

const CHRONO_ORDER: readonly string[] = [
  'map-varangians',
  'map-svyatoslav',
  'map-batu',
  'map-nevsky',
  'map-kulikovo',
  'map-moscow-rise',
  'map-kazan-1552',
  'map-livonian',
  'map-siberia',
  'map-smuta',
  'map-andrusovo',
  'map-razin',
  'map-northern-war',
  'map-poltava-1709',
  'map-gangut-1714',
  'map-kunersdorf-1759',
  'map-turkish-c18',
  'map-chesma-1770',
  'map-kagul-1770',
  'map-poland-partitions',
  'map-pugachev',
  'map-izmail-1790',
  'map-suvorov',
  'map-1812',
  'map-borodino-1812',
  'map-tarutino',
  'map-leipzig-1813',
  'map-decembrists-1825',
  'map-caucasus',
  'map-crimean',
  'map-sinop-1853',
  'map-sevastopol-siege',
  'map-sevastopol-crimea',
  'map-kars-1855',
  'map-central-asia',
  'map-turkish-1877',
  'map-plevna-1877',
  'map-growth-empire',
  'map-russo-japanese',
  'map-port-arthur-1904',
  'map-tsushima-1905',
  'map-ww1-eastprussia',
  'map-ww1',
  'map-civil-war',
  'map-perekop',
  'map-winter-war',
  'map-ww2-1941',
  'map-moscow-defense-1941',
  'map-leningrad-blockade',
  'map-ww2-1942',
  'map-iskra-1943',
  'map-ww2-kursk',
  'map-dnieper-1943',
  'map-ww2-bagration',
  'map-vistula-oder-1945',
  'map-berlin-1945',
  'map-ww2-1945',
  'map-manchuria-1945',
];

const ALL_MAP_INDEX = new Map<string, HistoricalMap>(
  [...CORE_HISTORICAL_MAPS, ...EXTRA_HISTORICAL_MAPS, ...BATTLE_HISTORICAL_MAPS].map((m) => [m.id, m]),
);

export const HISTORICAL_MAPS: readonly HistoricalMap[] = CHRONO_ORDER
  .map((id) => ALL_MAP_INDEX.get(id))
  .filter((m): m is HistoricalMap => Boolean(m));

export function findMapById(id: string): HistoricalMap | undefined {
  return HISTORICAL_MAPS.find((m) => m.id === id);
}

/**
 * Resolves a local map asset path against Vite's `BASE_URL` (supporting `./`, `/`, sub-paths,
 * and Capacitor WebView) while preserving absolute HTTP(S)/data URLs untouched.
 */
export function resolveMapImage(path: string, base: string = './'): string {
  if (!path || /^(https?:|data:|blob:)/.test(path)) return path;
  const cleanPath = path.replace(/^\/+/, '');
  const cleanBase = !base || base === '/' ? '/' : base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}${cleanPath}`;
}

export function filterMaps(
  maps: readonly HistoricalMap[],
  opts: { period?: string | null; scope?: MapScope | null; query?: string } = {},
): HistoricalMap[] {
  const { period = null, scope = null } = opts;
  const q = (opts.query ?? '').trim().toLowerCase();
  return maps.filter((m) => {
    if (period && m.period !== period) return false;
    if (scope && mapScope(m) !== scope) return false;
    if (!q) return true;
    const hay = [
      m.title,
      m.shortTitle,
      m.span,
      m.summary,
      ...m.points.map((p) => `${p.label} ${p.note}`),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Builds an ordered locate-on-map drill for a single map (shuffled points). */
export function buildLocateQueue(
  map: HistoricalMap,
  random: () => number = Math.random,
): BlindMapPoint[] {
  const copy = [...map.points];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export interface BlindCampaignRound {
  map: HistoricalMap;
  titleOptions: { id: string; label: string; span: string }[];
  targetPoint: BlindMapPoint;
  pointOptions: string[];
}

/**
 * Generates a full olympiad «Узнай слепую схему» round:
 * 1) 4 plausible campaign titles (including the correct map),
 * 2) 1 key numbered point to decode from 4 options,
 * 3) the map's 3 olympiad true/false statements.
 */
export function buildBlindCampaignRound(
  map: HistoricalMap,
  allMaps: readonly HistoricalMap[] = HISTORICAL_MAPS,
  random: () => number = Math.random,
): BlindCampaignRound {
  const others = allMaps.filter((m) => m.id !== map.id);
  const shuffledOthers = [...others];
  for (let i = shuffledOthers.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffledOthers[i], shuffledOthers[j]] = [shuffledOthers[j]!, shuffledOthers[i]!];
  }
  const titleOptions = [map, ...shuffledOthers.slice(0, 3)].map((m) => ({
    id: m.id,
    label: m.title,
    span: m.span,
  }));
  for (let i = titleOptions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [titleOptions[i], titleOptions[j]] = [titleOptions[j]!, titleOptions[i]!];
  }

  const targetIdx = Math.min(map.points.length - 1, Math.floor(random() * map.points.length));
  const targetPoint = map.points[targetIdx]!;

  const otherPoints = map.points.filter((p) => p.id !== targetPoint.id).map((p) => p.label);
  for (let i = otherPoints.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [otherPoints[i], otherPoints[j]] = [otherPoints[j]!, otherPoints[i]!];
  }
  const pointOptions = [targetPoint.label, ...otherPoints.slice(0, 3)];
  for (let i = pointOptions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pointOptions[i], pointOptions[j]] = [pointOptions[j]!, pointOptions[i]!];
  }

  return { map, titleOptions, targetPoint, pointOptions };
}

export function scoreBlindCampaign(input: {
  campaignCorrect: boolean;
  pointCorrect: boolean;
  statementsCorrect: number;
  statementsTotal: number;
}): { score: number; percent: number; xp: number } {
  const c = input.campaignCorrect ? 1 : 0;
  const p = input.pointCorrect ? 1 : 0;
  const s = input.statementsTotal > 0 ? input.statementsCorrect / input.statementsTotal : 0;
  const score = Math.round((c * 0.35 + p * 0.25 + s * 0.4) * 100) / 100;
  return {
    score,
    percent: Math.round(score * 100),
    xp: Math.max(10, Math.round(12 + score * 24)),
  };
}

export function mapStats(maps: readonly HistoricalMap[], progress: Readonly<MapProgressMap>): {
  total: number;
  mastered: number;
  blindSolved: number;
} {
  let mastered = 0;
  let blindSolved = 0;
  for (const m of maps) {
    const rec = progress[m.id];
    if (!rec) continue;
    if (rec.locateBest >= 0.8 || rec.blindSolved) mastered++;
    if (rec.blindSolved) blindSolved++;
  }
  return { total: maps.length, mastered, blindSolved };
}

export interface AttributionRound {
  item: AttributionItem;
  options: { id: string; label: string; sub?: string }[];
  correctOptionId: string;
}

/**
 * Generates a visual attribution round from real `kb.culture` items that have BOTH an image and
 * attribution `features`: picks 3 plausible distractors from the same kind (e.g. architecture vs architecture).
 */
export function buildAttributionRound(
  pool: readonly AttributionItem[],
  opts: { mode?: 'title' | 'period'; excludeId?: string; periodLabel?: (pid: string) => string; random?: () => number } = {},
): AttributionRound | undefined {
  if (pool.length < 2) return undefined;
  const rng = opts.random ?? Math.random;
  const mode = opts.mode ?? 'title';
  const candidates = pool.length > 1 && opts.excludeId ? pool.filter((x) => x.id !== opts.excludeId) : [...pool];
  const item = candidates[Math.floor(rng() * candidates.length)]!;

  if (mode === 'period') {
    const periods = [...new Set(pool.map((x) => x.period))];
    const distractors = periods.filter((p) => p !== item.period);
    for (let i = distractors.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [distractors[i], distractors[j]] = [distractors[j]!, distractors[i]!];
    }
    const chosen = [item.period, ...distractors.slice(0, 3)];
    for (let i = chosen.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [chosen[i], chosen[j]] = [chosen[j]!, chosen[i]!];
    }
    return {
      item,
      options: chosen.map((pid) => ({ id: pid, label: opts.periodLabel ? opts.periodLabel(pid) : pid })),
      correctOptionId: item.period,
    };
  }

  const sameKind = pool.filter((x) => x.id !== item.id && x.kind === item.kind);
  const fallback = pool.filter((x) => x.id !== item.id && x.kind !== item.kind);
  const srcPool = sameKind.length >= 3 ? [...sameKind] : [...sameKind, ...fallback];
  for (let i = srcPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [srcPool[i], srcPool[j]] = [srcPool[j]!, srcPool[i]!];
  }
  const picks = [item, ...srcPool.slice(0, 3)];
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [picks[i], picks[j]] = [picks[j]!, picks[i]!];
  }
  return {
    item,
    options: picks.map((x) => ({
      id: x.id,
      label: x.title,
      sub: x.author ? x.author : x.place,
    })),
    correctOptionId: item.id,
  };
}
