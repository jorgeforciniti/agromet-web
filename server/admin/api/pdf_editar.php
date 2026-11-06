<?php
/*
 * POST {id, titulo, categoria, creado} → {ok, informe}
 * Corrige los datos de un informe publicado (el archivo no cambia).
 */
require_once __DIR__ . '/comun.php';

exigir_metodo('POST');
administrador_actual();
$tabla = '`' . DB_ADMIN . '`.`pdfs`';

$datos = cuerpo_json();
$id = is_numeric($datos['id'] ?? null) ? (int) $datos['id'] : 0;
if ($id <= 0) error_json('Informe inválido.', 422);
$titulo = validar_titulo($datos['titulo'] ?? '');
$categoria = validar_categoria($datos['categoria'] ?? '');
$creado = validar_fecha($datos['creado'] ?? '', 'fecha del informe');

$db = conexion();
$st = $db->prepare("UPDATE $tabla SET titulo = ?, categoria = ?, creado = ? WHERE id = ?");
$st->bind_param('sssi', $titulo, $categoria, $creado, $id);
$st->execute();

$st = $db->prepare("SELECT id, titulo, archivo, creado, categoria FROM $tabla WHERE id = ?");
$st->bind_param('i', $id);
$st->execute();
$fila = $st->get_result()->fetch_assoc();
if (!$fila) error_json('El informe ya no existe.', 404);

responder(['ok' => true, 'informe' => informe_json($fila)]);
