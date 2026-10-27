import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';


@Component({
  selector: 'app-mapas',
  imports: [
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    ScrollRevealDirective
  ],
  templateUrl: './mapas.component.html',
  styleUrl: './mapas.component.css',
})

export class MapasComponent {
  constructor(private dialog: MatDialog) { }
  async openMapRainMonthly(): Promise<void> {
    const { MapRainMonthlyComponent } = await import('../map-rain-monthly/map-rain-monthly.component');

    this.dialog.open(MapRainMonthlyComponent, {
      width: 'min(1300px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openMapTemperature(): Promise<void> {
    const { MapTemperatureComponent } = await import('../map-temperature/map-temperature.component');

    this.dialog.open(MapTemperatureComponent, {
      width: 'min(1300px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openMapFrost(): Promise<void> {
    const { MapFrostComponent } = await import('../map-frost/map-frost.component');

    this.dialog.open(MapFrostComponent, {
      width: 'min(1300px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false,
      data: { hoy: false } // o lo que corresponda en tu caso
    });
  }
  async openMapRains(): Promise<void> {
    const { MapRainComponent } = await import('../map-rain/map-rain.component');

    this.dialog.open(MapRainComponent, {
      width: 'min(1300px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false,
      data: { hoy: false } // o true
    });
  }

}
