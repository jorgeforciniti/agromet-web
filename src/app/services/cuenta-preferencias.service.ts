import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { User } from '@angular/fire/auth';
import { AuthService } from './auth.service';
import { FavoritasEstaciones, StationService } from './station.service';

/** API de usuario (server/usuario/api, instalada en /services/usuarios). Mismo dominio en
 *  producción; en desarrollo pasa por proxy.conf.json. */
const API = '/services/usuarios';

interface RespuestaPreferencias {
  ok: boolean;
  error?: string;
  favoritas?: string[];
  predeterminada?: string | null;
}

/**
 * Favoritas y predeterminada de la cuenta (Etapa 2, ver docs/etapa-2-diseno.md).
 *
 * - Al iniciar sesión las pide al servidor y StationService pasa a mostrarlas; mientras
 *   responde, muestra la copia local de esa misma cuenta, si la hay.
 * - Cada cambio se envía al servidor agrupando los clics (1 s).
 * - Al cerrar sesión vuelven las favoritas del visitante.
 * - Si el servidor no responde (o la API todavía no está publicada), sigue en modo visitante:
 *   nada se pierde y el sitio funciona como en la Etapa 1.
 */
@Injectable({ providedIn: 'root' })
export class CuentaPreferenciasService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly stations = inject(StationService);

  /** Favoritas del navegador que se pueden pasar a una cuenta que todavía no tiene (0 = no ofrecer) */
  readonly ofrecerImportar$ = new BehaviorSubject<number>(0);

  private usuario: User | null = null;
  private pendiente?: FavoritasEstaciones;
  private timer?: ReturnType<typeof setTimeout>;

  /** Se llama una vez al arrancar la aplicación (AppComponent). */
  iniciar(): void {
    this.auth.getUserObservable()
      .pipe(map(u => u ?? null), distinctUntilChanged((a, b) => a?.uid === b?.uid))
      .subscribe(u => void this.cambioDeSesion(u));
  }

  /** Respuesta al ofrecimiento: pasa las favoritas del navegador a la cuenta, o no vuelve a preguntar. */
  responderImportacion(importar: boolean): void {
    const uid = this.usuario?.uid;
    this.ofrecerImportar$.next(0);
    if (!uid) return;
    this.recordarRespuesta(uid);
    if (importar) {
      const v = this.stations.favoritasVisitante;
      v.favoritas.forEach(id => {
        if (!this.stations.esFavorita(id)) this.stations.alternarFavorita(id);
      });
      if (v.predeterminada) this.stations.setPredeterminada(v.predeterminada);
    }
  }

  private async cambioDeSesion(usuario: User | null): Promise<void> {
    await this.enviarPendiente();
    this.usuario = usuario;
    this.ofrecerImportar$.next(0);

    if (!usuario) {
      this.stations.volverAVisitante();
      return;
    }

    const guardar = (p: FavoritasEstaciones) => this.programarGuardado(p);
    const copia = this.stations.copiaCuenta(usuario.uid);
    if (copia) {
      this.stations.usarCuenta(usuario.uid, copia, guardar);
    }

    try {
      const r = await firstValueFrom(this.http.get<RespuestaPreferencias>(`${API}/preferencias.php`,
        { headers: await this.cabeceras(usuario) }));
      if (!r.ok || this.usuario?.uid !== usuario.uid) return;
      const prefs = { favoritas: r.favoritas ?? [], predeterminada: r.predeterminada ?? null };
      this.stations.usarCuenta(usuario.uid, prefs, guardar);

      const delNavegador = this.stations.favoritasVisitante.favoritas.length;
      if (!prefs.favoritas.length && delNavegador && !this.yaRespondio(usuario.uid)) {
        this.ofrecerImportar$.next(delNavegador);
      }
    } catch {
      // API no disponible: sin copia, se sigue con las favoritas del visitante
      if (!copia) this.stations.volverAVisitante();
    }
  }

  private programarGuardado(p: FavoritasEstaciones): void {
    this.pendiente = p;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.enviarPendiente(), 1000);
  }

  private async enviarPendiente(): Promise<void> {
    clearTimeout(this.timer);
    const p = this.pendiente;
    const usuario = this.usuario;
    this.pendiente = undefined;
    if (!p || !usuario) return;
    try {
      await firstValueFrom(this.http.post(`${API}/preferencias.php`, p, { headers: await this.cabeceras(usuario) }));
    } catch {
      // Queda en la copia local; se reenvía con el próximo cambio
      if (!this.pendiente) this.pendiente = p;
    }
  }

  private async cabeceras(usuario: User): Promise<HttpHeaders> {
    return new HttpHeaders({ Authorization: `Bearer ${await usuario.getIdToken()}` });
  }

  private yaRespondio(uid: string): boolean {
    try {
      return localStorage.getItem(`agromet.importacion.${uid}`) === '1';
    } catch {
      return false;
    }
  }

  private recordarRespuesta(uid: string): void {
    try {
      localStorage.setItem(`agromet.importacion.${uid}`, '1');
    } catch {
      // sin almacenamiento: se volverá a preguntar
    }
  }
}
