import { Component, OnInit, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { WeatherService } from '../services/weather.service';
import { SunriseSunsetService } from '../services/sunrise-sunset.service';
import { WeatherData, Forecast, TimeSpecificForecast } from '../models/weather-data';
import { FormsModule } from '@angular/forms';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faTemperatureHigh, faTint, faWind, faClock } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCloudRain } from '@fortawesome/free-solid-svg-icons';
import { faSun, faMoon } from '@fortawesome/free-solid-svg-icons';
import { MatSelectModule } from '@angular/material/select'; // Importar MatSelectModule
import { MatFormFieldModule } from '@angular/material/form-field'; // Para el contenedor
import { faEye } from '@fortawesome/free-solid-svg-icons'; // Asegúrate de que esta línea existe
import { SmnAlertResponse, Warning, SmnEvent, ReportLevel, Period } from '../models/smn-alert.model';

registerLocaleData(localeEsAr);

@Component({
  selector: 'app-weather-forecast',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule, MatSelectModule, MatFormFieldModule,],
  templateUrl: './weather-forecast.component.html',
  styleUrls: ['./weather-forecast.component.css']
})
export class WeatherForecastComponent implements OnInit {
  @Output() stationSelected = new EventEmitter<string>();

  selectStation(station: any): void {
    this.selectedStation = station;
    this.updateStationData();
    this.stationSelected.emit(station.Identificacion);
  }

  loading = false;
  error: string | null = null;
  weatherData: WeatherData | null = null;
  currentConditions: TimeSpecificForecast | null = null;
  sunrise: string = '--:--';
  sunset: string = '--:--';
  selectedDayIndex: number = 0;
  selectedDay: Forecast | null = null;

  stations: any[] = [];
  selectedStation: any = null;
  rtTemperature: number | null = null;
  rtHumidity: number | null = null;
  rtWind: { direction?: string; speed?: number } | null = null;
  rtUpdated: Date | null = null;
  rtStationName: string = '';

  // Propiedades para alertas meteorológicas SMN
  smnAlerts: any[] = [];
  smnShortAlerts: any[] = [];

  // weather-forecast.component.ts
  periodoEnCastellano(period: string): string {
    switch (period) {
      case 'early_morning': return 'Madrugada';
      case 'morning': return 'Mañana';
      case 'afternoon': return 'Tarde';
      case 'night': return 'Noche';
      default: return period;
    }
  }

  constructor(
    private weatherService: WeatherService,
    private sunriseSunsetService: SunriseSunsetService,
    private changeDetectorRef: ChangeDetectorRef,
    private library: FaIconLibrary,
  ) {
    library.addIcons(faTemperatureHigh, faTint, faWind, faClock, faCloudRain, faSun, faMoon, faEye);
  }

  ngOnInit() {
    this.loadStations();
  }

  getWeatherForecast(lat: number, lon: number): void {
    this.loading = true;
    this.weatherService.getOpenWeatherForecast(lat, lon).subscribe({
      next: (response) => {
        const groupedForecast = this.groupForecastByDay(response.list);
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

        this.selectDay(null, 0);
        this.getSunriseSunset(lat, lon);
        this.loading = false;
        this.changeDetectorRef.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.error = 'Error al obtener el pronóstico';
        this.loading = false;
      }
    });
  }

  private groupForecastByDay(list: any[]): Forecast[] {
    const daysMap = new Map<string, Forecast>();
    const timeZone = 'America/Argentina/Buenos_Aires';

    list.forEach((entry: any) => {
      // Convertir timestamp (dt en segundos) a Date y ajustar a la zona local
      const utcDate = new Date(entry.dt * 1000);
      const localString = utcDate.toLocaleString('en-US', { timeZone });
      const localDate = new Date(localString);

      // Si la hora local es 21:00 o mayor, asignar la entrada al día anterior
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
          speed: Math.round(entry.wind.speed * 3.6) // de m/s a km/h
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

    // Ordenar los intervalos de cada día por su fullDate
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
      error: (err) => console.error(err)
    });
  }

  selectDay(event: MouseEvent | null, index: number): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.selectedDayIndex = index;
    if (this.weatherData) {
      this.selectedDay = this.weatherData.forecast[index];
    }
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

  loadStations(): void {
    this.weatherService.getStations().subscribe({
      next: (data: any[]) => {
        this.stations = data;
        // Seleccionar estación por defecto: Identificación "2049" o nombre que incluya "colmenar"
        const defaultStation = this.stations.find(
          station => station.Identificacion === '2049' ||
            station.nombre?.toLowerCase().includes('colmenar')
        );
        this.selectedStation = defaultStation || this.stations[0] || null;
        if (this.selectedStation) {
          const lat = parseFloat(this.selectedStation.lat);
          const lon = parseFloat(this.selectedStation.lon);
          if (!isNaN(lat) && !isNaN(lon)) {
            this.getWeatherForecast(lat, lon);
            this.updateStationData();
          }
        }
      },
      error: (err) => {
        console.error('Error al cargar estaciones:', err);
        this.error = 'No se pudieron cargar las estaciones';
        this.changeDetectorRef.detectChanges();
      }
    });
  }

  updateStationData(): void {
    if (this.selectedStation) {
      const lat = parseFloat(this.selectedStation.lat) || -26.8;
      const lon = parseFloat(this.selectedStation.lon) || -65.2;

      this.rtTemperature = parseFloat(this.selectedStation.temp_af) || null;
      this.rtHumidity = parseFloat(this.selectedStation.hum_af) || null;
      this.rtWind = {
        direction: this.selectedStation.direc || 'N/A',
        speed: parseFloat(this.selectedStation.viento_medio) || 0
      };
      this.rtUpdated = new Date(this.selectedStation.fecha_I) || null;
      this.rtStationName = this.selectedStation.nombre || 'Estación desconocida';

      // Actualiza el pronóstico con las coordenadas de la estación
      this.getWeatherForecast(lat, lon);
      // Obtener alertas SMN utilizando los nuevos endpoints
      this.loadSmnAlerts(lat, lon);
    }
  }

  loadSmnAlerts(lat: number, lon: number): void {
    this.weatherService.getSmnAlertByCoords(lat, lon)
      .subscribe({
        next: (alerta: SmnAlertResponse) => {
          // Map de event_id → ReportLevel[]
          const reportsMap = new Map<number, ReportLevel[]>();
          alerta.reports.forEach(r => reportsMap.set(r.event_id, r.levels));

          this.smnAlerts = alerta.warnings
            // Filtrar sólo warnings con fecha y eventos
            .filter((w: Warning): w is Warning => !!(w.date && w.events))
            .flatMap((warning: Warning) => {
              const fecha = warning.date!;  // ya garantizado por el filtro
              return warning.events!.flatMap((event: SmnEvent) => {
                // Sacamos la descripción/instrucción (suponemos un solo nivel)
                const [reportInfo]: ReportLevel[] = reportsMap.get(event.id) ?? [];

                // `Object.entries` devuelve [string, unknown], así que casteamos
                const entries = Object.entries(event.levels) as [Period, number][];

                return entries
                  .filter(([period, lvl]) => lvl >= 3)
                  .map(([period, lvl]) => ({
                    date: fecha,
                    period,      // tipo Period
                    level: event.max_level,
                    description: reportInfo?.description ?? '',
                    instruction: reportInfo?.instruction ?? ''
                  }));
              });
            });

          this.changeDetectorRef.detectChanges();
        },
        error: err => console.error(err)
      });
  }
}
