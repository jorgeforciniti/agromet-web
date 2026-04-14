import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  SmnAlertByAreaResponse,
  SmnAreaReport,
  SmnWarningByAreaResponse,
  WeatherAlertStation,
  WeatherService
} from '../services/weather.service';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, map, Observable } from 'rxjs';

/**
 * Tipo interno para la franja de temperaturas extremas
 */
interface TempWarning {
  level: number;           // 2, 3, 4
  type: 'cold' | 'heat';   // frío o calor
  area: 3373 | 3375;       // provincia o valles
}

interface SmnAlert {
  level: number;              // 3,4,5  (SMN escala)
  eventId: number;              // 3,4,5  (SMN escala)
  date: string;               // ISO date string
  period: string;             // "mañana", "tarde", etc.
  description: string;
  instruction: string;
  area: number;               // ðŸ‘ˆ AGREGA ESTA LÍNEA
}

interface UniqueAlert {
  eventId: number;
  level: number;
  description: string;
  instruction: string;
}

@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './alert.component.html',
  styleUrls: ['./alert.component.css']
})
export class AlertComponent implements OnInit {
  showRainAlert = false;
  showFrostAlert = false;
  frostAlertLevel: number = 0; // 0 = none, 1 = leve, 2 = moderada, 3 = severa
  smnAlertsByArea: { [area: number]: SmnAlert[] } = {};
  smnShortAlerts: SmnAlert[] = [];

  // NUEVO â€“ banner de temperaturas extremas
  tempExtremes: TempWarning[] = [];
  bannerText = '';

  selectedAlert: SmnAlert | null = null;

  smnDescriptions: { [area: number]: UniqueAlert[] } = {};

  selectAlert(alert: SmnAlert): void {
    this.selectedAlert = alert;
  }

  constructor(
    private weatherService: WeatherService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    forkJoin([
      this.loadSmnAlerts(3373),
      this.loadSmnAlerts(3375)
    ]).subscribe(([tucuman, valles]) => {
      this.smnAlertsByArea[3373] = tucuman.alerts;
      this.smnAlertsByArea[3375] = valles.alerts;

      this.smnDescriptions[3373] = tucuman.uniqueAlerts;
      this.smnDescriptions[3375] = valles.uniqueAlerts;

      const allAlerts = [...tucuman.alerts, ...valles.alerts].map(alert => {
        const desc = [...tucuman.uniqueAlerts, ...valles.uniqueAlerts]
          .find(d => d.eventId === alert.eventId && d.level === alert.level);

        return {
          ...alert,
          description: desc?.description ?? '',
          instruction: desc?.instruction ?? '',
        };
      });

      /*      if (allAlerts.length > 0) {
              this.dialog.open(AlertDialogComponent, {
                panelClass: 'do-dialog',
                autoFocus: false,
                restoreFocus: false,
                data: { alerts: allAlerts }
              });
            }
      */
      this.loadAlerts();
      this.loadTempExtremes();
    });
  }

  private loadTempExtremes(): void {
    this.weatherService.getSmnWarningByArea().subscribe((data: SmnWarningByAreaResponse) => {
      const areas = [
        { cold: data.cold?.['3373'], heat: data.heat?.['3373'], id: 3373 },
        { cold: data.cold?.['3375'], heat: data.heat?.['3375'], id: 3375 }
      ];

      this.tempExtremes = areas
        .map(ar => {
          const warn = (ar.cold && ar.cold.level >= 2)
            ? { level: ar.cold.level, type: 'cold', area: ar.id } as TempWarning
            : (ar.heat && ar.heat.level >= 2)
              ? { level: ar.heat.level, type: 'heat', area: ar.id } as TempWarning
              : null;
          return warn;
        })
        .filter(Boolean) as TempWarning[];
    });
  }

  /**
   * Decide la clase CSS según nivel de helada.
   */
  public getFrostClass(level: number): string {
    switch (level) {
      case 1: return 'frost-level-1';
      case 2: return 'frost-level-2';
      case 3: return 'frost-level-3';
      default: return '';
    }
  }

  /**
   * Consulta la API y determina si hay alertas de lluvia o helada.
   */
  private loadAlerts(): void {
    this.weatherService.getAlerts().subscribe((response) => {
      const stations = response.data.filter((s) => s.habilitada > 0);
      this.checkRainAlert(stations);
      this.frostAlertLevel = this.checkFrostAlertLevel(stations);
      this.showFrostAlert = this.frostAlertLevel > 0;
    });
  }

  /**
   * Activa alerta de lluvia si al menos una estación cumple criterios.
   */
  private checkRainAlert(stations: WeatherAlertStation[]): void {
    this.showRainAlert = stations.some(s => {
      const recs = parseInt(s.registrosLluvia, 10);
      const total = parseFloat(s.totalLluvia);
      return recs > 1 || (recs > 1 && total > 0.6);
    });
  }

  /**
   * Devuelve nivel de helada: 0 = no, 1 = leve, 2 = moderada, 3 = severa.
   */
  public checkFrostAlertLevel(stations: WeatherAlertStation[]): number {
    const temps = stations
      .map(s => parseFloat(s.minimaTemperatura))
      .filter(t => !isNaN(t));

    if (!temps.length) return 0;

    const minTemp = Math.min(...temps);

    if (minTemp > 0) return 0;
    if (minTemp > -2) return 1;
    if (minTemp > -4) return 2;
    if (minTemp > -6) return 3;
    return 3;
  }

