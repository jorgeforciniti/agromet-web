import { Component, OnInit } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
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
import { ComoSeLeeComponent } from '../shared/como-se-lee.component';

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

/** Fila de la grilla de una alerta: una región con su estado en cada día y período */
interface FilaAlerta {
  area: number;
  nombre: string;
  corto: string;
  celdas: boolean[];
}

/** Una tarjeta por evento y nivel: qué (descripción), cuándo y dónde (grilla) */
interface EventoAlerta {
  eventId: number;
  level: number;
  nombre: string;
  description: string;
  instruction: string;
  dias: string[];
  filas: FilaAlerta[];
  resumen: string;
  regiones: string;
}

const PERIODOS = ['early_morning', 'morning', 'afternoon', 'night'];

const AREAS: Record<number, string> = {
  3373: 'Provincia de Tucumán',
  3375: 'Valles Calchaquíes'
};

/** Nombres para la grilla en pantallas angostas */
const AREAS_CORTO: Record<number, string> = {
  3373: 'Tucumán',
  3375: 'Valles'
};

/*
 * El SMN identifica el fenómeno sólo con un código (event_id) y no publica la tabla de
 * nombres en su API abierta. 41 = tormentas está confirmado; para el resto se deduce de la
 * descripción. Si no se reconoce, la tarjeta muestra sólo el color de la alerta.
 */
const EVENTO_POR_CODIGO: Record<number, string> = { 41: 'Tormentas' };
const EVENTO_POR_TEXTO: [string, string][] = [
  ['tormenta', 'Tormentas'],
  ['zonda', 'Viento Zonda'],
  ['nevad', 'Nevadas'],
  ['viento', 'Viento'],
  ['lluvia', 'Lluvias'],
  ['niebla', 'Niebla'],
  ['polvo', 'Polvo en suspensión'],
  ['humo', 'Humo']
];

