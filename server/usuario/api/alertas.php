<?php
/*
 * GET  → {ok, alertas:[{id, estacion_id, variable, operador, umbral, activa}]}
 * POST {id?, estacion_id, variable, operador, umbral, activa} → {ok, id}  (sin id crea; con id edita)
 *   variable: temp_min | temp_max | lluvia_dia ; operador: <= | >=
 */
require_once __DIR__ . '/comun.php';

$metodo = exigir_metodo('GET', 'POST');
$u = usuario_actual();
$db = conexion();

if ($metodo === 'GET') {
    $st = $db->prepare('SELECT id, estacion_id, variable, operador, umbral, activa FROM usuario_alerta
                        WHERE usuario_id = ? ORDER BY id');
    $st->bind_param('i', $u['id']);
    $st->execute();
    $alertas = array_map(function ($a) {
        return [
            'id' => (int) $a['id'],
            'estacion_id' => $a['estacion_id'],
            'variable' => $a['variable'],
            'operador' => $a['operador'],
            'umbral' => (float) $a['umbral'],
            'activa' => (bool) $a['activa'],
        ];
    }, $st->get_result()->fetch_all(MYSQLI_ASSOC));
    responder(['ok' => true, 'alertas' => $alertas]);
}

$datos = cuerpo_json();
$estacion = validar_estacion($datos['estacion_id'] ?? null);

// Rango físico posible por variable (mismos criterios que la red de estaciones)
$rangos = ['temp_min' => [-25, 55], 'temp_max' => [-25, 55], 'lluvia_dia' => [0, 400]];
$variable = (string) ($datos['variable'] ?? '');
if (!isset($rangos[$variable])) {
    error_json('Variable inválida.', 422);
}
$operador = (string) ($datos['operador'] ?? '');
if (!in_array($operador, ['<=', '>='], true)) {
    error_json('Operador inválido.', 422);
}
$umbral = $datos['umbral'] ?? null;
if (!is_numeric($umbral) || $umbral < $rangos[$variable][0] || $umbral > $rangos[$variable][1]) {
    error_json('Umbral fuera de rango.', 422);
}
$umbral = round((float) $umbral, 1);
$activa = (int) (bool) ($datos['activa'] ?? true);

if (isset($datos['id'])) {
    $id = validar_id($datos['id']);
    $st = $db->prepare('UPDATE usuario_alerta SET estacion_id = ?, variable = ?, operador = ?, umbral = ?, activa = ?
                        WHERE id = ? AND usuario_id = ?');
    $st->bind_param('sssdiii', $estacion, $variable, $operador, $umbral, $activa, $id, $u['id']);
    $st->execute();
    // affected_rows es 0 también si no cambió nada: se confirma que exista
    $st = $db->prepare('SELECT 1 FROM usuario_alerta WHERE id = ? AND usuario_id = ?');
    $st->bind_param('ii', $id, $u['id']);
    $st->execute();
    if (!$st->get_result()->fetch_row()) {
        error_json('La alerta no existe.', 404);
    }
    responder(['ok' => true, 'id' => $id]);
}

$st = $db->prepare('SELECT COUNT(*) FROM usuario_alerta WHERE usuario_id = ?');
$st->bind_param('i', $u['id']);
$st->execute();
if ((int) $st->get_result()->fetch_row()[0] >= MAX_ALERTAS) {
    error_json('Se pueden tener hasta ' . MAX_ALERTAS . ' alertas.', 422);
}

$st = $db->prepare('INSERT INTO usuario_alerta (usuario_id, estacion_id, variable, operador, umbral, activa)
                    VALUES (?, ?, ?, ?, ?, ?)');
$st->bind_param('isssdi', $u['id'], $estacion, $variable, $operador, $umbral, $activa);
$st->execute();
responder(['ok' => true, 'id' => $db->insert_id]);
