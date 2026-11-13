import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { VariableSensor } from '../shared/depuracion';

/** API de administración (server/admin/api, instalada en /services/admin). */
export const API_ADMIN = '/services/admin';

export interface InformeCargado {
  id: number;
  titulo: string;
  archivo: string;
  creado: string;
  categoria: string;
}

export interface FiltroInformesAdmin {
  q?: string;
  categoria?: string;
  anio?: string;
  pagina?: number;
}

export interface LluviaEstacion9a9 {
  id: string;
  nombre: string;
  /** null: la estación no tiene registros en el período */
  mm: number | null;
  /** Horas cubiertas por los registros (24 = completo) */
  horas: number;
}

export interface Lluvias9a9 {
  desde: string;
  hasta: string;
  estaciones: LluviaEstacion9a9[];
}

export type EstadoEstacion = 'ok' | 'retraso' | 'sin';

export interface EstacionComunicacion {
  id: string;
  nombre: string;
  estado: EstadoEstacion;
  /** Minutos desde la última trama recibida (null: ninguna en 3 días) */
  min_recepcion: number | null;
  /** AAAA-MM-DD HH:MM:SS del dato más reciente */
  ult_dato: string | null;
  /** Negativo: reloj de la estación adelantado */
  min_dato: number | null;
  errores_1h: number;
}

export interface EventoComunicacion {
  id: number;
  fechahora: string;
  /** 0 hora, 2 ya existía, 3 trama corta, 5 comando web, 7 CRC, 8 recepción, 9 correcto */
  error_c: number;
  estacion: string;
  nombre: string | null;
  detalle: string;
}

export interface Comunicaciones {
  ahora: string;
  resumen: Record<EstadoEstacion, number>;
  estaciones: EstacionComunicacion[];
  eventos: EventoComunicacion[];
  por_tipo: { error_c: number; n: number }[];
}

export type ComandoEstacion = 'hora' | 'borrar';

export interface EstacionControl {
  id: string;
  nombre: string;
  /** dd/mm/aahh:mm guardada en estaciones.fecha_I */
  fecha_i: string | null;
  min_dato: number | null;
}

export interface PedidoEstacion {
  id: number;
  estacion: string;
  nombre: string | null;
  comando: ComandoEstacion;
  fecha_ref: string;
  estado: string;
  creado: string;
  enviado: string | null;
}

export interface ControlEstaciones {
  /** Hora del servidor en dd/mm/aahh:mm */
  ahora: string;
  estaciones: EstacionControl[];
  pendientes: PedidoEstacion[];
  historial: PedidoEstacion[];
}

/** Sensor dado de baja (depuración de datos; tabla estaciones.sensores_baja) */
export interface BajaSensor {
  id: number;
  estacion: string;
  nombre: string | null;
  variable: VariableSensor;
  /** AAAA-MM-DD */
  desde: string;
  /** AAAA-MM-DD; null: sigue de baja */
  hasta: string | null;
  motivo: string;
  cargado_por: string;
  creado: string;
}

export interface SensoresBaja {
  estaciones: { id: string; nombre: string }[];
  bajas: BajaSensor[];
}

export interface DatosBaja {
  desde: string;
  hasta: string | null;
  motivo: string;
}

/** Sensor que parece fallar según el control de datos (control_datos.php) */
export interface AlertaDatos {
  estacion: string;
  nombre: string;
  variable: VariableSensor;
  /** humedad_baja, viento_cero, lluvia_sin_registro… (ver el encabezado de control_datos.php) */
  regla: string;
  problema: string;
  dias: number;
  fechas: string[];
  primera: string;
  ultima: string;
  /** Cuándo empezó la falla (puede ser anterior al período revisado): la fecha desde de la baja */
  inicio: string;
  /** La falla ya estaba el primer día que se revisó (unos 400 días atrás): empezó antes de inicio */
  inicio_limite: boolean;
  /** Día más reciente: valor de la estación y mediana de las vecinas (null si no compara) */
  ejemplo: { fecha: string; valor: number; vecinas: number | null };
  /** El sensor ya está dado de baja */
  de_baja: boolean;
}

