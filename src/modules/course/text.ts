/**
 * Lesson text → HTML: paragraphs and **bold** like richText, plus `[[id]]` / `[[id|подпись]]` links to the
 * knowledge base rendered as inline links with `data-ref` (the page opens the entity sheet on tap; a link, not a
 * button, so a long label wraps with the line instead of jumping to its own); `lessonFigures` —
 * the pictures placed in the text after the paragraphs that mention them (LessonFigures.svelte).
 */
import { escapeHtml, richText } from '$lib/core/utils/text';
import { kb } from '$lib/core/content/kb.svelte';
import type { ImageInfo } from '$lib/core/content/schema';

export function lessonHtml(text: string): string {
  return richText(text).replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (_, id: string, label?: string) =>
    kb.get(id) ? `<a class="ref" href="#/entity/${id}" data-ref="${id}">${label ?? escapeHtml(kb.title(id))}</a>` : (label ?? id),
  );
}

/** One line of lesson markup without paragraphs — table cells, labels of blocks: **bold**, *italic*, [[links]]. */
export function lessonInline(text: string): string {
  return escapeHtml(text.trim())
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (_, id: string, label?: string) =>
      kb.get(id) ? `<a class="ref" href="#/entity/${id}" data-ref="${id}">${label ?? escapeHtml(kb.title(id))}</a>` : (label ?? id),
    );
}

/** Plain text without link markup (for previews). */
export const lessonPlain = (text: string) => text.replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, '$1').replace(/\[\[([a-z0-9-]+)\]\]/g, (_, id: string) => kb.title(id));

export interface Figure {
  id: string;
  title: string;
  src: string;
  info?: ImageInfo;
}
/** Paragraphs of a section text, as richText splits them. */
export const paragraphs = (text: string) => text.split(/\n{2,}/);
/** Per section: works of culture (the point of a culture lesson) and pictures of events and people. */
const MAX_CULTURE = 6;
const MAX_OTHER = 3;

/**
 * Pictures of a lesson, placed in the text: `[section][paragraph]` → the pictures shown right after that paragraph.
 * A section's `figures` are exactly its pictures (`[]` — none); otherwise the works of culture, events and people
 * linked in its text that have a picture, after the paragraph where each is first linked. A picture is shown once
 * per lesson — also when two cards carry it under different files (`pictureKeys`) — and not more than MAX_OTHER
 * events and portraits per section — the text stays a text.
 */
const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Keys under which a picture counts as already shown in the lesson: its file, the Commons file it was taken from,
 * its description, the work it reproduces. An event card often carries the painting of a culture card («Стрелецкий
 * бунт» — «Утро стрелецкой казни») or the portrait of its hero («Поход Ермака» — the parsuna of Ermak) as a file
 * of its own; without these keys the gallery shows the same picture twice.
 */
export function pictureKeys(src: string, info?: ImageInfo): string[] {
  const keys = [`src:${src}`];
  const file = info?.source?.match(/File:([^?#]+)/)?.[1];
  if (file) keys.push(`file:${norm(decodeURIComponent(file).replace(/ /g, '_'))}`);
  if (info?.about) keys.push(`about:${norm(info.about)}`);
  if (info?.title && info.author) keys.push(`work:${norm(info.title)}|${norm(info.author)}`);
  return keys;
}

/** A detail of a painting (Commons «…_detail…», «(cropped)») is the painting by the same author of the same year. */
const workKey = (info?: ImageInfo) =>
  info?.author && info.date && !/неизвестн/i.test(info.author) ? `${norm(info.author)}|${norm(info.date)}` : undefined;
const isDetail = (info?: ImageInfo) => /detail|fragment|фрагмент|деталь|cropped/i.test(info?.source ?? '');

export function lessonFigures(sections: { text: string; figures?: string[] }[]): Figure[][][] {
  const shown = new Set<string>();
  const works = new Set<string>();
  return sections.map((sec) => {
    const paras = paragraphs(sec.text);
    const firstPara = new Map<string, number>();
    paras.forEach((p, k) => {
      for (const m of p.matchAll(/\[\[([a-z0-9-]+)/g)) if (!firstPara.has(m[1]!)) firstPara.set(m[1]!, k);
    });
    const ids = sec.figures ?? [...firstPara.keys()];
    const out: Figure[][] = paras.map(() => []);
    let culture = 0;
    let other = 0;
    for (const id of ids) {
      const e = kb.get(id);
      const src = e ? kb.imageOf(e) : undefined;
      if (!e || !src || !['culture', 'event', 'person'].includes(e.kind)) continue;
      const info = kb.imageInfoOf(e);
      const keys = pictureKeys(src, info);
      const work = workKey(info);
      if (keys.some((k) => shown.has(k)) || (e.kind !== 'culture' && work && isDetail(info) && works.has(work))) continue;
      if (!sec.figures) {
        if (e.kind === 'culture' ? culture >= MAX_CULTURE : other >= MAX_OTHER) continue;
        if (e.kind === 'culture') culture++;
        else other++;
      }
      for (const k of keys) shown.add(k);
      if (e.kind === 'culture' && work) works.add(work);
      out[firstPara.get(id) ?? paras.length - 1]!.push({ id, title: kb.title(id), src, info });
    }
    return out;
  });
}
