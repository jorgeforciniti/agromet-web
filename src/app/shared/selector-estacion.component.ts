import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, forwardRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatFormFieldModule, MatFormFieldAppearance } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { combineLatest, Subscription } from 'rxjs';
import { StationService } from '../services/station.service';

/** Lo que el selector necesita de cada estación (WeatherStation y similares) */
export interface EstacionElegible {
  Identificacion: string;
  nombre: string;
  Localidad?: string;
  departamento?: string;
  lat?: string | number;
  lon?: string | number;
}

interface Opcion {
  id: string;
  texto: string;
  /** Localidad y departamento: explican por qué aparece en una búsqueda */
  lugar: string;
  /** Distancia en km, sólo en el grupo «Más cercanas» */
  km?: number;
}

interface Grupo {
  titulo: string;
  opciones: Opcion[];
}

/** Estaciones que se muestran en «Más cercanas» */
const CERCANAS = 3;
/** Resultados de una búsqueda: con más, conviene seguir escribiendo */
const MAX_RESULTADOS = 40;

/**
 * Selector de estación con búsqueda (A1 del informe de mejoras). Reemplaza al <select> que repetía
 * cada diálogo: se escribe parte del nombre, la localidad, el departamento o el número y se elige
 * de la lista. Sin texto, muestra primero las más cercanas (si se pidió la ubicación), las
 * favoritas y las recientes (StationService), y después todas.
 *
 * Funciona con formularios reactivos y con ngModel; el valor es la Identificacion:
 *   <app-selector-estacion formControlName="station" [estaciones]="stations"></app-selector-estacion>
 *
 * No cambia la estación activa: de eso se sigue ocupando cada diálogo, como antes.
 */
@Component({
  selector: 'app-selector-estacion',
  standalone: true,
  imports: [CommonModule, MatAutocompleteModule, MatFormFieldModule, MatInputModule, MatIconModule, MatButtonModule, MatTooltipModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectorEstacionComponent), multi: true }],
  template: `
    <mat-form-field [appearance]="appearance" subscriptSizing="dynamic" class="selector-estacion">
      <mat-label>{{ etiqueta }}</mat-label>
      <input #entrada matInput type="text" autocomplete="off" spellcheck="false"
        [value]="texto" [disabled]="deshabilitado" [required]="requerido"
        [matAutocomplete]="lista" (input)="buscar(entrada.value)" (focus)="alEnfocar(entrada)" (blur)="alSalir()"
        placeholder="Buscá por nombre, localidad o número">
      @if (puedeUbicar) {
        <button mat-icon-button matSuffix type="button" class="selector-estacion__cerca"
          [disabled]="deshabilitado || ubicando" (click)="cercaDeMi($event)"
          matTooltip="Estaciones más cercanas a tu ubicación" aria-label="Mostrar las estaciones más cercanas a mi ubicación">
          <mat-icon>{{ ubicando ? 'hourglass_empty' : 'my_location' }}</mat-icon>
        </button>
      }
      @if (avisoUbicacion) {
        <mat-hint>{{ avisoUbicacion }}</mat-hint>
      }
      <mat-autocomplete #lista="matAutocomplete" [displayWith]="mostrar" (optionSelected)="elegir($event)"
        [hideSingleSelectionIndicator]="true" panelWidth="min(360px, 92vw)">
        @for (g of grupos; track g.titulo) {
          <mat-optgroup [label]="g.titulo">
            @for (o of g.opciones; track o.id) {
              <mat-option [value]="o.id" [class.selector-estacion__activa]="o.id === valor">
                <span class="selector-estacion__nombre">{{ o.texto }}
                  @if (o.km !== undefined) {
                    <small class="selector-estacion__km">· {{ o.km | number:'1.0-0' }} km</small>
                  }
                </span>
                @if (o.lugar) {
                  <small class="selector-estacion__lugar">{{ o.lugar }}</small>
                }
              </mat-option>
            }
          </mat-optgroup>
        } @empty {
          <mat-option disabled>No hay estaciones que coincidan</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .selector-estacion { width: 100%; }
    .selector-estacion__cerca { color: var(--muted, #5b6470); }
    .selector-estacion__km { color: var(--muted, #5b6470); font-weight: 600; }
    .selector-estacion__nombre { display: block; line-height: 1.25; }
    .selector-estacion__lugar { display: block; color: var(--muted, #5b6470); font-size: .76rem; line-height: 1.2; }
    :host ::ng-deep .selector-estacion__activa { font-weight: 800; }
  `]
})
export class SelectorEstacionComponent implements ControlValueAccessor, OnDestroy {
  @Input() etiqueta = 'Estación';
  @Input() appearance: MatFormFieldAppearance = 'fill';
  @Input() set required(v: boolean | string) { this.requerido = v !== false && v !== 'false'; }

  @Input() set estaciones(lista: EstacionElegible[] | null | undefined) {
    this.lista = lista ?? [];
    this.texto = this.textoDe(this.valor);
    this.armarGrupos();
  }

  /** El usuario eligió otra estación (además del cambio de valor del formulario) */
  @Output() cambio = new EventEmitter<string>();

  @ViewChild('entrada') private entrada?: ElementRef<HTMLInputElement>;
  @ViewChild(MatAutocompleteTrigger) private disparador?: MatAutocompleteTrigger;

  private readonly stations = inject(StationService);
  private lista: EstacionElegible[] = [];
  private favoritas: string[] = [];
  private recientes: string[] = [];
  private cercanas: Opcion[] = [];
  private consulta = '';
  private readonly sub: Subscription;

