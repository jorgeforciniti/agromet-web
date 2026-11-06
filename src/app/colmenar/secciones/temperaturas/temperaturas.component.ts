import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { AnomaliaMensual, AnomaliasResponse, Mensual, MensualesResponse, Recurso } from '../../colmenar.models';
import { amplitud, COLOR, fmt, fmtSigno, MESES, MESES_CORTOS, opcionesBase, porMes, redondear } from '../../colmenar.utils';
import { AyudaTerminoComponent } from '../../shared/ayuda-termino.component';
import { EstadoCargaComponent } from '../../shared/estado-carga.component';
import { ExportarGraficoComponent } from '../../../shared/exportar-grafico.component';
import { ComoSeLeeComponent } from '../../../shared/como-se-lee.component';

type Variable = 'max' | 'min' | 'amp';

interface FilaTemp {
  mes: number;
  m: Mensual | null;
  a: AnomaliaMensual | null;
  parcialMax: boolean;
  parcialMin: boolean;
  completo: boolean;
  /** Amplitud térmica media del mes (sólo con Tmax y Tmin validadas), su normal y su anomalía. */
  amp: number | null;
  ampNormal: number | null;
  ampAnomalia: number | null;
}

@Component({
  selector: 'app-colmenar-temperaturas',
  standalone: true,
  imports: [ExportarGraficoComponent, CommonModule, BaseChartDirective, AyudaTerminoComponent, EstadoCargaComponent, ComoSeLeeComponent],
  templateUrl: './temperaturas.component.html',
  styleUrls: ['../../shared/seccion.css']
})
export class TemperaturasComponent implements OnChanges {
  @Input({ required: true }) anio!: number;
  @Input({ required: true }) mensuales!: Recurso<MensualesResponse>;
  @Input({ required: true }) anomalias!: Recurso<AnomaliasResponse>;
  @Output() reintentar = new EventEmitter<void>();

  readonly fmt = fmt;
  readonly fmtSigno = fmtSigno;
  readonly MESES = MESES;

  variable: Variable = 'max';
  filas: FilaTemp[] = [];

  datosSerie: ChartData<'line'> = { labels: [], datasets: [] };
  datosAnomalia: ChartData<'bar'> = { labels: [], datasets: [] };
  readonly opcionesSerie = opcionesBase('°C') as ChartOptions<'line'>;
  readonly opcionesAnomalia = (() => {
    const o = opcionesBase('°C') as ChartOptions<'bar'>;
    o.plugins = { ...o.plugins, legend: { display: false } };
    return o;
  })();

  ngOnChanges(): void {
    const mens = porMes(this.mensuales.datos?.datos);
    const anom = porMes(this.anomalias.datos?.datos);
    this.filas = mens.map((m, i) => {
      const a = anom[i];
      const amp = amplitud(m?.tmax_media_valida, m?.tmin_media_valida);
      const ampNormal = amplitud(a?.tmax_normal, a?.tmin_normal);
      return {
        mes: i + 1,
        m,
        a,
        parcialMax: !!m && m.tmax_media_valida === null && m.tmax_media_observada !== null,
        parcialMin: !!m && m.tmin_media_valida === null && m.tmin_media_observada !== null,
        completo: !!m && m.tmax_media_valida !== null && m.tmin_media_valida !== null,
        amp,
        ampNormal,
        ampAnomalia: amp !== null && ampNormal !== null ? redondear(amp - ampNormal, 2) : null
      };
    }).filter((f) => f.m || f.a);
    this.armarGraficos();
  }

  setVariable(v: Variable): void {
    this.variable = v;
    this.armarGraficos();
  }

  get etiquetaVariable(): string {
    return this.variable === 'max' ? 'Temperatura máxima media' : this.variable === 'min' ? 'Temperatura mínima media' : 'Amplitud térmica media';
  }

