import { Pipe, PipeTransform } from '@angular/core';

export interface GruposEstaciones<T> {
  favoritas: T[];
  resto: T[];
}

/**
 * Separa las estaciones de un selector en favoritas (en el orden del usuario) y el resto:
 *   stations | gruposEstaciones:(favoritas$ | async)
 * El tercer argumento es el campo con la identificación ('Identificacion' por defecto).
 */
@Pipe({ name: 'gruposEstaciones', standalone: true })
export class GruposEstacionesPipe implements PipeTransform {
  transform<T>(estaciones: T[] | null | undefined, favoritas: string[] | null | undefined,
    campo = 'Identificacion'): GruposEstaciones<T> {
    const lista = estaciones ?? [];
    const idDe = (e: T) => String((e as Record<string, unknown>)[campo] ?? '');
    const elegidas = (favoritas ?? [])
      .map(id => lista.find(e => idDe(e) === id))
      .filter((e): e is T => !!e);
    return { favoritas: elegidas, resto: lista.filter(e => !elegidas.includes(e)) };
  }
}
