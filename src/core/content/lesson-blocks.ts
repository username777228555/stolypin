/**
 * Texts of lesson blocks (tables, documents, disputes…) — for checks that read every word of a lesson the way they
 * read section texts: `[[id]]` links must exist, years after linked events must match, no stray Latin.
 * Used by validate.ts; the blocks themselves are drawn by modules/course/blocks/.
 */
import type { LessonBlock } from './schema';

/** Every text field of a block, with a path suffix for messages. */
export function blockTexts(b: LessonBlock): [string, string][] {
  const out: [string, string][] = [];
  const put = (path: string, s: string | undefined) => s && out.push([path, s]);
  switch (b.type) {
    case 'table':
      put('title', b.title);
      b.head.forEach((h, i) => put(`head[${i}]`, h));
      b.rows.forEach((r, i) => r.forEach((c, j) => put(`rows[${i}][${j}]`, c)));
      put('note', b.note);
      break;
    case 'document':
      put('title', b.title);
      put('moment', b.moment);
      put('about', b.about);
      b.questions?.forEach((q, i) => (put(`questions[${i}].q`, q.q), put(`questions[${i}].a`, q.a)));
      break;
    case 'debate':
      put('question', b.question);
      b.positions.forEach((p, i) => (put(`positions[${i}].thesis`, p.thesis), put(`positions[${i}].argument`, p.argument)));
      put('note', b.note);
      break;
    case 'chain':
      put('title', b.title);
      b.steps.forEach((s, i) => (put(`steps[${i}].label`, s.label), put(`steps[${i}].text`, s.text)));
      break;
    case 'pitfalls':
      b.items.forEach((x, i) => (put(`items[${i}].a`, x.a), put(`items[${i}].b`, x.b), put(`items[${i}].how`, x.how)));
      break;
    case 'numbers':
      put('title', b.title);
      b.items.forEach((x, i) => put(`items[${i}].label`, x.label));
      put('conclusion', b.conclusion);
      break;
    case 'argument':
      put('task', b.task);
      put('thesis', b.thesis);
      b.args.forEach((a, i) => (put(`args[${i}].fact`, a.fact), put(`args[${i}].analysis`, a.analysis), put(`args[${i}].view`, a.view), put(`args[${i}].conclusion`, a.conclusion)));
      put('conclusion', b.conclusion);
      break;
    case 'essay':
      b.parts.forEach((p, i) => (put(`parts[${i}].idea`, p.idea), put(`parts[${i}].task`, p.task)));
      put('problem', b.problem);
      break;
  }
  return out;
}
