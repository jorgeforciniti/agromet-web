import { bootstrapApplication } from '@angular/platform-browser';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { environment } from './app/environments/environment';
import { provideHttpClient } from '@angular/common/http';
import { enableProdMode } from '@angular/core';
import * as L from 'leaflet';

if (environment.production) {
  enableProdMode();
}

// Configuración global de Leaflet para mejor rendimiento
L.Map.mergeOptions({
  preferCanvas: true,
  wheelPxPerZoomLevel: 60
});

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth()),
    provideRouter(routes),
  ],
}).catch(err => console.error(err));