  private armarGraficos(): void {
    if (this.variable === 'amp') {
      this.armarGraficosAmplitud();
      return;
    }
    const max = this.variable === 'max';
    const color = max ? COLOR.tmax : COLOR.tmin;
    const anom = porMes(this.anomalias.datos?.datos);
    const mens = porMes(this.mensuales.datos?.datos);
    const valida = anom.map((a) => (max ? a?.tmax_media_valida : a?.tmin_media_valida) ?? null);
    const normal = anom.map((a) => (max ? a?.tmax_normal : a?.tmin_normal) ?? null);
    const parcial = mens.map((m) => {
      if (!m) {
        return null;
      }
      const v = max ? m.tmax_media_valida : m.tmin_media_valida;
      return v === null ? (max ? m.tmax_media_observada : m.tmin_media_observada) : null;
    });
    const anomalias = anom.map((a) => (max ? a?.anomalia_tmax : a?.anomalia_tmin) ?? null);

    this.datosSerie = {
      labels: MESES_CORTOS,
      datasets: [
        {
          label: `${max ? 'Tmax' : 'Tmin'} media ${this.anio}`,
          data: valida,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          spanGaps: false
        },
        {
          label: 'Normal 1991–2020',
          data: normal,
          borderColor: COLOR.normal,
          backgroundColor: COLOR.normal,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 4
        },
        ...(parcial.some((p) => p !== null)
          ? [{
            label: 'Media parcial (mes incompleto)',
            data: parcial,
            showLine: false,
            borderColor: color,
            backgroundColor: '#ffffff',
            borderWidth: 2,
            pointRadius: 5,
            pointStyle: 'rectRot' as const
          }]
          : [])
      ]
    };

    this.datosAnomalia = {
      labels: MESES_CORTOS,
      datasets: [
        {
          label: `Anomalía ${max ? 'Tmax' : 'Tmin'}`,
          data: anomalias,
          backgroundColor: anomalias.map((v) => ((v ?? 0) >= 0 ? COLOR.positivoTermico : COLOR.negativoTermico)),
          borderRadius: 4,
          maxBarThickness: 28
        }
      ]
    };
  }

  /** Amplitud térmica media mensual (Tmax − Tmin) frente a su normal 1991–2020. */
  private armarGraficosAmplitud(): void {
    const porNumero = new Map(this.filas.map((f) => [f.mes, f]));
    const fila = (i: number) => porNumero.get(i + 1);
    const mens = porMes(this.mensuales.datos?.datos);
    const valida = MESES_CORTOS.map((_, i) => fila(i)?.amp ?? null);
    const normal = MESES_CORTOS.map((_, i) => fila(i)?.ampNormal ?? null);
    // Meses incompletos: amplitud de las medias observadas, sólo como referencia.
    const parcial = mens.map((m) => (m && amplitud(m.tmax_media_valida, m.tmin_media_valida) === null
      ? amplitud(m.tmax_media_observada, m.tmin_media_observada) : null));
    const anomalias = MESES_CORTOS.map((_, i) => fila(i)?.ampAnomalia ?? null);

    this.datosSerie = {
      labels: MESES_CORTOS,
      datasets: [
        {
          label: `Amplitud media ${this.anio}`,
          data: valida,
          borderColor: COLOR.amplitud,
          backgroundColor: COLOR.amplitud,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          spanGaps: false
        },
        {
          label: 'Normal 1991–2020',
          data: normal,
          borderColor: COLOR.normal,
          backgroundColor: COLOR.normal,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 4
        },
        ...(parcial.some((p) => p !== null)
          ? [{
            label: 'Amplitud parcial (mes incompleto)',
            data: parcial,
            showLine: false,
            borderColor: COLOR.amplitud,
            backgroundColor: '#ffffff',
            borderWidth: 2,
            pointRadius: 5,
            pointStyle: 'rectRot' as const
          }]
          : [])
      ]
    };

    this.datosAnomalia = {
      labels: MESES_CORTOS,
      datasets: [
        {
          label: 'Anomalía de la amplitud',
          data: anomalias,
          backgroundColor: anomalias.map((v) => ((v ?? 0) >= 0 ? COLOR.positivoAmplitud : COLOR.negativoAmplitud)),
          borderRadius: 4,
          maxBarThickness: 28
        }
      ]
    };
  }
}
