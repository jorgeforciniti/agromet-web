import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AlertComponent } from '../alert/alert.component';
import { WeatherForecastComponent } from '../weather-forecast/weather-forecast.component';
import { LeafletGoesViewerComponent } from '../leaflet-goes-viewer/leaflet-goes-viewer.component';
import { MisEstacionesComponent } from '../mis-estaciones/mis-estaciones.component';
import { EnsoEstadoComponent } from '../enso-estado/enso-estado.component';
import { SelectorEstacionComponent } from '../shared/selector-estacion.component';
import { StationService } from '../services/station.service';
import { WeatherService, WeatherStation } from '../services/weather.service';

@Component({
  selector: 'app-estado-actual',
  standalone: true,
  imports: [
    AsyncPipe,
    NgIf,
    FormsModule,
    MatIconModule,
    AlertComponent,
    WeatherForecastComponent,
    LeafletGoesViewerComponent,
    MisEstacionesComponent,
    EnsoEstadoComponent,
    SelectorEstacionComponent
  ],
  templateUrl: './estado-actual.component.html',
  styleUrl: './estado-actual.component.css'
})
export class EstadoActualComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly stationService = inject(StationService);
  private readonly weatherService = inject(WeatherService);

  /** Estación activa: la eligen el selector de arriba y el mapa; la siguen datos y pronóstico */
  readonly activa$ = this.stationService.activa$;

  /** Estaciones que informan en tiempo real (la misma lista que usa el panel de datos) */
  estaciones: WeatherStation[] = [];

  ngOnInit(): void {
    this.weatherService.getStations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: lista => this.estaciones = [...lista].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')),
        error: () => this.estaciones = []
      });
  }

  elegirEstacion(id: string): void {
    this.stationService.setActiva(id);
  }

  /** Localidad, departamento y provincia de la estación, para mostrar junto al selector */
  lugar(id: string | null): string {
    const e = this.estaciones.find(s => s.Identificacion === id);
    if (!e) return '';
    return [...new Set([e.Localidad, e.departamento, e.provincia].map(t => (t ?? '').trim()).filter(Boolean))].join(', ');
  }

  scrollToSection(event: Event, sectionId: string): void {
    event.preventDefault();
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
