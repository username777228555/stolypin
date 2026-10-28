/**
 * Lesson text → HTML: paragraphs and **bold** like richText, plus `[[id]]` / `[[id|подпись]]` links to the
 * knowledge base rendered as buttons with `data-ref` (the page opens the entity sheet on tap); `lessonFigures` —
 * the pictures placed in the text after the paragraphs that mention them (LessonFigures.svelte).
 */
import { escapeHtml, richText } from '$lib/core/utils/text';
import { kb } from '$lib/core/content/kb.svelte';
import type { ImageInfo } from '$lib/core/content/schema';

export function lessonHtml(text: string): string {
  return richText(text).replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (_, id: string, label?: string) =>
    kb.get(id) ? `<button type="button" class="ref" data-ref="${id}">${label ?? escapeHtml(kb.title(id))}</button>` : (label ?? id),
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
 * per lesson, and not more than MAX_OTHER events and portraits per section — the text stays a text.
 */
export function lessonFigures(sections: { text: string; figures?: string[] }[]): Figure[][][] {
  const shown = new Set<string>();
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
      if (!e || !src || shown.has(src) || !['culture', 'event', 'person'].includes(e.kind)) continue;
      if (!sec.figures) {
        if (e.kind === 'culture' ? culture >= MAX_CULTURE : other >= MAX_OTHER) continue;
        if (e.kind === 'culture') culture++;
        else other++;
      }
      shown.add(src);
      out[firstPara.get(id) ?? paras.length - 1]!.push({ id, title: kb.title(id), src, info: kb.imageInfoOf(e) });
    }
    return out;
  });
}
