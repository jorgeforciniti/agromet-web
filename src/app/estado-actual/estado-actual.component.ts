import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AlertComponent } from '../alert/alert.component';
import { WeatherForecastComponent } from '../weather-forecast/weather-forecast.component';
import { LeafletGoesViewerComponent } from '../leaflet-goes-viewer/leaflet-goes-viewer.component';

@Component({
  selector: 'app-estado-actual',
  standalone: true,
  imports: [MatIconModule, AlertComponent, WeatherForecastComponent, LeafletGoesViewerComponent],
  templateUrl: './estado-actual.component.html',
  styleUrl: './estado-actual.component.css'
})
export class EstadoActualComponent {
  scrollToSection(event: Event, sectionId: string): void {
    event.preventDefault();
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
