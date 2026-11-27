import { BookOpen, Scale, ScrollText, Route } from '@lucide/svelte';
import { defineModule } from '$lib/core/define-module';

/** «Курс»: lessons, historian debates, blind historical projects, and cross-century thematic lines. */
export default defineModule({
  id: 'course',
  title: 'Курс',
  routes: [
    { path: '/course', tab: 'explore', component: () => import('./CoursePage.svelte') },
    { path: '/course/debates', tab: 'explore', component: () => import('./DebatesPage.svelte') },
    { path: '/course/projects', tab: 'practice', component: () => import('./ProjectsPage.svelte') },
    { path: '/project', tab: 'practice', component: () => import('./ProjectsPage.svelte') },
    { path: '/course/themes', tab: 'explore', component: () => import('./ThemesPage.svelte') },
    { path: '/course/themes/:id', tab: 'explore', component: () => import('./ThemeDetailPage.svelte') },
    { path: '/lesson/:id', tab: 'explore', component: () => import('./LessonPage.svelte') },
    { path: '/lesson/:id/dates', tab: 'explore', component: () => import('./DatesPage.svelte') },
  ],
  entries: [
    { hub: 'explore', title: 'Курс', description: 'Уроки по эпохам: объяснение, вопросы, повторение', icon: BookOpen, href: '/course', order: 1, tint: '#7c1d2b' },
    { hub: 'explore', title: 'Сквозные линии', description: 'Маршруты через века: таблицы, сравнения и эссе', icon: Route, href: '/course/themes', order: 2, tint: '#2d5a4c' },
    { hub: 'explore', title: 'Споры историков', description: 'Позиции и работы для эссе: конспект и тренировка', icon: Scale, href: '/course/debates', order: 3, tint: '#b5842c' },
    { hub: 'practice', title: 'Исторический проект', description: 'Разбор 259 источников по критериям ВсОШ (50 баллов)', icon: ScrollText, href: '/course/projects', order: 17, tint: '#8f2d38' },
  ],
});
