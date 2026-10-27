import { Pipe, PipeTransform } from '@angular/core';

/** Símbolo común para un dato faltante o inválido en tablas y popups. */
export const SIN_DATO = '—';

/**
 * Valor medido con coma decimal (es-AR), sin redondear ni agregar decimales:
 * "23.4" → "23,4", 5 → "5". Vacío o null → SIN_DATO. Un texto no numérico se muestra tal cual.
 */
export function formatValor(v: number | string | null | undefined): string {
  if (v == null) return SIN_DATO;
  const s = String(v).trim();
  if (s === '') return SIN_DATO;
  if (isNaN(Number(s))) return s;
  return s.replace('.', ',');
}

@Pipe({ name: 'valor', standalone: true })
export class ValorPipe implements PipeTransform {
  transform(v: number | string | null | undefined): string {
    return formatValor(v);
  }
}
