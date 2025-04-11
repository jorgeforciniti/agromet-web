import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AuthComponent } from './auth/auth.component'; // Importa el componente de autenticación

export const routes: Routes = [
    { path: '', component: HomeComponent }, // Ruta de la home
    { path: 'auth', component: AuthComponent }, // Página de autenticación
    
  // Añade más rutas según sea necesario
];
