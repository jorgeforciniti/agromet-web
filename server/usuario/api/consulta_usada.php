<?php
/* POST {id} → {ok}. Registra el uso para ordenar "Mis consultas" por uso reciente. */
require_once __DIR__ . '/comun.php';

exigir_metodo('POST');
$u = usuario_actual();
$id = validar_id(cuerpo_json()['id'] ?? null);

$st = conexion()->prepare('UPDATE usuario_consulta SET usada = NOW() WHERE id = ? AND usuario_id = ?');
$st->bind_param('ii', $id, $u['id']);
$st->execute();
responder(['ok' => true]);
