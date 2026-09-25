import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { BienvenidaComponent } from '../bienvenida/bienvenida.component';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';

type SummaryItem = {
  title: string;
  eyebrow?: string;
  subtitle: string;
  icon: string;
  colorVar: string;
  actionLabel: string;
  route: string;
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    BienvenidaComponent,
    ScrollRevealDirective
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  constructor(private router: Router) { }

  readonly summaryCards: SummaryItem[] = [
    {
      title: 'Estado actual',
      eyebrow: 'AHORA',
      subtitle: 'Alertas vigentes del SMN, datos en tiempo real, mapa operativo y pronóstico en un solo lugar.',
      icon: 'warning_amber',
      colorVar: 'var(--mod-alert)',
      actionLabel: 'Ver estado actual',
      route: '/estado-actual'
    },
    {
      title: 'Mapas interactivos',
      eyebrow: 'HERRAMIENTAS',
      subtitle: 'Capas y visualización geoespacial de lluvias, temperaturas y heladas.',
      icon: 'map',
      colorVar: 'var(--mod-maps)',
      actionLabel: 'Ver mapas',
      route: '/mapas'
    },
    {
      title: 'Datos y estadísticas',
      eyebrow: 'SERIES Y ANÁLISIS',
      subtitle: 'Series históricas, comparaciones entre años o localidades y herramientas de cálculo agronómico.',
      icon: 'query_stats',
      colorVar: 'var(--mod-stats)',
      actionLabel: 'Explorar',
      route: '/datos'
    },
    {
      title: 'Informes agrometeorológicos',
      subtitle: 'Boletines, reportes y publicaciones técnicas.',
      icon: 'description',
      colorVar: 'var(--mod-reports)',
      actionLabel: 'Explorar',
      route: '/informes'
    },
    {
      title: 'Red de estaciones',
      eyebrow: 'COBERTURA',
      subtitle: 'Ubicación y estado de todas las estaciones automáticas de la red.',
      icon: 'sensors',
      colorVar: 'var(--info)',
      actionLabel: 'Ver red',
      route: '/estaciones'
    }
  ];

  readonly featuredSummary: SummaryItem = this.summaryCards[0];
  readonly quickSummaries: SummaryItem[] = this.summaryCards.slice(1);

  goTo(route: string): void {
    this.router.navigate([route]);
  }
}
