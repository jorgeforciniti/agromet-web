# PHP sueltos de `/services/`

Se suben a mano (WinSCP) a la carpeta `/services/` del servidor, junto a `conecta_mysql.php`
(que no está en el repositorio y define `$conexion` según `$db`).

| Archivo | Uso en el sitio | Tablas (base `estaciones`) |
|---|---|---|
| `normales.php` | Normales mensuales de una estación | `normales` |
| `informes-v2.php` | Listado de informes | — |
| `lluvias-estacion.php` | Diálogo de una estación en «Lluvias por campaña»: ubicación, normales y serie histórica de lluvias mensuales | `estaciones_rr`, `datos_rr_mes` |
| `lluvia-periodo.php` | Mapa de lluvias diarias: lluvia de 0 a 24 h o de 9 a 9 h y cantidad de registros por estación | `estaciones`, `datos_estaciones` |
| `datos-temperatura.php` | Mapa de temperaturas: medias y extremos del período por estación | `estaciones`, `datos_diarios` |
| `kp-gfz.php` | Condiciones para aplicar: Kp de GFZ Potsdam para fechas pasadas (proxy, sin CORS) | — |
| `datos-alerta.php` | Estado actual, mapa de lluvias diarias y lluvia acumulada: lluvia y mínimas por estación | `estaciones`, `datos_estaciones` |
| `pronosticos/smn-alerta-area.php` | Alertas del SMN por área (`tipo=1`) y avisos de corto plazo (`tipo=2`) | — |

## `normales.php`

`GET /services/normales.php?estacion=<identificacion>` devuelve las normales mensuales de la
estación (ver el encabezado del archivo).

**Período de referencia.** Cada estación tiene normales de un período distinto, y el sitio lo
muestra junto a los gráficos cuando la API lo trae. `normales.php` lo busca en la misma fila de
`normales` (sin distinguir mayúsculas), en este orden:

- un par de columnas de años: `periodo_desde`/`periodo_hasta`, `periodo_inicio`/`periodo_fin`,
  `anio_desde`/`anio_hasta`, `ano_desde`/`ano_hasta`, `anio_inicio`/`anio_fin`, `desde`/`hasta` o
  `inicio`/`fin` → `"periodo": {"desde": 1991, "hasta": 2020}`;
- o una columna de texto: `periodo`, `periodo_referencia`, `periodo_ref`, `anios`, `años` o `anos`
  → `"periodo": "1991-2020"`.

Si no encuentra ninguna, no envía `periodo` y el sitio no lo muestra (no se rompe nada).
**Pendiente:** la tabla `normales` no tiene columnas de período (revisado en noviembre de 2026).
Hay que agregarlas y cargar el período de cada estación (lo da la Sección):

```sql
ALTER TABLE normales
  ADD COLUMN periodo_desde SMALLINT NULL AFTER identificacion,
  ADD COLUMN periodo_hasta SMALLINT NULL AFTER periodo_desde;
UPDATE normales SET periodo_desde = 1991, periodo_hasta = 2020 WHERE identificacion = <estación>;
```

Hasta entonces no se puede saber desde afuera si en el servidor está la versión nueva de
`normales.php`: las dos responden igual sin período. Con el primer período cargado, si la respuesta
no trae `periodo`, hay que volver a subir el archivo.

Para instalarlo: copiar el archivo a `/services/` y probar
`https://agromet.eeaoc.gob.ar/services/normales.php?estacion=<una identificación>`.

## `lluvias-estacion.php`

`GET /services/lluvias-estacion.php?estacion=<identificacion>` devuelve los datos de la estación y
su serie mensual (enero a diciembre por año). Los meses guardados como `-999.9` salen como `null`.
No modifica datos; sólo lee las mismas tablas que `datos-campania.php`.

Para instalarlo: copiar el archivo a `/services/` y probar
`https://agromet.eeaoc.gob.ar/services/lluvias-estacion.php?estacion=<una identificación>`.

## `lluvia-periodo.php`

**Cuidado.** La primera versión trabó la base de estaciones: consultas de más de 10 minutos con las
tablas bloqueadas, que hubo que matar con `KILL` (el JOIN con un OR entre fecha y hora recorría la tabla
entera). La versión actual filtra por un rango de `fecha` y usa el índice `Fecha` (EXPLAIN de noviembre
de 2026: `range` sobre `Fecha`, ~7.300 filas para dos días). Además acepta hasta 31 días y lleva la
pista `MAX_EXECUTION_TIME(15000)` (MySQL 5.7.8 o posterior la corta a los 15 s; MariaDB y versiones
anteriores la ignoran). Está instalado y probado en el servidor (noviembre de 2026), y el sitio lo usa
(`LLUVIA_PERIODO_HABILITADA = true` en `map-rain.component.ts`). Si hay que reinstalarlo o cambia la
consulta, volver a probarlo antes de habilitarlo:

1. Subirlo y abrir, de a uno, `?desde=<hoy>&hasta=<hoy>&dia=pluviometrico` y después un mes
   (`desde=<día 1>&hasta=<día 31>`). Cada uno tiene que responder en pocos segundos.
2. Si alguno tarda, renombrarlo a `lluvia-periodo.php.off`, poner `LLUVIA_PERIODO_HABILITADA = false`
   y revisar `SHOW PROCESSLIST` por si quedó una consulta colgada (`KILL <Id>`).

