<?php
/*
 * Base común de /admin/api: respuestas JSON, administrador desde el token y conexión.
 * Cada endpoint hace:  require_once __DIR__ . '/comun.php';  $admin = administrador_actual();
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

// Instalación incompleta: un require fallido cortaría con un 500 vacío
foreach (['RUTA_FIREBASE_TOKEN' => 'la API de usuarios (../usuarios/firebase_token.php)',
          'RUTA_CONECTA_ADMIN' => 'conecta_admin.php'] as $constante => $falta) {
    if (!is_file(constant($constante))) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => "Instalación incompleta en el servidor: falta $falta."], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
require_once RUTA_FIREBASE_TOKEN;

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
error_reporting(E_ALL);
ini_set('display_errors', '0');
date_default_timezone_set('America/Argentina/Buenos_Aires');

set_exception_handler(function (Throwable $e) {
    $linea = date('Y-m-d H:i:s') . ' ' . $e->getMessage() . ' en ' . basename($e->getFile()) . ':' . $e->getLine();
    error_log('admin/api: ' . $linea);
    @error_log($linea . "\n", 3, __DIR__ . '/errores.log');
    http_response_code(500);
    $respuesta = ['ok' => false, 'error' => 'Error interno del servidor.'];
    if ($e instanceof mysqli_sql_exception) {
        $respuesta['codigo'] = $e->getCode();
    }
    echo json_encode($respuesta, JSON_UNESCAPED_UNICODE);
});

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

/** Email del administrador de la sesión; corta con 401/403 si no corresponde. */
function administrador_actual(): string
{
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(\S+)$/', $auth, $m)) {
        error_json('Iniciá sesión para usar la administración.', 401);
    }
    $claims = verificar_token_firebase($m[1], FIREBASE_PROJECT_ID);
    if (!$claims) {
        error_json('La sesión venció. Volvé a iniciar sesión.', 401);
    }
    $email = isset($claims['email']) && is_string($claims['email']) ? strtolower($claims['email']) : '';
    if (!in_array($email, ADMINISTRADORES, true) || ($claims['email_verified'] ?? false) !== true) {
        error_json('Tu cuenta no tiene acceso a la administración.', 403);
    }
    return $email;
}

/** Conexión mysqli (una por pedido) con conecta_admin.php. */
function conexion(): mysqli
{
    static $cx = null;
    if ($cx) {
        return $cx;
    }
    ob_start();   // descarta cualquier salida del archivo de conexión (rompería el JSON)
    require RUTA_CONECTA_ADMIN;
    ob_end_clean();
    if (!isset($conexion) || !($conexion instanceof mysqli) || $conexion->connect_errno) {
        error_json('No se pudo conectar a la base de datos.', 500);
    }
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $conexion->set_charset('utf8mb4');
    return $cx = $conexion;
}

/** Cuerpo JSON del pedido (objeto), o error 400. */
function cuerpo_json(): array
{
    $datos = json_decode((string) file_get_contents('php://input', false, null, 0, 20000), true);
    if (!is_array($datos)) {
        error_json('El cuerpo del pedido debe ser JSON.');
    }
    return $datos;
}

/** Título de un informe (1 a 255 caracteres), o error 422. */
function validar_titulo($valor): string
{
    $titulo = is_string($valor) ? trim($valor) : '';
    if ($titulo === '' || strlen($titulo) > 255) {
        error_json('Escribí un título (hasta 255 caracteres).', 422);
    }
    return $titulo;
}

function validar_categoria($valor): string
{
    $categoria = is_string($valor) ? trim($valor) : '';
    if (!in_array($categoria, CATEGORIAS, true)) {
        error_json('Elegí una categoría.', 422);
    }
    return $categoria;
}

/** Fila de admin.pdfs como la ve el frontend. */
function informe_json(array $f): array
{
    return [
        'id' => (int) $f['id'],
        'titulo' => html_entity_decode(trim($f['titulo']), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
        'archivo' => trim($f['archivo']),
        'creado' => substr((string) $f['creado'], 0, 10),
        'categoria' => trim($f['categoria']),
    ];
}

/** AAAA-MM-DD válida, o error 422. */
function validar_fecha($valor, string $campo): string
{
    $valor = is_string($valor) ? trim($valor) : '';
    $f = DateTime::createFromFormat('!Y-m-d', $valor);
    if (!$f || $f->format('Y-m-d') !== $valor) {
        error_json("La $campo no es válida.", 422);
    }
    return $valor;
}

/** Error de las tablas del visor de estaciones (comunicaciones, comandos_estaciones): mensaje claro. */
function error_tablas_estaciones(mysqli_sql_exception $e)
{
    if ($e->getCode() === 1146) {   // la tabla no existe en esta base
        error_json('La base `' . DB_ESTACIONES . '` de este servidor no tiene las tablas del visor de estaciones (comunicaciones / comandos_estaciones).', 500);
    }
    if ($e->getCode() === 1142) {   // sin permiso sobre la tabla
        error_json('El usuario de conecta_admin.php no tiene permiso sobre las tablas del visor de estaciones.', 500);
    }
    throw $e;
}
