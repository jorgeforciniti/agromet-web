import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';


@Component({
  selector: 'app-mapas',
  imports: [
    MatCardModule,
    MatDialogModule,
    MatIconModule
  ],
  templateUrl: './mapas.component.html',
  styleUrl: './mapas.component.css',
})

export class MapasComponent {
  constructor(private dialog: MatDialog) { }
  async openMapRainMonthly(): Promise<void> {
    const { MapRainMonthlyComponent } = await import('../map-rain-monthly/map-rain-monthly.component');

    this.dialog.open(MapRainMonthlyComponent, {
      height: '95vh',
      maxWidth: '1200px',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openMapTemperature(): Promise<void> {
    const { MapTemperatureComponent } = await import('../map-temperature/map-temperature.component');

    this.dialog.open(MapTemperatureComponent, {
      height: '95vh',
      maxWidth: '1200px',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openMapFrost(): Promise<void> {
    const { MapFrostComponent } = await import('../map-frost/map-frost.component');

    this.dialog.open(MapFrostComponent, {
      width: '95vw',
      maxWidth: '1200px',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false,
      data: { hoy: false } // o lo que corresponda en tu caso
    });
  }
  async openMapRains(): Promise<void> {
    const { MapRainComponent } = await import('../map-rain/map-rain.component');

    this.dialog.open(MapRainComponent, {
      width: '95vw',
      maxWidth: '1200px',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false,
      data: { hoy: false } // o true
    });
  }

}