`GET /services/lluvia-periodo.php?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&dia=calendario|pluviometrico`
devuelve, por estación, la lluvia del período (`mm`, `null` si no tiene registros), la máxima de un
registro, la cantidad de registros, los registros con más de 0,3 mm y las horas que cubren sus
registros, junto con las horas transcurridas del período (`horasPeriodo`). Con `dia=pluviometrico`
cada día va de las 9 h del día anterior a las 9 h de la fecha. Es la misma consulta que
«Lluvias 9 a 9» de `/admin` (`server/admin/api/lluvias9a9.php`), pública y para varios días (hasta
31). No modifica datos.

El mapa de lluvias diarias lo usa para el botón «De 9 a 9 h» y para marcar las estaciones con
registros que cubren menos del 90 % del período. Si no está instalado, el mapa sigue funcionando de
0 a 24 h con `datos-alerta.php`, avisa que no puede marcar las incompletas y la vista de 9 a 9 h no
está disponible.

Para instalarlo: copiar el archivo a `/services/` (usa `conecta_mysql.php` con la base
`estaciones`) y probar
`https://agromet.eeaoc.gob.ar/services/lluvia-periodo.php?desde=<hoy>&hasta=<hoy>&dia=pluviometrico`.

## `datos-temperatura.php`

`GET /services/datos-temperatura.php?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` devuelve, por estación
habilitada, las medias de máxima, mínima y media del período, las extremas absolutas con su fecha y
los días con registro. No modifica datos.

Los días con `temp_max` o `temp_min` fuera de −25 a 50 °C (valores erróneos o de relleno) no entran
en los promedios ni en los extremos de esa variable; la media del día sólo se calcula si las dos son
válidas. Además de `count_records` (todas las filas), devuelve `dias_max`, `dias_min` y `dias_media`
(días válidos de cada variable), que el mapa usa para marcar las estaciones incompletas. Si el
servidor tiene la versión anterior, el mapa sigue funcionando con `count_records`.

El filtro va dentro de los agregados: el `WHERE` es el mismo que antes, así que lee las mismas filas.
Igual, antes de instalarlo, revisar el `EXPLAIN` de la consulta (está en el archivo) con un mes.

Para instalarlo: copiar el archivo a `/services/` (reemplaza al anterior; guardar una copia como
`datos-temperatura.php.ant`) y probar
`https://agromet.eeaoc.gob.ar/services/datos-temperatura.php?desde=<día 1>&hasta=<hoy>`.

## `kp-gfz.php`

Proxy del índice Kp de GFZ Potsdam (`https://kp.gfz.de/app/json/`), que no permite CORS.
«Condiciones para aplicar» lo usa para el Kp de cada intervalo de 3 h en fechas de más de una
semana (para la última semana usa el feed de NOAA). No usa la base de datos.

`GET /services/kp-gfz.php?start=AAAA-MM-DDThh:mm:ssZ&end=AAAA-MM-DDThh:mm:ssZ&index=Kp` devuelve la
respuesta de GFZ tal cual. Acepta hasta 31 días; si GFZ no responde en 10 s o responde otra cosa,
devuelve un error 502 y el sitio sigue con NOAA (usa el último Kp publicado y lo aclara).

El servidor tiene que poder hacer pedidos HTTPS hacia afuera (cURL de PHP o `allow_url_fopen`).

Para instalarlo: copiar el archivo a `/services/` y probar
`https://agromet.eeaoc.gob.ar/services/kp-gfz.php?start=2026-10-01T03:00:00Z&end=2026-10-02T03:00:00Z&index=Kp`
(tiene que devolver `"Kp":[...]` y `"datetime":[...]`).

## `datos-alerta.php`

**Cuidado:** consulta `datos_estaciones` (más de 20 millones de filas). Antes de instalar un cambio,
revisar el `EXPLAIN` con un mes y con 90 días (lo pide el mapa de lluvia acumulada).

`GET /services/datos-alerta.php` (desde las 12 h de ayer) o `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`
(hasta 400 días) devuelve, por estación, la lluvia total, la máxima de un registro (`maxLluvia`), los
registros con lluvia, la mínima y los registros con helada. Con rango agrupa por estación y día, y
PHP suma los días; así devuelve además la lluvia máxima de un día de 0 a 24 h y su fecha
(`maxLluviaDia`, `fechaMaxLluviaDia`), que el mapa de lluvias diarias muestra en períodos de más de
un día. Sin rango esos campos van `null`. No modifica datos.

Para instalarlo: guardar el actual como `datos-alerta.php.ant`, copiar el nuevo a `/services/` y
probar `https://agromet.eeaoc.gob.ar/services/datos-alerta.php?desde=<día 1>&hasta=<hoy>`. Si tarda,
volver al `.ant` y revisar `SHOW PROCESSLIST`.

## `pronosticos/smn-alerta-area.php`

Va en `/services/pronosticos/`, junto a `smn_token.php` y `token.json` (no están en el repositorio:
tienen el token del SMN). `GET ...?area=<id>&tipo=1` devuelve las alertas del área y `tipo=2` los
avisos de corto plazo (`/v1/warning/shortterm/area/<id>/`). La versión anterior ignoraba `tipo` (leía
una variable inexistente y comparaba con `=`), así que siempre devolvía las alertas.

Usa `api-test.smn.gob.ar`, el entorno de prueba del SMN; conviene confirmar con el SMN si hay que
pasar a la API de producción.

Para instalarlo: copiarlo a `/services/pronosticos/` y comparar `?area=<id>&tipo=1` con `tipo=2`
(tienen que ser distintos, salvo que no haya alertas ni avisos).
