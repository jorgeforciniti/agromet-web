import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { BienvenidaComponent } from '../bienvenida/bienvenida.component';
import { MisEstacionesComponent } from '../mis-estaciones/mis-estaciones.component';

type Acceso = {
  titulo: string;
  descripcion: string;
  icono: string;
  color: string;
  ruta: string;
};

type GrupoAccesos = {
  titulo: string;
  accesos: Acceso[];
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    RouterLink,
    BienvenidaComponent,
    MisEstacionesComponent
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  /** Accesos a las secciones, agrupados según para qué se usan. */
  readonly grupos: GrupoAccesos[] = [
    {
      titulo: 'Para hoy',
      accesos: [
        {
          titulo: 'Estado actual',
          descripcion: 'Avisos vigentes del SMN, datos de cada estación en tiempo real y pronóstico.',
          icono: 'warning_amber',
          color: 'var(--mod-alert)',
          ruta: '/estado-actual'
        },
        {
          titulo: 'Mapas',
          descripcion: 'Lluvias, temperaturas y heladas sobre el mapa de la provincia.',
          icono: 'map',
          color: 'var(--mod-maps)',
          ruta: '/mapas'
        }
      ]
    },
    {
      titulo: 'Para analizar',
      accesos: [
        {
          titulo: 'Datos y estadísticas',
          descripcion: 'Series históricas, comparaciones entre años o localidades y cálculos agronómicos.',
          icono: 'query_stats',
          color: 'var(--mod-stats)',
          ruta: '/datos'
        },
        {
          titulo: 'Estadísticas históricas',
          descripcion: 'Evolución, extremos y episodios climáticos de la estación El Colmenar.',
          icono: 'history',
          color: 'var(--mod-sat)',
          ruta: '/estadisticas-historicas'
        },
        {
          titulo: 'Informes',
          descripcion: 'Boletines, reportes y publicaciones técnicas de la Sección.',
          icono: 'description',
          color: 'var(--mod-reports)',
          ruta: '/informes'
        },
        {
          titulo: 'Red de estaciones',
          descripcion: 'Dónde está cada estación automática y qué mide.',
          icono: 'sensors',
          color: 'var(--info)',
          ruta: '/estaciones'
        }
      ]
    }
  ];
}
