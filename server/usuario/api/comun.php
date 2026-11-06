<?php
/*
 * Base común de /usuario/api: respuestas JSON, usuario desde el token, conexión y validaciones.
 * Cada endpoint hace:  require_once __DIR__ . '/comun.php';  $u = usuario_actual();
 * El usuario se toma SÓLO del token (uid), nunca de datos enviados por el navegador.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/firebase_token.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
error_reporting(E_ALL);
ini_set('display_errors', '0');
date_default_timezone_set('America/Argentina/Buenos_Aires');

// Cualquier error no previsto (por ejemplo, de MySQL) responde JSON en vez de una página vacía.
// El detalle queda en el log (ver abajo), no en la respuesta.
set_exception_handler(function (Throwable $e) {
    // También en errores.log de esta carpeta (el .htaccess impide leerlo desde afuera), porque
    // en este servidor el log de Apache no está accesible
    $linea = date('Y-m-d H:i:s') . ' ' . $e->getMessage() . ' en ' . basename($e->getFile()) . ':' . $e->getLine();
    error_log('usuarios/api: ' . $linea);
    @error_log($linea . "\n", 3, __DIR__ . '/errores.log');
    http_response_code(500);
    $respuesta = ['ok' => false, 'error' => 'Error interno del servidor.'];
    if ($e instanceof mysqli_sql_exception) {
        // Sólo el número de error de MySQL (ej. 1142 = falta un permiso): orienta sin exponer detalles
        $respuesta['codigo'] = $e->getCode();
    }
    echo json_encode($respuesta, JSON_UNESCAPED_UNICODE);
});

/** Termina con una respuesta JSON. */
function responder(array $datos, int $codigo = 200)
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

function error_json(string $mensaje, int $codigo = 400)
{
    responder(['ok' => false, 'error' => $mensaje], $codigo);
}

function exigir_metodo(string ...$metodos): string
{
    $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($m, $metodos, true)) {
        header('Allow: ' . implode(', ', $metodos));
        error_json('Método no permitido.', 405);
    }
    return $m;
}

/** Cuerpo JSON del pedido (objeto), o error 400. */
function cuerpo_json(): array
{
    $texto = file_get_contents('php://input', false, null, 0, 20000);
    $datos = json_decode((string) $texto, true);
    if (!is_array($datos)) {
        error_json('El cuerpo del pedido debe ser JSON.');
    }
    return $datos;
}

/**
 * Conexión mysqli (una sola por pedido) a DB_USUARIOS, reutilizando conecta_mysql.php.
 * Las estaciones se consultan con el nombre de su base (DB_ESTACIONES.TABLA_ESTACIONES).
 */
function conexion(): mysqli
{
    static $cx = null;
    if ($cx) {
        return $cx;
    }
    $db = DB_USUARIOS; // conecta_mysql.php usa $db
    ob_start();   // descarta cualquier salida de conecta_mysql.php (rompería el JSON)
    require RUTA_CONECTA_MYSQL;
    ob_end_clean();
    if (!isset($conexion) || !($conexion instanceof mysqli)) {
        error_json('No se pudo conectar a la base de datos.', 500);
    }
    // En PHP 7.3 un "new mysqli" fallido no lanza excepción: se informa el código (1045 = usuario
    // o contraseña incorrectos, 1044 = sin acceso a la base, 2002 = servidor no encontrado)
    if ($conexion->connect_errno) {
        responder(['ok' => false, 'error' => 'No se pudo conectar a la base de datos.',
            'codigo' => $conexion->connect_errno], 500);
    }
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $conexion->set_charset('utf8mb4');
    return $cx = $conexion;
}

/**
 * Usuario de la sesión: valida el token y devuelve ['id', 'uid', 'email'].
 * Crea la fila la primera vez y registra el último acceso.
 */
function usuario_actual(): array
{
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(\S+)$/', $auth, $m)) {
        error_json('Falta header Authorization: Bearer TOKEN.', 401);
    }
    $claims = verificar_token_firebase($m[1], FIREBASE_PROJECT_ID);
    if (!$claims) {
        error_json('Token Firebase invalido o expirado.', 401);
    }

    $uid = $claims['sub'];
    $email = isset($claims['email']) && is_string($claims['email']) ? substr($claims['email'], 0, 190) : null;
    $db = conexion();

    $st = $db->prepare('INSERT INTO usuario (firebase_uid, email, ultimo_acceso) VALUES (?, ?, NOW())
                        ON DUPLICATE KEY UPDATE email = VALUES(email), ultimo_acceso = NOW()');
    $st->bind_param('ss', $uid, $email);
    $st->execute();

    $st = $db->prepare('SELECT id FROM usuario WHERE firebase_uid = ?');
    $st->bind_param('s', $uid);
    $st->execute();
    $id = (int) $st->get_result()->fetch_row()[0];

    return ['id' => $id, 'uid' => $uid, 'email' => $email];
}

/** Identificadores de estaciones habilitadas (para validar lo que llega). */
function estaciones_validas(): array
{
    static $ids = null;
    if ($ids === null) {
        $tabla = '`' . DB_ESTACIONES . '`.`' . TABLA_ESTACIONES . '`';
        $res = conexion()->query("SELECT Identificacion FROM $tabla WHERE habilitada > 0");
        $ids = array_map('strval', array_column($res->fetch_all(MYSQLI_ASSOC), 'Identificacion'));
    }
    return $ids;
}

function validar_estacion($id, string $campo = 'estacion'): string
{
    $id = is_scalar($id) ? trim((string) $id) : '';
    if ($id === '' || !in_array($id, estaciones_validas(), true)) {
        error_json("La $campo no existe o no está habilitada.", 422);
    }
    return $id;
}

function validar_id($id): int
{
    if (!is_numeric($id) || (int) $id <= 0) {
        error_json('Identificador inválido.', 422);
    }
    return (int) $id;
}
