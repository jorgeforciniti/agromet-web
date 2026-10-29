<?php
/*
 * POST {id} → {ok}
 * Despublica un informe: borra el registro de admin.pdfs y mueve el archivo a PDFS/_despublicados/
 * (no se borra: si fue un error, se puede volver a subir desde ahí).
 */
require_once __DIR__ . '/comun.php';

exigir_metodo('POST');
administrador_actual();
$tabla = '`' . DB_ADMIN . '`.`pdfs`';

$datos = cuerpo_json();
$id = is_numeric($datos['id'] ?? null) ? (int) $datos['id'] : 0;
if ($id <= 0) error_json('Informe inválido.', 422);

$db = conexion();
$st = $db->prepare("SELECT archivo FROM $tabla WHERE id = ?");
$st->bind_param('i', $id);
$st->execute();
$fila = $st->get_result()->fetch_assoc();
if (!$fila) error_json('El informe ya no existe.', 404);

$st = $db->prepare("DELETE FROM $tabla WHERE id = ?");
$st->bind_param('i', $id);
$st->execute();

// Otro registro puede usar el mismo archivo: en ese caso queda donde está
$archivo = basename(trim($fila['archivo']));
$st = $db->prepare("SELECT COUNT(*) FROM $tabla WHERE archivo = ?");
$st->bind_param('s', $archivo);
$st->execute();
$enUso = (int) $st->get_result()->fetch_row()[0] > 0;

$carpeta = realpath(CARPETA_PDFS);
if (!$enUso && $carpeta !== false && $archivo !== '' && is_file("$carpeta/$archivo")) {
    $papelera = "$carpeta/_despublicados";
    if (!is_dir($papelera)) @mkdir($papelera, 0755);
    @rename("$carpeta/$archivo", "$papelera/" . date('Ymd-His') . "_$archivo");
}

responder(['ok' => true]);
