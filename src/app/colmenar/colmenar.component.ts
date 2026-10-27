import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subject, Subscription, forkJoin } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { COLMENAR_ANIO_INICIO, ColmenarService } from '../services/colmenar.service';
import {
  AnomaliasResponse,
  ClasificacionLluviasResponse,
  ExtremosTermicosResponse,
  MensualesResponse,
  NormalesResponse,
  Recurso
} from './colmenar.models';
import { ResumenComponent } from './secciones/resumen/resumen.component';
import { TemperaturasComponent } from './secciones/temperaturas/temperaturas.component';
import { EvolucionComponent } from './secciones/evolucion/evolucion.component';
import { PrecipitacionesComponent } from './secciones/precipitaciones/precipitaciones.component';
import { ExtremosComponent } from './secciones/extremos/extremos.component';
import { EpisodiosComponent } from './secciones/episodios/episodios.component';
import { ComparacionComponent } from './secciones/comparacion/comparacion.component';

type SeccionId = 'resumen' | 'temperaturas' | 'evolucion' | 'precipitaciones' | 'extremos' | 'episodios' | 'comparar';

interface Seccion {
  id: SeccionId;
  etiqueta: string;
  icono: string;
}

const CARGANDO = { estado: 'cargando', datos: null } as const;

@Component({
  selector: 'app-colmenar',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    ResumenComponent,
    TemperaturasComponent,
    EvolucionComponent,
    PrecipitacionesComponent,
    ExtremosComponent,
    EpisodiosComponent,
    ComparacionComponent
  ],
  templateUrl: './colmenar.component.html',
  styleUrl: './colmenar.component.css'
})
export class ColmenarComponent implements OnInit, OnDestroy {
  readonly anioInicio = COLMENAR_ANIO_INICIO;
  readonly anioActual = new Date().getFullYear();
  readonly anios: number[] = Array.from({ length: this.anioActual - COLMENAR_ANIO_INICIO + 1 }, (_, i) => this.anioActual - i);

  readonly secciones: Seccion[] = [
    { id: 'resumen', etiqueta: 'Resumen', icono: 'dashboard' },
    { id: 'temperaturas', etiqueta: 'Temperaturas', icono: 'device_thermostat' },
    { id: 'evolucion', etiqueta: 'Evolución térmica e hídrica', icono: 'show_chart' },
    { id: 'precipitaciones', etiqueta: 'Precipitaciones', icono: 'water_drop' },
    { id: 'extremos', etiqueta: 'Extremos térmicos', icono: 'local_fire_department' },
    { id: 'episodios', etiqueta: 'Episodios cálidos', icono: 'wb_sunny' },
    { id: 'comparar', etiqueta: 'Comparar años', icono: 'compare_arrows' }
  ];

  anio = this.anioActual;
  seccion: SeccionId = 'resumen';

  normales: Recurso<NormalesResponse> = { ...CARGANDO };
  mensuales: Recurso<MensualesResponse> = { ...CARGANDO };
  anomalias: Recurso<AnomaliasResponse> = { ...CARGANDO };
  lluvias: Recurso<ClasificacionLluviasResponse> = { ...CARGANDO };
  extremos: Recurso<ExtremosTermicosResponse> = { ...CARGANDO };

  private cargado = false;
  private readonly carga$ = new Subject<number>();
  private subs = new Subscription();

  constructor(private api: ColmenarService, private route: ActivatedRoute, private router: Router) { }

  ngOnInit(): void {
    this.subs.add(
      this.carga$
        .pipe(
          switchMap((anio) => {
            this.normales = { ...CARGANDO };
            this.mensuales = { ...CARGANDO };
            this.anomalias = { ...CARGANDO };
            this.lluvias = { ...CARGANDO };
            this.extremos = { ...CARGANDO };
            return forkJoin({
              normales: this.api.recurso(this.api.getNormales(), (r) => !r.datos?.length),
              mensuales: this.api.recurso(this.api.getMensuales(anio, anio), (r) => !r.datos?.length),
              anomalias: this.api.recurso(this.api.getAnomalias(anio, anio), (r) => !r.datos?.length),
              lluvias: this.api.recurso(this.api.getClasificacionLluvias(anio), (r) => !r.datos?.length),
              extremos: this.api.recurso(this.api.getExtremosTermicos(anio), (r) => !r.datos?.length)
            });
          })
        )
        .subscribe((r) => {
          this.normales = r.normales;
          this.mensuales = r.mensuales;
          this.anomalias = r.anomalias;
          this.lluvias = r.lluvias;
          this.extremos = r.extremos;
        })
    );

    this.subs.add(
      this.route.queryParamMap.subscribe((q) => {
        const sec = q.get('seccion') as SeccionId | null;
        if (sec && this.secciones.some((s) => s.id === sec)) {
          this.seccion = sec;
        }
        const anio = Number(q.get('anio'));
        const anioValido = Number.isInteger(anio) && anio >= COLMENAR_ANIO_INICIO && anio <= this.anioActual ? anio : this.anio;
        if (!this.cargado || anioValido !== this.anio) {
          this.anio = anioValido;
          this.cargar();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  cargar(): void {
    this.cargado = true;
    this.carga$.next(this.anio);
  }

  cambiarAnio(valor: number | string): void {
    const anio = Number(valor);
    if (!Number.isInteger(anio) || anio < COLMENAR_ANIO_INICIO || anio > this.anioActual) {
      return;
    }
    this.actualizarUrl({ anio });
  }

  irSeccion(id: SeccionId): void {
    this.actualizarUrl({ seccion: id });
  }

  /** Evita copiar o arrastrar los datos mostrados (tablas, tarjetas y gráficos). */
  bloquear(ev: Event): void {
    ev.preventDefault();
  }

  /** Navegación con flechas entre pestañas (patrón ARIA tablist). */
  teclaPestania(ev: KeyboardEvent, i: number): void {
    const delta = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) {
      return;
    }
    ev.preventDefault();
    const sig = this.secciones[(i + delta + this.secciones.length) % this.secciones.length];
    this.irSeccion(sig.id);
    setTimeout(() => document.getElementById('tab-' + sig.id)?.focus());
  }

  private actualizarUrl(cambios: { anio?: number; seccion?: SeccionId }): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { anio: cambios.anio ?? this.anio, seccion: cambios.seccion ?? this.seccion },
      replaceUrl: true
    });
  }

  /** Estado general de completitud del año, tomado de los indicadores de la API. */
  get completitud(): { texto: string; completo: boolean } | null {
    const ext = this.extremos.datos?.resumen_anual;
    const ll = this.lluvias.datos?.datos;
    if (!ext && !ll) {
      return null;
    }
    const mesesLluvia = ll ? ll.filter((m) => m.lluvia_completa).length : null;
    const completo = !!ext?.anio_completo && mesesLluvia === 12;
    if (completo) {
      return { texto: 'Año completo', completo };
    }
    const partes: string[] = [];
    if (ext) {
      partes.push(`${ext.dias_registrados} de ${ext.dias_anio} días con registro`);
    }
    if (mesesLluvia !== null) {
      partes.push(`${mesesLluvia}/12 meses completos de lluvia`);
    }
    return { texto: 'Año incompleto · ' + partes.join(' · '), completo };
  }
}
