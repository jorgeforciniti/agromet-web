import { Component, OnInit, OnDestroy, ChangeDetectorRef, Output, EventEmitter, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { OpenWeatherForecastItem, OpenWeatherForecastResponse, OpenWeatherNowResponse, WeatherService, WeatherStation } from '../services/weather.service';
import { ESTACION_INICIAL, StationService } from '../services/station.service';
import { Subscription } from 'rxjs';
import { SunriseSunsetService } from '../services/sunrise-sunset.service';
import { WeatherData, Forecast, TimeSpecificForecast } from '../models/weather-data';
import { FormsModule } from '@angular/forms';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faTemperatureHigh, faTint, faWind, faClock, faCloudRain, faSun, faMoon, faEye } from '@fortawesome/free-solid-svg-icons'; // faCloudRain y faEye ya estaban, mantenemos
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Chart, Plugin } from 'chart.js';
import { VAR_COLOR, GRID_COLOR, conAlfa, fmtNum } from '../charts/chart-theme';
import { referenciasHelada } from '../charts/referencias';
import { MatIconModule } from '@angular/material/icon';
import { Input } from '@angular/core';
import { ExportarGraficoComponent } from '../shared/exportar-grafico.component';

/**
 * Aviso de helada pronosticada (E9 del informe de mejoras), con el pronóstico horario de
 * OpenWeatherMap para las próximas 48 h. Temperatura del aire en abrigo: con 3 °C o menos ya
 * puede helar a nivel del suelo; con 0 °C o menos hay helada en abrigo.
 */
const HORAS_AVISO_HELADA = 48;
const UMBRAL_POSIBLE_HELADA = 3;
const UMBRAL_HELADA = 0;

export interface AvisoHelada {
  nivel: 'helada' | 'posible';
  minima: number;
  cuando: Date;
}
import { EstadoComunicacion, estadoComunicacion, haceCuanto, leerFechaEstacion } from '../shared/estado-estacion';

registerLocaleData(localeEsAr);

const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

/** Horarios del sol de un día, en hora local de Argentina (como fullDate de los intervalos) */
interface CicloSolar {
  salida: Date;
  puesta: Date;
  mediodia: Date;
  albaCivil: Date;
  ocasoCivil: Date;
}

