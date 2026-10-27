import { Map as MapIcon, ShieldHalf } from '@lucide/svelte';
import { defineModule } from '$lib/core/define-module';

/**
 * «Губернии 1856» — географические карточки К. М. Грибанова (data.ts): просмотр с оборотом и увеличением,
 * викторины «Чей герб?» и «Чья карта?». Плитка в «Изучении» и игра в «Играх».
 */
export default defineModule({
  id: 'gubernii',
  title: 'Губернии 1856',
  routes: [
    { path: '/gubernii', tab: 'explore', component: () => import('./GuberniiPage.svelte') },
    { path: '/gubernii/:id', tab: 'explore', component: () => import('./GuberniaPage.svelte') },
  ],
  entries: [
    { hub: 'explore', title: 'Губернии 1856', description: 'Карточки империи: гербы, карты, народы', icon: MapIcon, href: '/gubernii', order: 47, tint: '#3d6b4f' },
    { hub: 'games', title: 'Чей герб?', description: 'Узнайте губернию по гербу или карте 1856 года', icon: ShieldHalf, href: '/gubernii?mode=arms', order: 60, tint: '#8a2f2a' },
  ],
});
