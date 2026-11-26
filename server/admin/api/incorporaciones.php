<?php
/*
 * Pedidos para sumar una estación propia a la red (página pública /suma-tu-estacion).
 *
 * POST sin token (público) → registra el pedido y avisa por correo a AVISO_INCORPORACIONES.
 *   {nombre, email, telefono?, ubicacion, estacion?, internet?, comentarios?, sitio_web}
 *   `sitio_web` es una trampa para robots: el formulario lo deja vacío.
 *   → {ok, mensaje}
 * GET (administrador) → {ok, pedidos:[...]} los últimos 200, del más nuevo al más viejo.
 * POST {accion:'atendido', id, atendido} (administrador) → marca o desmarca el pedido.
 *
 * Tabla admin.incorporaciones_estacion (ver LEEME.md).
 */
require_once __DIR__ . '/comun.php';

const TABLA_INCORPORACIONES = '`' . DB_ADMIN . '`.`incorporaciones_estacion`';
const INTERNET_VALIDOS = ['', 'si', 'no', 'no_se'];

$metodo = exigir_metodo('GET', 'POST');

/** Texto de un campo: recortado, sin caracteres de control y de hasta $max caracteres. */
function texto_campo(array $datos, string $campo, int $max, bool $multilinea = false): string
{
    $valor = isset($datos[$campo]) && is_string($datos[$campo]) ? trim($datos[$campo]) : '';
    $valor = preg_replace($multilinea ? '/[^\P{C}\n]/u' : '/\p{C}/u', '', $valor) ?? '';
    return mb_strlen($valor) > $max ? mb_substr($valor, 0, $max) : $valor;
}

function error_tabla_incorporaciones(mysqli_sql_exception $e)
{
    if (in_array($e->getCode(), [1146, 1142], true)) {   // falta la tabla o el permiso
        error_json('Todavía no se pueden recibir pedidos por el sitio. Escribinos a ' . AVISO_INCORPORACIONES . '.', 503);
    }
    throw $e;
}

if ($metodo === 'GET') {
    administrador_actual();
    try {
        $filas = conexion()->query('SELECT * FROM ' . TABLA_INCORPORACIONES . ' ORDER BY id DESC LIMIT 200')
            ->fetch_all(MYSQLI_ASSOC);
    } catch (mysqli_sql_exception $e) {
        error_tabla_incorporaciones($e);
    }
    responder(['ok' => true, 'pedidos' => array_map(function ($f) {
        return [
            'id' => (int) $f['id'],
            'creado' => $f['creado'],
            'nombre' => $f['nombre'],
            'email' => $f['email'],
            'telefono' => $f['telefono'],
            'ubicacion' => $f['ubicacion'],
            'estacion' => $f['estacion'],
            'internet' => $f['internet'],
            'comentarios' => $f['comentarios'],
            'atendido' => $f['atendido'] !== null,
            'atendido_por' => $f['atendido_por'],
        ];
    }, $filas)]);
}

$datos = cuerpo_json();

if (($datos['accion'] ?? '') === 'atendido') {
    $admin = administrador_actual();
    $id = filter_var($datos['id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id) {
        error_json('Falta el pedido.', 422);
    }
    $atendido = empty($datos['atendido']) ? 0 : 1;
    try {
        $st = conexion()->prepare('UPDATE ' . TABLA_INCORPORACIONES
            . ' SET atendido = IF(?, NOW(), NULL), atendido_por = IF(?, ?, NULL) WHERE id = ?');
        $st->bind_param('iisi', $atendido, $atendido, $admin, $id);
        $st->execute();
    } catch (mysqli_sql_exception $e) {
        error_tabla_incorporaciones($e);
    }
    responder(['ok' => true]);
}

// ---- Pedido público ----

// Un robot completa todos los campos: se le responde como si nada para que no reintente
if (texto_campo($datos, 'sitio_web', 200) !== '') {
    responder(['ok' => true, 'mensaje' => 'Recibimos tu pedido.']);
}

$nombre = texto_campo($datos, 'nombre', 120);
$email = strtolower(texto_campo($datos, 'email', 160));
$telefono = texto_campo($datos, 'telefono', 40);
$ubicacion = texto_campo($datos, 'ubicacion', 200);
$estacion = texto_campo($datos, 'estacion', 120);
$internet = texto_campo($datos, 'internet', 10);
$comentarios = texto_campo($datos, 'comentarios', 2000, true);

if ($nombre === '') {
    error_json('Escribí tu nombre.', 422);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    error_json('Revisá el correo electrónico.', 422);
}
if ($ubicacion === '') {
    error_json('Contanos dónde está la estación.', 422);
}
if (!in_array($internet, INTERNET_VALIDOS, true)) {
    $internet = '';
}

$ip = ip_cliente();
$cx = conexion();
try {
    // Tope contra envíos repetidos: 3 por hora desde la misma IP
    $st = $cx->prepare('SELECT COUNT(*) AS n FROM ' . TABLA_INCORPORACIONES
        . ' WHERE ip = ? AND creado >= NOW() - INTERVAL 1 HOUR');
    $st->bind_param('s', $ip);
    $st->execute();
    if ((int) $st->get_result()->fetch_assoc()['n'] >= 3) {
        error_json('Ya recibimos tus pedidos. Si necesitás agregar algo, escribinos a ' . AVISO_INCORPORACIONES . '.', 429);
    }

    $st = $cx->prepare('INSERT INTO ' . TABLA_INCORPORACIONES
        . ' (nombre, email, telefono, ubicacion, estacion, internet, comentarios, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $st->bind_param('ssssssss', $nombre, $email, $telefono, $ubicacion, $estacion, $internet, $comentarios, $ip);
    $st->execute();
    $id = $cx->insert_id;
} catch (mysqli_sql_exception $e) {
    error_tabla_incorporaciones($e);
}

// Aviso por correo: si el servidor no puede mandarlo, el pedido igual queda en /admin
$conexion_internet = ['si' => 'Sí', 'no' => 'No', 'no_se' => 'No sabe', '' => '—'][$internet];
$cuerpo = "Pedido n.º $id para sumar una estación a la red (agromet.eeaoc.gob.ar/suma-tu-estacion)\n\n"
    . "Nombre: $nombre\nCorreo: $email\nTeléfono: " . ($telefono ?: '—') . "\n"
    . "Ubicación de la estación: $ubicacion\nMarca y modelo: " . ($estacion ?: '—') . "\n"
    . "Conexión a internet: $conexion_internet\n\nComentarios:\n" . ($comentarios ?: '—') . "\n\n"
    . "También se ve en Administración → Sumar estaciones.\n";
$encabezados = "From: Agromet EEAOC <" . REMITENTE_AVISOS . ">\r\nReply-To: $email\r\n"
    . "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit";
if (!@mail(AVISO_INCORPORACIONES, '=?UTF-8?B?' . base64_encode("Sumar estación a la red: $nombre") . '?=', $cuerpo, $encabezados)) {
    error_log("admin/api: no se pudo mandar el aviso del pedido de incorporación $id");
}

responder(['ok' => true, 'mensaje' => 'Recibimos tu pedido.']);
