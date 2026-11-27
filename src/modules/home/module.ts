import { defineModule } from '$lib/core/define-module';
import HomePage from './HomePage.svelte';

export default defineModule({
  id: 'home',
  title: 'Главная',
  routes: [{ path: '/', tab: 'home', component: () => Promise.resolve({ default: HomePage }) }],
});
