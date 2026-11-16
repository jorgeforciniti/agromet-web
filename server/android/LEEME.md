# `/android/` (PHP de la app móvil)

Los usa la app de `C:\IONIC\agromet` (`environment.agrometBase`). Se suben a mano (WinSCP) a
`/android/` del servidor, junto a `conecta_mysql.php` (no está en el repositorio). En el
repositorio están sólo los que se modificaron desde el sitio; el resto (`io_noticias.php`,
`io_version.php`) sigue sólo en el servidor.

## Depuración de datos

`io_datos.php`, `io_estaciones.php`, `io_rr.php` e `io_temperaturas.php` usan
`/services/depuracion.php` (tiene que estar subido; si no está, responden como antes):

- **Datos actuales de una estación** (`io_datos`, `io_estaciones`): el valor de un sensor dado de
  baja no se manda; se quita la clave, no va en null, porque la app lee null como 0. Sin el valor,
  la pantalla principal usa su estimación de OpenWeatherMap y la marca como estimada.
- **Mapas y listados** (`io_rr?estacion=0`, `io_temperaturas?estacion=0, -1, -2, -3`): se saca la
  estación con la variable de baja en el período.
- **Series de una estación** (`io_rr` e `io_temperaturas` con un id): se sacan los días y los meses
  en que la variable estuvo de baja; la serie de hoy queda vacía si está de baja hoy.
