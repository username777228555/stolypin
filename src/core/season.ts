/**
 * Сезонное новогоднее оформление «Русская зима» (Гжель и Хохлома).
 * В режиме «Авто» включается с 15 ноября по 20 января включительно:
 * днём — бело-синий фарфор Гжели, ночью — золотая роспись Хохломы.
 */

export type WinterPref = 'auto' | 'gzhel' | 'khokhloma' | 'off';
export type WinterTheme = 'off' | 'gzhel' | 'khokhloma';

/** Активен ли новогодний сезон: с 15 ноября по 20 января включительно. */
export function isWinterSeason(date: Date = new Date()): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return (month === 11 && day >= 15) || month === 12 || (month === 1 && day <= 20);
}

/** Итоговый стиль зимней темы с учётом настройки пользователя, тёмного режима и даты. */
export function resolveWinterTheme(
  pref: WinterPref | undefined,
  dark: boolean,
  date: Date = new Date(),
): WinterTheme {
  const mode = pref ?? 'gzhel';
  if (mode === 'off') return 'off';
  if (mode === 'gzhel' || mode === 'khokhloma') return mode;
  if (!isWinterSeason(date)) return 'off';
  return dark ? 'khokhloma' : 'gzhel';
}

/** Сколько дней осталось до Нового года (15 нояб. — 31 дек.), 0 на 1 января, иначе null. */
export function daysUntilNewYear(date: Date = new Date()): number | null {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month === 1 && day === 1) return 0;
  if (!((month === 11 && day >= 15) || month === 12)) return null;
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const nextJan1 = Date.UTC(date.getFullYear() + 1, 0, 1);
  return Math.round((nextJan1 - today) / 86_400_000);
}
