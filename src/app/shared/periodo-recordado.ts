/*
 * Último período (desde/hasta) elegido en cada herramienta de "Datos y estadísticas" (C4 del
 * informe de mejoras). Se guarda en localStorage con las fechas fijas y vence a las 24 h de
 * haberlo elegido; después vuelve el período por defecto de la herramienta.
 *
 * Prioridad al abrir: enlace o consulta guardada (data.consulta) > período recordado > por defecto.
 */
import { Consulta, Herramienta, fechaIso, leerFecha } from './enlace-consulta';

const PREFIJO = 'agromet.periodo.';
const VIGENCIA_MS = 24 * 60 * 60 * 1000;

export interface RangoFechas {
  desde: Date;
  hasta: Date;
}

interface PeriodoGuardado {
  desde: string;
  hasta: string;
  /** Momento en que se eligió (ms) */
  elegido: number;
}

/**
 * Período recordado de la herramienta, o null si la consulta trae fechas, no hay nada guardado,
 * venció o no es válido.
 */
export function periodoRecordado(herramienta: Herramienta, consulta: Consulta = {}): RangoFechas | null {
  if (consulta['desde'] || consulta['hasta']) return null;
  const guardado = leer(herramienta);
  if (!guardado) return null;
  const desde = leerFecha(guardado.desde);
  const hasta = leerFecha(guardado.hasta);
  if (!desde || !hasta || desde > hasta) return null;
  return { desde, hasta };
}

/**
 * Guarda el período consultado. Si es el período por defecto, borra lo guardado; si es el mismo
 * que ya estaba, no renueva el plazo (vence a las 24 h de elegirlo, no de la última consulta).
 */
export function recordarPeriodo(herramienta: Herramienta, desde: Date, hasta: Date, porDefecto: RangoFechas): void {
  if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) return;
  const nuevo = { desde: fechaIso(desde), hasta: fechaIso(hasta) };
  try {
    if (nuevo.desde === fechaIso(porDefecto.desde) && nuevo.hasta === fechaIso(porDefecto.hasta)) {
      localStorage.removeItem(PREFIJO + herramienta);
      return;
    }
    const anterior = leer(herramienta);
    if (anterior && anterior.desde === nuevo.desde && anterior.hasta === nuevo.hasta) return;
    const guardado: PeriodoGuardado = { ...nuevo, elegido: Date.now() };
    localStorage.setItem(PREFIJO + herramienta, JSON.stringify(guardado));
  } catch {
    // Sin localStorage (navegación privada, bloqueado): no se recuerda
  }
}

/** Lo guardado y vigente; si venció o está dañado, lo borra y devuelve null. */
function leer(herramienta: Herramienta): PeriodoGuardado | null {
  try {
    const texto = localStorage.getItem(PREFIJO + herramienta);
    if (!texto) return null;
    const g = JSON.parse(texto) as Partial<PeriodoGuardado> | null;
    const edad = Date.now() - Number(g?.elegido);
    if (typeof g?.desde === 'string' && typeof g.hasta === 'string' && edad >= 0 && edad < VIGENCIA_MS) {
      return g as PeriodoGuardado;
    }
    localStorage.removeItem(PREFIJO + herramienta);
  } catch {
    // Sin localStorage o JSON inválido: se usa el período por defecto
  }
  return null;
}
