# API de administración (instalada en /services/admin): instalación en el servidor

Reemplaza `admin.php` + `admin-pdfs.php` (carga de informes), `RR9a9.php` (lluvias de 9 a 9) y el
visor de estaciones (`/web/visor`: `index.php`, `datos.php` y `control.php`). La usa
la página `/admin` del sitio, que sólo ven las cuentas de `ADMINISTRADORES` en `api/config.php`.

El acceso se controla en el servidor: cada pedido trae el token de Firebase de la sesión y la API
exige que el email esté en la lista **y** confirmado. Ocultar el menú en el sitio es sólo comodidad.

Necesita la API de usuarios ya instalada en `/services/usuarios` (reutiliza su `firebase_token.php`).

## 1. Subir los archivos

Con WinSCP, copiar la carpeta `api/` a `public_html/services/admin/` (incluido `.htaccess`, que es un
archivo oculto: activar "Mostrar archivos ocultos").

## 2. Conexión a la base

Copiar el `admin-conecta.php` que usaba `admin.php` a `public_html/services/admin/conecta_admin.php`.
Tiene que poder escribir en la base `admin` (tabla `pdfs`) y leer `estaciones` (`estaciones` y
`datos_estaciones`). El `.htaccess` impide pedirlo desde afuera y **no se sube al repositorio**
(tiene la contraseña).

Para las pestañas **Comunicaciones** y **Control de estaciones**, la base `estaciones` de ese
servidor tiene que tener las tablas que escribe UDPAdmin (`comunicaciones` y `comandos_estaciones`), y
el usuario de la conexión necesita leer `comunicaciones` y leer, insertar y modificar
`comandos_estaciones`. Si no están o falta el permiso, la pestaña lo dice (no rompe el resto).

Antes el visor sólo se podía abrir desde la red interna (192.168.x.x) y el control pedía una
contraseña. Ahora vale el mismo control que el resto de la administración: cuenta de la lista con el
email confirmado. Cada pedido de control queda anotado en `comandos.log` (fecha, email, IP y
estación), que no se puede leer desde afuera.

### Sensores dados de baja

La pestaña **Sensores dados de baja** guarda en la base `estaciones` qué sensores dan valores
erróneos (depuración de datos). Todo el sitio lee esa tabla con `/services/sensores-baja.php` y deja
de usar esos valores. Crear la tabla y darle permiso al usuario de `conecta_admin.php` (escribe) y a
`'invitado'@'%'`, el de `conecta_mysql.php` (lee; si ya tiene `SELECT` sobre `estaciones.*`, no hace
falta):

```sql
CREATE TABLE estaciones.sensores_baja (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  identificacion VARCHAR(16) NOT NULL,
  variable VARCHAR(20) NOT NULL COMMENT 'temperatura, humedad, viento, lluvia, radiacion, presion u hoja',
  desde DATE NOT NULL,
  hasta DATE NULL COMMENT 'NULL: sigue de baja',
  motivo VARCHAR(255) NOT NULL,
  cargado_por VARCHAR(120) NOT NULL,
  creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modificado DATETIME NULL,
  PRIMARY KEY (id),
  KEY estacion_variable (identificacion, variable)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

GRANT SELECT, INSERT, UPDATE, DELETE ON estaciones.sensores_baja TO '<usuario de conecta_admin.php>'@'<host>';
GRANT SELECT ON estaciones.sensores_baja TO 'invitado'@'%';
```

La pestaña **Control de datos** (`control_datos.php`) propone qué dar de baja: compara cada estación
con sus vecinas en `datos_diarios` (sólo lectura, la misma que ya tiene `conecta_admin.php` sobre
`estaciones`). Con 31 días son unas 1.300 filas por el índice de fecha; responde en menos de un
segundo. Además busca hasta 400 días atrás cuándo empezó cada falla («Falla desde»): la baja va desde ese día,
porque los datos anteriores del sensor son buenos. Lee unas 16.000 filas de `datos_diarios`. El botón
«Dar de baja…» de cada alerta abre la pestaña de sensores con los datos precargados; ahí también se
puede corregir la fecha desde de una baja ya cargada.

Cada alta, cambio o borrado queda anotado en `sensores.log` (fecha, email y qué cambió), que no se
puede leer desde afuera. Si falta la tabla o el permiso, la pestaña lo dice.

Para la pestaña **El Colmenar** (carga de la serie diaria) hace falta otra conexión, con la base
`colmenar`: copiar `api/conecta_colmenar.ejemplo.php` como `conecta_colmenar.php` en la misma
carpeta y completar el host y el puerto (los de `/api/config.ini`), el usuario y la contraseña.
Tampoco se sube al repositorio y el `.htaccess` impide pedirlo desde afuera. Es un usuario aparte
del de `/api/config.ini`, para que las APIs públicas de El Colmenar sigan sin poder escribir:

```sql
CREATE USER 'agromet_colmenar'@'<IP del servidor web>' IDENTIFIED BY '<contraseña>';
GRANT SELECT, INSERT, UPDATE ON colmenar.clima_diario_el_colmenar TO 'agromet_colmenar'@'<IP del servidor web>';
```

