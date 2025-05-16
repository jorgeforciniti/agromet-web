import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DatosOnlineComponent } from '../datos-online/datos-online.component';
import { WeatherDashboardComponent } from '../weather-dashboard/weather-dashboard.component';
import { RainCampaignDialogComponent, RainCampaignData } from '../rain-campaign-dialog/rain-campaign-dialog.component';
import { ConditionsToApplyComponent } from '../conditions-to-apply/conditions-to-apply.component';
import { ComparisonByYearComponent } from '../comparison-by-year/comparison-by-year.component';
import { ComparisonByLocationComponent } from '../comparison-by-location/comparison-by-location.component';

@Component({
  selector: 'app-datos-meteorologicos',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatDialogModule],
  templateUrl: './datos-meteorologicos.component.html',
  styleUrls: ['./datos-meteorologicos.component.css']
})
export class DatosMeteorologicosComponent {
  constructor(private dialog: MatDialog) {}

  openDatosOnline(): void {
    this.dialog.open(DatosOnlineComponent, {
      width: '90%',
      maxWidth: '95vw',
      panelClass: 'custom-dialog-container'
    });
  }

  openDatosxLocalidad(): void {
    this.dialog.open(WeatherDashboardComponent, {
      width: '90%',
      maxWidth: '95vw',
      panelClass: 'custom-dialog-container'
    });
  }

  openRainDialog() {
    this.dialog.open(RainCampaignDialogComponent, {
      width: '90vw',
      height: '90vw',
      maxWidth: '1200px',
      panelClass: 'custom-dialog-container'
    });
  }

  openConditionsDialog() {
    this.dialog.open(ConditionsToApplyComponent, {
      width: '90vw',
      height: '90vw',
      maxWidth: '1200px',
      panelClass: 'custom-dialog-container'
    });
  }

  openComparisonByYear() {
    this.dialog.open(ComparisonByYearComponent, {
      width: '90vw',
      height: '90vw',
      maxWidth: '1200px',
      panelClass: 'custom-dialog-container'
    });
  }

  openComparisonByLocation() {
    this.dialog.open(ComparisonByLocationComponent, {
      width: '90vw',
      height: '90vw',
      maxWidth: '1200px',
      panelClass: 'custom-dialog-container'
    });
  }

  

}