export interface WeatherData {
    updated: string;
    location: Location;
    type: string;
    forecast: Forecast[];
  }
  
  export interface Location {
    id: number;
    name: string;
    department: string;
    province: string;
    type: string;
    coord: Coordinates;
  }
  
  export interface Coordinates {
    lon: number;
    lat: number;
  }
  
  export interface Forecast {
    date: string;
    temp_min: number;
    temp_max: number;
    humidity_min: number;
    humidity_max: number;
    early_morning?: TimeSpecificForecast;
    morning?: TimeSpecificForecast;
    afternoon?: TimeSpecificForecast;
    night?: TimeSpecificForecast;
  }
  
  export interface TimeSpecificForecast {
    humidity: number | null;
    rain_prob_range: [number, number];
    gust_range: any;
    temperature: number;
    visibility: string;
    rain06h: number | null;
    weather: WeatherDescription;
    wind: Wind;
    river: any;
    border: any;
  }
  
  export interface WeatherDescription {
    description: string;
    id: number;
  }
  
  export interface Wind {
    direction: string;
    deg: number;
    speed_range: [number, number];
  }
