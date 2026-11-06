<?php
/*
 * GET  → {ok, consultas:[{id, nombre, herramienta, parametros, creada, usada}]}  (las usadas hace poco primero)
 * POST {nombre, herramienta, parametros} → {ok, id}
 *   parametros: query string del enlace sin "herramienta" (ej. "estacion=73&desde=2026-07-01&base=7")
 */
require_once __DIR__ . '/comun.php';

$metodo = exigir_metodo('GET', 'POST');
$u = usuario_actual();
$db = conexion();

if ($metodo === 'GET') {
    $st = $db->prepare('SELECT id, nombre, herramienta, parametros, creada, usada FROM usuario_consulta
                        WHERE usuario_id = ? ORDER BY COALESCE(usada, creada) DESC');
    $st->bind_param('i', $u['id']);
    $st->execute();
    $consultas = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    foreach ($consultas as &$c) {
        $c['id'] = (int) $c['id'];
    }
    responder(['ok' => true, 'consultas' => $consultas]);
}

$datos = cuerpo_json();

$nombre = trim((string) ($datos['nombre'] ?? ''));
if (!preg_match('/^.{1,80}$/us', $nombre)) {
    error_json('El nombre es obligatorio y puede tener hasta 80 caracteres.', 422);
}

$herramienta = (string) ($datos['herramienta'] ?? '');
if (!in_array($herramienta, HERRAMIENTAS, true)) {
    error_json('Herramienta desconocida.', 422);
}

// Se normaliza el query string: sólo claves simples y valores cortos, sin "herramienta"
parse_str((string) ($datos['parametros'] ?? ''), $params);
$limpios = [];
foreach ($params as $clave => $valor) {
    if ($clave === 'herramienta' || !preg_match('/^[a-z_]{1,20}$/', (string) $clave) || !is_string($valor) || strlen($valor) > 40) {
        continue;
    }
    $limpios[$clave] = $valor;
}
if (isset($limpios['estacion'])) {
    validar_estacion($limpios['estacion']);
}
$parametros = http_build_query($limpios);
if (strlen($parametros) > 1000) {
    error_json('La consulta es demasiado larga.', 422);
}

$st = $db->prepare('SELECT COUNT(*) FROM usuario_consulta WHERE usuario_id = ?');
$st->bind_param('i', $u['id']);
$st->execute();
if ((int) $st->get_result()->fetch_row()[0] >= MAX_CONSULTAS) {
    error_json('Se pueden guardar hasta ' . MAX_CONSULTAS . ' consultas. Borrá alguna para agregar otra.', 422);
}

$st = $db->prepare('INSERT INTO usuario_consulta (usuario_id, nombre, herramienta, parametros) VALUES (?, ?, ?, ?)');
$st->bind_param('isss', $u['id'], $nombre, $herramienta, $parametros);
$st->execute();

responder(['ok' => true, 'id' => $db->insert_id]);
