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

Los parámetros se convierten a número antes de ir al SQL (`intval`): con el texto sin filtrar se
podía inyectar SQL. `smn-nuevo.php` e `io_valles.php` ya lo validaban y siguen sólo en el servidor.

**Depuración de datos:** usan `/services/depuracion.php` (tiene que estar subido; si no está, responden
como antes). Los valores de los sensores dados de baja salen en `null` (en `smn.php`, `-99.9`), sin
cambiar el formato: las mismas claves, como ya salía un dato faltante.
