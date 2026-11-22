<script lang="ts">
  import { Search, Clock, X, BookOpen, ChevronRight } from '@lucide/svelte';
  import PageHeader from '$lib/design/components/PageHeader.svelte';
  import TextField from '$lib/design/components/TextField.svelte';
  import Card from '$lib/design/components/Card.svelte';
  import EmptyState from '$lib/design/components/EmptyState.svelte';
  import EntityRow from '$lib/components/EntityRow.svelte';
  import { kb } from '$lib/core/content/kb.svelte';
  import { search, type SearchDoc } from '$lib/core/search';
  import { router } from '$lib/core/router.svelte';

  let q = $state(router.query.get('q') ?? '');
  let recent = $state<string[]>(JSON.parse(localStorage.getItem('stolypin-recent') ?? '[]'));
  const results = $derived(q.trim().length >= 2 ? search(q) : []);
  const groups = $derived.by(() => {
    const order: SearchDoc['kind'][] = ['lesson', 'person', 'event', 'culture', 'term', 'source'];
    const names: Record<string, string> = { lesson: 'Уроки курса', person: 'Персоналии', event: 'События', culture: 'Культура', term: 'Термины', source: 'Источники' };
    return order.map((k) => ({ k, name: names[k]!, items: results.filter((r) => r.kind === k) })).filter((g) => g.items.length);
  });

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const v = q.trim();
    clearTimeout(saveTimer);
    if (v.length < 3) return;
    saveTimer = setTimeout(() => {
      recent = [v, ...recent.filter((r) => r !== v)].slice(0, 8);
      localStorage.setItem('stolypin-recent', JSON.stringify(recent));
    }, 1500);
  });
</script>

<div class="page">
  <PageHeader title="Поиск" back="/" />
  <TextField bind:value={q} placeholder="Урок, событие, человек, термин…" icon={Search} autofocus />

  {#if !q.trim()}
    {#if recent.length}
      <div class="recent">
        <span class="eyebrow">Недавнее</span>
        <div class="row wrap">
          {#each recent as r (r)}
            <button class="rq" onclick={() => (q = r)}><Clock size={14} />{r}</button>
          {/each}
          <button class="rq clear" onclick={() => { recent = []; localStorage.removeItem('stolypin-recent'); }}><X size={14} />очистить</button>
        </div>
      </div>
    {/if}
    <p class="muted tip">Поиск ищет по урокам курса и всей базе знаний, понимает русские словоформы: «денежные реформы», «реформы Петра», «Смута».</p>
  {:else if groups.length}
    {#each groups as g (g.k)}
      <section class="grp">
        <h2 class="eyebrow">{g.name} · {g.items.length}</h2>
        <Card padding="sm">
          {#if g.k === 'lesson'}
            {#each g.items as r (r.id)}
              {@const period = r.period ? kb.periodById.get(r.period) : undefined}
              <a class="lesson-row" href="#/lesson/{r.id}" style:--c={period?.color ?? 'var(--accent)'}>
                <span class="l-ico"><BookOpen size={17} /></span>
                <span class="grow l-txt">
                  <strong>{r.title}</strong>
                  {#if r.sub}<small class="muted">{r.sub}</small>{/if}
                </span>
                <ChevronRight size={16} class="chev" />
              </a>
            {/each}
          {:else}
            {#each g.items as r (r.id)}
              {@const e = kb.get(r.id)}
              {#if e}<EntityRow entity={e} compact />{/if}
            {/each}
          {/if}
        </Card>
      </section>
    {/each}
  {:else if q.trim().length >= 2}
    <EmptyState icon={Search} title="Ничего не нашлось" text="Попробуйте другое слово или проверьте написание." />
  {/if}
</div>

<style>
  .recent { margin-top: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-2); }
  .rq { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: var(--r-full); border: 1px solid var(--line); background: var(--surface); font-size: var(--text-sm); cursor: pointer; color: var(--ink-2); }
  .rq.clear { color: var(--ink-3); border-style: dashed; }
  .tip { margin-top: var(--sp-5); font-size: var(--text-sm); }
  .grp { margin-top: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-2); }
  .lesson-row { display: flex; align-items: center; gap: var(--sp-3); padding: 10px 8px; border-radius: var(--r-sm); text-decoration: none; color: var(--ink); transition: background var(--dur-1); }
  .lesson-row:hover { background: var(--surface-2); }
  .l-ico { width: 34px; height: 34px; flex: none; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 14%, transparent); color: var(--c); }
  .l-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: var(--text-sm); }
  .l-txt strong { line-height: 1.3; }
  .l-txt small { font-size: var(--text-xs); }
  .lesson-row :global(.chev) { flex: none; color: var(--ink-3); }
</style>
