# `/api/` (feeds de datos para terceros)

Se suben a mano (WinSCP) a `/api/` del servidor, junto a `conecta_mysql.php` (no está en el
repositorio). Las subcarpetas `push/` (notificaciones de la app) tienen su propio LEEME.

| Archivo | Para quién | Parámetro |
|---|---|---|
| `smn.php`, `smn-anterior.php` | Servicio Meteorológico Nacional | `?fecha=AAAAMMDD` |
| `coviar.php` | COVIAR (estaciones de los valles) | `?fecha=AAAAMMDD` |
| `citrusvil.php` | Citrusvil (estaciones 40 a 59) | `?fecha=AAAAMMDD` |
| `conicet_BB.php` | CONICET | `?fecha=AAAAMMDD` |
| `io_estaciones.php` | Versión vieja de la lista de estaciones | `?habilitada=` |
| `smn-nuevo.php` | Servicio Meteorológico Nacional (versión nueva) | `?fecha=AAAAMMDD` |
| `io_valles.php` | Estaciones de los valles (datos diarios) | `?fecha=AAAAMMDD` |
| `api_el_charco.php` | El Charco (estación 9), CSV o JSON | `?fecha=AAAA-MM-DD&hora=HH:MM&formato=` |

Los parámetros se convierten a número antes de ir al SQL (`intval`): con el texto sin filtrar se
podía inyectar SQL. `smn-nuevo.php`, `io_valles.php` y `api_el_charco.php` ya lo validaban.

**Depuración de datos:** usan `/services/depuracion.php` (tiene que estar subido; si no está, responden
como antes). Los valores de los sensores dados de baja salen en `null` (en `smn.php`, `smn-nuevo.php` e
`io_valles.php`, `-99.9`; en el CSV de `api_el_charco.php`, vacíos), sin
cambiar el formato: las mismas claves, como ya salía un dato faltante.

**Cantidad de consultas:** todos suman cada consulta (por día e IP) en la tabla `api_consultas` con
`/services/registro-consultas.php`; se ve en /admin, pestaña «Consultas de APIs» (SQL en
`server/admin/LEEME.md`). Sin la tabla, responden igual.
