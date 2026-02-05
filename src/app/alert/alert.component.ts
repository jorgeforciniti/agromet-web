import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeatherService } from '../services/weather.service';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MapRainComponent } from '../map-rain/map-rain.component';
import { MapFrostComponent } from '../map-frost/map-frost.component';

@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './alert.component.html',
  styleUrls: ['./alert.component.css']
})
export class AlertComponent implements OnInit {
  showRainAlert = false;
  showFrostAlert = false;
  frostAlertLevel: number = 0; // 0 = none, 1 = leve, 2 = moderada, 3 = severa

  constructor(
    private weatherService: WeatherService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadAlerts();
  }

  /**
   * Decide la clase CSS según nivel de helada.
   */
  public getFrostClass(level: number): string {
    switch (level) {
      case 1: return 'frost-level-1';
      case 2: return 'frost-level-2';
      case 3: return 'frost-level-3';
      default: return '';
    }
  }

  /**
   * Consulta la API y determina si hay alertas de lluvia o helada.
   */
  private loadAlerts(): void {
    this.weatherService.getAlerts().subscribe((response: any) => {
      const stations = response.data.filter((s: any) => s.habilitada > 0);
      this.checkRainAlert(stations);
      this.frostAlertLevel = this.checkFrostAlertLevel(stations);
      this.showFrostAlert = this.frostAlertLevel > 0;
    });
  }

  /**
   * Activa alerta de lluvia si al menos una estación cumple criterios.
   */
  private checkRainAlert(stations: any[]): void {
    this.showRainAlert = stations.some(s => {
      const recs = parseInt(s.registrosLluvia, 10);
      const total = parseFloat(s.totalLluvia);
      return recs > 1 || (recs > 1 && total > 0.6);
    });
  }

  /**
   * Devuelve nivel de helada: 0 = no, 1 = leve, 2 = moderada, 3 = severa.
   */
  public checkFrostAlertLevel(stations: any[]): number {
    const temps = stations.map(s => parseFloat(s.minimaTemperatura));
    if (!temps.length) return 0;

    const minTemp = Math.min(...temps);
    if (minTemp > 0) return 0;
    if (minTemp > -2) return 1;
    if (minTemp > -4) return 2;
    return 3;
  }

  /**
   * Abre diálogo de heladas.
   */
  public openFrostDialog(): void {
    this.dialog.open(MapFrostComponent, {
      width: '90vw',
      maxWidth: '1200px',
      panelClass: 'custom-dialog-container',
      data: { hoy: true }
    });
  }

  /**
   * Abre diálogo de lluvias.
   */
  public openRainDialog(): void {
    this.dialog.open(MapRainComponent, {
      width: '90vw',
      maxWidth: '1200px',
      panelClass: 'custom-dialog-container',
      data: { hoy: true }
    });
  }
}