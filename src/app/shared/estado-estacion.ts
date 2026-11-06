/**
 * Estado de comunicación de una estación según la hora de su último dato (fecha_I), común a
 * los mapas, las tarjetas y los popups (B1 y G2 del informe de mejoras): así un valor viejo no
 * se ve igual que uno actual.
 */
export type EstadoComunicacion = 'al-dia' | 'atrasada' | 'sin-datos-hoy';

/** Hasta esta antigüedad el dato se considera al día (las estaciones reportan cada 15 o 30 min) */
export const MINUTOS_AL_DIA = 60;

export const ETIQUETA_ESTADO: Record<EstadoComunicacion, string> = {
  'al-dia': 'Al día (dato de la última hora)',
  'atrasada': 'Atrasada (más de 1 h sin datos)',
  'sin-datos-hoy': 'Sin datos hoy'
};

/**
 * fecha_I de la API: "2026-11-03 09:45:00", en hora local. Se arma a mano porque Safari no
 * interpreta la fecha con espacio en new Date(); también acepta ISO y objetos Date.
 */
export function leerFechaEstacion(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(valor.trim());
  const fecha = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) : new Date(valor);
  return isNaN(fecha.getTime()) ? null : fecha;
}

export function estadoComunicacion(fecha: Date | null, ahora = new Date()): EstadoComunicacion {
  if (!fecha || fecha.toDateString() !== ahora.toDateString()) return 'sin-datos-hoy';
  // Algunas estaciones tienen el reloj adelantado: un dato "futuro" cuenta como al día
  return (ahora.getTime() - fecha.getTime()) / 60000 <= MINUTOS_AL_DIA ? 'al-dia' : 'atrasada';
}

/** "hace 13 min", "hace 2 h 40 min", "hace 3 días" */
export function haceCuanto(fecha: Date, ahora = new Date()): string {
  const min = Math.max(0, Math.round((ahora.getTime() - fecha.getTime()) / 60000));
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h${min % 60 ? ` ${min % 60} min` : ''}`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

/** "Actualizado 09:45 · hace 13 min", o "Último dato: 02/11 18:00 · hace 2 días" si no es de hoy */
export function textoActualizado(fecha: Date | null, ahora = new Date()): string {
  if (!fecha) return 'Sin datos recibidos';
  const pad = (n: number) => String(n).padStart(2, '0');
  const hora = `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
  const hoy = fecha.toDateString() === ahora.toDateString();
  return hoy
    ? `Actualizado ${hora} · ${haceCuanto(fecha, ahora)}`
    : `Último dato: ${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)} ${hora} · ${haceCuanto(fecha, ahora)}`;
}