/** Instante ISO (UTC) → Date con la hora de pared de Argentina, igual que los intervalos del pronóstico */
function horaLocal(iso: string): Date {
  return new Date(new Date(iso).toLocaleString('en-US', { timeZone: ZONA_HORARIA }));
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-weather-forecast',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FontAwesomeModule,
    MatSelectModule,
    MatFormFieldModule,
    MatIconModule,
    ExportarGraficoComponent,
  ],
  templateUrl: './weather-forecast.component.html',
  styleUrls: ['./weather-forecast.component.css']
})
export class WeatherForecastComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() mode: 'realtime' | 'forecast' | 'full' = 'full';
  @Output() stationSelected = new EventEmitter<string>();
  @ViewChild('temperatureChart') temperatureChartCanvas!: ElementRef<HTMLCanvasElement>;

  private temperatureChart: Chart | null = null;
  loading = false;
  error: string | null = null;
  weatherData: WeatherData | null = null;
  nowIconUrl: string | null = null;
  nowDescription: string | null = null;
  nowLoading = false;
  currentConditions: TimeSpecificForecast | null = null;
  sunrise: string = '--:--';
  sunset: string = '--:--';
  selectedDayIndex: number = 0;
  selectedDay: Forecast | null = null;
  /** Salida y puesta del sol por fecha del pronóstico (null si el servicio no respondió) */
  private cicloSolar = new Map<string, CicloSolar | null>();

  stations: WeatherStation[] = [];
  selectedStation: WeatherStation | null = null;
  rtTemperature: number | null = null;
  rtHumidity: number | null = null;
  rtRain: number | null = null;
  rtWind: { direction?: string; speed?: number } | null = null;

  rtUpdated: Date | null = null;
  /** Mínima pronosticada más baja de las próximas 48 h, si llega al umbral de helada */
  avisoHelada: AvisoHelada | null = null;
  /** Antigüedad del último dato ("hace 13 min") y su estado, para que un dato viejo se note */
  rtHace = '';
  rtEstado: EstadoComunicacion = 'sin-datos-hoy';
  rtStationName: string = '';

  constructor(
    private weatherService: WeatherService,
    private sunriseSunsetService: SunriseSunsetService,
    private changeDetectorRef: ChangeDetectorRef,
    private stationService: StationService,
    private library: FaIconLibrary
  ) {
    library.addIcons(faTemperatureHigh, faTint, faWind, faClock, faCloudRain, faSun, faMoon, faEye);
  }

  private readonly subs = new Subscription();

  ngOnInit() {
    this.subs.add(this.stationService.selectedStation$.subscribe(station => {
      this.selectedStation = station;
      if (station) {
        this.updateStationData();
      }
    }));
    // Si cambia la activa desde otra sección (p. ej. "Usar esta estación" en Mis estaciones), se la sigue
    this.subs.add(this.stationService.activa$.subscribe(() => this.seguirActiva()));
    this.loadStations();
  }

  ngAfterViewInit(): void {
    this.scheduleChartRender();
  }


  selectStation(station: WeatherStation): void {
    this.stationService.setSelectedStation(station);
    this.stationSelected.emit(station.Identificacion);
  }

  /**
   * El mat-select por defecto compara por referencia de objeto. La estación seleccionada
   * puede llegar desde StationService con una instancia distinta (ej. elegida en el mapa,
   * que trae su propia copia de la lista de estaciones) aunque sea la misma estación real,
   * así que comparamos por Identificacion en vez de por referencia.
   */
  compareStations(a: WeatherStation | null, b: WeatherStation | null): boolean {
    return (a?.Identificacion ?? null) === (b?.Identificacion ?? null);
  }

  getWeatherForecast(lat: number, lon: number): void {
    this.loading = true;
    this.weatherService.getOpenWeatherForecast(lat, lon).subscribe({
      next: (response: OpenWeatherForecastResponse) => {
        const groupedForecast = this.groupForecastByDay(response.list);
        this.avisoHelada = this.buscarHelada(response.list);
        this.weatherData = {
          location: {
            name: response.city.name,
            province: '',
            lat,
            lon
          },
          updated: new Date(),
          forecast: groupedForecast
        };

        this.cicloSolar.clear();
        this.selectDay(groupedForecast[0] ?? null, 0);
        this.getSunriseSunset(lat, lon);
        this.loading = false;
        this.changeDetectorRef.detectChanges();
      },
      error: () => {
        this.error = 'Error al obtener el pronóstico';
        this.loading = false;
      }
    });
  }

  /** Intervalo con la temperatura más baja de las próximas 48 h, si llega a posible helada. */
  private buscarHelada(list: OpenWeatherForecastItem[]): AvisoHelada | null {
    const ahora = Date.now();
    const limite = ahora + HORAS_AVISO_HELADA * 3600_000;
    let peor: OpenWeatherForecastItem | null = null;
    for (const item of list ?? []) {
      const t = item.dt * 1000;
      if (t < ahora - 3 * 3600_000 || t > limite) continue;
      if (!peor || item.main.temp_min < peor.main.temp_min) peor = item;
    }
    if (!peor || peor.main.temp_min > UMBRAL_POSIBLE_HELADA) return null;
    return {
      nivel: peor.main.temp_min <= UMBRAL_HELADA ? 'helada' : 'posible',
      minima: peor.main.temp_min,
      cuando: new Date(peor.dt * 1000)
    };
  }

  private groupForecastByDay(list: OpenWeatherForecastItem[]): Forecast[] {
    const daysMap = new Map<string, Forecast>();
    const timeZone = 'America/Argentina/Buenos_Aires';

    list.forEach((entry) => {
      const utcDate = new Date(entry.dt * 1000);
      const localString = utcDate.toLocaleString('en-US', { timeZone });
      const localDate = new Date(localString);

      let groupingDate = localDate;
      if (localDate.getHours() >= 21) {
        groupingDate = new Date(localDate);
        groupingDate.setDate(groupingDate.getDate() - 1);
      }
      const dateKey = groupingDate.toISOString().split('T')[0];

      const forecastEntry: TimeSpecificForecast = {
        fullDate: localDate,
        hour: localDate.toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone
        }),
        temperature: entry.main.temp,
        humidity: entry.main.humidity,
        visibility: `${(entry.visibility / 1000).toFixed(1)} km`,
        weather: {
          description: entry.weather[0].description,
          icon: entry.weather[0].icon
        },
        rain_prob: Math.round((entry.pop || 0) * 100),
        wind: {
          direction: this.getCardinalDirection(entry.wind.deg),
          speed: Math.round(entry.wind.speed * 3.6)
        }
      };

      if (!daysMap.has(dateKey)) {
        daysMap.set(dateKey, {
          date: dateKey,
          temp_min: entry.main.temp_min,
          temp_max: entry.main.temp_max,
          humidity_min: entry.main.humidity,
          humidity_max: entry.main.humidity,
          intervals: [forecastEntry]
        });
      } else {
        const dayForecast = daysMap.get(dateKey)!;
        dayForecast.temp_min = Math.min(dayForecast.temp_min, entry.main.temp_min);
        dayForecast.temp_max = Math.max(dayForecast.temp_max, entry.main.temp_max);
        dayForecast.humidity_min = Math.min(dayForecast.humidity_min, entry.main.humidity);
        dayForecast.humidity_max = Math.max(dayForecast.humidity_max, entry.main.humidity);
        dayForecast.intervals.push(forecastEntry);
      }
    });

    const forecastArray = Array.from(daysMap.values())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 7);

    forecastArray.forEach(day => {
      day.intervals.sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime());
    });
    return forecastArray;
  }

  private getCardinalDirection(degree: number): string {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const index = Math.round((degree % 360) / 45) % 8;
    return directions[index];
  }

  private getSunriseSunset(lat: number, lon: number): void {
    this.sunriseSunsetService.getSunriseSunset(lat, lon).subscribe({
      next: (response) => {
        if (response.status === 'OK') {
          this.sunrise = new Date(response.results.sunrise).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Argentina/Buenos_Aires'
          });
          this.sunset = new Date(response.results.sunset).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Argentina/Buenos_Aires'
          });
        }
      },
      error: () => undefined
    });
  }

  selectDay(day: Forecast | null, index: number): void {
    const fallback = this.weatherData?.forecast?.[index] ?? this.weatherData?.forecast?.[0] ?? null;

    this.selectedDayIndex = index;
    this.selectedDay = day ?? fallback;

    this.changeDetectorRef.detectChanges();

    this.scheduleChartRender();
    this.cargarCicloSolar(this.selectedDay?.date);
  }

  /** Pide salida, puesta y crepúsculos del día elegido (una vez por fecha) y redibuja el gráfico. */
  private cargarCicloSolar(fecha: string | undefined): void {
    const loc = this.weatherData?.location;
    if (!fecha || loc?.lat == null || loc.lon == null || this.cicloSolar.has(fecha)) return;
    this.cicloSolar.set(fecha, null);
    this.sunriseSunsetService.getSunriseSunset(loc.lat, loc.lon, fecha).subscribe({
      next: (response) => {
        if (response.status !== 'OK') return;
        const r = response.results;
        this.cicloSolar.set(fecha, {
          salida: horaLocal(r.sunrise),
          puesta: horaLocal(r.sunset),
          mediodia: horaLocal(r.solar_noon),
          albaCivil: horaLocal(r.civil_twilight_begin),
          ocasoCivil: horaLocal(r.civil_twilight_end)
        });
        if (this.selectedDay?.date === fecha) this.scheduleChartRender();
      },
      error: () => undefined
    });
  }

  /**
   * Día y noche en el gráfico: la noche sombreada en azul con el alba y el ocaso en tonos
   * cálidos, el recorrido del sol como un arco punteado entre la salida y la puesta (con el
   * sol en su posición actual si el día es hoy), medio sol en el horizonte marcando cada
   * hora y una luna en la noche.
   */
  private pluginCicloSolar(ciclo: CicloSolar, tiempos: Date[], esHoy: boolean): Plugin<'line'> {
    // Hora → píxel interpolando entre los intervalos de 3 h (y extrapolando fuera de ellos)
    const xDe = (chart: Chart, t: Date): number => {
      const x = chart.scales['x'];
      const ms = t.getTime();
      const ts = tiempos.map(d => d.getTime());
      const n = ts.length;
      if (n < 2) return x.getPixelForValue(0);
      let i = ts.findIndex((v, k) => k < n - 1 && ms <= ts[k + 1]);
      if (i < 0) i = n - 2;
      const f = (ms - ts[i]) / (ts[i + 1] - ts[i]);
      const x0 = x.getPixelForValue(i);
      return x0 + f * (x.getPixelForValue(i + 1) - x0);
    };

    const dibujarSol = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, mitad: boolean) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r, mitad ? Math.PI : 0, 2 * Math.PI);
      ctx.fill();
      const rayos = mitad ? [-160, -125, -90, -55, -20] : [0, 45, 90, 135, 180, 225, 270, 315];
      for (const g of rayos) {
        const a = (g * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r + 3), cy + Math.sin(a) * (r + 3));
        ctx.lineTo(cx + Math.cos(a) * (r + 7), cy + Math.sin(a) * (r + 7));
        ctx.stroke();
      }
      ctx.restore();
    };

    // Luna creciente: se recorta un círculo a otro en un lienzo aparte (no borra el gráfico)
    const luna = document.createElement('canvas');
    luna.width = luna.height = 24;
    const lctx = luna.getContext('2d');
    if (lctx) {
      lctx.fillStyle = 'rgba(79, 70, 229, .6)';
      lctx.beginPath();
      lctx.arc(12, 12, 9, 0, 2 * Math.PI);
      lctx.fill();
      lctx.globalCompositeOperation = 'destination-out';
      lctx.beginPath();
      lctx.arc(17, 9, 8, 0, 2 * Math.PI);
      lctx.fill();
    }
    const dibujarLuna = (ctx: CanvasRenderingContext2D, cx: number, cy: number) => ctx.drawImage(luna, cx - 12, cy - 12);

    return {
      id: 'cicloSolar',
      beforeDatasetsDraw: (chart) => {
        const area = chart.chartArea;
        if (!area) return;
        const ctx = chart.ctx;
        const xAlba = xDe(chart, ciclo.albaCivil);
        const xSalida = xDe(chart, ciclo.salida);
        const xPuesta = xDe(chart, ciclo.puesta);
        const xOcaso = xDe(chart, ciclo.ocasoCivil);
        const xNoche = (x: number) => Math.min(Math.max(x, area.left), area.right);

        ctx.save();
        ctx.beginPath();
        ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
        ctx.clip();

        // Noche y crepúsculos: azul de noche que pasa por un tono cálido hacia el día
        const noche = 'rgba(49, 46, 129, .10)';
        const calido = 'rgba(251, 146, 60, .16)';
        const dia = 'rgba(255, 255, 255, 0)';
        const tramo = (desde: number, hasta: number, colores: string[]) => {
          const a = xNoche(desde), b = xNoche(hasta);
          if (b <= a) return;
          const g = ctx.createLinearGradient(desde, 0, hasta, 0);
          colores.forEach((c, k) => g.addColorStop(k / (colores.length - 1), c));
          ctx.fillStyle = g;
          ctx.fillRect(a, area.top, b - a, area.bottom - area.top);
        };
        ctx.fillStyle = noche;
        if (xAlba > area.left) ctx.fillRect(area.left, area.top, xNoche(xAlba) - area.left, area.bottom - area.top);
        if (xOcaso < area.right) ctx.fillRect(xNoche(xOcaso), area.top, area.right - xNoche(xOcaso), area.bottom - area.top);
        tramo(xAlba, xSalida + (xSalida - xAlba), [noche, calido, dia]);
        tramo(xPuesta - (xOcaso - xPuesta), xOcaso, [dia, calido, noche]);

        // Recorrido del sol: arco punteado de la salida a la puesta, más alto al mediodía solar
        const base = area.bottom;
        const alto = (area.bottom - area.top) * 0.82;
        const xMedio = xDe(chart, ciclo.mediodia);
        const yArco = (x: number) => {
          const u = x <= xMedio ? (x - xSalida) / (xMedio - xSalida) : (xPuesta - x) / (xPuesta - xMedio);
          return base - alto * Math.sin((Math.max(0, Math.min(1, u)) * Math.PI) / 2);
        };
        ctx.strokeStyle = 'rgba(234, 179, 8, .55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        for (let x = xSalida; x <= xPuesta; x += 3) {
          if (x === xSalida) ctx.moveTo(x, yArco(x)); else ctx.lineTo(x, yArco(x));
        }
        ctx.lineTo(xPuesta, base);
        ctx.stroke();
        ctx.setLineDash([]);

        // Sol en su posición actual (sólo hoy y de día)
        const ahora = horaLocal(new Date().toISOString());
        const xa = xDe(chart, ahora);
        const ya = yArco(xa);
        if (esHoy && ahora > ciclo.salida && ahora < ciclo.puesta && Number.isFinite(xa) && Number.isFinite(ya)) {
          const halo = ctx.createRadialGradient(xa, ya, 2, xa, ya, 22);
          halo.addColorStop(0, 'rgba(250, 204, 21, .55)');
          halo.addColorStop(1, 'rgba(250, 204, 21, 0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(xa, ya, 22, 0, 2 * Math.PI);
          ctx.fill();
          dibujarSol(ctx, xa, ya, 6, '#eab308', false);
        }

        // Luna en los tramos de noche que tengan lugar
        if (xAlba - area.left > 40) dibujarLuna(ctx, (area.left + xNoche(xAlba)) / 2, area.top + 18);
        if (area.right - xOcaso > 40) dibujarLuna(ctx, (xNoche(xOcaso) + area.right) / 2, area.top + 18);
        ctx.restore();
      },
      afterDatasetsDraw: (chart) => {
        const area = chart.chartArea;
        if (!area) return;
        const ctx = chart.ctx;
        // Medio sol sobre el horizonte con la hora: naranja al salir, rojizo al ponerse
        const marcas: [Date, string, string][] = [
          [ciclo.salida, '#f59e0b', `↑ ${hhmm(ciclo.salida)}`],
          [ciclo.puesta, '#ea580c', `↓ ${hhmm(ciclo.puesta)}`]
        ];
        ctx.save();
        ctx.font = '700 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (const [t, color, texto] of marcas) {
          const x = xDe(chart, t);
          if (x < area.left + 8 || x > area.right - 8) continue;
          dibujarSol(ctx, x, area.bottom, 8, color, true);
          const ancho = ctx.measureText(texto).width + 10;
          ctx.fillStyle = 'rgba(255, 255, 255, .85)';
          ctx.fillRect(x - ancho / 2, area.bottom - 34, ancho, 15);
          ctx.fillStyle = color;
          ctx.fillText(texto, x, area.bottom - 20);
        }
        ctx.restore();
      }
    };
  }

  /** "Sol: sale 06:31 · se pone 19:35 · 13 h 04 min de luz" para el subtítulo del gráfico */
  private textoCicloSolar(ciclo: CicloSolar): string {
    const min = Math.round((ciclo.puesta.getTime() - ciclo.salida.getTime()) / 60000);
    return `Sol: sale ${hhmm(ciclo.salida)} · se pone ${hhmm(ciclo.puesta)} · ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min de luz`;
  }

  /** Ícono del día: el del intervalo más cercano al mediodía (el primero suele ser de noche). */
  iconoDelDia(day: Forecast): TimeSpecificForecast {
    return day.intervals.reduce((mejor, i) =>
      Math.abs(i.fullDate.getHours() - 13) < Math.abs(mejor.fullDate.getHours() - 13) ? i : mejor, day.intervals[0]);
  }

  /** Mayor probabilidad de lluvia del día (%) */
  lluviaDelDia(day: Forecast): number {
    return Math.max(0, ...day.intervals.map(i => i.rain_prob));
  }

  /** Barra de temperatura del día dentro del rango de toda la semana (posición y ancho en %) */
  barraTemperatura(day: Forecast): { left: number; width: number } {
    const dias = this.weatherData?.forecast ?? [day];
    const min = Math.min(...dias.map(d => d.temp_min));
    const max = Math.max(...dias.map(d => d.temp_max));
    const rango = Math.max(1, max - min);
    const left = ((day.temp_min - min) / rango) * 100;
    return { left, width: Math.max(8, ((day.temp_max - day.temp_min) / rango) * 100) };
  }

  /** aaaa-mm-dd → d/m */
  fechaCorta(dateStr: string): string {
    const [, m, d] = dateStr.split('-');
    return `${Number(d)}/${Number(m)}`;
  }

  /** Ícono de OpenWeather en doble resolución (se ve nítido en pantallas densas) */
  iconoUrl(icono: string): string {
    return `https://openweathermap.org/img/wn/${icono}@2x.png`;
  }

  getDayName(dateStr: string): string {
    const [year, month, day] = dateStr.split('-');
    const dateObj = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 12));
    return dateObj
      .toLocaleDateString('es-AR', {
        weekday: 'short',
        timeZone: 'America/Argentina/Buenos_Aires'
      })
      .substring(0, 3)
      .toUpperCase();
  }

  /** Si en otra sección se eligió otra estación, el pronóstico la sigue. */
  private seguirActiva(): void {
    if (!this.stations.length) return;
    const activa = this.stationService.activa;
    const actual = this.stationService.getSelectedStation()?.Identificacion;
    if (actual === activa) return;
    const enLista = this.stations.find(station => station.Identificacion === activa);
    // Ya muestra una estación y la activa no está en esta lista: se deja la que está
    if (!enLista && actual) return;
    const stationToSelect = enLista ||
      this.stations.find(station => station.Identificacion === ESTACION_INICIAL) ||
      this.stations[0];
    // Si la activa no está en esta lista se muestra otra, pero la activa no cambia
    this.stationService.setSelectedStation(stationToSelect, false);
  }

  loadStations(): void {
    this.weatherService.getStations().subscribe({
      next: (data) => {
        this.stations = data;
        this.seguirActiva();
      },
      error: () => {
        this.error = 'Error al cargar las estaciones';
        this.loading = false;
      }
    });
  }

  updateStationData(): void {
    if (this.selectedStation) {
      const lat = parseFloat(this.selectedStation.lat) || -26.8;
      const lon = parseFloat(this.selectedStation.lon) || -65.2;

      const temp = parseFloat(this.selectedStation.temp_af ?? '');
      this.rtTemperature = isNaN(temp) || temp < -25 || temp > 55 ? null : temp;
      const humidity = parseFloat(this.selectedStation.hum_af ?? '');
      this.rtHumidity = isNaN(humidity) ? null : humidity;
      const rrDia = parseFloat(this.selectedStation.RR_dia ?? '');
      this.rtRain = isNaN(rrDia) || rrDia > 400 ? null : parseFloat(rrDia.toFixed(1));
      const rawSpeed = parseFloat(this.selectedStation.viento_medio ?? '');
      this.rtWind = {
        direction: this.selectedStation.direc || 'N/A',
        speed: isNaN(rawSpeed) || rawSpeed > 390 ? undefined : rawSpeed
      };
      this.rtUpdated = leerFechaEstacion(this.selectedStation.fecha_I);
      this.rtHace = this.rtUpdated ? haceCuanto(this.rtUpdated) : '';
      this.rtEstado = estadoComunicacion(this.rtUpdated);
      this.rtStationName = this.selectedStation.nombre || 'EstaciÃ³n desconocida';

      this.getWeatherForecast(lat, lon);
      this.loadNowWeather(lat, lon);
    }

  }

  private loadNowWeather(lat: number, lon: number): void {
    this.nowLoading = true;
    this.nowIconUrl = null;
    this.nowDescription = null;

    this.weatherService.getOpenWeatherNow(lat, lon).subscribe({
      next: (res: OpenWeatherNowResponse) => {
        const w = res?.weather?.[0];
        const icon = w?.icon;

        this.nowDescription = w?.description ?? null;
        this.nowIconUrl = icon ? `https://openweathermap.org/img/wn/${icon}.png` : null;

        this.nowLoading = false;
      },
      error: () => {
        this.nowLoading = false;
        this.nowIconUrl = null;
        this.nowDescription = null;
      }
    });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.temperatureChart?.destroy();
  }

  private cssVar(name: string, fallback: string) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  private createTemperatureChart(): void {
    if (!this.selectedDay) return;
    const canvas = this.temperatureChartCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (this.temperatureChart) {
      this.temperatureChart.destroy();
      this.temperatureChart = null;
    }

    const labels = this.selectedDay.intervals.map(interval => interval.hour);
    const temperatures = this.selectedDay.intervals.map(interval => interval.temperature);

    const lineColor = VAR_COLOR.temp;
    const textColor = this.cssVar('--text', '#111827');
    const mutedColor = this.cssVar('--muted', '#6b7280');
    const gridColor = GRID_COLOR;

    const ciclo = this.cicloSolar.get(this.selectedDay.date) ?? null;
    const esHoy = this.selectedDayIndex === 0;
    const tiempos = this.selectedDay.intervals.map(interval => interval.fullDate);

    this.temperatureChart = new Chart(ctx, {
      type: 'line',
      // Con un solo intervalo (p. ej. hoy a la noche) no hay eje de horas donde ubicar el sol
      plugins: ciclo && tiempos.length >= 2 ? [this.pluginCicloSolar(ciclo, tiempos, esHoy)] : [],
      data: {
        labels,
        datasets: [{
          label: 'Temperatura',
          data: temperatures,
          borderColor: lineColor,
          backgroundColor: conAlfa(lineColor, .13),
          borderWidth: 2,
          pointRadius: 2.5,
          pointHoverRadius: 4,
          pointBackgroundColor: lineColor,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
          tension: 0.35,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              color: mutedColor,
              maxTicksLimit: 6,
              font: { size: 11 }
            },
            grid: { color: gridColor }
          },
          y: {
            ticks: {
              color: mutedColor,
              callback: (value) => {
                const n = Number(value);
                return isNaN(n) ? '' : fmtNum(n, 1);
              }
            },
            grid: { color: gridColor }
          }
        },
        plugins: {
          referencias: { lineas: referenciasHelada() },
          legend: { display: false },
          title: {
            display: true,
            text: 'Pronóstico de Temperatura Horaria (°C)',
            color: textColor,
            font: { weight: 700, size: 12 }
          },
          subtitle: {
            display: !!ciclo,
            text: ciclo ? this.textoCicloSolar(ciclo) : '',
            color: '#b45309',
            font: { weight: 600, size: 11 },
            padding: { bottom: 6 }
          },
          tooltip: {
            callbacks: {
              label: (context) => `${fmtNum(context.parsed.y, 1)} °C`
            }
          }
        }
      }
    });
  }

  private scheduleChartRender() {
    setTimeout(() => this.createTemperatureChart(), 0);
  }
}

