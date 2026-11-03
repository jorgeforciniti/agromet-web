import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { WeatherService, WeatherStation } from './weather.service';
import type { RefFicha } from '../maps/popup';

/** Distancia máxima (en grados) para reconocer una estación por sus coordenadas. */
const TOLERANCIA_GRADOS = 0.01;

/** La lista se vuelve a pedir pasado este tiempo: la ficha muestra el último dato. */
const VIGENCIA_MS = 60_000;

/**
 * Abre la ficha de una estación (FichaEstacionDialogComponent) desde cualquier sección. Los
 * mapas temáticos no traen el registro completo de la estación: la buscan en la lista de
 * estaciones por coordenadas. El id sólo desempata, porque algunas fuentes usan otra numeración
 * (en lluvias mensuales es el id del pluviómetro, que coincide con el de otra estación).
 */
@Injectable({ providedIn: 'root' })
export class FichaEstacionService {
  private lista?: { pedida: number; estaciones: Promise<WeatherStation[]> };

  constructor(
    private readonly dialog: MatDialog,
    private readonly weatherService: WeatherService
  ) { }

  async abrir(estacion: WeatherStation): Promise<void> {
    const { FichaEstacionDialogComponent } = await import('../ficha-estacion-dialog/ficha-estacion-dialog.component');
    this.dialog.open(FichaEstacionDialogComponent, {
      data: estacion,
      width: 'min(760px, 96vw)',
      maxWidth: '96vw',
      autoFocus: false
    });
  }

  /** La estación de la red en ese lugar, o undefined si el punto no es una (un pluviómetro). */
  async buscar(ref: RefFicha): Promise<WeatherStation | undefined> {
    if (!Number.isFinite(ref.lat) || !Number.isFinite(ref.lon)) return undefined;
    try {
      const cerca = (await this.estaciones())
        .map(e => ({ e, d: Math.hypot(Number(e.lat) - ref.lat, Number(e.lon) - ref.lon) }))
        .filter(c => c.d <= TOLERANCIA_GRADOS)
        .sort((a, b) => a.d - b.d);
      return (cerca.find(c => ref.id && c.e.Identificacion === ref.id) ?? cerca[0])?.e;
    } catch (error) {
      console.error('No se pudo obtener la lista de estaciones:', error);
      return undefined;
    }
  }

  async abrirPorReferencia(ref: RefFicha): Promise<void> {
    const estacion = await this.buscar(ref);
    if (estacion) await this.abrir(estacion);
  }

  private estaciones(): Promise<WeatherStation[]> {
    if (!this.lista || Date.now() - this.lista.pedida > VIGENCIA_MS) {
      const estaciones = firstValueFrom(this.weatherService.getStationsAll());
      this.lista = { pedida: Date.now(), estaciones };
      // Si falla, el próximo pedido lo vuelve a intentar
      estaciones.catch(() => this.lista = undefined);
    }
    return this.lista.estaciones;
  }
}
