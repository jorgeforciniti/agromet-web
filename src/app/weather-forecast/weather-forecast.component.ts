import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { WeatherService } from '../services/weather.service';
import { WeatherData, Forecast, TimeSpecificForecast } from '../models/weather-data';
import { SunriseSunsetService } from '../services/sunrise-sunset.service';
import localeEsAr from '@angular/common/locales/es-AR';

// Registrar localización para fechas en español
registerLocaleData(localeEsAr);

@Component({
  selector: 'app-weather-forecast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './weather-forecast.component.html',
  styleUrls: ['./weather-forecast.component.css']
})
export class WeatherForecastComponent implements OnInit {
  loading = false;
  error: string | null = null;
  weatherData: WeatherData | null = null;
  currentConditions: TimeSpecificForecast | null = null;
  currentWindDirection: string | null = null;
  sunrise: string = '--:--';
  sunset: string = '--:--';
  selectedDayIndex: number = 0;
  selectedDay: Forecast | null = null;
  
  readonly lat: number = -26.82414;
  readonly lng: number = -65.2226;

  constructor(
    private weatherService: WeatherService,
    private sunriseSunsetService: SunriseSunsetService,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.getWeatherForecast();
    this.getSunriseSunset();
  }

  getWeatherForecast(): void {
    this.loading = true;
    this.weatherService.getWeatherForecast().subscribe({
      next: (data: WeatherData) => {
        this.weatherData = data;
        if (data.forecast && data.forecast.length > 0) {
          data.forecast = this.sortForecastByDate(data.forecast);
          this.selectDay(null, 0); // Inicializar con primer día
          
          // Establecer condiciones actuales
          const now = new Date().getHours();
          const today = data.forecast[0];
          
          if (now >= 0 && now < 6 && today.early_morning) {
            this.currentConditions = today.early_morning;
          } else if (now >= 6 && now < 12 && today.morning) {
            this.currentConditions = today.morning;
          } else if (now >= 12 && now < 18 && today.afternoon) {
            this.currentConditions = today.afternoon;
          } else if (today.night) {
            this.currentConditions = today.night;
          }
          
          this.currentWindDirection = this.currentConditions?.wind?.direction || null;
        }
        this.loading = false;
        this.changeDetectorRef.detectChanges();
      },
      error: (err: any) => {
        console.error(err);
        this.error = 'Error al obtener los datos del clima.';
        this.loading = false;
      }
    });
  }

  private sortForecastByDate(forecast: Forecast[]): Forecast[] {
    // Convertir fechas a objetos Date y ordenar
    return forecast.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      
      // Ajustar a zona horaria argentina
      dateA.setHours(dateA.getHours() + 3);
      dateB.setHours(dateB.getHours() + 3);
      
      return dateA.getTime() - dateB.getTime();
    });
  }

  getSunriseSunset(): void {
    this.sunriseSunsetService.getSunriseSunset(this.lat, this.lng).subscribe({
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
      error: (err: any) => {
        console.error(err);
      }
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
    const date = new Date(dateStr);
    date.setHours(date.getHours() + 3); // Ajuste horario
    return date.toLocaleDateString('es-AR', { 
      weekday: 'short',
      timeZone: 'America/Argentina/Buenos_Aires'
    }).substring(0, 3).toUpperCase();
  }
}