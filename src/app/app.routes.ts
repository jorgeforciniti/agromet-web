import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent)
  },
  {
    path: 'auth',
    loadComponent: () => import('./auth/auth.component').then((m) => m.AuthComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./weather-dashboard/weather-dashboard.component').then((m) => m.WeatherDashboardComponent)
  },
  { path: 'index.php', redirectTo: '', pathMatch: 'full' },
  { path: '**', redirectTo: '', pathMatch: 'full' },
];
