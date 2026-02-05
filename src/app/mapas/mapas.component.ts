import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MapRainMonthlyComponent } from '../map-rain-monthly/map-rain-monthly.component'
import { MapTemperatureComponent } from '../map-temperature/map-temperature.component'
import { MapFrostComponent } from '../map-frost/map-frost.component'
import { MapRainComponent } from '../map-rain/map-rain.component';

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
  constructor(private dialog: MatDialog) { }
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

  openMapFrost() {
    this.dialog.open(MapFrostComponent, {
      width: '90vw',
      maxWidth: '1200px',
      panelClass: 'custom-dialog-container'
    });
  }
  openMapRains() {
    this.dialog.open(MapRainComponent, {
      width: '90vw',
      maxWidth: '1200px',
      panelClass: 'custom-dialog-container',
      data: { hoy: false }
    });
  }

}
