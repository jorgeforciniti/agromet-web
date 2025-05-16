import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import {MapRainMonthlyComponent} from '../map-rain-monthly/map-rain-monthly.component'
import {MapTemperatureComponent} from '../map-temperature/map-temperature.component'

@Component({
  selector: 'app-mapas',
  imports: [
    MatCardModule,
    MatDialogModule,
  ],
  templateUrl: './mapas.component.html',
  styleUrl: './mapas.component.css'
})

export class MapasComponent {
  constructor(private dialog: MatDialog) {}
    openMapRainMonthly() {
      this.dialog.open(MapRainMonthlyComponent, {
        width: '90vw',
        maxWidth: '1200px',
        panelClass: 'custom-dialog-container'
      });
    } 
    openMapTemperature() {
      this.dialog.open(MapTemperatureComponent, {
        width: '90vw',
        maxWidth: '1200px',
        panelClass: 'custom-dialog-container'
      });
    } 
}
  