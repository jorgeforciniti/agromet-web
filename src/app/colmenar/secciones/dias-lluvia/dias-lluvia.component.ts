import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { Subscription } from 'rxjs';
import { ColmenarService } from '../../../services/colmenar.service';
import { EstadoCarga, LluviaDiariaAnio } from '../../colmenar.models';
import { COLOR, fmt, fmtSigno, MESES, MESES_CORTOS, opcionesBase } from '../../colmenar.utils';
import { AyudaTerminoComponent } from '../../shared/ayuda-termino.component';
import { EstadoCargaComponent } from '../../shared/estado-carga.component';
import { ExportarGraficoComponent } from '../../../shared/exportar-grafico.component';

/** Clases de lluvia diaria (mm, resolución 0,1 mm). La clase 0 agrupa días sin lluvia y con traza. */
export interface ClaseLluvia {
  etiqueta: string;
  corta: string;
  color: string;
}

export const CLASES: ClaseLluvia[] = [
  { etiqueta: 'Menos de 0,1 mm (sin lluvia o traza)', corta: '< 0,1', color: '#adb5bd' },
  { etiqueta: '0,1 a 1,0 mm', corta: '0,1–1', color: '#86b6ef' },
  { etiqueta: '1,1 a 5,0 mm', corta: '1,1–5', color: '#5598e7' },
  { etiqueta: '5,1 a 20,0 mm', corta: '5,1–20', color: '#2a78d6' },
  { etiqueta: '20,1 a 50,0 mm', corta: '20,1–50', color: '#1c5cab' },
  { etiqueta: '50,1 mm o más', corta: '≥ 50,1', color: '#0d366b' }
];

/** Índice de clase de una lluvia diaria. */
export function claseDe(mm: number): number {
  const v = Math.round(mm * 10) / 10;
  if (v < 0.1) return 0;
  if (v <= 1.0) return 1;
  if (v <= 5.0) return 2;
  if (v <= 20.0) return 3;
  if (v <= 50.0) return 4;
  return 5;
}

/** Período de referencia para las normales de días por clase. */
const NORMAL_DESDE = 1991;
const NORMAL_HASTA = 2020;

interface FilaMes {
  mes: number;
  /** Días por clase; en meses incompletos, sólo de los días con dato. */
  conteos: number[];
  conLluvia: number;
  completo: boolean;
  diasValidos: number;
  diasMes: number;
  /** Normal 1991–2020 de días por clase. */
  normal: number[];
}

