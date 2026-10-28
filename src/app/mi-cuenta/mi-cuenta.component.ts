import { AfterViewInit, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { StationService } from '../services/station.service';
import { WeatherService, WeatherStation } from '../services/weather.service';
import { ConsultaGuardada, ConsultasGuardadasService } from '../services/consultas-guardadas.service';
import { AlertaUsuario, AlertasUsuarioService, TIPOS_ALERTA, VariableAlerta } from '../services/alertas-usuario.service';
import { MisEstacionesComponent } from '../mis-estaciones/mis-estaciones.component';
import { GruposEstacionesPipe } from '../pipes/grupos-estaciones.pipe';
import { Herramienta, NOMBRE_HERRAMIENTA } from '../shared/enlace-consulta';

/**
 * "Mi cuenta" (Etapa 2): estaciones favoritas, consultas guardadas y alertas propias.
 * Las secciones se pueden abrir directo con /mi-cuenta#consultas o #alertas (menú de usuario).
 */
@Component({
  selector: 'app-mi-cuenta',
  standalone: true,
  imports: [AsyncPipe, DatePipe, DecimalPipe, FormsModule, RouterLink, MatIconModule, MisEstacionesComponent, GruposEstacionesPipe],
  templateUrl: './mi-cuenta.component.html',
  styleUrl: './mi-cuenta.component.css'
})
export class MiCuentaComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly weather = inject(WeatherService);
  private readonly consultasSvc = inject(ConsultasGuardadasService);
  private readonly alertasSvc = inject(AlertasUsuarioService);
  readonly favoritas$ = inject(StationService).favoritas$;

  readonly usuario$ = this.auth.getUserObservable();
  readonly consultas$ = this.consultasSvc.consultas$;
  readonly alertas$ = this.alertasSvc.alertas$;
  readonly tipos = TIPOS_ALERTA;
  readonly variables = Object.keys(TIPOS_ALERTA) as VariableAlerta[];

  estaciones: WeatherStation[] = [];
  errorConsultas = '';
  errorAlertas = '';

  // Formulario de nueva alerta
  nuevaEstacion = '';
  nuevaVariable: VariableAlerta = 'temp_min';
  nuevoUmbral: number | null = 0;
  guardandoAlerta = false;

  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.weather.getStationsAll().subscribe(e => {
      this.estaciones = e.filter(s => (s.habilitada ?? 0) > 0)
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    });
    // Con sesión, se cargan consultas y alertas (y se vuelven a cargar si cambia la cuenta)
    this.subs.push(this.usuario$.subscribe(u => {
      if (!u) return;
      this.consultasSvc.cargar().catch(e => this.errorConsultas = this.mensaje(e));
      this.alertasSvc.cargar().catch(e => this.errorAlertas = this.mensaje(e));
    }));
  }

  ngAfterViewInit(): void {
    this.subs.push(this.route.fragment.subscribe(f => {
      if (f) setTimeout(() => document.getElementById(f)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }));
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  nombreEstacion(id: string | null | undefined): string {
    return this.estaciones.find(e => e.Identificacion === id)?.nombre ?? (id ? `Estación ${id}` : '');
  }

  /** "Horas de frío · Famaillá · 01/07/2026 a 31/07/2026" */
  detalleConsulta(c: ConsultaGuardada): string {
    const p = new URLSearchParams(c.parametros);
    const fecha = (v: string | null) => v ? v.split('-').reverse().join('/') : '';
    const partes = [NOMBRE_HERRAMIENTA[c.herramienta as Herramienta] ?? c.herramienta];
    if (p.get('estacion')) partes.push(this.nombreEstacion(p.get('estacion')));
    if (p.get('desde') && p.get('hasta')) partes.push(`${fecha(p.get('desde'))} a ${fecha(p.get('hasta'))}`);
    return partes.join(' · ');
  }

  abrirConsulta(c: ConsultaGuardada): void {
    this.consultasSvc.abrir(c);
  }

  async borrarConsulta(c: ConsultaGuardada): Promise<void> {
    if (!confirm(`¿Borrar la consulta "${c.nombre}"?`)) return;
    this.errorConsultas = '';
    try {
      await this.consultasSvc.borrar(c.id);
    } catch (e) {
      this.errorConsultas = this.mensaje(e);
    }
  }

  async agregarAlerta(): Promise<void> {
    const tipo = TIPOS_ALERTA[this.nuevaVariable];
    if (!this.nuevaEstacion) {
      this.errorAlertas = 'Elegí una estación.';
      return;
    }
    if (this.nuevoUmbral === null || this.nuevoUmbral < tipo.min || this.nuevoUmbral > tipo.max) {
      this.errorAlertas = `El valor tiene que estar entre ${tipo.min} y ${tipo.max} ${tipo.unidad}.`;
      return;
    }
    this.guardandoAlerta = true;
    this.errorAlertas = '';
    try {
      await this.alertasSvc.guardar({
        estacion_id: this.nuevaEstacion, variable: this.nuevaVariable, umbral: this.nuevoUmbral, activa: true
      });
    } catch (e) {
      this.errorAlertas = this.mensaje(e);
    } finally {
      this.guardandoAlerta = false;
    }
  }

  async alternarAlerta(a: AlertaUsuario): Promise<void> {
    this.errorAlertas = '';
    try {
      await this.alertasSvc.guardar({ ...a, activa: !a.activa });
    } catch (e) {
      this.errorAlertas = this.mensaje(e);
    }
  }

  async borrarAlerta(a: AlertaUsuario): Promise<void> {
    this.errorAlertas = '';
    try {
      await this.alertasSvc.borrar(a.id);
    } catch (e) {
      this.errorAlertas = this.mensaje(e);
    }
  }

  /** Valor sugerido al cambiar el tipo: 0 °C para heladas, 35 °C para calor, 30 mm de lluvia. */
  cambioTipo(): void {
    this.nuevoUmbral = { temp_min: 0, temp_max: 35, lluvia_dia: 30 }[this.nuevaVariable];
  }

  private mensaje(e: unknown): string {
    return e instanceof Error ? e.message : 'No se pudo completar la operación.';
  }
}