  /**
   * Abre diálogo de heladas.
   */
  public async openFrostDialog(): Promise<void> {
    const { MapFrostComponent } = await import('../map-frost/map-frost.component');

    this.dialog.open(MapFrostComponent, {
      width: '90vw',
      maxWidth: '1200px',
      panelClass: 'do-dialog',
      data: { hoy: true }
    });
  }

  /**
   * Abre diálogo de lluvias.
   */
  public async openRainDialog(): Promise<void> {
    const { MapRainComponent } = await import('../map-rain/map-rain.component');

    this.dialog.open(MapRainComponent, {
      width: '90vw',
      maxWidth: '1200px',
      panelClass: 'do-dialog',
      data: { hoy: true }
    });
  }


  /**
     * Consulta la API getSmnWarningByArea() y decide si mostrar la franja
     */
  /** Devuelve clase CSS para color de fondo */
  /** Clase CSS para color de fondo */
  getTempClass(level: number): string {
    return { 2: 'level-2', 3: 'level-3', 4: 'level-4' }[level] || '';
  }

  /** Nombre de color en texto */
  private colorName(level: number): 'amarilla' | 'naranja' | 'roja' {
    return level === 2 ? 'amarilla' : level === 3 ? 'naranja' : 'roja';
  }

  /** Construye el texto a mostrar */
  composeBannerText(w: TempWarning): string {
    const region = w.area === 3373 ? 'Provincia de Tucumán' : 'los Valles Calchaquíes';
    const temp = w.type === 'cold' ? 'frío' : 'calor';
    const color = this.colorName(w.level);
    return `Alerta ${color} por posibles temperaturas extremas: ${temp} en ${region}`;
  }

  //  â”€â”€â”€ Placeâ€‘holders de métodos previos (lluvia / helada) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  periodoEnCastellano(period: string): string {
    switch (period) {
      case 'early_morning': return 'Madrugada';
      case 'morning': return 'Mañana';
      case 'afternoon': return 'Tarde';
      case 'night': return 'Noche';
      default: return period;
    }
  }

  loadSmnAlerts(area: number): Observable<{ alerts: SmnAlert[], uniqueAlerts: UniqueAlert[] }> {
    return this.weatherService.getSmnAlertByArea(area).pipe(
      map((alerta: SmnAlertByAreaResponse) => {
        const reportsMap = new Map<number, SmnAreaReport['levels']>();
        alerta.reports.forEach((report) => reportsMap.set(report.event_id, report.levels));

        const smnAlerts: SmnAlert[] = [];
        const uniqueMap = new Map<string, UniqueAlert>();

        for (const warning of alerta.warnings) {
          const fecha = warning.date;
          for (const event of warning.events) {
            const reportInfos = reportsMap.get(event.id) ?? [];

            for (const [period, lvlRaw] of Object.entries(event.levels)) {
              const lvl = Number(lvlRaw);
              if (lvl >= 3) {
                // ðŸ‘‰ smnAlert: para listado por día/período
                smnAlerts.push({
                  date: fecha,
                  period,
                  level: lvl,
                  area,
                  eventId: event.id,         // ðŸ‘ˆ IMPORTANTE
                  description: '',
                  instruction: ''
                });

                // ðŸ‘‰ uniqueAlert: para texto descriptivo único
                const key = `${event.id}-${lvl}`;
                if (!uniqueMap.has(key)) {
                  const reportMatch = reportInfos.find(r => Number(r.level) === lvl);
                  if (reportMatch) {
                    uniqueMap.set(key, {
                      eventId: event.id,
                      level: lvl,
                      description: reportMatch.description ?? '',
                      instruction: reportMatch.instruction ?? ''
                    });
                  }
                }
              }
            }
          }
        }

        return {
          alerts: smnAlerts,
          uniqueAlerts: Array.from(uniqueMap.values())
        };
      })
    );
  }

  public levelName(level: number): string {
    switch (level) {
      case 3: return 'amarilla';
      case 4: return 'naranja';
      case 5: return 'roja';
      default: return 'sin nivel';
    }
  }

  async openInstructionDialog(instruction?: string, level?: number): Promise<void> {
    if (!instruction || !instruction.trim()) {
      return;
    }

    const lvl = level ?? 3;
    const { AlertInstructionDialogComponent } = await import('../alert-instruction-dialog/alert-instruction-dialog.component');

    this.dialog.open(AlertInstructionDialogComponent, {
      panelClass: ['instr-dialog', `instr-level-${lvl}`],
      autoFocus: false,
      restoreFocus: false,
      data: { instruction, level: lvl },
      width: 'min(720px, 94vw)',
      maxWidth: '94vw'
    });
  }

  getAllUniqueDescriptions(): UniqueAlert[] {
    const map = new Map<string, UniqueAlert>();
    for (const area of [3373, 3375]) {
      for (const a of this.smnDescriptions[area] ?? []) {
        const key = `${a.eventId}-${a.level}`;
        if (!map.has(key)) {
          map.set(key, a);
        }
      }
    }
    return Array.from(map.values());
  }

  getUniqueGlobalDescriptions(): UniqueAlert[] {
    const seen = new Map<string, UniqueAlert>();

    [3373, 3375].forEach(area => {
      (this.smnDescriptions[area] ?? []).forEach(alert => {
        const key = `${alert.eventId}-${alert.level}`;
        if (!seen.has(key)) {
          seen.set(key, alert);
        }
      });
    });

    return Array.from(seen.values());
  }

}
