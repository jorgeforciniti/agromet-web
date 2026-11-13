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
| `resumen-diario.php` | Resumen diario de la red (/datos): máxima, mínima, lluvia, humedad, viento, radiación y demás valores de un día en todas las estaciones | `estaciones`, `datos_diarios` |
| `sensores-baja.php` | Depuración de datos (todo el sitio): sensores dados de baja, que se cargan en /admin | `sensores_baja` |
| `incendio-fwi.php` | Peligro de incendios (/datos): índice meteorológico de peligro de incendios (FWI) del sistema canadiense por estación y día | `estaciones`, `datos_estaciones`, `fwi_diario` (la escribe) |
| `datos-alerta.php` | Estado actual, mapa de lluvias diarias y lluvia acumulada: lluvia y mínimas por estación | `estaciones`, `datos_estaciones` |
| `enso.php` | Estado actual (El Niño y La Niña) y El Colmenar (sección «El Niño y La Niña»): índice RONI de NOAA CPC y estado de alerta | — |
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

## `resumen-diario.php`

`GET /services/resumen-diario.php?fecha=AAAA-MM-DD` devuelve, por estación habilitada que tenga la
fila de ese día en `datos_diarios`, las mismas columnas que `datos-diarios.php` da para una estación
(`temp_max`, `temp_min`, `HR_max`, `HR_min`, `rr_24`, `presion_media_24`, `viento_medio`,
`viento_max`, `rad_solar_media`, `rad_solar_max`, `et`, `hum_hoja_hs`). La fila del día en curso se
va completando durante el día. No modifica datos.

Está instalado y probado en el servidor (noviembre de 2026: 36 estaciones, responde en unos 0,03 s).

Es una sola consulta por fecha (`WHERE fecha = ?`, una fila por estación). Si no está instalado o
falla, el diálogo pide `datos-diarios.php` estación por estación (unos 40 pedidos), así que funciona
igual, pero más lento.

Para instalarlo:

1. Las columnas de `datos_diarios` se revisaron en noviembre de 2026 (`SHOW COLUMNS`); en la tabla la
   humedad es `hr_max`/`hr_min` y la respuesta la devuelve como `HR_max`/`HR_min` (ver `COLUMNAS`).
2. Medir el tiempo real de la consulta (con el `EXPLAIN` no alcanza; ver `datos-alerta.php`):
   tiene que usar el índice de `fecha` y responder en menos de un segundo.
3. Copiar el archivo a `/services/` y probar
   `https://agromet.eeaoc.gob.ar/services/resumen-diario.php?fecha=<hoy>`.

## `sensores-baja.php`

`GET /services/sensores-baja.php` devuelve los sensores dados de baja: estación, variable
(`temperatura`, `humedad`, `viento`, `lluvia`, `radiacion`, `presion` u `hoja`), desde, hasta (`null`
si sigue de baja) y motivo. El sitio no muestra ni usa esos valores en ese período. Las bajas se
cargan en /admin, pestaña «Sensores dados de baja»; la tabla y los permisos están en
`server/admin/LEEME.md`. Si la tabla no existe, devuelve la lista vacía y el sitio sigue sin depurar.

Para instalarlo: copiar el archivo a `/services/` y probar
`https://agromet.eeaoc.gob.ar/services/sensores-baja.php` (tiene que devolver `"status":"success"`).

## `incendio-fwi.php`

Calcula el índice meteorológico de peligro de incendios forestales (FWI) del sistema canadiense,
ajustado al hemisferio sur, según la guía de campo «Tablas para el cálculo del FWI» (Plan Nacional
de Manejo del Fuego, 1998). Usa las ecuaciones de Van Wagner y Pickett (1985), que reproducen las
tablas de la guía. El método, el viento llevado a 10 m (anemómetros a 3 m: +35 %) y el manejo de
los datos faltantes están en el encabezado del archivo.

**Es el único PHP de `/services/` que escribe en la base**: guarda una fila por estación y día en
`fwi_diario` (cada día depende del anterior, así que no se puede calcular al vuelo). Sólo lee
`datos_estaciones` de a un día por consulta y nunca agrupa por fecha.

- `GET ?fecha=AAAA-MM-DD`: el día en todas las estaciones.
- `GET ?estacion=<identificacion>&desde=AAAA-MM-DD&hasta=AAAA-MM-DD`: la serie de una estación
  (hasta 400 días; el gráfico pide 90).
- `GET ?prueba=guia`: el ejemplo de octubre de la guía, calculado sin usar la base, junto a los
  valores de la planilla. FFMC e ISI coinciden; DMC, DC y FWI dan algo más que la planilla (las
  tablas toman el extremo inferior de cada franja de temperatura y humedad).

Cada consulta completa los días que faltan, de a 20, y vuelve a calcular los últimos 2 días (como
mucho cada 30 minutos) por los registros que llegan tarde. El día en curso se calcula desde las 13 h.
La respuesta trae `calculadoHasta` y `pendientes` (días que faltan calcular).

