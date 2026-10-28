import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { UsuarioApiService } from './usuario-api.service';
import { Herramienta } from '../shared/enlace-consulta';

/** Consulta guardada: el mismo enlace de "Copiar enlace", con un nombre */
export interface ConsultaGuardada {
  id: number;
  nombre: string;
  herramienta: Herramienta;
  /** query string sin "herramienta" (estacion=73&desde=...) */
  parametros: string;
  creada: string;
  usada: string | null;
}

/** "Mis consultas" (Etapa 2): guardar, listar, abrir y borrar consultas de la cuenta. */
@Injectable({ providedIn: 'root' })
export class ConsultasGuardadasService {
  private readonly api = inject(UsuarioApiService);
  private readonly router = inject(Router);

  /** null = todavía no se cargaron */
  readonly consultas$ = new BehaviorSubject<ConsultaGuardada[] | null>(null);

  async cargar(): Promise<void> {
    const r = await this.api.get<{ consultas: ConsultaGuardada[] }>('consultas.php');
    this.consultas$.next(r.consultas);
  }

  /** Guarda a partir del enlace completo (/datos?herramienta=...&...). */
  async guardarEnlace(nombre: string, enlace: string): Promise<void> {
    const params = new URL(enlace).searchParams;
    const herramienta = params.get('herramienta') ?? '';
    params.delete('herramienta');
    await this.api.post('consultas.php', { nombre, herramienta, parametros: params.toString() });
    if (this.consultas$.value) await this.cargar();
  }

  async borrar(id: number): Promise<void> {
    await this.api.post('consulta_borrar.php', { id });
    this.consultas$.next((this.consultas$.value ?? []).filter(c => c.id !== id));
  }

  /** Abre la herramienta con la consulta y registra el uso (para ordenarlas por uso reciente). */
  abrir(c: ConsultaGuardada): void {
    void this.api.post('consulta_usada.php', { id: c.id }).catch(() => undefined);
    void this.router.navigateByUrl(`/datos?herramienta=${encodeURIComponent(c.herramienta)}&${c.parametros}`);
  }

  /** Al cerrar sesión no deben quedar las consultas de otra cuenta en memoria. */
  limpiar(): void {
    this.consultas$.next(null);
  }
}
