/**
 * Lesson text → HTML: paragraphs and **bold** like richText, plus `[[id]]` / `[[id|подпись]]` links to the
 * knowledge base rendered as buttons with `data-ref` (the page opens the entity sheet on tap); `figuresOf` —
 * the pictures shown under a section (LessonFigures.svelte).
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
/** At most this many pictures under one section: a strip, not a gallery. */
const MAX_FIGURES = 6;

/**
 * Pictures for a lesson section: the given `figures` (any entity with a picture), or else the works of culture
 * linked in the text, in the order they are mentioned. Entities without a picture are skipped.
 */
export function figuresOf(sec: { text: string; figures?: string[] }): Figure[] {
  const ids = sec.figures ?? [...new Set([...sec.text.matchAll(/\[\[([a-z0-9-]+)/g)].map((m) => m[1]!))].filter((id) => kb.get(id)?.kind === 'culture');
  const out: Figure[] = [];
  for (const id of ids) {
    const e = kb.get(id);
    const src = e ? kb.imageOf(e) : undefined;
    if (!e || !src) continue;
    out.push({ id, title: kb.title(id), src, info: kb.imageInfoOf(e) });
    if (out.length >= MAX_FIGURES) break;
  }
  return out;
}
