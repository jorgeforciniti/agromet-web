import { Component } from '@angular/core';
import { BienvenidaComponent } from "../bienvenida/bienvenida.component";
import { DatosMeteorologicosComponent } from '../datos-meteorologicos/datos-meteorologicos.component';
import { MapasComponent } from '../mapas/mapas.component';
import { InformesComponent } from "../informes/informes.component";
import { AuthComponent } from '../auth/auth.component'

@Component({
  selector: 'app-home',
  imports: [
    BienvenidaComponent,
    DatosMeteorologicosComponent,
    MapasComponent,
    InformesComponent,
    AuthComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})

export class HomeComponent {

}