@Component({
  selector: 'app-colmenar-dias-lluvia',
  standalone: true,
  imports: [ExportarGraficoComponent, CommonModule, BaseChartDirective, AyudaTerminoComponent, EstadoCargaComponent],
  templateUrl: './dias-lluvia.component.html',
  styleUrls: ['../../shared/seccion.css', './dias-lluvia.component.css']
})
export class DiasLluviaComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) anio!: number;

  readonly fmt = fmt;
  readonly fmtSigno = fmtSigno;
  readonly MESES = MESES;
  readonly CLASES = CLASES;
  readonly NORMAL_DESDE = NORMAL_DESDE;
  readonly NORMAL_HASTA = NORMAL_HASTA;

  estado: EstadoCarga = 'cargando';
  mensaje?: string;
  descargados = 0;
  aDescargar = 0;

  filas: FilaMes[] = [];
  /** Totales por clase de los meses completos del año y su normal para esos mismos meses. */
  totalAnio: number[] = [];
  normalMismosMeses: number[] = [];
  mesesCompletos = 0;
  sinDatosAnio = false;
  /** Normal 1991–2020 de días por clase: [mes − 1][clase]. */
  normal: number[][] = [];

  datosMensual: ChartData<'bar' | 'line'> = { labels: [], datasets: [] };
  opcionesMensual: ChartOptions<'bar'> = {};
  datosClases: ChartData<'bar'> = { labels: [], datasets: [] };
  opcionesClases: ChartOptions<'bar'> = {};

  private sub?: Subscription;

  constructor(private api: ColmenarService) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['anio']) {
      this.cargar();
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get anual(): boolean {
    return this.mesesCompletos === 12;
  }

  /** Suma de las clases 1 a 5 (0,1 mm o más). */
  conLluvia(conteos: number[]): number {
    return conteos.slice(1).reduce((s, v) => s + v, 0);
  }

  sumaClases(conteos: number[], desde: number): number {
    return conteos.slice(desde).reduce((s, v) => s + v, 0);
  }

  cargar(): void {
    const anios: number[] = [];
    for (let a = NORMAL_DESDE; a <= NORMAL_HASTA; a++) anios.push(a);
    if (!anios.includes(this.anio)) anios.push(this.anio);
    this.estado = 'cargando';
    this.mensaje = undefined;
    this.descargados = 0;
    this.aDescargar = anios.length;
    this.sub?.unsubscribe();
    this.sub = this.api.getLluviaDiariaAnios(anios, (n) => (this.descargados = n)).subscribe({
      next: (datos) => this.calcular(datos),
      error: (err: unknown) => {
        this.estado = 'error';
        this.mensaje = this.api.mensajeError(err);
      }
    });
  }

  private calcular(datos: LluviaDiariaAnio[]): void {
    // Normal: promedio de días por clase de cada mes en 1991–2020 (sólo meses con todos los días válidos).
    const sumaNormal = Array.from({ length: 12 }, () => new Array(CLASES.length).fill(0));
    const nNormal = new Array(12).fill(0);
    for (const a of datos.filter((d) => d.anio >= NORMAL_DESDE && d.anio <= NORMAL_HASTA)) {
      for (let m = 1; m <= 12; m++) {
        const c = this.contarMes(a, m);
        if (!c.completo) continue;
        c.conteos.forEach((v, k) => (sumaNormal[m - 1][k] += v));
        nNormal[m - 1]++;
      }
    }
    const normal = sumaNormal.map((fila, i) => fila.map((v) => (nNormal[i] ? v / nNormal[i] : NaN)));
    this.normal = normal;

    const delAnio = datos.find((d) => d.anio === this.anio);
    this.sinDatosAnio = !delAnio || delAnio.mm.every((v) => v === null);
    if (this.sinDatosAnio || !delAnio) {
      this.estado = 'vacio';
      return;
    }
    this.filas = Array.from({ length: 12 }, (_, i) => {
      const c = this.contarMes(delAnio, i + 1);
      return { mes: i + 1, ...c, conLluvia: this.conLluvia(c.conteos), normal: normal[i] };
    }).filter((f) => f.diasValidos > 0);

    const completas = this.filas.filter((f) => f.completo);
    this.mesesCompletos = completas.length;
    this.totalAnio = CLASES.map((_, k) => completas.reduce((s, f) => s + f.conteos[k], 0));
    this.normalMismosMeses = CLASES.map((_, k) => completas.reduce((s, f) => s + f.normal[k], 0));
    this.estado = 'ok';
    this.armarGraficos();
  }

  private contarMes(a: LluviaDiariaAnio, mes: number): { conteos: number[]; completo: boolean; diasValidos: number; diasMes: number } {
    const conteos = new Array(CLASES.length).fill(0);
    let diasMes = 0;
    let diasValidos = 0;
    a.fechas.forEach((f, i) => {
      if (Number(f.slice(5, 7)) !== mes) return;
      diasMes++;
      const v = a.mm[i];
      if (v === null) return;
      diasValidos++;
      conteos[claseDe(v)]++;
    });
    return { conteos, completo: diasMes > 0 && diasValidos === diasMes, diasValidos, diasMes };
  }

  private armarGraficos(): void {
    const porMes = Array.from({ length: 12 }, (_, i) => this.filas.find((f) => f.mes === i + 1) ?? null);
    this.datosMensual = {
      labels: MESES_CORTOS,
      datasets: [
        ...CLASES.slice(1).map((c, j) => ({
          type: 'bar' as const,
          label: c.etiqueta,
          data: porMes.map((f) => (f ? f.conteos[j + 1] : null)),
          backgroundColor: porMes.map((f) => (f && !f.completo ? c.color + '66' : c.color)),
          borderColor: '#ffffff',
          borderWidth: 1,
          stack: 'dias',
          maxBarThickness: 34,
          order: 2
        })),
        {
          type: 'line' as const,
          label: `Normal ${NORMAL_DESDE}–${NORMAL_HASTA} (días con lluvia)`,
          data: this.normal.map((n) => this.conLluvia(n)),
          borderColor: COLOR.normal,
          backgroundColor: COLOR.normal,
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 3,
          order: 1
        }
      ]
    } as ChartData<'bar' | 'line'>;
    const om = opcionesBase('días', { minCero: true, decimales: 0 }) as ChartOptions<'bar'>;
    om.scales = { ...om.scales, x: { ...om.scales?.['x'], stacked: true }, y: { ...om.scales?.['y'], stacked: true } };
    om.plugins = {
      ...om.plugins,
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.y;
            // La última serie es la línea de la normal (con decimales); las demás son conteos.
            const dec = ctx.datasetIndex === CLASES.length - 1 ? 1 : 0;
            return `${ctx.dataset.label}: ${fmt(v, dec)} días`;
          },
          footer: (items) => {
            const f = porMes[items[0]?.dataIndex ?? -1];
            if (!f) return '';
            return f.completo ? `Total: ${f.conLluvia} días con lluvia` : `Mes incompleto: ${f.diasValidos} de ${f.diasMes} días con dato`;
          }
        }
      }
    };
    this.opcionesMensual = om;

    const etiquetaAnio = this.anual ? String(this.anio) : `${this.anio} (${this.mesesCompletos} meses completos)`;
    this.datosClases = {
      labels: CLASES.slice(1).map((c) => c.corta + ' mm'),
      datasets: [
        { label: etiquetaAnio, data: this.totalAnio.slice(1), backgroundColor: COLOR.lluvia, borderRadius: 4, maxBarThickness: 30 },
        { label: `Normal ${NORMAL_DESDE}–${NORMAL_HASTA} (mismos meses)`, data: this.normalMismosMeses.slice(1), backgroundColor: COLOR.normal + '88', borderRadius: 4, maxBarThickness: 30 }
      ]
    };
    const oc = opcionesBase('días', { minCero: true, decimales: 1 }) as ChartOptions<'bar'>;
    this.opcionesClases = oc;
  }
}
