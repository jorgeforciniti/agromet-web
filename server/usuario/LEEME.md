# API de usuarios (instalada en /services/usuarios): instalación en el servidor

Backend de la Etapa 2 (favoritas de la cuenta, consultas guardadas y alertas). Diseño completo en
`docs/etapa-2-diseno.md`. Compatible con PHP 7.3 o superior; necesita `mysqli` (con mysqlnd), `openssl`
y `allow_url_fopen` activo (no usa curl).

## 1. Revisar `api/config.php`

| Constante | Qué poner |
|---|---|
| `RUTA_CONECTA_MYSQL` | Ruta al `conecta_mysql.php` que usan los PHP de `/services/` (por defecto `public_html/services/conecta_mysql.php`). |
| `DB_USUARIOS` | Base donde se crean las tablas nuevas. Puede ser `estaciones` u otra; el usuario de MySQL de `conecta_mysql.php` necesita permisos ahí. |
| `DB_ESTACIONES` / `TABLA_ESTACIONES` | Base y tabla de estaciones (para validar los identificadores). |

`HERRAMIENTAS` tiene que coincidir con `Herramienta` de `src/app/shared/enlace-consulta.ts`: al sumar
una herramienta en /datos (por ejemplo `resumen-diario`), volver a subir `config.php` o no se van a poder
guardar sus consultas.

`conecta_mysql.php` no se modifica: se incluye igual que en `/services/` (con `$db`), y cualquier texto
que imprima se descarta para no romper las respuestas JSON.

## 2. Crear las tablas

Ejecutar `sql/01_tablas_usuario.sql` en la base `DB_USUARIOS` (phpMyAdmin o consola). Sólo crea
tablas nuevas (`usuario`, `usuario_preferencias`, `usuario_favorita`, `usuario_consulta`,
`usuario_alerta`); no toca las existentes.

## 3. Subir los archivos

Con WinSCP, copiar la carpeta `api/` a `public_html/services/usuarios/` (incluido `.htaccess`, que es un
archivo oculto: activar "Mostrar archivos ocultos").

El `.htaccess` impide pedir desde afuera `config.php`, `comun.php` y `firebase_token.php`, y hace que
Apache le pase a PHP el header `Authorization`.

## 4. Probar

Sin token (tiene que responder 401):

    curl -i https://agromet.eeaoc.gob.ar/services/usuarios/preferencias.php

Con token: iniciar sesión en el sitio publicado, abrir las herramientas del navegador (F12), pestaña
**Red**, y buscar el pedido a `preferencias.php` que hace el sitio al iniciar sesión: tiene que
responder `200 {"ok":true,"favoritas":[...]}`.

Comprobaciones:
- `https://agromet.eeaoc.gob.ar/services/usuarios/config.php` → 403.
- Marcar una favorita con sesión iniciada → en la base aparece la fila en `usuario_favorita`.
- Cerrar sesión → vuelven las favoritas que había sin sesión.

Si el sitio publicado todavía no tiene esta API, el frontend sigue funcionando como en la Etapa 1
(favoritas sólo en el navegador).
