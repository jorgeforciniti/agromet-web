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

## 3. Revisar `api/config.php`

| Constante | Qué poner |
|---|---|
| `ADMINISTRADORES` | Emails con acceso. Si se cambia, cambiar también `src/app/shared/administradores.ts`. |
| `CARPETA_PDFS` | Carpeta de `https://agromet.eeaoc.gob.ar/PDFS/`. Por defecto, dos niveles arriba de `services/admin`. PHP necesita permiso de escritura ahí. |
| `MAX_BYTES` | Tamaño máximo (30 MB). `upload_max_filesize` y `post_max_size` de PHP tienen que ser iguales o mayores. |

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
| `lluvias9a9.php` | Lluvia de 9 a 9 de todas las estaciones habilitadas. |
| `comunicaciones.php` | Quién reporta (últimas tramas recibidas por estación) y los últimos 150 eventos de `comunicaciones`. |
| `comandos.php` | Pedidos de "Actualizar fecha y hora" y "Borrar memoria" para UDPAdmin: lista, carga y cancela. |
| `control_datos.php` | Control de datos: revisa `datos_diarios` de los últimos 7 a 31 días y propone sensores que parecen fallar (humedad que cae a 1-3 %, anemómetro trabado, pluviómetro sin registro, temperatura lejos de las vecinas, etc.). Sólo lee; las reglas están en el encabezado del archivo. |
| `sensores_baja.php` | Sensores dados de baja (depuración de datos): lista, carga, edita (por ejemplo, para cerrar una baja cuando se arregla el sensor) y borra. |
