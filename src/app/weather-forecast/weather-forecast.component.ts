import { Component, OnInit, ChangeDetectorRef, Output, EventEmitter, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { OpenWeatherForecastItem, OpenWeatherForecastResponse, OpenWeatherNowResponse, WeatherService, WeatherStation } from '../services/weather.service';
import { StationService } from '../services/station.service';
import { SunriseSunsetService } from '../services/sunrise-sunset.service';
import { WeatherData, Forecast, TimeSpecificForecast } from '../models/weather-data';
import { FormsModule } from '@angular/forms';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faTemperatureHigh, faTint, faWind, faClock, faCloudRain, faSun, faMoon, faEye } from '@fortawesome/free-solid-svg-icons'; // faCloudRain y faEye ya estaban, mantenemos
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import Chart from 'chart.js/auto';
import { MatIconModule } from '@angular/material/icon';
import { Input } from '@angular/core';

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
    MatIconModule,
  ],
  templateUrl: './weather-forecast.component.html',
  styleUrls: ['./weather-forecast.component.css']
})
export class WeatherForecastComponent implements OnInit, AfterViewInit {
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

  stations: WeatherStation[] = [];
  selectedStation: WeatherStation | null = null;
  rtTemperature: number | null = null;
  rtHumidity: number | null = null;
  rtRain: number | null = null;
  rtWind: { direction?: string; speed?: number } | null = null;

  rtUpdated: Date | null = null;
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

  ngOnInit() {
    this.stationService.selectedStation$.subscribe(station => {
      this.selectedStation = station;
      if (station) {
        this.updateStationData();
      }
    });
    this.loadStations();
  }

  ngAfterViewInit(): void {
    this.scheduleChartRender();
  }


  selectStation(station: WeatherStation): void {
    this.stationService.setSelectedStation(station);
    this.stationSelected.emit(station.Identificacion);
  }

  getWeatherForecast(lat: number, lon: number): void {
    this.loading = true;
    this.weatherService.getOpenWeatherForecast(lat, lon).subscribe({
      next: (response: OpenWeatherForecastResponse) => {
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
      next: (data) => {
        this.stations = data;
        if (!this.stationService.getSelectedStation()) {
          const defaultStation = this.stations.find(
            station => station.Identificacion === '2049' ||
              station.nombre?.toLowerCase().includes('colmenar')
          );
          const stationToSelect = defaultStation || (this.stations.length > 0 ? this.stations[0] : null);
          this.stationService.setSelectedStation(stationToSelect);
        }
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
      this.rtUpdated = this.selectedStation.fecha_I ? new Date(this.selectedStation.fecha_I) : null;
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

    const lineColor = this.cssVar('--brand', '#6d28d9');
    const textColor = this.cssVar('--text', '#111827');
    const mutedColor = this.cssVar('--muted', '#6b7280');
    const gridColor = 'rgba(17,24,39,.08)';

    this.temperatureChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Temperatura',
          data: temperatures,
          borderColor: lineColor,
          backgroundColor: lineColor + '22',
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
                return isNaN(n) ? '' : n.toFixed(1);
              }
            },
            grid: { color: gridColor }
          }
        },
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Pronóstico de Temperatura Horaria (°C)',
            color: textColor,
            font: { weight: 700, size: 12 }
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.parsed.y.toFixed(1)} °C`
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

