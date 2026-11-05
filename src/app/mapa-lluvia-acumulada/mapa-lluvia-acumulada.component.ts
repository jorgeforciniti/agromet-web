import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable, Subscription, catchError, forkJoin, map, of } from 'rxjs';
import * as L from 'leaflet';
import { OPCIONES_GESTOS } from '../maps/gestos';
import { ZonaProductiva, alternarZona, cargarCapasZonas, crearZonasProductivas } from '../maps/zonas-productivas';
import { agregarMapaBase, cargarProvincias } from '../maps/mapa-base';
import { FilaPopup, conectarBotonesFicha, filasConNormal, popupEstacion } from '../maps/popup';
import { seguirTamanioMapa } from '../maps/map-size';
import { encuadrarTucuman } from '../maps/encuadre';
import { leyendaPlegable } from '../maps/leyenda-plegable';
import { colorPorcentajeNormal, filasLeyendaPorcentajeNormal } from '../maps/paleta-porcentaje-normal';
import { formatDecimal } from '../pipes/valor.pipe';
import { KmzLayerService } from '../services/kmz-layer.service';
import { RainCampaignRecord, RainCampaignStation, WeatherService } from '../services/weather.service';
import { MesCampania } from '../estacion-lluvia-dialog/estacion-lluvia-dialog.component';
import { ComoSeLeeComponent } from '../shared/como-se-lee.component';

/*
 * E6 del informe de mejoras: lluvia acumulada de los últimos 30, 60 y 90 días, comparada con la
 * normal de esos mismos días.
 *  - Usa los pluviómetros de la red EEAOC (datos cargados a mano), no las estaciones automáticas,
 *    que a veces se tapan. Esos datos son mensuales: cada período toma 1, 2 o 3 meses completos
 *    más lo que va del mes en curso (datos-campania-mes-en-curso.php). La normal mensual se
 *    prorratea por día, así la normal cubre exactamente las mismas fechas.
 *  - Contraste: si hay una estación automática a menos de 2 km, se muestra lo que midió en las
 *    mismas fechas (datos-alerta.php) y se avisa cuando midió mucho menos que el pluviómetro.
 */

/** Días nominales de cada período y meses completos que toma antes del mes en curso. */
const PERIODOS = [30, 60, 90] as const;
type Periodo = typeof PERIODOS[number];
const MESES_COMPLETOS: Record<Periodo, number> = { 30: 1, 60: 2, 90: 3 };

const SIN_DATO = -999.9;
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** Distancia máxima a la estación automática con la que se contrasta. */
const MAX_KM_AUTOMATICA = 2;
/** Aviso: el pluviómetro tiene al menos 10 mm y la automática midió menos del 70 %. */
const MIN_MM_AVISO = 10;
const PROPORCION_AVISO = 0.7;

interface RegistroMesEnCurso {
  id: number;
  mm: number | string;
  ultimo: string;
}

interface RespuestaMesEnCurso {
  status: string;
  month?: number;
  year?: number;
  data?: RegistroMesEnCurso[];
}

interface RegistroAlerta {
  identificacion: number | string;
  nombre: string;
  lat: number | string;
  lon: number | string;
  habilitada: number;
  totalLluvia: number | string | null;
}

interface Automatica {
  nombre: string;
  km: number;
  lluvia: number | null;
}

interface Acumulado {
  desde: Date;
  hasta: Date;
  lluvia: number;
  normal: number;
  /** Lo que midió la estación automática cercana en las mismas fechas (si hay). */
  automatica?: Automatica;
}

interface Pluviometro {
  id: number;
  nombre: string;
  lat: number;
  lon: number;
  periodoNormal: string;
  /** Meses de la consulta, con el mes en curso ya completado (para la ficha de lluvias). */
  campania: MesCampania[];
  /** null si al período le falta algún mes cargado. */
  acumulado: Record<Periodo, Acumulado | null>;
}

