import { Routes } from '@angular/router';
import { adminGuard } from './admin/admin.guard';

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
    path: 'estadisticas-historicas',
    loadComponent: () => import('./colmenar/colmenar.component').then((m) => m.ColmenarComponent)
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
    path: 'mi-cuenta',
    loadComponent: () => import('./mi-cuenta/mi-cuenta.component').then((m) => m.MiCuentaComponent)
  },
  {
    path: 'privacidad',
    loadComponent: () => import('./privacidad/privacidad.component').then((m) => m.PrivacidadComponent)
  },
  {
    // Sólo para las cuentas de shared/administradores.ts (la API también lo controla)
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/admin.component').then((m) => m.AdminComponent)
  },
  {
    path: 'auth',
    loadComponent: () => import('./auth/auth.component').then((m) => m.AuthComponent)
  },
  { path: 'dashboard', redirectTo: 'datos', pathMatch: 'full' },
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
