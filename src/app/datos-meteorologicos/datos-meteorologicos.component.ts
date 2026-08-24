import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-datos-meteorologicos',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './datos-meteorologicos.component.html',
  styleUrls: ['./datos-meteorologicos.component.css']
})
export class DatosMeteorologicosComponent implements OnInit {
  constructor(private dialog: MatDialog) { }

  ngOnInit(): void {
    if (typeof window !== 'undefined' && window.location.search.includes('debugDiseaseDialog=1')) {
      setTimeout(() => { void this.openDiseaseConditionsDialog(); }, 300);
    }
  }

  async openDatosOnline(): Promise<void> {
    const { DatosOnlineComponent } = await import('../datos-online/datos-online.component');

    this.dialog.open(DatosOnlineComponent, {
      panelClass: 'do-dialog',
      width: 'min(1400px, 96vw)',
      maxWidth: '96vw',
      height: '92vh',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: false,
    });
  }

  async openDatosxLocalidad(): Promise<void> {
    const { WeatherDashboardComponent } = await import('../weather-dashboard/weather-dashboard.component');

    this.dialog.open(WeatherDashboardComponent, {
      panelClass: 'do-dialog',          // <- clave: mismo panelClass que el otro
      width: 'min(1200px, 96vw)',
      maxWidth: '96vw',
      height: '92vh',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: false,
    });
  }

  async openRainDialog(): Promise<void> {
    const { RainCampaignDialogComponent } = await import('../rain-campaign-dialog/rain-campaign-dialog.component');

    this.dialog.open(RainCampaignDialogComponent, {
      width: 'min(1600px, 98vw)',
      maxWidth: '98vw',
      height: '95vh',
      panelClass: 'do-dialog'
    });
  }

  async openConditionsDialog(): Promise<void> {
    const { ConditionsToApplyComponent } = await import('../conditions-to-apply/conditions-to-apply.component');

    this.dialog.open(ConditionsToApplyComponent, {
      width: 'min(1600px, 98vw)',
      maxWidth: '98vw',
      height: '95vh',
      panelClass: 'do-dialog'
    });
  }

  async openComparisonByYear(): Promise<void> {
    const { ComparisonByYearComponent } = await import('../comparison-by-year/comparison-by-year.component');

    this.dialog.open(ComparisonByYearComponent, {
      width: '95vw',
      height: '95vh',
      maxWidth: '1200px',
      panelClass: 'do-dialog'
    });
  }

  async openComparisonByLocation(): Promise<void> {
    const { ComparisonByLocationComponent } = await import('../comparison-by-location/comparison-by-location.component');

    this.dialog.open(ComparisonByLocationComponent, {
      width: '95vw',
      height: '95vh',
      maxWidth: '1200px',
      panelClass: 'do-dialog'
    });
  }

  async openSoyYieldDialog(): Promise<void> {
    const { SoyYieldDialogComponent } = await import('../soy-yield-dialog/soy-yield-dialog.component');

    this.dialog.open(SoyYieldDialogComponent, {
      width: 'min(980px, 94vw)',
      maxWidth: '94vw',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openChillHoursDialog(): Promise<void> {
    const { ChillHoursDialogComponent } = await import('../chill-hours-dialog/chill-hours-dialog.component');

    this.dialog.open(ChillHoursDialogComponent, {
      width: 'min(1120px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openThermalSumDialog(): Promise<void> {
    const { ThermalSumDialogComponent } = await import('../thermal-sum-dialog/thermal-sum-dialog.component');

    this.dialog.open(ThermalSumDialogComponent, {
      width: 'min(1120px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openDiseaseConditionsDialog(): Promise<void> {
    const { DiseaseConditionsDialogComponent } = await import('../disease-conditions-dialog/disease-conditions-dialog.component');

    this.dialog.open(DiseaseConditionsDialogComponent, {
      width: 'min(1280px, 96vw)',
      maxWidth: '96vw',
      height: '94vh',
      maxHeight: '94vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openPhenologyWeatherDialog(): Promise<void> {
    const { PhenologyWeatherDialogComponent } = await import('../phenology-weather-dialog/phenology-weather-dialog.component');

    this.dialog.open(PhenologyWeatherDialogComponent, {
      width: 'min(1400px, 97vw)',
      maxWidth: '97vw',
      height: '95vh',
      maxHeight: '95vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }
}

