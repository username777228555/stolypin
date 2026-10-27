/**
 * «Губернии 1856» — the set of geographic cards by К. М. Грибанов (СПб., 1856; РНБ, общественное
 * достояние): one card per governorate, oblast or land of the empire, each with a coat of arms, map, peoples,
 * climate, rivers, population and a costume, and on the other side its towns, trades and distances.
 *
 * Data: `content/gubernii/1856.json` (transcription in modern spelling, one entry per card) and the scans
 * `content/gubernii/1856/cNNN.webp` (fetched by `scripts/media/gubernii_1856.py`). Commons numbers the scans in
 * pairs: the odd file is the «Особенности» side, the even one the main side — `front`/`back` keep the numbers.
 * An entry whose scan is missing is skipped, so the screen works while the set is still being filled in.
 */
export interface Gubernia {
  /** Latin slug, stable: progress and links use it. */
  id: string;
  /** Name in modern spelling, as on the card: «Виленская губерния». */
  name: string;
  /** Number of the main-side scan (coat of arms, map). */
  front: number;
  /** Number of the «Особенности» scan (towns, trades). */
  back: number;
  /** Group for the filter: «Финляндия», «Прибалтика», «Сибирь»… */
  region: string;
  /** Губернский город. */
  center?: string;
  /** Where the land lies today, one short phrase. */
  today?: string;
  peoples?: string;
  climate?: string;
  soil?: string;
  rivers?: string;
  sea?: string;
  /** «Душ обоего пола» on the card. */
  population?: number;
  /** «Квадратных вёрст» on the card. */
  area?: number;
  cities?: string[];
  /** Pictures on the «Особенности» side: trades, crafts, landmarks. */
  features?: string[];
  /** Lines of the «Особенности» side: fortress, trade, a date from the town's past (as the card puts it). */
  note?: string;
  /** The card leaves the coat-of-arms box empty (the Caucasus governorates): «Чей герб?» skips it. */
  noArms?: boolean;
  /** Versts from the губернский город to Петербург and to Москва. */
  spb?: number;
  moscow?: number;
}

interface SetFile {
  title: string;
  author: string;
  year: number;
  holder: string;
  license: string;
  cards: Gubernia[];
}

const files = import.meta.glob<SetFile>('/content/gubernii/1856.json', { eager: true, import: 'default' });
const scans = import.meta.glob<string>('/content/gubernii/1856/*.webp', { eager: true, query: '?url', import: 'default' });

const set: SetFile = Object.values(files)[0] ?? { title: '', author: '', year: 1856, holder: '', license: '', cards: [] };

/** URL of scan number `n`, if it is in the build. */
export function scan(n: number): string | undefined {
  return scans[`/content/gubernii/1856/c${String(n).padStart(3, '0')}.webp`];
}

/** Cards whose main side is present, in the order of the set (alphabetical, as in 1856). */
export const gubernii: Gubernia[] = set.cards.filter((g) => scan(g.front));
export const setInfo = { title: set.title, author: set.author, year: set.year, holder: set.holder, license: set.license };
/** Parts of the empire for the filter, west to east and north to south; any other `region` goes last. */
const REGION_ORDER = ['Центральная Россия', 'Север', 'Прибалтика', 'Финляндия', 'Царство Польское', 'Западный край', 'Малороссия', 'Новороссия и Бессарабия', 'Поволжье и Урал', 'Кавказ', 'Сибирь и Америка'];
const rank = (r: string) => (REGION_ORDER.includes(r) ? REGION_ORDER.indexOf(r) : REGION_ORDER.length);
export const regions: string[] = [...new Set(gubernii.map((g) => g.region))].sort((a, b) => rank(a) - rank(b));
export const byId = new Map(gubernii.map((g) => [g.id, g]));

/**
 * Parts of the main side, as fractions of the card (all the cards share one engraved layout): the coat of arms
 * with its side labels, and the map without the title line. Used by the «Чей герб?» / «Чья карта?» quizzes.
 */
export const CROPS = {
  arms: { x: 0.12, y: 0.07, w: 0.33, h: 0.23 },
  map: { x: 0.07, y: 0.355, w: 0.86, h: 0.29 },
} as const;
export type CropName = keyof typeof CROPS;

/** «Виленская губерния» → «Виленская»: options in the quiz stay short. */
export const shortName = (g: Gubernia) => g.name.replace(/\s+(губерния|область)$/i, '');