export interface ControlDatos {
  desde: string;
  hasta: string;
  dias: number;
  alertas: AlertaDatos[];
}

/** Un día de la serie de El Colmenar (colmenar_diarios.php). */
export interface DiaColmenar {
  fecha: string;
  /** false: el día no tiene fila en la tabla */
  existe: boolean;
  temp_max: number | null;
  temp_min: number | null;
  precipitacion: number | null;
  /** 0 sin lluvia, 1 traza, 2 medible, 3 sin dato */
  estado_pp: number;
  origen: string | null;
  definitivo: boolean;
  observaciones: string | null;
  actualizado_en: string | null;
  /** Sin fila, provisional o con algún valor vacío */
  pendiente: boolean;
}

export interface PeriodoColmenar {
  inicio: string;
  hoy: string;
  desde: string;
  hasta: string;
  dias: DiaColmenar[];
}

export interface AnioPendienteColmenar {
  anio: number;
  dias: number;
  sin_fila: number;
  provisionales: number;
  sin_max: number;
  sin_min: number;
  sin_pp: number;
}

export interface ResumenColmenar {
  inicio: string;
  hoy: string;
  total: number;
  anios: AnioPendienteColmenar[];
}

export interface CargaDiaColmenar {
  fecha: string;
  temp_max: number | null;
  temp_min: number | null;
  precipitacion: number | null;
  traza: boolean;
  observaciones: string;
}

interface RespuestaApi {
  ok: boolean;
  error?: string;
}

