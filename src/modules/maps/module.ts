import { Compass, Map } from '@lucide/svelte';
import { defineModule } from '$lib/core/define-module';

/** «Слепые карты и атрибуция»: interactive offline historical atlas, pin-locate & blind campaign drills, visual attribution. */
export default defineModule({
  id: 'maps',
  title: 'Слепые карты',
  routes: [
    { path: '/maps', tab: 'practice', component: () => import('./MapsPage.svelte') },
  ],
  entries: [
    {
      hub: 'practice',
      title: 'Слепые карты',
      description: '58 карт войн и битв: поиск точек, слепая схема и атрибуция',
      icon: Compass,
      href: '/maps?mode=blind',
      order: 15,
      tint: '#2b4c7e',
    },
    {
      hub: 'explore',
      title: 'Исторический атлас',
      description: '58 цветных карт походов, осад и битв IX–XX вв.',
      icon: Map,
      href: '/maps?mode=atlas',
      order: 4,
      tint: '#2d5a4c',
    },
  ],
});