No necesita `DELETE`: la pestaña nunca borra días. Si falta el archivo o el permiso, la pestaña lo
dice y el resto de la administración sigue funcionando.

### Red pluviométrica

La pestaña **Red pluviométrica** reemplaza al programa de Visual FoxPro (`web.exe`) para cargar las
lluvias de la red. Diseño completo en `docs/admin-lluvias-red-diseno.md`. Usa su propia conexión:
copiar `api/conecta_lluvias.ejemplo.php` como `conecta_lluvias.php` en la misma carpeta y completar
la contraseña. Tampoco se sube al repositorio y el `.htaccess` impide pedirlo desde afuera. El
usuario sólo tiene permiso sobre las tres tablas de la red y un tope de conexiones, para que esta
pestaña nunca pueda agotar las conexiones de la base:

```sql
CREATE USER 'agromet_lluvias'@'<IP del servidor web>' IDENTIFIED BY '<contraseña>'
  WITH MAX_USER_CONNECTIONS 5 MAX_STATEMENT_TIME 30;
GRANT SELECT, INSERT ON estaciones.estaciones_rr TO 'agromet_lluvias'@'<IP del servidor web>';
GRANT SELECT, INSERT, UPDATE, DELETE ON estaciones.datos_rr_dia TO 'agromet_lluvias'@'<IP del servidor web>';
GRANT SELECT, INSERT, UPDATE ON estaciones.datos_rr_mes TO 'agromet_lluvias'@'<IP del servidor web>';
```

`estaciones_rr` sólo necesita `INSERT`: cada edición agrega una versión nueva. Antes de usarla (una
vez, en un horario sin uso y después de una copia de las tres tablas), conviene aplicar los cambios de
la §6 del diseño: los controles de filas repetidas y los `ALTER` (InnoDB, claves únicas
`estacion_fecha` y `estacion_anio`, índice por fecha). La pestaña funciona sin ellos, pero:

- sin la clave única `estacion_anio`, el año nuevo no se crea solo (la pestaña lo avisa) y la fila de
  cada localidad se crea al cargarle el primer total;
- con MyISAM, cada grabado bloquea la tabla entera mientras dura, y las transacciones no hacen nada:
  si una planilla fallara a mitad por un error de la base, las filas anteriores quedarían grabadas
  (las filas repetidas se detectan antes de escribir, así que ese caso no corta la planilla).

`MAX_STATEMENT_TIME` en `CREATE USER` depende de la versión de MariaDB: si no lo acepta, crear el
usuario sin esa opción y poner `max_statement_time` en `my.ini`.

Cada cambio queda en `lluvias.log` de la carpeta (fecha, email, IP, valor anterior y nuevo), que no
se puede leer desde afuera.

### Consultas de las APIs para terceros

La pestaña **Consultas de APIs** muestra cuántas veces se consultan los feeds de `/api/` (SMN,
COVIAR, Citrusvil, CONICET, valles, El Charco), por día y por IP. Cada feed suma una consulta con
`/services/registro-consultas.php` (lo usa `'invitado'@'%'`, el de `conecta_mysql.php`, que escribe)
y esta pestaña la lee con `consultas_api.php` (el usuario de `conecta_admin.php`, que sólo lee). Sin
la tabla, los feeds responden igual y la pestaña avisa que falta.

```sql
CREATE TABLE estaciones.api_consultas (
  dia DATE NOT NULL,
  api VARCHAR(40) NOT NULL COMMENT 'nombre del PHP de /api/ (smn, coviar, ...)',
  ip VARCHAR(45) NOT NULL,
  consultas INT UNSIGNED NOT NULL DEFAULT 0,
  ultima DATETIME NOT NULL,
  PRIMARY KEY (dia, api, ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

GRANT SELECT, INSERT, UPDATE ON estaciones.api_consultas TO 'invitado'@'%';
GRANT SELECT ON estaciones.api_consultas TO '<usuario de conecta_admin.php>'@'<host>';
```

## 3. Revisar `api/config.php`

| Constante | Qué poner |
|---|---|
| `ADMINISTRADORES` | Emails con acceso. Si se cambia, cambiar también `src/app/shared/administradores.ts`. |
| `CARPETA_PDFS` | Carpeta de `https://agromet.eeaoc.gob.ar/PDFS/`. Por defecto, dos niveles arriba de `services/admin`. PHP necesita permiso de escritura ahí. |
| `MAX_BYTES` | Tamaño máximo (30 MB). `upload_max_filesize` y `post_max_size` de PHP tienen que ser iguales o mayores. |
| `DB_COLMENAR`, `COLMENAR_DESDE` | Base de la serie diaria de El Colmenar y su primer día (los días sin fila desde esa fecha cuentan como faltantes). |
| `LIMITES_COLMENAR` | Valores aceptados al cargar (temperaturas de −20 a 50 °C y lluvia de 0 a 500 mm). Si se cambian, cambiar también `admin-colmenar.component.ts`. |
| `LIMITE_LLUVIA_DIA`, `AVISO_LLUVIA_DIA`, `LIMITE_LLUVIA_MES`, `AVISO_LLUVIA_MES`, `LLUVIAS_DESDE` | Red pluviométrica: tope y aviso de los mm (500 y 150 por día, 2000 y 800 por mes) y primer año aceptado. Si se cambian, cambiar también `src/app/admin/lluvias-red/lluvias-red.ts`. |
| `DIAS_GRACIA_DIARIO` | Hasta qué día del mes se pueden cargar todavía los datos diarios del mes anterior (10). |
| `ZONA_RED` | Caja de latitud y longitud de la red: una localidad fuera de ella sólo genera un aviso. |

