<?php
/*
 * GET  → {ok, favoritas:[ids en orden], predeterminada, perfil}
 * POST {favoritas:[...], predeterminada:null|id, perfil?:null|...} → {ok}  (reemplaza todo)
 */
require_once __DIR__ . '/comun.php';

$metodo = exigir_metodo('GET', 'POST');
$u = usuario_actual();
$db = conexion();

if ($metodo === 'GET') {
    $st = $db->prepare('SELECT estacion_id FROM usuario_favorita WHERE usuario_id = ? ORDER BY orden');
    $st->bind_param('i', $u['id']);
    $st->execute();
    $favoritas = array_column($st->get_result()->fetch_all(MYSQLI_ASSOC), 'estacion_id');

    $st = $db->prepare('SELECT p.estacion_predeterminada, us.perfil_uso
                        FROM usuario us LEFT JOIN usuario_preferencias p ON p.usuario_id = us.id
                        WHERE us.id = ?');
    $st->bind_param('i', $u['id']);
    $st->execute();
    $fila = $st->get_result()->fetch_assoc() ?: [];

    responder([
        'ok' => true,
        'favoritas' => $favoritas,
        'predeterminada' => $fila['estacion_predeterminada'] ?? null,
        'perfil' => $fila['perfil_uso'] ?? null,
    ]);
}

// POST: validar todo antes de escribir
$datos = cuerpo_json();
$favoritas = $datos['favoritas'] ?? [];
if (!is_array($favoritas)) {
    error_json('favoritas debe ser una lista.', 422);
}
// Las estaciones que ya no existen o se deshabilitaron se descartan sin error (si no, una
// favorita vieja impediría guardar cualquier otro cambio)
$validas = estaciones_validas();
$favoritas = array_values(array_unique(array_filter(
    array_map(function ($f) { return is_scalar($f) ? trim((string) $f) : ''; }, $favoritas),
    function ($f) use ($validas) { return in_array($f, $validas, true); }
)));
if (count($favoritas) > MAX_FAVORITAS) {
    error_json('Se pueden guardar hasta ' . MAX_FAVORITAS . ' favoritas.', 422);
}

$predeterminada = $datos['predeterminada'] ?? null;
if ($predeterminada !== null && !in_array((string) $predeterminada, $favoritas, true)) {
    $predeterminada = null; // tiene que ser una de las favoritas válidas
}

$cambiaPerfil = array_key_exists('perfil', $datos);
$perfil = $datos['perfil'] ?? null;
if ($perfil !== null && !in_array($perfil, ['productor', 'tecnico', 'investigador', 'institucional', 'otro'], true)) {
    error_json('Perfil de uso inválido.', 422);
}

$db->begin_transaction();
try {
    $st = $db->prepare('DELETE FROM usuario_favorita WHERE usuario_id = ?');
    $st->bind_param('i', $u['id']);
    $st->execute();

    $st = $db->prepare('INSERT INTO usuario_favorita (usuario_id, estacion_id, orden) VALUES (?, ?, ?)');
    foreach ($favoritas as $orden => $estacion) {
        $st->bind_param('isi', $u['id'], $estacion, $orden);
        $st->execute();
    }

    $st = $db->prepare('INSERT INTO usuario_preferencias (usuario_id, estacion_predeterminada) VALUES (?, ?)
                        ON DUPLICATE KEY UPDATE estacion_predeterminada = VALUES(estacion_predeterminada)');
    $st->bind_param('is', $u['id'], $predeterminada);
    $st->execute();

    if ($cambiaPerfil) {
        $st = $db->prepare('UPDATE usuario SET perfil_uso = ? WHERE id = ?');
        $st->bind_param('si', $perfil, $u['id']);
        $st->execute();
    }
    $db->commit();
} catch (Throwable $e) {
    $db->rollback();
    error_json('No se pudieron guardar las preferencias.', 500);
}

responder(['ok' => true]);
