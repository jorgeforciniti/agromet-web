import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AuthComponent } from './auth/auth.component'; // Importa el componente de autenticación
import { WeatherDashboardComponent } from './weather-dashboard/weather-dashboard.component';

export const routes: Routes = [
  { path: '', component: HomeComponent }, // Ruta de la home
  { path: 'auth', component: AuthComponent }, // Página de autenticación
  { path: 'dashboard', component: WeatherDashboardComponent },

  // Añade más rutas según sea necesario
];
