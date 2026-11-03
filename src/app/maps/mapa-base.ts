import * as L from 'leaflet';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { GeoJsonObject } from 'geojson';

/*
 * Mapa base común (B3 del informe de mejoras): calles de OpenStreetMap o imagen satelital de
 * Esri, con el control de capas de Leaflet arriba a la derecha, y el límite de las provincias.
 * Reemplaza las copias de las URL, atribuciones y desplegables «Mapa Base» de cada mapa.
 */

/**
 * zIndex 0: el mapa base queda debajo de cualquier otra capa de mosaicos que se agregue
 * después en el tilePane (capas del visor de Estado actual, NDVI), aunque se cambie de base.
 */
function capaCalles(): L.TileLayer {
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    maxZoom: 19,
    zIndex: 0
  });
}

/** Esri tiene imágenes hasta el nivel 18 en la zona; más cerca se amplían los mosaicos. */
function capaSatelital(): L.TileLayer {
  return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Imágenes &copy; Esri',
    maxNativeZoom: 18,
    maxZoom: 19,
    zIndex: 0
  });
}

/**
 * Agrega el mapa de calles. Con `selector` (por defecto) agrega también el control para pasar a
 * la imagen satelital y lo devuelve, para sumarle capas superpuestas (ver cargarProvincias).
 * Los mapas chicos de una sola estación (ficha, lluvias por campaña) van sin selector.
 */
export function agregarMapaBase(map: L.Map, { selector = true } = {}): L.Control.Layers | undefined {
  const calles = capaCalles().addTo(map);
  if (!selector) return undefined;
  return L.control.layers(
    { 'Calles': calles, 'Satelital': capaSatelital() },
    undefined,
    { position: 'topright' }
  ).addTo(map);
}

/** Estilo común del límite provincial. */
export const ESTILO_PROVINCIAS: L.PathOptions = {
  color: 'blue',
  weight: 1,
  opacity: 0.8,
  fillOpacity: 0
};

/**
 * Dibuja el límite de las provincias en un pane propio, sin capturar clics (no tapa los
 * marcadores ni abre popups con el nombre). Si se pasa el control de capas, se puede ocultar
 * desde ahí. `zIndex`: 350 lo deja debajo de las capas superpuestas (400); el visor de Estado
 * actual lo sube para que el límite se vea sobre sus capas de lluvia, nubes, etc.
 */
export async function cargarProvincias(
  map: L.Map,
  http: HttpClient,
  { control, zIndex = 350 }: { control?: L.Control.Layers; zIndex?: number } = {}
): Promise<L.GeoJSON | undefined> {
  try {
    const datos = await firstValueFrom(http.get<GeoJsonObject>('assets/shapes/provincias.geojson'));
    if (!map.getPane('provincePane')) map.createPane('provincePane').style.zIndex = String(zIndex);
    const capa = L.geoJSON(datos, { pane: 'provincePane', interactive: false, style: ESTILO_PROVINCIAS }).addTo(map);
    control?.addOverlay(capa, 'Límites provinciales');
    return capa;
  } catch (error) {
    console.error('Error al cargar provincias:', error);
    return undefined;
  }
}
