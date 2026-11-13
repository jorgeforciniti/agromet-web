import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { GRID_COLOR, VAR_COLOR, conAlfa } from '../../charts/chart-theme';
import { EncabezadoDialogoComponent } from '../../shared/encabezado-dialogo.component';
import { ExportarGraficoComponent } from '../../shared/exportar-grafico.component';
import { formatDecimal } from '../../pipes/valor.pipe';

/** Datos que recibe el diálogo desde la tabla de Lluvias 9 a 9 */
export interface DatosDistribucion {
  id: string;
  nombre: string;
  /** Día anterior: el período empieza ese día a las 9 h (AAAA-MM-DD) */
  desde: string;
  /** El período termina ese día a las 9 h (AAAA-MM-DD) */
  hasta: string;
}

/** Vecinas para comparar: las mismas que usa la depuración (a menos de 40 km y 400 m de desnivel) */
const VECINAS_KM = 40;
const VECINAS_DESNIVEL = 400;
const MAX_VECINAS = 3;
/** Un vuelco del pluviómetro Davis: 0,254 mm (0,01 pulgadas) */
const VUELCO = 0.26;

const SERVICIOS = 'https://agromet.eeaoc.gob.ar/services/';
const COLOR_VECINAS = ['#495057', '#868e96', '#adb5bd'];

interface EstacionCruda {
  Identificacion: string;
  nombre: string;
  lat: string;
  lon: string;
  alt?: string | number;
  habilitada?: string | number;
}

interface Serie {
  id: string;
  nombre: string;
  km: number;
  /** 'AAAA-MM-DD HH:MM' → mm del registro (null: registro sin dato de lluvia) */
  registros: Map<string, number | null>;
  total: number;
  /** Último registro con lluvia, o null */
  ultimaLluvia: string | null;
}

type Senal = 'normal' | 'semitapado' | 'tapado' | 'aislada' | 'sin-lluvia' | 'sin-vecinas' | 'sin-datos';

const TEXTO_SENAL: Record<Senal, { titulo: string; detalle: string }> = {
  normal: { titulo: 'Buenas condiciones', detalle: 'La lluvia cae en los mismos momentos que en las vecinas y el total es comparable.' },
  semitapado: {
    titulo: 'Posible pluviómetro semitapado',
    detalle: 'Registra menos que las vecinas o sigue sumando de a poco cuando en las vecinas ya paró: el agua escurre lento por un embudo obstruido.'
  },
  tapado: { titulo: 'Posible pluviómetro tapado', detalle: 'Casi no registra lluvia mientras las vecinas registran 5 mm o más.' },
  aislada: {
    titulo: 'Lluvia aislada',
    detalle: 'Registra lluvia y las vecinas no: puede ser una tormenta local o un registro falso. Conviene confirmarla con alguien del lugar.'
  },
  'sin-lluvia': { titulo: 'Sin lluvia', detalle: 'Ni la estación ni sus vecinas registraron lluvia en el período: no hay con qué evaluar el pluviómetro.' },
  'sin-vecinas': { titulo: 'Sin vecinas para comparar', detalle: 'No hay estaciones con datos a menos de 40 km y 400 m de desnivel.' },
  'sin-datos': { titulo: 'Sin registros', detalle: 'La estación no tiene registros en el período.' }
};

/**
 * Distribución de la lluvia de 9 a 9 h de una estación, registro por registro, con el acumulado de
 * sus vecinas al lado, para evaluar el pluviómetro (en buenas condiciones, semitapado o tapado). Lee
 * los registros crudos de datos-24hs.php, sin la depuración del sitio: acá se evalúa justamente el
 * sensor. La señal es orientativa; la decisión (dar de baja la lluvia) es de la Sección.
 */
@Component({
  selector: 'app-lluvia-distribucion-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, MatProgressBarModule, BaseChartDirective,
    EncabezadoDialogoComponent, ExportarGraficoComponent],
  templateUrl: './lluvia-distribucion-dialog.component.html',
  styleUrls: ['./lluvia-distribucion-dialog.component.css']
})
export class LluviaDistribucionDialogComponent implements OnInit {
  private readonly http = inject(HttpClient);

  cargando = true;
  error = '';
  estacion: Serie | null = null;
  vecinas: Serie[] = [];
  senal: Senal = 'sin-datos';
  /** mm que la estación registró más de 1 h después de la última lluvia de las vecinas */
  cola = 0;
  colaHoras = 0;
  medianaVecinas: number | null = null;
  maxRegistro = 0;
  primeraLluvia: string | null = null;
  ultimaLluvia: string | null = null;
  vuelcosSueltos = 0;
  registrosConLluvia = 0;