Está instalado y probado en el servidor (13/11/2026). La carga desde el 1/7 llevó 7 pedidos de 7 a
13 s (unos 0,6 s por día) y una consulta ya calculada responde en 0,03 s. El PHP se conecta como
`'invitado'@'%'`, que tiene `SELECT, INSERT, DELETE` sólo sobre `estaciones.fwi_diario`.

Para instalarlo:

1. Revisar con `SHOW COLUMNS FROM datos_estaciones` que la temperatura, la humedad y el viento
   medio sean `temp_af`, `hum_af` y `viento_medio` (son los nombres que devuelve `datos-24hs.php`).
   Si no, cambiarlos en `VARIABLES`. Revisar también que `estaciones` tenga `lat`, `lon`, `alt`,
   `zona` y `tiempo`.
2. Crear la tabla. El usuario de `conecta_mysql.php` tiene que poder hacer `SELECT`, `INSERT` y
   `DELETE` en ella (`REPLACE` borra e inserta):

   ```sql
   CREATE TABLE fwi_diario (
     identificacion VARCHAR(16) NOT NULL,
     fecha DATE NOT NULL,
     temp DECIMAL(4,1) NULL COMMENT 'Temperatura a las 12 h (°C)',
     hr DECIMAL(4,1) NULL COMMENT 'Humedad relativa a las 12 h (%)',
     viento DECIMAL(5,1) NULL COMMENT 'Viento medio a las 12 h llevado a 10 m (km/h)',
     lluvia DECIMAL(6,1) NULL COMMENT 'Lluvia de 12 a 12 h (mm)',
     ffmc DECIMAL(5,2) NULL,
     dmc DECIMAL(7,2) NULL,
     dc DECIMAL(7,2) NULL,
     isi DECIMAL(6,2) NULL,
     bui DECIMAL(7,2) NULL,
     fwi DECIMAL(6,2) NULL,
     estimado VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'JSON con los valores estimados y cómo',
     dias_sin_datos SMALLINT NOT NULL DEFAULT 0,
     calculado DATETIME NOT NULL,
     PRIMARY KEY (identificacion, fecha),
     KEY fecha (fecha)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
   ```

3. Medir el tiempo real de las dos consultas de un día (la del mediodía y la de la lluvia de 12 a
   12 h, en `lecturasMediodia` y `lluviaDelDia`) con una fecha cualquiera: cada una tiene que
   responder en menos de un segundo, como `lluvia-periodo.php` con dos días.
4. Copiar el archivo a `/services/` y abrir `?prueba=guia` (tiene que devolver los 18 días del
   ejemplo).
5. Abrir `?fecha=<hoy>` varias veces, hasta que `pendientes` sea 0. Desde `INICIO` (1/7/2026) son
   unos 135 días: 7 pedidos de 20 días. Cada uno tiene que tardar pocos segundos; si alguno tarda
   mucho, renombrar el archivo a `incendio-fwi.php.off` y revisar `SHOW PROCESSLIST`.

**Sensores dados de baja.** Lee `sensores_baja` y trata esos valores como faltantes. Cuando cambia
esa tabla, borra lo calculado desde la fecha afectada (una baja nueva, desde su fecha; una editada o
borrada, desde `INICIO`) y lo vuelve a calcular de a 20 días por pedido. Para eso guarda la cantidad
de bajas y la fecha del último cambio en `agromet-fwi-bajas.json`, en la carpeta temporal de PHP.

**Cambios de método.** Si se cambia cómo se calcula, subir `VERSION_CALCULO`: el primer pedido con la
versión nueva recalcula todo desde `INICIO`, sin tener que vaciar la tabla. La versión 2 toma como
vecinas las estaciones a menos de 40 km y 400 m de desnivel de cualquier zona (en la 1 tenían que ser
de la misma zona, y La Cruz quedaba sin El Rodeo 1, a 6,7 km, por estar en Pedemonte).

Para volver a calcular todo (por ejemplo, si cambia el método o `INICIO`): `TRUNCATE fwi_diario` y
repetir el paso 5.

Si responde «Error al preparar el guardado del índice de incendios (MySQL N)»: 1142 es que el usuario
de `conecta_mysql.php` no tiene permiso de `INSERT` o `DELETE` en `fwi_diario` (`GRANT SELECT, INSERT, DELETE ON estaciones.fwi_diario TO 'invitado'@'%';`: el host
tiene que ser el de la cuenta con la que entra el PHP, que se ve con
`SELECT user, host FROM mysql.user WHERE user = 'invitado';`), 1146 que no
existe la tabla y 1054 que una columna no coincide con el SQL de arriba.

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
revisar el `EXPLAIN` **y medir el tiempo real** con 90 días (lo pide el mapa de lluvia acumulada): el
`EXPLAIN` no alcanza (ver abajo).

