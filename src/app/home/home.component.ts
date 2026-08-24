import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { BienvenidaComponent } from '../bienvenida/bienvenida.component';
import { DatosMeteorologicosComponent } from '../datos-meteorologicos/datos-meteorologicos.component';
import { MapasComponent } from '../mapas/mapas.component';
import { InformesComponent } from '../informes/informes.component';
import { LeafletGoesViewerComponent } from '../leaflet-goes-viewer/leaflet-goes-viewer.component';
import { WeatherForecastComponent } from '../weather-forecast/weather-forecast.component';
import { AlertComponent } from '../alert/alert.component';
import { Router } from '@angular/router';

type SummaryItem = {
  title: string;
  eyebrow?: string;
  subtitle: string;
  icon: string;
  colorVar: string;
  actionLabel: string;
  targetId: string;
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    BienvenidaComponent,
    DatosMeteorologicosComponent,
    MapasComponent,
    InformesComponent,
    LeafletGoesViewerComponent,
    AlertComponent,
    WeatherForecastComponent
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  constructor(private router: Router) { }
  readonly summaryCards: SummaryItem[] = [
    {
      title: 'Alertas y avisos',
      eyebrow: 'ESTADO ACTUAL',
      subtitle: 'Avisos vigentes del Servicio Meteorológico Nacional y seguimiento por región',
      icon: 'warning_amber',
      colorVar: 'var(--mod-alert)',
      actionLabel: 'Ver alertas',
      targetId: 'sec-alertas'
    },
    {
      title: 'Datos actuales y pronóstico',
      eyebrow: 'CONSULTA RÁPIDA',
      subtitle: 'Tiempo real y pronóstico por estación o localidad',
      icon: 'thermostat',
      colorVar: 'var(--mod-data)',
      actionLabel: 'Abrir',
      targetId: 'sec-datos'
    },
    {
      title: 'Estadísticas meteorológicas',
      eyebrow: 'SERIES Y ANÁLISIS',
      subtitle: 'Series, promedios, extremos y consultas históricas',
      icon: 'query_stats',
      colorVar: 'var(--mod-stats)',
      actionLabel: 'Abrir',
      targetId: 'sec-estadisticas'
    },
    {
      title: 'Informes agrometeorológicos',
      subtitle: 'Boletines, reportes y publicaciones técnicas',
      icon: 'description',
      colorVar: 'var(--mod-reports)',
      actionLabel: 'Explorar',
      targetId: 'sec-informes'
    },
/*
  {
      title: 'Solicitar información',
      eyebrow: 'TRÁMITE FORMAL',
      subtitle: 'Inicie un pedido formal de datos, informes o consultas técnicas',
      icon: 'assignment',
      colorVar: 'var(--mod-request)',
      actionLabel: 'Solicitar',
      targetId: 'ruta-solicitudes'
    },
    {
      title: 'Mis solicitudes',
      eyebrow: 'SEGUIMIENTO',
      subtitle: 'Revise estados, pagos, respuestas y archivos entregados',
      icon: 'fact_check',
      colorVar: 'var(--mod-track)',
      actionLabel: 'Consultar',
      targetId: 'ruta-mis-solicitudes'
    },
*/
    {
      title: 'Mapas interactivos',
      eyebrow: 'HERRAMIENTAS',
      subtitle: 'Capas y visualización geoespacial para seguimiento',
      icon: 'map',
      colorVar: 'var(--mod-maps)',
      actionLabel: 'Ver mapas',
      targetId: 'sec-mapas'
    }
  ];

  readonly featuredSummary: SummaryItem = this.summaryCards[0];
  readonly quickSummaries: SummaryItem[] = this.summaryCards.slice(1);

  scrollTo(targetId: string) {
    if (targetId === 'ruta-solicitudes') {
      this.router.navigate(['/solicitudes']);
      return;
    }

    if (targetId === 'ruta-mis-solicitudes') {
      this.router.navigate(['/mis-solicitudes']);
      return;
    }

    const el = document.getElementById(targetId);
    if (!el) return;

    const headerOffset = 115;
    const rect = el.getBoundingClientRect();
    const absoluteY = rect.top + window.scrollY;
    window.scrollTo({ top: absoluteY - headerOffset, behavior: 'smooth' });
  }

}