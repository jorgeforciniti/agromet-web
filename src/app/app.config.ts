import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { environment } from './environments/environment'; // Asegúrate de que la ruta sea correcta
import { routes } from './app.routes';
import { WeatherService } from './services/weather.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)), // ✅ Sin importProvidersFrom
    provideAuth(() => getAuth()), // ✅ Sin importProvidersFrom
    WeatherService       // Registra el servicio WeatherService
  ],
};