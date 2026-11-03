# PHP sueltos de `/services/`

Se suben a mano (WinSCP) a la carpeta `/services/` del servidor, junto a `conecta_mysql.php`
(que no está en el repositorio y define `$conexion` según `$db`).

| Archivo | Uso en el sitio | Tablas (base `estaciones`) |
|---|---|---|
| `normales.php` | Normales mensuales de una estación | `normales` |
| `informes-v2.php` | Listado de informes | — |
| `lluvias-estacion.php` | Diálogo de una estación en «Lluvias por campaña»: ubicación, normales y serie histórica de lluvias mensuales | `estaciones_rr`, `datos_rr_mes` |

## `lluvias-estacion.php`

`GET /services/lluvias-estacion.php?estacion=<identificacion>` devuelve los datos de la estación y
su serie mensual (enero a diciembre por año). Los meses guardados como `-999.9` salen como `null`.
No modifica datos; sólo lee las mismas tablas que `datos-campania.php`.

Para instalarlo: copiar el archivo a `/services/` y probar
`https://agromet.eeaoc.gob.ar/services/lluvias-estacion.php?estacion=<una identificación>`.