/** Pedidos a la API de administración con el token de la sesión (mismo esquema que UsuarioApiService). */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** 20 por página, del último cargado al primero. */
  informes(filtro: FiltroInformesAdmin = {}): Promise<{ informes: InformeCargado[]; total: number }> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtro)) {
      if (valor !== undefined && valor !== null && valor !== '') params = params.set(clave, String(valor));
    }
    return this.pedir('GET', 'pdfs.php', undefined, params);
  }

  cargarInforme(datos: { titulo: string; categoria: string; creado: string; archivo: File }): Promise<InformeCargado> {
    const form = new FormData();
    form.append('titulo', datos.titulo);
    form.append('categoria', datos.categoria);
    form.append('creado', datos.creado);
    form.append('archivo', datos.archivo, datos.archivo.name);
    return this.pedir<{ informe: InformeCargado }>('POST', 'pdfs.php', form).then(r => r.informe);
  }

  editarInforme(datos: Omit<InformeCargado, 'archivo'>): Promise<InformeCargado> {
    return this.pedir<{ informe: InformeCargado }>('POST', 'pdf_editar.php', datos).then(r => r.informe);
  }

  /** Lo saca de /informes; el archivo queda en PDFS/_despublicados/ del servidor. */
  despublicarInforme(id: number): Promise<void> {
    return this.pedir('POST', 'pdf_borrar.php', { id }).then(() => undefined);
  }

  lluvias9a9(fecha: string): Promise<Lluvias9a9> {
    return this.pedir<Lluvias9a9>('GET', 'lluvias9a9.php', undefined, new HttpParams().set('fecha', fecha));
  }

  comunicaciones(): Promise<Comunicaciones> {
    return this.pedir<Comunicaciones>('GET', 'comunicaciones.php');
  }

  controlEstaciones(): Promise<ControlEstaciones> {
    return this.pedir<ControlEstaciones>('GET', 'comandos.php');
  }

  /** Lo envía UDPAdmin en la próxima trama de la estación. Devuelve el mensaje para mostrar. */
  pedirComando(datos: { estacion: string; comando: ComandoEstacion; fecha_ref?: string; confirmar?: string }): Promise<string> {
    return this.pedir<{ mensaje: string }>('POST', 'comandos.php', { accion: 'crear', ...datos }).then(r => r.mensaje);
  }

  cancelarComando(id: number): Promise<string> {
    return this.pedir<{ mensaje: string }>('POST', 'comandos.php', { accion: 'cancelar', id }).then(r => r.mensaje);
  }

  /** Revisa los últimos `dias` días completos (7 a 31) */
  controlDatos(dias: number): Promise<ControlDatos> {
    return this.pedir<ControlDatos>('GET', 'control_datos.php', undefined, new HttpParams().set('dias', String(dias)));
  }

  sensoresBaja(): Promise<SensoresBaja> {
    return this.pedir<SensoresBaja>('GET', 'sensores_baja.php');
  }

  /** Devuelve el mensaje para mostrar */
  darDeBaja(datos: DatosBaja & { estacion: string; variable: VariableSensor }): Promise<string> {
    return this.pedir<{ mensaje: string }>('POST', 'sensores_baja.php', { accion: 'crear', ...datos }).then(r => r.mensaje);
  }

  editarBaja(id: number, datos: DatosBaja): Promise<string> {
    return this.pedir<{ mensaje: string }>('POST', 'sensores_baja.php', { accion: 'editar', id, ...datos }).then(r => r.mensaje);
  }

  borrarBaja(id: number): Promise<string> {
    return this.pedir<{ mensaje: string }>('POST', 'sensores_baja.php', { accion: 'borrar', id }).then(r => r.mensaje);
  }

  /** Años de la serie de El Colmenar con días faltantes, provisionales o con valores vacíos. */
  resumenColmenar(): Promise<ResumenColmenar> {
    return this.pedir<ResumenColmenar>('GET', 'colmenar_diarios.php', undefined, new HttpParams().set('resumen', '1'));
  }

  /** Hasta 366 días; con `pendientes`, sólo los que tienen algo para cargar. */
  diasColmenar(desde: string, hasta: string, pendientes: boolean): Promise<PeriodoColmenar> {
    let params = new HttpParams().set('desde', desde).set('hasta', hasta);
    if (pendientes) params = params.set('pendientes', '1');
    return this.pedir<PeriodoColmenar>('GET', 'colmenar_diarios.php', undefined, params);
  }

  /** Todo o nada. Devuelve cuántos días cambiaron y cómo quedaron los enviados. */
  guardarColmenar(dias: CargaDiaColmenar[]): Promise<{ guardados: number; dias: DiaColmenar[] }> {
    return this.pedir('POST', 'colmenar_diarios.php', { dias });
  }

  private async pedir<T>(metodo: 'GET' | 'POST', archivo: string, cuerpo?: unknown, params?: HttpParams): Promise<T> {
    const usuario = await this.auth.getCurrentUser();
    if (!usuario) {
      throw new Error('Iniciá sesión para usar la administración.');
    }
    const headers = new HttpHeaders({ Authorization: `Bearer ${await usuario.getIdToken()}` });
    try {
      const url = `${API_ADMIN}/${archivo}`;
      const r = await firstValueFrom(metodo === 'GET'
        ? this.http.get<T & RespuestaApi>(url, { headers, params })
        : this.http.post<T & RespuestaApi>(url, cuerpo, { headers }));
      if (!r.ok) throw new Error(r.error || 'No se pudo completar la operación.');
      return r;
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        // Sin la API instalada, el servidor responde la página del sitio (HTML) en vez de JSON
        const texto = (e.error as { text?: unknown } | null)?.text;
        if (e.status === 404 || (typeof texto === 'string' && texto.trimStart().startsWith('<'))) {
          throw new Error('La administración todavía no está instalada en el servidor (falta /services/admin).');
        }
        throw new Error((e.error as RespuestaApi | null)?.error || 'No se pudo conectar con el servidor. Volvé a intentar.');
      }
      throw e;
    }
  }
}
