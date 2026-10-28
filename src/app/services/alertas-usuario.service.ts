import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { UsuarioApiService } from './usuario-api.service';

export type VariableAlerta = 'temp_min' | 'temp_max' | 'lluvia_dia';

export interface AlertaUsuario {
  id: number;
  estacion_id: string;
  variable: VariableAlerta;
  operador: '<=' | '>=';
  umbral: number;
  activa: boolean;
}

/**
 * Qué se compara en cada alerta. Sólo con datos medidos que el sitio ya recibe:
 * la mínima del día (datos-alerta.php), la última temperatura y la lluvia del día (estaciones.php).
 * No hay máxima diaria publicada, por eso la de calor usa la última medición.
 */
export const TIPOS_ALERTA: Record<VariableAlerta, { operador: '<=' | '>='; texto: string; unidad: string; min: number; max: number }> = {
  temp_min: { operador: '<=', texto: 'Mínima de hoy menor o igual a', unidad: '°C', min: -25, max: 55 },
  temp_max: { operador: '>=', texto: 'Temperatura medida mayor o igual a', unidad: '°C', min: -25, max: 55 },
  lluvia_dia: { operador: '>=', texto: 'Lluvia de hoy mayor o igual a', unidad: 'mm', min: 0, max: 400 }
};

/** Alerta cuyo umbral se superó con el último dato */
export interface AlertaDisparada {
  alerta: AlertaUsuario;
  valor: number;
}

/** Valores medidos de una estación, ya filtrados por rango físico (null = sin dato) */
export interface MedicionesEstacion {
  minima: number | null;
  temperatura: number | null;
  lluvia: number | null;
}

/** "Mis alertas" (Etapa 2): umbrales por estación, guardados en la cuenta y evaluados al cargar. */
@Injectable({ providedIn: 'root' })
export class AlertasUsuarioService {
  private readonly api = inject(UsuarioApiService);

  /** null = todavía no se cargaron (o no hay sesión) */
  readonly alertas$ = new BehaviorSubject<AlertaUsuario[] | null>(null);

  async cargar(): Promise<void> {
    const r = await this.api.get<{ alertas: AlertaUsuario[] }>('alertas.php');
    this.alertas$.next(r.alertas);
  }

  /** Crea (sin id) o edita una alerta. El operador sale del tipo de alerta. */
  async guardar(a: Omit<AlertaUsuario, 'id' | 'operador'> & { id?: number }): Promise<void> {
    await this.api.post('alertas.php', { ...a, operador: TIPOS_ALERTA[a.variable].operador });
    await this.cargar();
  }

  async borrar(id: number): Promise<void> {
    await this.api.post('alerta_borrar.php', { id });
    this.alertas$.next((this.alertas$.value ?? []).filter(a => a.id !== id));
  }

  limpiar(): void {
    this.alertas$.next(null);
  }

  /** Alertas activas cuyo umbral se superó, según las mediciones de cada estación. */
  evaluar(mediciones: Map<string, MedicionesEstacion>): AlertaDisparada[] {
    return (this.alertas$.value ?? [])
      .filter(a => a.activa)
      .map(a => {
        const m = mediciones.get(a.estacion_id);
        const valor = !m ? null
          : a.variable === 'temp_min' ? m.minima
            : a.variable === 'temp_max' ? m.temperatura
              : m.lluvia;
        if (valor === null) return null;
        const supera = a.operador === '<=' ? valor <= a.umbral : valor >= a.umbral;
        return supera ? { alerta: a, valor } : null;
      })
      .filter((d): d is AlertaDisparada => d !== null);
  }
}
