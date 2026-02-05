import { Component } from '@angular/core';
import { BienvenidaComponent } from "../bienvenida/bienvenida.component";
import { DatosMeteorologicosComponent } from '../datos-meteorologicos/datos-meteorologicos.component';
import { MapasComponent } from '../mapas/mapas.component';
import { InformesComponent } from "../informes/informes.component";
import { LeafletGoesViewerComponent } from '../leaflet-goes-viewer/leaflet-goes-viewer.component'; // ruta según tu estructura
import { AlertComponent } from '../alert/alert.component';

@Component({
  selector: 'app-home',
  imports: [
    BienvenidaComponent,
    DatosMeteorologicosComponent,
    MapasComponent,
    InformesComponent,
    LeafletGoesViewerComponent,
    AlertComponent
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})

export class HomeComponent {

}
