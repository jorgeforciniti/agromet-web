# `/api/push/` (notificaciones de la app móvil)

Se suben a mano (WinSCP) a `/api/push/` del servidor. En el repositorio está sólo lo que se
modificó desde el sitio; el resto (`fcm-v1.php`, `push-*.php`) sigue sólo en el servidor.

## `verificar-heladas-push.php`

Lo llama una tarea programada con `?key=...`. Busca estaciones con `temp_af <= 0` en los últimos 45
minutos, abre o actualiza los eventos y el episodio provincial de helada y manda el aviso por FCM
(ver el encabezado del archivo para `dry_run`, `test_identificacion` y `test_temp`).

- **Clave:** está en `clave-push.php`, que no se sube al repositorio (ver `clave-push.ejemplo.php`).
  Tiene que estar en `/api/push/` del servidor; si falta, responde 500 «Falta clave-push.php».
- **Depuración de datos:** usa `/services/depuracion.php`. Una estación con la temperatura dada de
  baja no cuenta como helada (sale en `resumen.omitidas_por_baja`) y su evento abierto se cierra. `resumen.temperatura_de_baja` lista
  las estaciones con la temperatura de baja hoy, para controlar que las lee. Si
  `depuracion.php` no está, funciona como antes. El usuario de `../estaciones/conecta_mysql.php`
  necesita `SELECT` sobre `estaciones.sensores_baja`; sin ese permiso no descarta nada.
