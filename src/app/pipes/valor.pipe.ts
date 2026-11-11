import { Pipe, PipeTransform } from '@angular/core';

/** Símbolo común para un dato faltante o inválido en tablas y popups. */
export const SIN_DATO = '—';

/**
 * Valor medido con coma decimal (es-AR), sin redondear ni agregar decimales:
 * "23.4" → "23,4", 5 → "5". Con `decimales`, redondea a esa cantidad fija: 5 → "5,0".
 * Vacío o null → SIN_DATO. Un texto no numérico se muestra tal cual.
 */
export function formatValor(v: number | string | null | undefined, decimales?: number): string {
  if (v == null) return SIN_DATO;
  const s = String(v).trim();
  if (s === '') return SIN_DATO;
  if (isNaN(Number(s))) return s;
  if (decimales !== undefined) return formatDecimal(Number(s), decimales);
  return s.replace('.', ',');
}

/** Igual que n.toFixed(decimales) pero con coma decimal, para textos armados en código (popups, leyendas). */
export function formatDecimal(n: number, decimales = 1): string {
  return n.toFixed(decimales).replace('.', ',');
}

@Pipe({ name: 'valor', standalone: true })
export class ValorPipe implements PipeTransform {
  transform(v: number | string | null | undefined, decimales?: number): string {
    return formatValor(v, decimales);
  }
}
