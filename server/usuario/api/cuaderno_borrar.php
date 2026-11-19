<?php
/*
 * POST {uid} → {ok}. Borra una anotación del cuaderno de aplicaciones (app móvil).
 * Si ya no existe responde ok igual: el celular puede reintentar un borrado hecho sin conexión.
 */
require_once __DIR__ . '/comun.php';

exigir_metodo('POST');
$u = usuario_actual();

$uid = cuerpo_json()['uid'] ?? '';
if (!is_scalar($uid) || !preg_match('/^[A-Za-z0-9-]{1,40}$/', (string) $uid)) {
    error_json('uid inválido.', 422);
}
$uid = (string) $uid;

$st = conexion()->prepare('DELETE FROM usuario_cuaderno WHERE usuario_id = ? AND uid = ?');
$st->bind_param('is', $u['id'], $uid);
$st->execute();
responder(['ok' => true]);
