import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import {
  SmnWarningByAreaResponse,
  WeatherService,
  WeatherStation
} from '../services/weather.service';
import { StationService } from '../services/station.service';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';
import { CountUpDirective } from '../directives/count-up.directive';

interface FrostSummary {
  count: number;
  lowest: number;
  lowestStation: string;
}

const ZONA_LABELS: Record<string, string> = {
  '1': 'Llanura Tucumana',
  '2': 'Pedemonte Tucumano',
  '3': 'Valles Intermontanos',
  '4': 'Valles Intermontanos',
  '5': 'Provincias Adyacentes'
};

const DEFAULT_STATION_ID = '2049'; // El Colmenar

@Component({
  selector: 'app-bienvenida',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    RouterModule,
    ScrollRevealDirective,
    CountUpDirective
  ],
  templateUrl: './bienvenida.component.html',
  styleUrl: './bienvenida.component.css'
})
export class BienvenidaComponent implements OnInit {
  loadingConditions = true;
  loadingUv = false;
  loadingFrost = true;
  frostSummary: FrostSummary | null = null;
  alertText: string | null = null;

  stations: WeatherStation[] = [];
  currentStationIndex = 0;
  currentStation: WeatherStation | null = null;
  uvIndex: number | null = null;

  constructor(
    private dialog: MatDialog,
    private weatherService: WeatherService,
    private stationService: StationService
  ) { }

  ngOnInit(): void {
    this.loadCurrentConditions();
    this.loadFrostSummary();

    this.weatherService.getSmnWarningByArea().subscribe({
      next: (data: SmnWarningByAreaResponse) => {
        this.alertText = this.composeAlertText(data);
      },
      error: () => {
        // No es crítico para el hero: si falla, simplemente no se muestra la franja de alerta.
      }
    });
  }

  /**
   * Estaciones que reportaron hoy (fecha_I = hoy) y con lecturas dentro de rango físico
   * posible, para no dejar navegar a estaciones caídas/desactualizadas ni a estaciones
   * con valores de error del sensor (ej. 1802.6 °C / 255 % / 410.4 km/h vistos en producción).
   * Si por algún motivo ninguna pasa el filtro (falla de red, etc.), se usa la lista
   * completa para no dejar la tarjeta vacía.
   */
  private loadCurrentConditions(): void {
    this.weatherService.getStations().subscribe({
      next: (stations) => {
        const todayStr = this.formatDateYMD(new Date());
        const valid = stations.filter(s =>
          (s.fecha_I ?? '').startsWith(todayStr) && this.hasPlausibleReadings(s)
        );
        this.stations = valid.length ? valid : stations;

        if (!this.stations.length) {
          this.loadingConditions = false;
          return;
        }

        const defaultIndex = this.stations.findIndex(s => s.Identificacion === DEFAULT_STATION_ID);
        this.currentStationIndex = defaultIndex >= 0 ? defaultIndex : 0;
        this.selectCurrentStation();
      },
      error: () => {
        this.loadingConditions = false;
      }
    });
  }

  private hasPlausibleReadings(station: WeatherStation): boolean {
    const temp = parseFloat(station.temp_af ?? '');
    const hum = parseFloat(station.hum_af ?? '');
    const wind = parseFloat(station.viento_medio ?? '');

    if (!isNaN(temp) && (temp < -25 || temp > 55)) return false;
    if (!isNaN(hum) && (hum < 0 || hum > 100)) return false;
    if (!isNaN(wind) && (wind < 0 || wind > 390)) return false;
    return true;
  }

  private formatDateYMD(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private selectCurrentStation(): void {
    this.currentStation = this.stations[this.currentStationIndex] ?? null;
    this.loadingConditions = false;
    this.loadUvIndex();
  }

  previousStation(): void {
    if (this.stations.length < 2) return;
    this.currentStationIndex = (this.currentStationIndex - 1 + this.stations.length) % this.stations.length;
    this.selectCurrentStation();
  }

  nextStation(): void {
    if (this.stations.length < 2) return;
    this.currentStationIndex = (this.currentStationIndex + 1) % this.stations.length;
    this.selectCurrentStation();
  }

  private loadUvIndex(): void {
    this.uvIndex = null;
    const lat = parseFloat(this.currentStation?.lat ?? '');
    const lon = parseFloat(this.currentStation?.lon ?? '');
    if (isNaN(lat) || isNaN(lon)) return;

    this.loadingUv = true;
    this.weatherService.getUvIndex(lat, lon).subscribe({
      next: (res) => {
        this.uvIndex = res.value;
        this.loadingUv = false;
      },
      error: () => {
        this.uvIndex = null;
        this.loadingUv = false;
      }
    });
  }

  zonaLabel(zona?: string): string {
    return zona ? (ZONA_LABELS[zona] ?? '') : '';
  }

  locationLabel(station: WeatherStation): string {
    return [station.Localidad || station.nombre, station.departamento, station.provincia]
      .filter(Boolean)
      .join(', ');
  }

  get currentTemp(): number | null {
    const v = parseFloat(this.currentStation?.temp_af ?? '');
    return isNaN(v) ? null : v;
  }

  get currentHumidity(): number | null {
    const v = parseFloat(this.currentStation?.hum_af ?? '');
    return isNaN(v) ? null : v;
  }

  get currentWindSpeed(): number | null {
    const v = parseFloat(this.currentStation?.viento_medio ?? '');
    return isNaN(v) ? null : v;
  }

  /** Sincroniza con la estación global usada en "Estado actual" al navegar hacia allá. */
  goToCurrentStation(): void {
    if (this.currentStation) {
      this.stationService.setSelectedStation(this.currentStation);
    }
  }

  /**
   * Mismas estaciones y umbral que usa AlertComponent para la franja de heladas,
   * pero a nivel de red completa en lugar de un solo peor caso.
   */
  private loadFrostSummary(): void {
    this.weatherService.getAlerts().subscribe({
      next: (response) => {
        const stations = response.data.filter(s => s.habilitada > 0);
        const temps = stations
          .map(s => ({ nombre: s.nombre, temp: parseFloat(s.minimaTemperatura) }))
          .filter(t => !isNaN(t.temp));

        if (!temps.length) {
          this.loadingFrost = false;
          return;
        }

        const belowZero = temps.filter(t => t.temp < 0);
        const lowest = temps.reduce((min, t) => (t.temp < min.temp ? t : min), temps[0]);

        this.frostSummary = {
          count: belowZero.length,
          lowest: lowest.temp,
          lowestStation: lowest.nombre
        };
        this.loadingFrost = false;
      },
      error: () => {
        this.loadingFrost = false;
      }
    });
  }

  private composeAlertText(data: SmnWarningByAreaResponse): string | null {
    const heat = data.heat?.['3373'];
    const cold = data.cold?.['3373'];

    if (heat && heat.level >= 2) {
      return 'Alerta por temperaturas extremas de calor en la provincia de Tucumán.';
    }
    if (cold && cold.level >= 2) {
      return 'Alerta por temperaturas extremas de frío en la provincia de Tucumán.';
    }
    return null;
  }

  async openDialog(): Promise<void> {
    const { DialogComponent } = await import('./dialog/dialog.component');

    this.dialog.open(DialogComponent, {
      panelClass: 'about-dialog',
      width: 'min(880px, calc(100vw - 32px))',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '90vh',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openFrostMapDialog(): Promise<void> {
    const { MapFrostComponent } = await import('../map-frost/map-frost.component');

    this.dialog.open(MapFrostComponent, {
      width: '95vw',
      maxWidth: '1200px',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false,
      data: { hoy: true }
    });
  }
}
