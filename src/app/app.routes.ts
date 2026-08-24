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
  {
    path: 'solicitudes',
    loadComponent: () => import('./solicitudes/solicitudes.component').then((m) => m.SolicitudesComponent)
  },
  {
    path: 'mis-solicitudes',
    loadComponent: () => import('./mis-solicitudes/mis-solicitudes.component').then((m) => m.MisSolicitudesComponent)
  },
  {
    path: 'mis-solicitudes/:id',
    loadComponent: () => import('./mi-solicitud-detalle/mi-solicitud-detalle.component').then((m) => m.MiSolicitudDetalleComponent)
  },
  { path: 'index.php', redirectTo: '', pathMatch: 'full' },
  { path: '**', redirectTo: '', pathMatch: 'full' },
];
