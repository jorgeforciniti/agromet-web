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

## Alertas a medida (`push-alertas.php`, `verificar-alertas-push.php`)

Cada celular puede crear hasta 5 alertas por estación y condición: temperatura por debajo o por encima
de un valor, lluvia del día, ráfaga y helada pronosticada esta noche (Open-Meteo, gratuito para uso no
comercial; se cita en «Acerca de» de la app). Cada alerta avisa como máximo cada 12 horas.

Instalación (una vez):

1. Crear la tabla con `sql/app_push_alertas.sql` en la base `estaciones`.
2. Subir a `/api/push/`: `push-alertas-comun.php`, `push-alertas.php` y `verificar-alertas-push.php`.
3. Tarea programada cada 15 minutos:
   `https://agromet.eeaoc.gob.ar/api/push/verificar-alertas-push.php?key=...` (la clave de
   `clave-push.php`). Para probar sin enviar: `&dry_run=1`; para un solo celular:
   `&solo_dispositivo_id=N`.

- `push-alertas.php` lo llama la app (POST JSON con `token`, `dispositivo_id` y `accion`: `listar`,
  `agregar` o `borrar`). Sólo responde si el token y el dispositivo coinciden en `app_push_dispositivos`.
- Temperatura, lluvia y ráfaga usan el último registro de `estaciones` si tiene menos de 90 minutos y
  sin los sensores dados de baja (`/services/depuracion.php`).
- La helada pronosticada se evalúa sólo de 17 a 21 h (una consulta a Open-Meteo por estación).
- Los avisos quedan en `app_push_log` con `tipo = 'alerta_usuario'` y `evento_id` = id de la alerta.
  Si `evento_id` de esa tabla no admite ese valor, ajustar el INSERT.
