<?php
/*
 * Cuaderno de aplicaciones de la app móvil (tabla usuario_cuaderno, ver ../sql/03_cuaderno.sql).
 * GET  → {ok, cuaderno:[{uid, fecha, lote, producto, dosis, notas, condiciones}]}  (más nuevas primero)
 * POST {registros:[{uid, fecha, lote, producto, dosis, notas, condiciones}]} → {ok, guardados}
 *   Crea o reemplaza cada anotación por su uid (lo genera el celular): la app manda de una vez las
 *   que anotó sin conexión. fecha: «2026-11-19T10:30» en la hora del celular.
 */
require_once __DIR__ . '/comun.php';

$metodo = exigir_metodo('GET', 'POST');
$u = usuario_actual();
$db = conexion();

if ($metodo === 'GET') {
    $st = $db->prepare("SELECT uid, DATE_FORMAT(fecha, '%Y-%m-%dT%H:%i') AS fecha, lote, producto, dosis, notas, condiciones
                        FROM usuario_cuaderno WHERE usuario_id = ? ORDER BY fecha DESC");
    $st->bind_param('i', $u['id']);
    $st->execute();
    $cuaderno = array_map(function ($r) {
        $r['condiciones'] = $r['condiciones'] !== null ? json_decode($r['condiciones'], true) : null;
        return $r;
    }, $st->get_result()->fetch_all(MYSQLI_ASSOC));
    responder(['ok' => true, 'cuaderno' => $cuaderno]);
}

/** Texto de hasta $max caracteres (UTF-8, sin depender de mbstring) */
function texto($valor, int $max, string $campo): string
{
    $valor = is_scalar($valor) ? trim((string) $valor) : '';
    if (!preg_match('/^.{0,' . $max . '}$/us', $valor)) {
        error_json("$campo: hasta $max caracteres.", 422);
    }
    return $valor;
}

$datos = cuerpo_json();
$registros = $datos['registros'] ?? null;
if (!is_array($registros) || count($registros) === 0 || count($registros) > 200) {
    error_json('registros: entre 1 y 200 anotaciones.', 422);
}

// Validar todo antes de escribir
$filas = [];
foreach ($registros as $r) {
    if (!is_array($r)) {
        error_json('Anotación inválida.', 422);
    }
    $uid = is_scalar($r['uid'] ?? null) ? (string) $r['uid'] : '';
    if (!preg_match('/^[A-Za-z0-9-]{1,40}$/', $uid)) {
        error_json('uid inválido.', 422);
    }
    $fecha = is_scalar($r['fecha'] ?? null) ? (string) $r['fecha'] : '';
    if (!preg_match('/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/', $fecha, $m) || !strtotime("$m[1] $m[2]")) {
        error_json('Fecha inválida.', 422);
    }
    $condiciones = null;
    if (isset($r['condiciones'])) {
        if (!is_array($r['condiciones'])) {
            error_json('condiciones debe ser un objeto.', 422);
        }
        $condiciones = json_encode($r['condiciones'], JSON_UNESCAPED_UNICODE);
        if (strlen($condiciones) > 1000) {
            error_json('condiciones demasiado largas.', 422);
        }
    }
    $filas[] = [
        $uid, "$m[1] $m[2]:00",
        texto($r['lote'] ?? '', 80, 'Lote'), texto($r['producto'] ?? '', 80, 'Producto'),
        texto($r['dosis'] ?? '', 40, 'Dosis'), texto($r['notas'] ?? '', 500, 'Notas'),
        $condiciones,
    ];
}

$st = $db->prepare('SELECT COUNT(*) FROM usuario_cuaderno WHERE usuario_id = ?');
$st->bind_param('i', $u['id']);
$st->execute();
if ((int) $st->get_result()->fetch_row()[0] + count($filas) > MAX_CUADERNO) {
    error_json('Se pueden guardar hasta ' . MAX_CUADERNO . ' anotaciones.', 422);
}

$st = $db->prepare('INSERT INTO usuario_cuaderno (usuario_id, uid, fecha, lote, producto, dosis, notas, condiciones)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE fecha = VALUES(fecha), lote = VALUES(lote), producto = VALUES(producto),
                      dosis = VALUES(dosis), notas = VALUES(notas), condiciones = VALUES(condiciones)');
foreach ($filas as $f) {
    $st->bind_param('isssssss', $u['id'], $f[0], $f[1], $f[2], $f[3], $f[4], $f[5], $f[6]);
    $st->execute();
}
responder(['ok' => true, 'guardados' => count($filas)]);