  valor = '';
  texto = '';
  grupos: Grupo[] = [];
  deshabilitado = false;
  requerido = false;
  ubicando = false;
  avisoUbicacion = '';
  readonly puedeUbicar = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  /** Texto del campo para una opción elegida (el valor de la opción es la Identificacion) */
  readonly mostrar = (id: unknown): string => this.textoDe(id == null ? '' : String(id));

  private alCambiar: (v: string) => void = () => {};
  private alTocar: () => void = () => {};

  constructor() {
    this.sub = combineLatest([this.stations.favoritas$, this.stations.recientes$]).subscribe(([f, r]) => {
      this.favoritas = f;
      this.recientes = r;
      this.armarGrupos();
    });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  // ===== ControlValueAccessor =====

  writeValue(v: unknown): void {
    this.valor = v == null ? '' : String(v);
    this.texto = this.textoDe(this.valor);
  }

  registerOnChange(fn: (v: string) => void): void { this.alCambiar = fn; }
  registerOnTouched(fn: () => void): void { this.alTocar = fn; }
  setDisabledState(d: boolean): void { this.deshabilitado = d; }

  // ===== Interacción =====

  /** Al entrar se selecciona el texto: se puede escribir encima o abrir la lista completa */
  alEnfocar(entrada: HTMLInputElement): void {
    this.consulta = '';
    this.armarGrupos();
    entrada.select();
  }

  buscar(texto: string): void {
    this.texto = texto;
    this.consulta = texto;
    this.armarGrupos();
  }

  elegir(e: MatAutocompleteSelectedEvent): void {
    const id = String(e.option.value);
    this.texto = this.textoDe(id);
    this.consulta = '';
    if (id !== this.valor) {
      this.valor = id;
      this.alCambiar(id);
      this.cambio.emit(id);
    }
    this.entrada?.nativeElement.blur();
  }

  /** Si se escribió sin elegir, vuelve el nombre de la estación que sigue elegida */
  alSalir(): void {
    this.alTocar();
    setTimeout(() => {
      if (this.disparador?.panelOpen) return;
      this.texto = this.textoDe(this.valor);
      this.consulta = '';
    }, 150);
  }

  cercaDeMi(evento: Event): void {
    evento.stopPropagation();
    this.avisoUbicacion = '';
    this.ubicando = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.ubicando = false;
        this.cercanas = this.masCercanas(pos.coords.latitude, pos.coords.longitude);
        if (!this.cercanas.length) {
          this.avisoUbicacion = 'Las estaciones de la lista no tienen coordenadas.';
          return;
        }
        this.consulta = '';
        this.armarGrupos();
        this.entrada?.nativeElement.focus();
        setTimeout(() => this.disparador?.openPanel());
      },
      err => {
        this.ubicando = false;
        this.avisoUbicacion = err.code === err.PERMISSION_DENIED
          ? 'Sin permiso para usar tu ubicación.'
          : 'No se pudo obtener tu ubicación.';
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }

  // ===== Armado de la lista =====

  private armarGrupos(): void {
    const q = normalizar(this.consulta);
    if (q) {
      const encontradas = this.lista
        .filter(e => normalizar([e.Identificacion, e.nombre, e.Localidad, e.departamento].join(' ')).includes(q))
        .slice(0, MAX_RESULTADOS)
        .map(e => this.opcion(e));
      this.grupos = encontradas.length ? [{ titulo: 'Resultados', opciones: encontradas }] : [];
      return;
    }

    const ids = new Set(this.lista.map(e => e.Identificacion));
    const porIds = (lista: string[]) => lista.filter(id => ids.has(id)).map(id => this.opcion(this.buscarEstacion(id)!));
    const favoritas = porIds(this.favoritas);
    const recientes = porIds(this.recientes.filter(id => !this.favoritas.includes(id)));
    this.grupos = [
      { titulo: 'Más cercanas', opciones: this.cercanas.filter(o => ids.has(o.id)) },
      { titulo: '★ Favoritas', opciones: favoritas },
      { titulo: 'Recientes', opciones: recientes },
      { titulo: 'Todas las estaciones', opciones: this.lista.map(e => this.opcion(e)) }
    ].filter(g => g.opciones.length);
  }

  private masCercanas(lat: number, lon: number): Opcion[] {
    return this.lista
      .map(e => ({ e, km: distanciaKm(lat, lon, Number(e.lat), Number(e.lon)) }))
      .filter(x => Number.isFinite(x.km))
      .sort((a, b) => a.km - b.km)
      .slice(0, CERCANAS)
      .map(x => ({ ...this.opcion(x.e), km: x.km }));
  }

  private opcion(e: EstacionElegible): Opcion {
    const lugar = [...new Set([e.Localidad, e.departamento].map(t => (t ?? '').trim()).filter(Boolean))]
      .filter(t => normalizar(t) !== normalizar(e.nombre))
      .join(' · ');
    return { id: e.Identificacion, texto: `${e.Identificacion} - ${e.nombre}`, lugar };
  }

  private buscarEstacion(id: string): EstacionElegible | undefined {
    return this.lista.find(e => e.Identificacion === id);
  }

  private textoDe(id: string): string {
    if (!id) return '';
    const e = this.buscarEstacion(id);
    return e ? `${e.Identificacion} - ${e.nombre}` : id;
  }
}

/** Minúsculas y sin tildes, para que «tafi» encuentre «Tafí» */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Distancia sobre la esfera (haversine), en km */
function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NaN;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