@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, ComoSeLeeComponent],
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

  /** Tarjetas de alertas SMN agrupadas por evento y nivel */
  eventos: EventoAlerta[] = [];
  /** Hora de la última actualización del SMN (la más reciente de las dos áreas) */
  actualizado: Date | null = null;
  /** true cuando llegó la respuesta del SMN (evita mostrar "sin alertas" mientras carga) */
  cargado = false;
  readonly periodos = PERIODOS;

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

      this.cargado = true;
      this.eventos = this.armarEventos([...tucuman.alerts, ...valles.alerts],
        [...tucuman.uniqueAlerts, ...valles.uniqueAlerts]);
      const fechas = [tucuman.updated, valles.updated]
        .map(u => u ? new Date(u) : null)
        .filter((d): d is Date => !!d && !isNaN(d.getTime()));
      this.actualizado = fechas.length ? new Date(Math.max(...fechas.map(d => d.getTime()))) : null;

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
      width: 'min(1300px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
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
      width: 'min(1300px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
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

  loadSmnAlerts(area: number): Observable<{ alerts: SmnAlert[], uniqueAlerts: UniqueAlert[], updated?: string }> {
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
          uniqueAlerts: Array.from(uniqueMap.values()),
          updated: alerta.updated
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

  /** Agrupa los períodos con alerta por evento y nivel, con una fila por región. */
  private armarEventos(alertas: SmnAlert[], descripciones: UniqueAlert[]): EventoAlerta[] {
    const grupos = new Map<string, SmnAlert[]>();
    for (const a of alertas) {
      const key = `${a.eventId}-${a.level}`;
      grupos.set(key, [...(grupos.get(key) ?? []), a]);
    }

    return Array.from(grupos.values())
      .map(grupo => {
        const { eventId, level } = grupo[0];
        const desc = descripciones.find(d => d.eventId === eventId && d.level === level);
        const dias = this.rangoDias(grupo.map(a => a.date));
        const indice = (a: SmnAlert) => dias.indexOf(a.date) * PERIODOS.length + PERIODOS.indexOf(a.period);

        const filas = [3373, 3375].map(area => {
          const celdas: boolean[] = new Array(dias.length * PERIODOS.length).fill(false);
          grupo.filter(a => a.area === area).forEach(a => celdas[indice(a)] = true);
          return { area, nombre: AREAS[area], corto: AREAS_CORTO[area], celdas };
        });

        const posiciones = grupo.map(indice).filter(i => i >= 0);

        return {
          eventId,
          level,
          nombre: this.nombreEvento(eventId, desc?.description ?? ''),
          description: desc?.description ?? '',
          instruction: desc?.instruction ?? '',
          dias,
          filas,
          resumen: this.resumenVigencia(dias, Math.min(...posiciones), Math.max(...posiciones)),
          regiones: filas.filter(f => f.celdas.some(Boolean)).map(f => f.nombre).join(' y ')
        };
      })
      .sort((a, b) => b.level - a.level || a.nombre.localeCompare(b.nombre));
  }

  private nombreEvento(eventId: number, description: string): string {
    if (EVENTO_POR_CODIGO[eventId]) return EVENTO_POR_CODIGO[eventId];
    const texto = description.toLowerCase();
    return EVENTO_POR_TEXTO.find(([clave]) => texto.includes(clave))?.[1] ?? '';
  }

  /** Días consecutivos entre la primera y la última fecha con alerta (YYYY-MM-DD). */
  private rangoDias(fechas: string[]): string[] {
    const ordenadas = [...new Set(fechas)].sort();
    const dias: string[] = [];
    const d = this.fechaLocal(ordenadas[0]);
    const fin = this.fechaLocal(ordenadas[ordenadas.length - 1]);
    while (d <= fin) {
      dias.push(formatDate(d, 'yyyy-MM-dd', 'es-AR'));
      d.setDate(d.getDate() + 1);
    }
    return dias;
  }

  private fechaLocal(iso: string): Date {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /** Días desde hoy (0 = hoy, 1 = mañana). */
  private diasDesdeHoy(iso: string): number {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Math.round((this.fechaLocal(iso).getTime() - hoy.getTime()) / 86400000);
  }

  /** Encabezado de la grilla: "Hoy, mié 28", "Mañana, jue 29" o "Vie 30". */
  etiquetaDia(iso: string): string {
    const corto = formatDate(this.fechaLocal(iso), 'EEE d', 'es-AR').replace('.', '');
    const diff = this.diasDesdeHoy(iso);
    if (diff === 0) return `Hoy, ${corto}`;
    if (diff === 1) return `Mañana, ${corto}`;
    return corto.charAt(0).toUpperCase() + corto.slice(1);
  }

  periodoCorto(period: string): string {
    const cortos: Record<string, string> = { early_morning: 'Madr.', morning: 'Mañ.', afternoon: 'Tarde', night: 'Noche' };
    return cortos[period] ?? period;
  }

  /** "Hoy a la noche" o "Desde hoy a la tarde hasta mañana de madrugada". */
  private resumenVigencia(dias: string[], desde: number, hasta: number): string {
    const cuando: Record<string, string> = {
      early_morning: 'de madrugada', morning: 'a la mañana', afternoon: 'a la tarde', night: 'a la noche'
    };
    const momento = (i: number) => {
      const iso = dias[Math.floor(i / PERIODOS.length)];
      const diff = this.diasDesdeHoy(iso);
      const dia = diff === 0 ? 'hoy' : diff === 1 ? 'mañana' : 'el ' + formatDate(this.fechaLocal(iso), 'EEEE d', 'es-AR');
      return `${dia} ${cuando[PERIODOS[i % PERIODOS.length]]}`;
    };
    const frase = desde === hasta ? momento(desde) : `desde ${momento(desde)} hasta ${momento(hasta)}`;
    return frase.charAt(0).toUpperCase() + frase.slice(1);
  }

  /** Texto para lectores de pantalla de cada casilla de la grilla. */
  etiquetaCelda(ev: EventoAlerta, fila: FilaAlerta, i: number): string {
    const dia = this.etiquetaDia(ev.dias[Math.floor(i / PERIODOS.length)]);
    const periodo = this.periodoEnCastellano(PERIODOS[i % PERIODOS.length]);
    const estado = fila.celdas[i] ? `alerta ${this.levelName(ev.level)}` : 'sin alerta';
    return `${fila.nombre}, ${dia}, ${periodo}: ${estado}`;
  }
}
