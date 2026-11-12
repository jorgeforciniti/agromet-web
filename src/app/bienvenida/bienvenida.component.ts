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
import { estadoComunicacion, leerFechaEstacion } from '../shared/estado-estacion';

interface FrostSummary {
  count: number;
  lowest: number;
  lowestStation: string;
}

/** Una estación ubicada en la franja de su zona según la temperatura actual. */
interface PuntoRed {
  indice: number;
  nombre: string;
  temp: number;
  x: number;
  carril: number;
  color: string;
}

interface FranjaZona {
  etiqueta: string;
  puntos: PuntoRed[];
}

/** Orden de las franjas: de los valles de altura a la llanura, y después el resto. */
const ORDEN_ZONAS = ['4', '3', '2', '1', '5'];

/** Escala de color de temperatura (°C → color) para los puntos de la red. */
const ESCALA_TEMP: [number, string][] = [
  [0, '#3b6fb6'],
  [10, '#7fb0d6'],
  [18, '#e9c84b'],
  [26, '#f08a4b'],
  [34, '#c2410c']
];

const ZONA_LABELS: Record<string, string> = {
  '1': 'Llanura Tucumana y zonas vecinas',
  '2': 'Pedemonte Tucumano',
  '3': 'Valles Intermontanos',
  '4': 'Valles de Altura',
  '5': 'Provincias Adyacentes'
};


@Component({
  selector: 'app-bienvenida',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    RouterModule
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

  franjas: FranjaZona[] = [];
  escala: number[] = [];
  masFria: WeatherStation | null = null;
  masCalida: WeatherStation | null = null;
  /** Estaciones del gráfico (dato de la última hora) y las que informaron hoy pero están atrasadas */
  alDia = 0;
  atrasadas = 0;

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

        this.armarFranjas();

        // El carrusel arranca en la estación activa (predeterminada o última usada)
        const defaultIndex = this.stations.findIndex(s => s.Identificacion === this.stationService.activa);
        this.currentStationIndex = defaultIndex >= 0 ? defaultIndex : 0;
        this.selectCurrentStation();
      },
      error: () => {
        this.loadingConditions = false;
      }
    });
  }

  /**
   * Agrupa las estaciones con temperatura por zona y les asigna una posición horizontal
   * en una escala común. Cuando dos puntos quedan muy juntos se apilan en otro carril
   * para que no se tapen. Sólo entran las que tienen dato de la última hora (ver
   * shared/estado-estacion.ts): una lectura de la madrugada no se compara con las del mediodía.
   * Las atrasadas siguen en el carrusel, con la hora de su lectura.
   */
  private armarFranjas(): void {
    const ahora = new Date();
    const conTemp = this.stations
      .map((s, indice) => ({ s, indice, temp: parseFloat(s.temp_af ?? '') }))
      .filter(p => !isNaN(p.temp));
    const recientes = conTemp.filter(p => estadoComunicacion(leerFechaEstacion(p.s.fecha_I), ahora) === 'al-dia');
    this.alDia = recientes.length;
    this.atrasadas = conTemp.length - recientes.length;
    this.masFria = this.masCalida = null;

    if (!recientes.length) {
      this.franjas = [];
      this.escala = [];
      return;
    }

    const temps = recientes.map(p => p.temp);
    let min = Math.floor(Math.min(...temps) / 5) * 5;
    let max = Math.ceil(Math.max(...temps) / 5) * 5;
    if (max - min < 10) max = min + 10;
    this.escala = [];
    for (let t = min; t <= max; t += 5) this.escala.push(t);

    const fria = recientes.reduce((a, b) => (b.temp < a.temp ? b : a));
    const calida = recientes.reduce((a, b) => (b.temp > a.temp ? b : a));
    this.masFria = fria.s;
    this.masCalida = calida.s;

    const claves = [...ORDEN_ZONAS, ''];
    this.franjas = claves
      .map(clave => {
        const grupo = recientes
          .filter(p => (ORDEN_ZONAS.includes(p.s.zona ?? '') ? p.s.zona : '') === clave)
          .sort((a, b) => a.temp - b.temp);

        const ultimoX: number[] = [];
        const puntos = grupo.map(p => {
          const x = ((p.temp - min) / (max - min)) * 100;
          let carril = ultimoX.findIndex(ux => x - ux > 2.2);
          if (carril < 0) carril = ultimoX.length < 3 ? ultimoX.length : 0;
          ultimoX[carril] = x;
          return { indice: p.indice, nombre: p.s.nombre, temp: p.temp, x, carril, color: this.colorTemp(p.temp) };
        });

        return { etiqueta: clave ? ZONA_LABELS[clave] : 'Otras estaciones', puntos };
      })
      .filter(f => f.puntos.length);
  }

  private colorTemp(temp: number): string {
    if (temp <= ESCALA_TEMP[0][0]) return ESCALA_TEMP[0][1];
    for (let i = 1; i < ESCALA_TEMP.length; i++) {
      const [t1, c1] = ESCALA_TEMP[i];
      if (temp <= t1) {
        const [t0, c0] = ESCALA_TEMP[i - 1];
        return this.mezclar(c0, c1, (temp - t0) / (t1 - t0));
      }
    }
    return ESCALA_TEMP[ESCALA_TEMP.length - 1][1];
  }

  private mezclar(a: string, b: string, f: number): string {
    const ca = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
    const cb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
    return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * f).toString(16).padStart(2, '0')).join('');
  }

  seleccionar(indice: number): void {
    this.currentStationIndex = indice;
    this.selectCurrentStation();
  }

  /** Hora de la última lectura (de fecha_I, "AAAA-MM-DD HH:MM:SS"). */
  get horaLectura(): string | null {
    const m = (this.currentStation?.fecha_I ?? '').match(/\d{2}:\d{2}/);
    return m ? m[0] : null;
  }

  formatoTemp(temp: number | string | undefined): string {
    const v = typeof temp === 'number' ? temp : parseFloat(temp ?? '');
    return isNaN(v) ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: 1 });
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
      width: 'min(1300px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false,
      data: { hoy: true }
    });
  }
}
