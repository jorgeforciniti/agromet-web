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