## 4. Probar

Sin token (tiene que responder 401):

    curl -i https://agromet.eeaoc.gob.ar/services/admin/pdfs.php

- `https://agromet.eeaoc.gob.ar/services/admin/config.php` → 403.
- Iniciar sesión con una cuenta de la lista → menú de la cuenta → **Administración**.
- Con una cuenta que no está en la lista, `/admin` vuelve al inicio y la API responde 403.

Los errores inesperados quedan en `errores.log` de la carpeta (no se puede leer desde afuera).

## Qué hace cada archivo

| Archivo | Uso |
|---|---|
| `pdfs.php` | Lista los informes (búsqueda, categoría, año, de a 20) y publica uno nuevo. |
| `pdf_editar.php` | Corrige título, categoría o fecha de un informe publicado. |
| `pdf_borrar.php` | Despublica: borra el registro y mueve el archivo a `PDFS/_despublicados/` (no se pierde). |
| `lluvias9a9.php` | Lluvia de 9 a 9 de todas las estaciones habilitadas y de las deshabilitadas que tienen registros en el período. |
| `comunicaciones.php` | Quién reporta (últimas tramas recibidas por estación) y los últimos 150 eventos de `comunicaciones`. Incluye las deshabilitadas con GPRS, que no cuentan en el resumen. |
| `comandos.php` | Pedidos de "Actualizar fecha y hora" y "Borrar memoria" para UDPAdmin: lista, carga y cancela (también en estaciones deshabilitadas con GPRS). |
| `control_datos.php` | Control de datos: revisa `datos_diarios` de los últimos 7 a 31 días y propone sensores que parecen fallar (humedad que cae a 1-3 %, anemómetro trabado, pluviómetro sin registro, temperatura lejos de las vecinas, etc.). Revisa también las deshabilitadas que tienen datos, pero sólo las habilitadas sirven de vecinas. Sólo lee; las reglas están en el encabezado del archivo. |
| `consultas_api.php` | Consultas de los feeds para terceros de `/api/` por feed, día e IP (tabla `api_consultas`). Sólo lee. |
| `sensores_baja.php` | Sensores dados de baja (depuración de datos): lista, carga, edita (por ejemplo, para cerrar una baja cuando se arregla el sensor) y borra. Lista todas las estaciones, también las deshabilitadas. Con `variable: todas` da de baja todos los sensores de una estación que falla entera (una fila por sensor). |
| `colmenar_diarios.php` | Serie diaria de El Colmenar (`colmenar.clima_diario_el_colmenar`): resumen de pendientes por año, días de un período y carga de faltantes o validación de provisionales. |
| `lluvias_comun.php` | Base de la red pluviométrica: conexión con `conecta_lluvias.php`, validación de los mm, lista de localidades y alta automática del año. No se puede pedir desde afuera. |
| `lluvias_localidades.php` | Localidades de la red (`estaciones_rr`): lista (antes crea las filas del año en curso), ficha con versiones, alta con el siguiente número libre y edición (versión nueva). |
| `lluvias_dia.php` | Datos diarios (`datos_rr_dia`) del mes en curso y, hasta el día `DIAS_GRACIA_DIARIO`, del anterior: lectura de un mes y carga de un valor (vacío lo borra). |
| `lluvias_mes.php` | Totales mensuales (`datos_rr_mes`): un año completo con la suma de los diarios como referencia, la serie de una localidad, carga de un valor y de una planilla (todo o nada). Crea la fila que falte. |

## Serie diaria de El Colmenar (`colmenar_diarios.php`)

Es la tabla que leen las APIs públicas de `/api/colmenar` (estadísticas históricas del sitio), así
que lo que se guarda aparece en el sitio en el siguiente pedido. Reglas:

- **Día que falta** (sin fila): se inserta con `origen = 'convencional'` y `estado_registro = 1`.
- **Día provisional** (`estado_registro = 0`, los de la estación automática): se guardan los valores
  cargados y queda `estado_registro = 1`. Si se cambió algún valor, `origen` pasa a `convencional`;
  si se valida tal cual, conserva su origen.
- **Día validado** (`estado_registro = 1`): sólo se completan los valores en `NULL`; los demás no se
  pueden cambiar.
- `estado_pp` se calcula: sin lluvia cargada 3, traza 1 (se guarda 0 mm), 0 mm 0, 0,1 mm o más 2.
- Se guardan todos los días enviados o ninguno (transacción). Nunca se borran filas.

Cada día guardado queda en `colmenar.log` de la carpeta (fecha, email, IP, valores anteriores y
nuevos), que no se puede leer desde afuera.
