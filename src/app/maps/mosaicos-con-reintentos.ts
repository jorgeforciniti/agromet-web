import * as L from 'leaflet';

/** Reintentos por mosaico antes de darlo por fallido. */
const REINTENTOS = 5;
/** Espera antes del primer reintento; crece con cada uno. */
const ESPERA_MS = 400;

type MosaicoConIntentos = HTMLImageElement & { intentos?: number };

/**
 * Capa de mosaicos que reintenta los que fallan. NASA GIBS responde 404 o 502 al azar a mosaicos
 * que sí existen (en noviembre de 2026, entre el 30 y el 40 % de los pedidos), y el mapa quedaba con
 * huecos. Cada reintento agrega `?intento=N` para que el navegador no reutilice la respuesta fallida.
 * El evento 'tileerror' sólo se dispara cuando se agotaron los reintentos, así que una fecha sin
 * imagen (404 en todos los pedidos) se sigue detectando.
 */
const CapaConReintentos = L.TileLayer.extend({
  _tileOnError(done: L.DoneCallback, tile: MosaicoConIntentos, e: Error) {
    const intentos = tile.intentos ?? 0;
    if (intentos >= REINTENTOS) {
      (L.TileLayer.prototype as any)._tileOnError.call(this, done, tile, e);
      return;
    }
    tile.intentos = intentos + 1;
    const url = tile.src.split('?')[0];
    setTimeout(() => {
      // Si el mosaico salió de la vista (zoom o desplazamiento) no hace falta pedirlo de nuevo.
      if (tile.isConnected) {
        tile.src = `${url}?intento=${tile.intentos}`;
      }
    }, ESPERA_MS * tile.intentos);
  }
});

/** Igual que L.tileLayer, pero reintentando los mosaicos que fallan. */
export function capaMosaicosConReintentos(url: string, opciones: L.TileLayerOptions): L.TileLayer {
  return new (CapaConReintentos as any)(url, opciones) as L.TileLayer;
}
