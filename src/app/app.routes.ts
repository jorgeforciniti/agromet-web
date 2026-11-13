import { Routes } from '@angular/router';
import { adminGuard } from './admin/admin.guard';

// `title` es el título de la pestaña y el que muestran los buscadores para cada sección.
export const routes: Routes = [
  {
    path: '',
    title: 'Sección Agrometeorología - EEAOC | Tucumán - Argentina',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent)
  },
  {
    path: 'estado-actual',
    title: 'Estado actual | Agrometeorología EEAOC',
    loadComponent: () => import('./estado-actual/estado-actual.component').then((m) => m.EstadoActualComponent)
  },
  {
    path: 'mapas',
    title: 'Mapas | Agrometeorología EEAOC',
    loadComponent: () => import('./mapas/mapas.component').then((m) => m.MapasComponent)
  },
  {
    path: 'datos',
    title: 'Datos y estadísticas | Agrometeorología EEAOC',
    loadComponent: () => import('./datos-meteorologicos/datos-meteorologicos.component').then((m) => m.DatosMeteorologicosComponent)
  },
  {
    path: 'estadisticas-historicas',
    title: 'Estadísticas históricas de El Colmenar | Agrometeorología EEAOC',
    loadComponent: () => import('./colmenar/colmenar.component').then((m) => m.ColmenarComponent)
  },
  {
    path: 'informes',
    title: 'Informes | Agrometeorología EEAOC',
    loadComponent: () => import('./informes/informes.component').then((m) => m.InformesComponent)
  },
  {
    path: 'estaciones',
    title: 'Red de estaciones | Agrometeorología EEAOC',
    loadComponent: () => import('./estaciones/estaciones.component').then((m) => m.EstacionesComponent)
  },
  {
    path: 'mi-cuenta',
    title: 'Mi cuenta | Agrometeorología EEAOC',
    loadComponent: () => import('./mi-cuenta/mi-cuenta.component').then((m) => m.MiCuentaComponent)
  },
  {
    path: 'privacidad',
    title: 'Política de privacidad | Agrometeorología EEAOC',
    loadComponent: () => import('./privacidad/privacidad.component').then((m) => m.PrivacidadComponent)
  },
  {
    // Sólo para las cuentas de shared/administradores.ts (la API también lo controla)
    path: 'admin',
    title: 'Administración | Agrometeorología EEAOC',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/admin.component').then((m) => m.AdminComponent)
  },
  {
    path: 'auth',
    title: 'Ingresar | Agrometeorología EEAOC',
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