function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function fechaIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fechaCorta(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** 'aaaa-mm-dd' como fecha local (new Date('aaaa-mm-dd') la toma en UTC). */
function leerFecha(texto: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1;
}

@Component({
  selector: 'app-mapa-lluvia-acumulada',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ComoSeLeeComponent
  ],
  templateUrl: './mapa-lluvia-acumulada.component.html',
  styleUrls: ['./mapa-lluvia-acumulada.component.css']
})
export class MapaLluviaAcumuladaComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Deja de observar el tamaño del contenedor del mapa (ver seguirTamanioMapa). */
  private dejarDeSeguirTamanio?: () => void;
  private map?: L.Map;
  private marcadores = L.layerGroup();
  private pedidos = new Subscription();

  readonly periodos = PERIODOS;
  periodo: Periodo = 30;
  private readonly hoy = new Date();
  /** Primer día de cada período: el 1.º del mes, 1, 2 o 3 meses antes del actual. */
  readonly desde: Record<Periodo, Date> = {
    30: new Date(this.hoy.getFullYear(), this.hoy.getMonth() - 1, 1),
    60: new Date(this.hoy.getFullYear(), this.hoy.getMonth() - 2, 1),
    90: new Date(this.hoy.getFullYear(), this.hoy.getMonth() - 3, 1)
  };
  /** Último día del mes anterior: hasta ahí llegan los pluviómetros sin dato del mes en curso. */
  readonly finMesAnterior = new Date(this.hoy.getFullYear(), this.hoy.getMonth(), 0);
  /** Último dato del mes en curso (null si todavía no hay). */
  ultimoDato: Date | null = null;

  zoneLayers: ZonaProductiva[] = crearZonasProductivas();
  cargando = true;
  error = false;
  pluviometros: Pluviometro[] = [];
  private porId = new Map<number, Pluviometro>();

  constructor(
    private weatherService: WeatherService,
    private http: HttpClient,
    private kmzLayerService: KmzLayerService,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<MapaLluviaAcumuladaComponent>
  ) { }

  ngOnInit(): void {
    const inicio = this.desde[90];
    this.pedidos.add(forkJoin({
      // Desde el mes de inicio trae los meses siguientes con su normal
      campania: this.weatherService.getRainCampaign(inicio.getMonth() + 1, inicio.getFullYear()),
      enCurso: this.weatherService.getRainCurrentMonth<RegistroMesEnCurso>().pipe(
        catchError(() => of(null))
      ) as Observable<RespuestaMesEnCurso | null>
    }).subscribe({
      next: r => {
        this.pluviometros = this.leerPluviometros(r.campania.data ?? [], r.enCurso);
        this.porId = new Map(this.pluviometros.map(p => [p.id, p]));
        this.error = this.pluviometros.length === 0;
        this.cargando = false;
        this.dibujar();
        if (this.pluviometros.length) this.contrastarConAutomaticas();
      },
      error: () => {
        this.cargando = false;
        this.error = true;
      }
    }));
  }

  async ngAfterViewInit(): Promise<void> {
    this.map = L.map('mapaLluviaAcumulada', {
      center: [-27, -65],
      zoom: 8,
      ...OPCIONES_GESTOS   // gestos táctiles y Ctrl+rueda (ver maps/gestos.ts)
    });
    this.dejarDeSeguirTamanio = seguirTamanioMapa(this.map);
    encuadrarTucuman(this.map);

    const control = agregarMapaBase(this.map);
    // Todos los puntos son pluviómetros: «Ver ficha» abre su ficha de lluvias, como en Lluvias mensuales
    conectarBotonesFicha(this.map, {
      buscar: async ref => this.porId.get(Number(ref.id)),
      abrirPorReferencia: ref => this.abrirFichaLluvia(Number(ref.id))
    });
    this.map.createPane('zonePane').style.zIndex = '450';
    this.map.createPane('rainMarkersPane').style.zIndex = '600';
    this.marcadores.addTo(this.map);
    this.agregarLeyenda();
    // Los datos pueden llegar antes que el mapa
    this.dibujar();

    await cargarProvincias(this.map, this.http, { control });
    await cargarCapasZonas(this.zoneLayers, this.kmzLayerService);
    setTimeout(() => this.map?.invalidateSize(), 50);
  }

  ngOnDestroy(): void {
    this.pedidos.unsubscribe();
    this.dejarDeSeguirTamanio?.();
    this.map?.remove();
    // Sin mapa: los pasos que siguen a las cargas asíncronas no tocan un mapa ya destruido
    this.map = undefined;
  }

  /** Fin del período en el título: el último dato del mes en curso, o el fin del mes anterior. */
  get hasta(): Date {
    return this.ultimoDato ?? this.finMesAnterior;
  }

  get dias(): number {
    return diasEntre(this.desde[this.periodo], this.hasta);
  }

  toggleZoneLayer(zone: ZonaProductiva, selected: boolean): void {
    alternarZona(this.map, zone, selected);
  }

  elegirPeriodo(periodo: Periodo): void {
    this.periodo = periodo;
    this.map?.closePopup();
    this.dibujar();
  }

  close(): void {
    this.dialogRef.close();
  }

  private leerPluviometros(datos: RainCampaignStation[], enCurso: RespuestaMesEnCurso | null): Pluviometro[] {
    // El mes en curso sólo vale si es este mes (el servicio podría estar atrasado)
    const delMes = enCurso?.status === 'success' && enCurso.month === this.hoy.getMonth() + 1 && enCurso.year === this.hoy.getFullYear();
    const parciales = new Map<number, { mm: number; ultimo: Date }>();
    for (const r of delMes ? enCurso!.data ?? [] : []) {
      const mm = aNumero(r.mm);
      const ultimo = leerFecha(r.ultimo);
      if (mm !== null && mm >= 0 && ultimo) parciales.set(Number(r.id), { mm, ultimo });
    }
    this.ultimoDato = null;
    for (const p of parciales.values()) {
      if (!this.ultimoDato || p.ultimo > this.ultimoDato) this.ultimoDato = p.ultimo;
    }

    const lista: Pluviometro[] = [];
    for (const p of datos) {
      if (!p.lat || !p.lon) continue;
      const parcial = parciales.get(p.id);
      const campania: MesCampania[] = p.dataset.map(r => ({ ...r }));
      const mesActual = campania.find(r => this.esMes(r, this.hoy));
      if (parcial && mesActual) {
        mesActual.value = parcial.mm;
        mesActual.isCurrent = true;
      }

      const normales = MESES.map(mes => aNumero(p.dataset.find(r => r.month?.toUpperCase() === mes)?.normal));
      const acumulado = {} as Record<Periodo, Acumulado | null>;
      for (const dias of PERIODOS) {
        acumulado[dias] = this.acumular(campania, normales, MESES_COMPLETOS[dias], parcial);
      }
      if (PERIODOS.every(d => acumulado[d] === null)) continue;
      lista.push({
        id: p.id, nombre: p.name, lat: Number(p.lat), lon: Number(p.lon),
        periodoNormal: p.reference_period, campania, acumulado
      });
    }
    return lista;
  }

  private esMes(r: RainCampaignRecord, fecha: Date): boolean {
    return r.year === fecha.getFullYear() && r.month?.toUpperCase() === MESES[fecha.getMonth()];
  }

  /** Meses completos más el mes en curso (si tiene dato). null si falta algún mes completo. */
  private acumular(
    campania: MesCampania[], normales: (number | null)[], meses: number, parcial?: { mm: number; ultimo: Date }
  ): Acumulado | null {
    const desde = new Date(this.hoy.getFullYear(), this.hoy.getMonth() - meses, 1);
    let lluvia = 0;
    for (let i = 0; i < meses; i++) {
      const mes = new Date(desde.getFullYear(), desde.getMonth() + i, 1);
      const r = campania.find(c => this.esMes(c, mes));
      if (!r || r.value === SIN_DATO || r.value < 0) return null;
      lluvia += r.value;
    }
    let hasta = this.finMesAnterior;
    if (parcial) {
      lluvia += parcial.mm;
      hasta = parcial.ultimo;
    }

    // Normal de las mismas fechas: cada día suma la normal de su mes dividida por los días del mes
    let normal = 0;
    for (let d = new Date(desde); d <= hasta; d.setDate(d.getDate() + 1)) {
      const n = normales[d.getMonth()];
      if (n === null || n < 0) return null;
      normal += n / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    }
    return { desde, hasta, lluvia, normal };
  }

  /**
   * Pide a datos-alerta.php la lluvia de las automáticas en las mismas fechas de cada período
   * (como mucho dos finales distintos por período: con y sin mes en curso) y la cruza con el
   * pluviómetro más cercano. Si falla, el mapa sigue igual, sin contraste.
   */
  private contrastarConAutomaticas(): void {
    const consultas = new Map<string, { desde: Date; hasta: Date }>();
    for (const p of this.pluviometros) {
      for (const dias of PERIODOS) {
        const a = p.acumulado[dias];
        if (a) consultas.set(`${fechaIso(a.desde)}_${fechaIso(a.hasta)}`, { desde: a.desde, hasta: a.hasta });
      }
    }
    const pedidos: Record<string, Observable<RegistroAlerta[] | null>> = {};
    for (const [clave, c] of consultas) {
      pedidos[clave] = this.weatherService.getRains<RegistroAlerta>(fechaIso(c.desde), fechaIso(c.hasta)).pipe(
        map(r => r.data ?? []),
        catchError(() => of(null))
      );
    }
    this.pedidos.add(forkJoin(pedidos).subscribe(respuestas => {
      for (const p of this.pluviometros) {
        for (const dias of PERIODOS) {
          const a = p.acumulado[dias];
          const automaticas = a && respuestas[`${fechaIso(a.desde)}_${fechaIso(a.hasta)}`];
          if (a && automaticas) a.automatica = this.automaticaCercana(p, automaticas);
        }
      }
      this.dibujar();
    }));
  }

  private automaticaCercana(p: Pluviometro, automaticas: RegistroAlerta[]): Automatica | undefined {
    let mejor: Automatica | undefined;
    for (const r of automaticas) {
      const lat = aNumero(r.lat);
      const lon = aNumero(r.lon);
      if (!(r.habilitada > 0) || !lat || !lon) continue;
      const km = distanciaKm(p.lat, p.lon, lat, lon);
      if (km <= MAX_KM_AUTOMATICA && (!mejor || km < mejor.km)) {
        mejor = { nombre: r.nombre, km, lluvia: aNumero(r.totalLluvia) };
      }
    }
    return mejor;
  }

  private conAviso(a: Acumulado): boolean {
    const auto = a.automatica?.lluvia;
    return auto != null && a.lluvia >= MIN_MM_AVISO && auto < a.lluvia * PROPORCION_AVISO;
  }

  private dibujar(): void {
    if (!this.map) return;
    this.marcadores.clearLayers();
    for (const p of this.pluviometros) {
      const a = p.acumulado[this.periodo];
      if (!a) continue;
      const aviso = this.conAviso(a);
      L.circleMarker([p.lat, p.lon], {
        pane: 'rainMarkersPane',
        radius: aviso ? 9 : 8,
        fillColor: colorPorcentajeNormal(a.lluvia, a.normal),
        color: '#000',
        weight: aviso ? 3 : 1,
        dashArray: aviso ? '4 3' : undefined,
        fillOpacity: 0.9
      })
        .bindPopup(popupEstacion({
          titulo: p.nombre,
          subtitulos: [
            `Del ${fechaCorta(a.desde)} al ${fechaCorta(a.hasta)} (${diasEntre(a.desde, a.hasta)} días)`,
            p.periodoNormal ? `Normal ${p.periodoNormal}` : ''
          ],
          filas: this.filasPopup(p, a),
          ficha: { id: String(p.id), lat: p.lat, lon: p.lon }
        }))
        .bindTooltip(`${formatDecimal(a.lluvia, 1)} mm`, { direction: 'right', offset: [8, 0], className: 'rain-value-label' })
        .addTo(this.marcadores);
    }
  }

  /** El período elegido con su normal y desvío; los otros dos, con el porcentaje de la normal; y el contraste. */
  private filasPopup(p: Pluviometro, a: Acumulado): FilaPopup[] {
    const filas = filasConNormal('Lluvia del período', a.lluvia, a.normal, 'mm');
    for (const dias of PERIODOS) {
      const otro = p.acumulado[dias];
      if (dias === this.periodo || !otro) continue;
      const porcentaje = otro.normal > 0 ? ` (${formatDecimal((otro.lluvia / otro.normal) * 100, 0)} % de la normal)` : '';
      filas.push({ etiqueta: `Período de ${dias} días`, valor: `${formatDecimal(otro.lluvia, 1)} mm${porcentaje}` });
    }
    const auto = a.automatica;
    if (auto) {
      const distancia = auto.km < 0.5 ? '' : ` (a ${formatDecimal(auto.km, 1)} km)`;
      filas.push({
        etiqueta: `Estación automática ${auto.nombre}${distancia}`,
        valor: auto.lluvia === null ? 'sin dato' : `${formatDecimal(auto.lluvia, 1)} mm`
      });
      if (this.conAviso(a)) {
        filas.push({ etiqueta: 'Aviso', valor: 'la automática midió mucho menos; puede tener el pluviómetro obstruido', destacada: true });
      }
    }
    return filas;
  }

  /** Ficha de lluvias del pluviómetro (la de Lluvias por campaña), en la vista del total. */
  private async abrirFichaLluvia(id: number): Promise<void> {
    const p = this.porId.get(id);
    if (!p) return;
    const inicio = this.desde[90];
    const { EstacionLluviaDialogComponent } = await import('../estacion-lluvia-dialog/estacion-lluvia-dialog.component');
    this.dialog.open(EstacionLluviaDialogComponent, {
      data: {
        id: p.id,
        name: p.nombre,
        lat: p.lat,
        lon: p.lon,
        referencePeriod: p.periodoNormal,
        inicioMes: inicio.getMonth() + 1,
        inicioAnio: inicio.getFullYear(),
        campania: p.campania,
        mesIdx: null
      },
      width: 'min(900px, 96vw)',
      maxWidth: '96vw',
      panelClass: 'do-dialog',
      autoFocus: false
    });
  }

  private agregarLeyenda(): void {
    const leyenda = new L.Control({ position: 'bottomright' });
    leyenda.onAdd = () => {
      const div = L.DomUtil.create('div', 'info legend');
      div.innerHTML = `<div class="legend-title">% de la normal</div>${filasLeyendaPorcentajeNormal()}` +
        `<i style="width:12px; height:12px; display:inline-block; margin-right:6px; border-radius:50%; border:3px dashed #000; box-sizing:content-box;"></i>` +
        ' La automática cercana<br>midió mucho menos<br>';
      return leyendaPlegable(div);
    };
    leyenda.addTo(this.map!);
  }
}
