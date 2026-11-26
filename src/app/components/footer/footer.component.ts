import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, MatIconModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css'
})
export class FooterComponent {
  readonly anio = new Date().getFullYear();

  /** Accesos a las secciones públicas (las mismas del menú, sin Administración). */
  readonly secciones = [
    { label: 'Inicio', path: '/' },
    { label: 'Estado actual', path: '/estado-actual' },
    { label: 'Mapas', path: '/mapas' },
    { label: 'Datos y estadísticas', path: '/datos' },
    { label: 'Estadísticas históricas', path: '/estadisticas-historicas' },
    { label: 'Informes', path: '/informes' },
    { label: 'Red de estaciones', path: '/estaciones' }
  ];
}
