import { Component, OnInit, ChangeDetectorRef, Output, EventEmitter, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { WeatherService } from '../services/weather.service';
import { SunriseSunsetService } from '../services/sunrise-sunset.service';
import { WeatherData, Forecast, TimeSpecificForecast } from '../models/weather-data';
import { FormsModule } from '@angular/forms';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faTemperatureHigh, faTint, faWind, faClock, faCloudRain, faSun, faMoon, faEye } from '@fortawesome/free-solid-svg-icons'; // faCloudRain y faEye ya estaban, mantenemos
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { SmnAlertResponse, Warning, SmnEvent, ReportLevel, Period } from '../models/smn-alert.model';
import { Chart } from 'chart.js';

registerLocaleData(localeEsAr);

@Component({
  selector: 'app-weather-forecast',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FontAwesomeModule,
    MatSelectModule,
    MatFormFieldModule,
    // BaseChartDirective, // Eliminado de imports
  ],
  templateUrl: './weather-forecast.component.html',
  styleUrls: ['./weather-forecast.component.css']
})
export class WeatherForecastComponent implements OnInit, AfterViewInit {
  @Output() stationSelected = new EventEmitter<string>();
  @ViewChild('temperatureChart') temperatureChartCanvas!: ElementRef<HTMLCanvasElement>;

  // Propiedades relacionadas con los gráficos eliminadas:
  // temperatureChartData, forecastDays, labels, tempChartData, humChartData, windChartData, rainChartData, chartOptions
  private temperatureChart: Chart | null = null;
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

  smnAlerts: any[] = [];
  smnShortAlerts: any[] = [];

  periodoEnCastellano(period: string): string {
    switch (period) {
      case 'early_morning': return 'Madrugada';
      case 'morning': return 'Mañana';
      case 'afternoon': return 'Tarde';
      case 'night': return 'Noche';
      default: return period;
    }
  }

  private createTemperatureChart(): void {
    if (!this.selectedDay) return;

    const ctx = this.temperatureChartCanvas?.nativeElement;
    if (!ctx) {
      console.error('Canvas element not found');
      return;
    }

    // Extraer horas y temperaturas
    const labels = this.selectedDay.intervals.map(interval => interval.hour);
    const temperatures = this.selectedDay.intervals.map(interval => interval.temperature);
    const wind = this.selectedDay.intervals.map(interval => interval.wind.speed);

    // Destruir el gráfico existente si ya hay uno
    if (this.temperatureChart) {
      this.temperatureChart.destroy();
    }

    // Crear el nuevo gráfico
    this.temperatureChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Temperatura',  // el label puede quedarse o quitarse, no se mostrará
          data: temperatures,
          borderColor: 'rgba(255, 238, 5)',
          backgroundColor: 'rgba(255, 238, 5, 0.3)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: 'rgba(255, 238, 5, 0.72)',
          fill: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: {
              display: true,
              text: 'Hora',
              color: 'rgba(255, 248, 143, 0.72)'
            },
            ticks: {
              color: 'rgba(255, 248, 143, 0.72)' // Color amarillo para los ticks del eje Y
            },
            grid: {
              color: 'rgba(255, 248, 143, 0.1)' // Opcional: color de la cuadrícula
            }
          },
          y: {
            title: {
              display: false,
              text: '°C',
              color: 'rgba(255, 248, 143, 0.72)'
            },
            ticks: {
              color: 'rgba(255, 248, 143, 0.72)',
              callback: function(value) {
  const numericValue = Number(value);
  if (isNaN(numericValue)) return '';
  
  return numericValue < 10 
    ? `0${numericValue.toFixed(0)}` 
    : numericValue.toFixed(0);
}
            },
            grid: {
              color: 'rgba(255, 248, 143, 0.1)', // Opcional: color de la cuadrícula
            }
          }
        },
        plugins: {
          legend: {
            display: false    // ← aquí deshabilitamos la leyenda
          },
          title: {
            display: true,
            text: 'Pronóstico de Temperatura Horaria (°C)',
            color: 'rgba(255, 248, 143, 0.72)'
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `${context.parsed.y.toFixed(0)}`;  // solo valor numérico
              }
            }
          }
        }
      }
    });
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

  ngAfterViewInit() {
    this.createTemperatureChart();
  }
  selectStation(station: any): void {
    this.selectedStation = station;
    this.updateStationData();
    this.stationSelected.emit(station.Identificacion);
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

        this.selectDay(null, 0); // Esto seleccionará el primer día y sus datos para la nueva vista horaria
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
      error: (err) => console.error(err)
    });
  }

  selectDay(day: Forecast | null, index: number): void {
    this.selectedDayIndex = index;
    this.selectedDay = day || this.weatherData?.forecast[0] || null;
    setTimeout(() => {
      this.createTemperatureChart();
    }, 0);
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
        const defaultStation = this.stations.find(
          station => station.Identificacion === '2049' ||
            station.nombre?.toLowerCase().includes('colmenar')
        );
        this.selectedStation = defaultStation || (this.stations.length > 0 ? this.stations[0] : null);
        if (this.selectedStation) {
          const lat = parseFloat(this.selectedStation.lat);
          const lon = parseFloat(this.selectedStation.lon);
          if (!isNaN(lat) && !isNaN(lon)) {
            this.getWeatherForecast(lat, lon); // Esto llamará a selectDay(null, 0) internamente
            this.updateStationData(); // Asegura que los datos en tiempo real y alertas se carguen
          } else {
            this.error = 'Coordenadas inválidas para la estación por defecto.';
            this.loading = false;
          }
        } else {
          this.error = 'No hay estaciones disponibles o no se pudo seleccionar una por defecto.';
          this.loading = false;
        }
        this.changeDetectorRef.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar estaciones:', err);
        this.error = 'No se pudieron cargar las estaciones';
        this.loading = false;
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
      this.rtUpdated = this.selectedStation.fecha_I ? new Date(this.selectedStation.fecha_I) : null;
      this.rtStationName = this.selectedStation.nombre || 'Estación desconocida';

      this.getWeatherForecast(lat, lon); // Actualiza el pronóstico detallado
      this.loadSmnAlerts(lat, lon); // Carga alertas para la nueva estación
    }
  }

  loadSmnAlerts(lat: number, lon: number): void {
    this.weatherService.getSmnAlertByCoords(lat, lon)
      .subscribe({
        next: (alerta: SmnAlertResponse) => {
          const reportsMap = new Map<number, ReportLevel[]>();
          alerta.reports.forEach(r => reportsMap.set(r.event_id, r.levels));

          this.smnAlerts = alerta.warnings
            .filter((w: Warning): w is Warning => !!(w.date && w.events))
            .flatMap((warning: Warning) => {
              const fecha = warning.date!;
              return warning.events!.flatMap((event: SmnEvent) => {
                const [reportInfo]: ReportLevel[] = reportsMap.get(event.id) ?? [];
                const entries = Object.entries(event.levels) as [Period, number][];

                return entries
                  .filter(([_, lvl]) => lvl >= 3) // Usar _ si 'period' no se usa aquí
                  .map(([period, lvl]) => ({ // Aquí sí usamos 'period'
                    date: fecha,
                    period,
                    level: event.max_level, // Usar max_level del evento general
                    description: reportInfo?.description ?? 'No disponible',
                    instruction: reportInfo?.instruction ?? 'No disponible'
                  }));
              });
            });
          this.changeDetectorRef.detectChanges();
        },
        error: err => {
          console.error('Error al cargar alertas SMN:', err);
          this.smnAlerts = []; // Limpiar alertas en caso de error
          this.changeDetectorRef.detectChanges();
        }
      });
  }
}