import { bootstrapApplication } from '@angular/platform-browser';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { getAnalytics, provideAnalytics, ScreenTrackingService, UserTrackingService } from '@angular/fire/analytics';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { iniciarPostHog, ManejadorErrores, medirVisitas } from './app/services/analytics.service';
import { environment } from './app/environments/environment';
import { provideHttpClient } from '@angular/common/http';
import { enableProdMode, ErrorHandler, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import * as L from 'leaflet';
import { provideAnimations } from '@angular/platform-browser/animations';

if (environment.production) {
  enableProdMode();
}

// Formato argentino para los pipes de número y fecha (coma decimal, punto de miles),
// el mismo que ya usaban las estadísticas históricas con Intl.NumberFormat('es-AR').
registerLocaleData(localeEsAr);

// Configuración global de Leaflet para mejor rendimiento
L.Map.mergeOptions({
  preferCanvas: true,
  wheelPxPerZoomLevel: 60
});

// Visitas, uso y errores con PostHog (ver analytics.service.ts).
if (medirVisitas()) {
  iniciarPostHog();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth()),
    // Estadísticas de visitas con Google Analytics (ID de medición de firebaseConfig), sin
    // nada visible en la página: visitas, usuarios, páginas vistas por ruta (ScreenTracking)
    // y, con sesión iniciada, el id anónimo de Firebase del usuario (UserTracking).
    ...(medirVisitas()
      ? [provideAnalytics(() => getAnalytics()), ScreenTrackingService, UserTrackingService]
      : []),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideAnimations(),
    { provide: LOCALE_ID, useValue: 'es-AR' },
    { provide: ErrorHandler, useClass: ManejadorErrores },
  ],
}).catch(err => console.error(err));
