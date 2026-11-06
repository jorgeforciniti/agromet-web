<?php
/*
 * POST → {ok}. Borra los datos del usuario en estas tablas (favoritas, consultas y alertas
 * caen por ON DELETE CASCADE). La cuenta de Firebase la borra el propio usuario.
 */
require_once __DIR__ . '/comun.php';

exigir_metodo('POST');
$u = usuario_actual();

$st = conexion()->prepare('DELETE FROM usuario WHERE id = ?');
$st->bind_param('i', $u['id']);
$st->execute();
responder(['ok' => true]);
