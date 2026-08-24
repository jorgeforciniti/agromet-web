import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { WeatherStation } from './weather.service';

@Injectable({
  providedIn: 'root'
})
export class StationService {
  private selectedStationSubject = new BehaviorSubject<WeatherStation | null>(null);
  public selectedStation$: Observable<WeatherStation | null> = this.selectedStationSubject.asObservable();

  constructor() { }

  setSelectedStation(station: WeatherStation | null): void {
    this.selectedStationSubject.next(station);
  }

  getSelectedStation(): WeatherStation | null {
    return this.selectedStationSubject.value;
  }
}