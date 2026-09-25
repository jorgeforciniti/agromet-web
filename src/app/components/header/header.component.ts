import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { NavbarComponent } from '../navbar/navbar.component';
import { SmnWarningByAreaResponse, WeatherService } from '../../services/weather.service';

interface NavItem {
  label: string;
  path: string;
  exact?: boolean;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, NavbarComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit {
  menuOpen = false;
  alertText: string | null = null;

  readonly navItems: NavItem[] = [
    { label: 'Inicio', path: '/', exact: true },
    { label: 'Estado actual', path: '/estado-actual' },
    { label: 'Mapas', path: '/mapas' },
    { label: 'Datos y estadísticas', path: '/datos' },
    { label: 'Informes', path: '/informes' },
    { label: 'Red de estaciones', path: '/estaciones' }
  ];

  constructor(private weatherService: WeatherService) { }

  ngOnInit(): void {
    this.weatherService.getSmnWarningByArea().subscribe({
      next: (data: SmnWarningByAreaResponse) => {
        this.alertText = this.composeAlertText(data);
      },
      error: () => {
        // No es crítico para el header: si falla, simplemente no se muestra el badge.
      }
    });
  }

  private composeAlertText(data: SmnWarningByAreaResponse): string | null {
    const heat = data.heat?.['3373'];
    const cold = data.cold?.['3373'];

    if (heat && heat.level >= 2) {
      return 'Alerta por temperaturas extremas de calor en la provincia de Tucumán.';
    }
    if (cold && cold.level >= 2) {
      return 'Alerta por temperaturas extremas de frío en la provincia de Tucumán.';
    }
    return null;
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }
}
