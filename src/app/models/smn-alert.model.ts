export type Period = 'early_morning' | 'morning' | 'afternoon' | 'night';

export interface EventLevels {
  early_morning: number;
  morning:       number;
  afternoon:     number;
  night:         number;
}

export interface SmnEvent {
  id:        number;
  max_level: number;
  levels:    EventLevels;
}

export interface Warning {
  date?:      string;       // algunas advertencias pueden venir vacías {}
  max_level?: number;
  events?:    SmnEvent[];
}

export interface ReportLevel {
  level:       number;
  description: string;
  instruction: string;
}

export interface Report {
  event_id: number;
  levels:   ReportLevel[];
}

export interface SmnAlertResponse {
  area_id:  number;
  updated:  string;
  warnings: Warning[];
  reports:  Report[];
}
