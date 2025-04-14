export interface WeatherData {
  location: {
    name: string;
    province: string;
    lat?: number;
    lon?: number;
  };
  updated: Date;
  forecast: Forecast[];
}

interface Estacion {
  Identificacion: string;
  nombre: string;
  lat: string;
  lon: string;
  alt?: number;
  temp_af: number;
  hum_af: number;
  precipitacion?: number;
}

export interface Forecast {
  date: string;
  temp_min: number;
  temp_max: number;
  humidity_min: number;
  humidity_max: number;
  intervals: TimeSpecificForecast[];
  representativeIcon?: string; // Agregado: ícono representativo del día
}

export interface TimeSpecificForecast {
  fullDate: Date; // Agregada la propiedad fullDate
  hour: string;
  temperature: number;
  humidity: number;
  visibility: string;
  weather: {
    description: string;
    icon: string;
  };
  rain_prob: number;
  wind: {
    direction: string;
    speed: number;
  };
}