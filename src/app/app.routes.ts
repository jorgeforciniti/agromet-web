import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent)
  },
  {
    path: 'estado-actual',
    loadComponent: () => import('./estado-actual/estado-actual.component').then((m) => m.EstadoActualComponent)
  },
  {
    path: 'mapas',
    loadComponent: () => import('./mapas/mapas.component').then((m) => m.MapasComponent)
  },
  {
    path: 'datos',
    loadComponent: () => import('./datos-meteorologicos/datos-meteorologicos.component').then((m) => m.DatosMeteorologicosComponent)
  },
  {
    path: 'informes',
    loadComponent: () => import('./informes/informes.component').then((m) => m.InformesComponent)
  },
  {
    path: 'estaciones',
    loadComponent: () => import('./estaciones/estaciones.component').then((m) => m.EstacionesComponent)
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
