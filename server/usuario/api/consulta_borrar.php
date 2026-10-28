<?php
/* POST {id} → {ok}. Sólo borra consultas del usuario del token. */
require_once __DIR__ . '/comun.php';

exigir_metodo('POST');
$u = usuario_actual();
$id = validar_id(cuerpo_json()['id'] ?? null);

$st = conexion()->prepare('DELETE FROM usuario_consulta WHERE id = ? AND usuario_id = ?');
$st->bind_param('ii', $id, $u['id']);
$st->execute();
if ($st->affected_rows === 0) {
    error_json('La consulta no existe.', 404);
}
responder(['ok' => true]);
