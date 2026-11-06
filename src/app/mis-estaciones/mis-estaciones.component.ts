import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { combineLatest, Subscription } from 'rxjs';
import { StationService } from '../services/station.service';
import { CuentaPreferenciasService } from '../services/cuenta-preferencias.service';
import { AlertaDisparada, AlertasUsuarioService, MedicionesEstacion, TIPOS_ALERTA } from '../services/alertas-usuario.service';
import { WeatherService, WeatherStation } from '../services/weather.service';
import { leerFechaEstacion } from '../shared/estado-estacion';

/** Tarjeta de una estación favorita con su último dato */
interface TarjetaEstacion {
  id: string;
  nombre: string;
  ubicacion: string;
  temp: number | null;
  hum: number | null;
  lluvia: number | null;
  actualizado: Date | null;
  /** El último dato no es de hoy */
  atrasada: boolean;
  predeterminada: boolean;
  activa: boolean;
}

/**
 * "Mis estaciones": las favoritas del usuario con su último dato, la predeterminada y la
 * activa. Usa sólo estaciones.php (ya trae los valores actuales) y las preferencias de
 * StationService, así que funciona igual con o sin sesión iniciada.
 */
@Component({
  selector: 'app-mis-estaciones',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  templateUrl: './mis-estaciones.component.html',
  styleUrl: './mis-estaciones.component.css'
})
export class MisEstacionesComponent implements OnInit, OnDestroy {
  tarjetas: TarjetaEstacion[] = [];
  /** Hay favoritas guardadas (aunque sus datos todavía no hayan llegado) */
  hayFavoritas = false;
  cargando = true;
  error = false;

  private readonly cuentaPreferencias = inject(CuentaPreferenciasService);
  /** Favoritas del navegador que se pueden pasar a la cuenta (0 = no ofrecer) */
  readonly ofrecerImportar$ = this.cuentaPreferencias.ofrecerImportar$;

  /** Alertas de la cuenta que se cumplen con el último dato */
  disparadas: AlertaDisparada[] = [];
  readonly tipos = TIPOS_ALERTA;
  private readonly alertas = inject(AlertasUsuarioService);
  /** Mínima del día por estación (datos-alerta.php); se pide sólo si hay alertas de helada */
  private minimas = new Map<string, number>();
  private minimasPedidas = false;
  /** Máxima de hoy de las estaciones con alerta de máxima (datos-diarios.php) */
  private maximas = new Map<string, number>();
  private maximasPedidas = new Set<string>();

  private estaciones: WeatherStation[] = [];
  private sub?: Subscription;
  private subAlertas?: Subscription;

  constructor(
    private weatherService: WeatherService,
    private stationService: StationService
  ) { }

  ngOnInit(): void {
    this.weatherService.getStationsAll().subscribe({
      next: estaciones => {
        this.estaciones = estaciones;
        this.cargando = false;
        this.armar();
        this.evaluarAlertas();
      },
      error: () => {
        this.cargando = false;
        this.error = true;
      }
    });

    this.sub = combineLatest([
      this.stationService.favoritas$,
      this.stationService.predeterminada$,
      this.stationService.activa$
    ]).subscribe(() => this.armar());

    this.subAlertas = this.alertas.alertas$.subscribe(lista => {
      if (lista?.some(a => a.activa && a.variable === 'temp_min')) this.pedirMinimas();
      this.pedirMaximas((lista ?? []).filter(a => a.activa && a.variable === 'temp_max').map(a => a.estacion_id));
      this.evaluarAlertas();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.subAlertas?.unsubscribe();
  }

  nombreEstacion(id: string): string {
    return this.estaciones.find(e => e.Identificacion === id)?.nombre ?? `Estación ${id}`;
  }

  private pedirMinimas(): void {
    if (this.minimasPedidas) return;
    this.minimasPedidas = true;
    this.weatherService.getAlerts<Record<string, unknown>>().subscribe({
      next: r => {
        for (const e of r.data ?? []) {
          const id = String(e['identificacion'] ?? e['Identificacion'] ?? '');
          const min = this.enRango(String(e['minimaTemperatura'] ?? ''), -25, 55);
          if (id && min !== null) this.minimas.set(id, min);
        }
        this.evaluarAlertas();
      },
      error: () => undefined
    });
  }

  /** Máxima de hoy de cada estación pedida (una consulta por estación, como mucho 20 alertas). */
  private pedirMaximas(estaciones: string[]): void {
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    for (const id of new Set(estaciones)) {
      if (this.maximasPedidas.has(id)) continue;
      this.maximasPedidas.add(id);
      this.weatherService.getWeatherDataDiary<{ fecha: string; temp_max: number | string | null }>(fecha, fecha, id).subscribe({
        next: r => {
          const dia = (r.data ?? []).find(d => String(d.fecha).slice(0, 10) === fecha);
          const max = this.enRango(dia?.temp_max == null ? '' : String(dia.temp_max), -25, 55);
          if (max !== null) {
            this.maximas.set(id, max);
            this.evaluarAlertas();
          }
        },
        error: () => undefined
      });
    }
  }

  /** Arma las mediciones de cada estación y pregunta qué alertas se cumplen. */
  private evaluarAlertas(): void {
    const mediciones = new Map<string, MedicionesEstacion>();
    for (const e of this.estaciones) {
      mediciones.set(e.Identificacion, {
        minima: this.minimas.get(e.Identificacion) ?? null,
        maxima: this.maximas.get(e.Identificacion) ?? null,
        temperatura: this.enRango(e.temp_af, -25, 55),
        lluvia: this.enRango(e.RR_dia, 0, 400)
      });
    }
    this.disparadas = this.alertas.evaluar(mediciones);
  }

  importar(si: boolean): void {
    this.cuentaPreferencias.responderImportacion(si);
  }

  usar(id: string): void {
    this.stationService.setActiva(id);
  }

  alternarPredeterminada(t: TarjetaEstacion): void {
    this.stationService.setPredeterminada(t.predeterminada ? null : t.id);
  }

  quitar(id: string): void {
    this.stationService.alternarFavorita(id);
  }

  private armar(): void {
    const favoritas = this.stationService.favoritas;
    this.hayFavoritas = favoritas.length > 0;
    const hoy = new Date().toDateString();

    this.tarjetas = favoritas
      .map(id => this.estaciones.find(e => e.Identificacion === id))
      .filter((e): e is WeatherStation => !!e)
      .map(e => {
        const actualizado = leerFechaEstacion(e.fecha_I);
        return {
          id: e.Identificacion,
          nombre: e.nombre,
          ubicacion: [e.departamento, e.provincia].filter(Boolean).join(', '),
          // Mismos rangos físicos que la red de estaciones: descarta errores del sensor
          temp: this.enRango(e.temp_af, -25, 55),
          hum: this.enRango(e.hum_af, 0, 100),
          lluvia: this.enRango(e.RR_dia, 0, 400),
          actualizado: actualizado && !isNaN(actualizado.getTime()) ? actualizado : null,
          atrasada: !actualizado || actualizado.toDateString() !== hoy,
          predeterminada: e.Identificacion === this.stationService.predeterminada,
          activa: e.Identificacion === this.stationService.activa
        };
      });
  }

  private enRango(valor: string | undefined, min: number, max: number): number | null {
    const n = parseFloat(valor ?? '');
    return isNaN(n) || n < min || n > max ? null : n;
  }
}
