<script lang="ts">
  import { Compass, RotateCcw } from '@lucide/svelte';
  import EmptyState from '$lib/design/components/EmptyState.svelte';
  import Button from '$lib/design/components/Button.svelte';
  import { router } from '$lib/core/router.svelte';

  let {
    title = 'Здесь ничего нет',
    message,
    canReload = false,
    onretry,
  }: {
    title?: string;
    message?: string;
    canReload?: boolean;
    onretry?: () => void;
  } = $props();

  function goHome() {
    if (router.path === '/') {
      if (onretry) onretry();
      else window.location.reload();
    } else {
      router.navigate('/', { replace: true });
    }
  }
</script>

<div class="page">
  <EmptyState icon={Compass} {title} text={message ?? 'Такой страницы не существует. Вернёмся на главную?'}>
    <div class="nf-actions">
      {#if canReload}
        <Button icon={RotateCcw} onclick={() => (onretry ? onretry() : window.location.reload())}>
          Обновить страницу
        </Button>
      {/if}
      <Button variant={canReload ? 'secondary' : 'primary'} onclick={goHome}>На главную</Button>
    </div>
  </EmptyState>
</div>

<style>
  .nf-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--sp-2);
  }
</style>