  grafico: ChartData<'bar' | 'line', (number | null)[], string> = { labels: [], datasets: [] };
  readonly opciones: ChartConfiguration<'bar' | 'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12 } },
      tooltip: {
        callbacks: {
          label: c => {
            const v = c.parsed.y;
            return `${c.dataset.label}: ${v === null || v === undefined ? '—' : formatDecimal(v, 2)} mm`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } },
      y: { beginAtZero: true, title: { display: true, text: 'mm por registro' }, grid: { color: GRID_COLOR } },
      y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'mm acumulados' }, grid: { display: false } }
    }
  };

  readonly textoSenal = TEXTO_SENAL;

  constructor(
    private dialogRef: MatDialogRef<LluviaDistribucionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) readonly datos: DatosDistribucion
  ) { }

  async ngOnInit(): Promise<void> {
    try {
      const estaciones = await firstValueFrom(this.http.get<EstacionCruda[]>(SERVICIOS + 'estaciones.php'));
      const propia = estaciones.find(e => String(e.Identificacion) === this.datos.id);
      this.estacion = await this.serie(this.datos.id, this.datos.nombre, 0);
      if (propia) {
        const candidatas = estaciones
          .filter(e => String(e.Identificacion) !== this.datos.id && Number(e.habilitada ?? 1) > 0
            && Math.abs(Number(e.alt ?? 0) - Number(propia.alt ?? 0)) <= VECINAS_DESNIVEL)
          .map(e => ({ e, km: distanciaKm(+propia.lat, +propia.lon, +e.lat, +e.lon) }))
          .filter(x => x.km <= VECINAS_KM)
          .sort((a, b) => a.km - b.km)
          .slice(0, MAX_VECINAS + 2);
        const series = await Promise.all(candidatas.map(x => this.serie(String(x.e.Identificacion), x.e.nombre.trim(), x.km)));
        // Sólo las que tienen registros en el período
        this.vecinas = series.filter(s => s.registros.size > 0).slice(0, MAX_VECINAS);
      }
      this.evaluar();
      this.armarGrafico();
    } catch {
      this.error = 'No se pudieron leer los registros. Probá de nuevo en un rato.';
    } finally {
      this.cargando = false;
    }
  }

  /** Registros de 9 a 9 h de una estación: del día anterior después de las 9 h y del día hasta las 9 h */
  private async serie(id: string, nombre: string, km: number): Promise<Serie> {
    const dia = (fecha: string) => this.http
      .get<{ data?: { hora: string; lluvia?: number | string | null }[] }>(SERVICIOS + 'datos-24hs.php', { params: { fecha, estacion: id } })
      .pipe(map(r => (r?.data ?? []).map(x => ({ ...x, fecha }))), catchError(() => of([])));
    const [antes, despues] = await firstValueFrom(forkJoin([dia(this.datos.desde), dia(this.datos.hasta)]));
    const registros = new Map<string, number | null>();
    for (const r of [...antes.filter(x => x.hora > '09:00:00'), ...despues.filter(x => x.hora <= '09:00:00')]) {
      const n = r.lluvia === null || r.lluvia === undefined || r.lluvia === '' ? null : Number(r.lluvia);
      registros.set(`${r.fecha} ${r.hora.slice(0, 5)}`, n !== null && n >= 0 && n < 500 ? n : null);
    }
    let total = 0;
    let ultimaLluvia: string | null = null;
    for (const [clave, mm] of [...registros.entries()].sort()) {
      if (mm === null) continue;
      total += mm;
      if (mm > 0) ultimaLluvia = clave;
    }
    return { id, nombre, km, registros, total, ultimaLluvia };
  }

  /**
   * Señal orientativa (criterio propio):
   *   tapado: las vecinas registran 5 mm o más (mediana) y la estación el 20 % o menos;
   *   semitapado: registra menos de la mitad que las vecinas, o la mitad de su lluvia (y 1 mm o más)
   *     cae más de 1 h después de la última lluvia de las vecinas, durante 2 h o más;
   *   aislada: 5 mm o más con las vecinas en menos de 1 mm.
   */
  private evaluar(): void {
    const e = this.estacion;
    if (!e || e.registros.size === 0) {
      this.senal = 'sin-datos';
      return;
    }
    const conLluvia = [...e.registros.entries()].filter(([, mm]) => (mm ?? 0) > 0).sort();
    this.registrosConLluvia = conLluvia.length;
    this.maxRegistro = Math.max(0, ...conLluvia.map(([, mm]) => mm ?? 0));
    this.primeraLluvia = conLluvia[0]?.[0] ?? null;
    this.ultimaLluvia = conLluvia[conLluvia.length - 1]?.[0] ?? null;
    this.vuelcosSueltos = conLluvia.filter(([, mm]) => (mm ?? 0) <= VUELCO).length;

    if (!this.vecinas.length) {
      this.senal = e.total > 0 ? 'sin-vecinas' : 'sin-lluvia';
      return;
    }
    const totales = this.vecinas.map(v => v.total).sort((a, b) => a - b);
    const m = totales.length % 2 ? totales[(totales.length - 1) / 2]
      : (totales[totales.length / 2 - 1] + totales[totales.length / 2]) / 2;
    this.medianaVecinas = m;

    // Lluvia de la estación después de que paró en todas las vecinas (más 1 h de margen)
    const ultimas = this.vecinas.map(v => v.ultimaLluvia).filter((x): x is string => !!x).sort();
    const finVecinas = ultimas.length ? minutos(ultimas[ultimas.length - 1]) + 60 : null;
    const tarde = finVecinas === null ? [] : conLluvia.filter(([clave]) => minutos(clave) > finVecinas);
    this.cola = tarde.reduce((s, [, mm]) => s + (mm ?? 0), 0);
    this.colaHoras = tarde.length > 1 ? (minutos(tarde[tarde.length - 1][0]) - minutos(tarde[0][0])) / 60 : 0;

    if (m < 1 && e.total < 1) this.senal = 'sin-lluvia';
    else if (m < 1 && e.total >= 5) this.senal = 'aislada';
    else if (m >= 5 && e.total <= 0.2 * m) this.senal = 'tapado';
    else if ((m >= 5 && e.total < 0.5 * m) || (e.total >= 1 && this.cola >= 0.5 * e.total && this.colaHoras >= 2)) this.senal = 'semitapado';
    else this.senal = 'normal';
  }

  private armarGrafico(): void {
    const e = this.estacion;
    if (!e) return;
    const claves = [...new Set([e, ...this.vecinas].flatMap(s => [...s.registros.keys()]))].sort();
    const acumulada = (s: Serie): (number | null)[] => {
      let suma = 0;
      let empezo = false;
      return claves.map(c => {
        const mm = s.registros.get(c);
        if (mm !== undefined && mm !== null) {
          suma += mm;
          empezo = true;
        }
        return empezo ? Math.round(suma * 100) / 100 : null;
      });
    };
    this.grafico = {
      labels: claves.map(c => this.momento(c)),
      datasets: [
        {
          type: 'bar', label: `${e.nombre}: por registro`, yAxisID: 'y', order: 3,
          data: claves.map(c => e.registros.get(c) ?? null),
          backgroundColor: conAlfa(VAR_COLOR.lluvia, .75), borderWidth: 0, barPercentage: 1, categoryPercentage: 1
        },
        {
          type: 'line', label: `${e.nombre}: acumulada`, yAxisID: 'y1', order: 1, data: acumulada(e),
          borderColor: VAR_COLOR.lluvia, backgroundColor: VAR_COLOR.lluvia, borderWidth: 2.5, pointRadius: 0, stepped: true,
          spanGaps: true
        },
        ...this.vecinas.map((v, i) => ({
          type: 'line' as const, label: `${v.nombre} (${formatDecimal(v.km, 0)} km)`, yAxisID: 'y1', order: 2,
          data: acumulada(v), borderColor: COLOR_VECINAS[i], backgroundColor: COLOR_VECINAS[i], borderWidth: 1.5,
          borderDash: [5, 4], pointRadius: 0, stepped: true, spanGaps: true
        }))
      ]
    };
  }

  /** Horas cubiertas por los registros de la estación (cada uno, 15 minutos) */
  get horasCubiertas(): number {
    return (this.estacion?.registros.size ?? 0) / 4;
  }

  /** «02/11 14:30» a partir de 'AAAA-MM-DD HH:MM' */
  momento(clave: string | null): string {
    return clave ? `${clave.slice(8, 10)}/${clave.slice(5, 7)} ${clave.slice(11)}` : '—';
  }

  mm(n: number | null | undefined, decimales = 1): string {
    return n === null || n === undefined ? '—' : formatDecimal(n, decimales);
  }

  diaMes(iso: string): string {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  }

  close(): void {
    this.dialogRef.close();
  }
}

/** Minutos de una clave 'AAAA-MM-DD HH:MM' (hora local; sólo para comparar) */
function minutos(clave: string): number {
  return Date.parse(`${clave.replace(' ', 'T')}:00`) / 60000;
}

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
