/**
 * Kinds of written historical sources as olympiad projects classify them — by the purpose the author had
 * («зачем создан?»), after the source-study course of HSE (И. Н. Данилевский и др., «Источниковедение», 2019).
 * The document block shows the kind with its purpose, so the student learns to tell a law from an act,
 * office papers from records, publicism from a diary.
 */
import type { SOURCE_GENRES } from '$lib/core/content/schema';

export type SourceGenre = (typeof SOURCE_GENRES)[number];

export const GENRES: Record<SourceGenre, { label: string; purpose: string }> = {
  chronicle: { label: 'Летописание', purpose: 'повествование по годам; летописи вбирают договоры, повести, жития' },
  law: { label: 'Законодательство', purpose: 'устанавливает новые нормы для всего общества от имени верховной власти' },
  act: { label: 'Актовый источник', purpose: 'устанавливает правоотношения между сторонами: договор, грамота, завещание' },
  office: { label: 'Делопроизводство', purpose: 'обслуживает работу системы — государства, ведомства, имения: доклады, рапорты, протоколы, прошения' },
  records: { label: 'Материалы учёта', purpose: 'контроль уже принятых решений: писцовые и переписные книги, ревизские сказки' },
  statistics: { label: 'Статистика', purpose: 'сведения для обработки и выработки будущих решений: переписи, обследования' },
  publicism: { label: 'Публицистика', purpose: 'выражает мнение общественной группы по острому вопросу; сюда же проекты конституций' },
  periodical: { label: 'Периодическая печать', purpose: 'газеты и журналы: формируют общественное мнение и служат каналом связи с властью' },
  personal: { label: 'Источник личного происхождения', purpose: 'общение людей или с самим собой: дневники, мемуары, письма' },
  literature: { label: 'Литературное произведение', purpose: 'художественный текст: даже автобиографический, он содержит вымысел' },
  historiography: { label: 'Историография', purpose: 'исследование историка: представляет знание о прошлом, а не свидетельствует о нём' },
};