`GET /services/datos-alerta.php` (desde las 12 h de ayer) o `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`
(hasta 400 días) devuelve, por estación, la lluvia total, la máxima de un registro (`maxLluvia`), los
registros con lluvia, la mínima y los registros con helada. No modifica datos. La versión instalada
antes de la máxima diaria tardaba 0,3 s con un mes y 0,9 s con 90 días (noviembre de 2026).

**Lluvia máxima diaria.** Con rango devuelve además `maxLluviaDia` y `fechaMaxLluviaDia`: el día con más
lluvia (`rr_24`, de 0 a 24 h) de `datos_diarios`, que tiene una fila por estación y día. Es una consulta
aparte; si falla, la respuesta sale igual sin esos campos. Sólo cuenta los días que ya tienen su fila en
`datos_diarios`. **No agrupar `datos_estaciones` por fecha:** se probó y, con 90 días, tardó 70 s, aunque
el `EXPLAIN` daba `range` sobre `idx_cub` con «Using index», igual que la versión original.

Para instalarlo: medir antes la consulta de `datos_diarios` (con 1 día, 1 mes y 90 días), guardar el
actual como `datos-alerta.php.ant`, copiar el nuevo a `/services/` y comparar el tiempo de
`?desde=<hace 90 días>&hasta=<ayer>` con el de antes. Si tarda más, volver al `.ant`.

## `pronosticos/smn-alerta-area.php`

Va en `/services/pronosticos/`, junto a `smn_token.php` y `token.json` (no están en el repositorio:
tienen el token del SMN). `GET ...?area=<id>&tipo=1` devuelve las alertas del área y `tipo=2` la
lista de avisos de corto plazo vigentes de Tucumán (`/v1/warning/shortterm?province=90`; esos avisos van
por provincia, no por área, y `area` se ignora). La ruta por área que usaba antes no existe (404); las
rutas están en `https://api-test.smn.gob.ar/v1/swagger-ui.html`. La versión anterior ignoraba `tipo` (leía
una variable inexistente y comparaba con `=`), así que siempre devolvía las alertas.

Usa `api-test.smn.gob.ar`, el entorno de prueba del SMN; conviene confirmar con el SMN si hay que
pasar a la API de producción.

Para instalarlo: copiarlo a `/services/pronosticos/` y probar `?area=3373&tipo=2`: tiene que devolver
una lista (`[]` si no hay avisos vigentes), no un objeto con `error`.

## `enso.php`

`GET /services/enso.php` devuelve el índice RONI (Relative Oceanic Niño Index) de NOAA CPC, una
temporada de 3 meses por valor desde 1950, y el estado del sistema de alerta de CPC (traducido) con
la fecha de su última discusión y de la próxima. No usa la base de datos. Desde 2026 CPC clasifica El
Niño y La Niña con el RONI en lugar del ONI. El sitio calcula las fases (±0,5 °C durante 5 temporadas
seguidas) y la intensidad.

**Se actualiza solo.** Una vez por día baja `RONI.ascii.txt` y la discusión diagnóstica de CPC y los
guarda en `agromet-enso.json`, en la carpeta temporal de PHP (`sys_get_temp_dir()`). Si NOAA no
responde, usa esa copia aunque esté vencida y, si no hay ninguna, la tabla fija del archivo
(`$RONI_FIJO`, copiada el 11/11/2026). El campo `origen` dice de dónde salió (`noaa`, `cache` o
`fijo`); con `fijo` la tarjeta de Estado actual lo aclara.

A mano, y sólo si se quiere:

- **Resumen en castellano** de la discusión vigente: agregarlo en `$RESUMENES` con la fecha de la
  discusión (CPC publica el segundo jueves de cada mes). Si no hay resumen para la fecha vigente, el
  sitio muestra sólo el estado de alerta.
- **Renovar la tabla fija** de vez en cuando (pegar `RONI.ascii.txt` convertido y cambiar
  `FIJO_ACTUALIZADO`). Sólo se usa si nunca se pudo bajar de NOAA.
- Si CPC cambia el texto de la página, el estado queda con la última copia; si aparece un estado de
  alerta nuevo sin traducir, se muestra en inglés (agregarlo a `$ALERTAS`).

El servidor tiene que poder hacer pedidos HTTPS hacia afuera (cURL de PHP o `allow_url_fopen`), igual
que `kp-gfz.php`.

Para instalarlo: copiar el archivo a `/services/` y probar
`https://agromet.eeaoc.gob.ar/services/enso.php`: tiene que traer `"origen":"noaa"` (o `cache` en la
segunda consulta), `datos` desde 1950 y `estado.alerta` en castellano. Hasta que esté instalado, la
tarjeta de Estado actual y la sección del Colmenar muestran un error con «Reintentar».
