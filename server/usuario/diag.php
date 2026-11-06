<?php
/*
 * Diagnóstico de la API de usuarios. Subir a public_html/services/usuarios/, abrirlo una vez en
 * el navegador y BORRARLO después. No muestra credenciales ni datos de la base.
 */
header('Content-Type: text/plain; charset=utf-8');
ini_set('display_errors', '1');
error_reporting(E_ALL);

register_shutdown_function(function () {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_COMPILE_ERROR, E_CORE_ERROR], true)) {
        echo "\n*** ERROR FATAL: {$e['message']}\n    en " . basename($e['file']) . " línea {$e['line']}\n";
    }
});

echo "PHP " . PHP_VERSION . " (" . PHP_SAPI . ")\n";
foreach (['mysqli', 'mysqlnd', 'openssl', 'json'] as $ext) {
    echo str_pad($ext, 10) . (extension_loaded($ext) ? "sí" : "NO") . "\n";
}
echo "allow_url_fopen: " . (ini_get('allow_url_fopen') ? "sí" : "NO") . "\n";
echo "get_result (mysqlnd): " . (method_exists('mysqli_stmt', 'get_result') ? "sí" : "NO") . "\n";
echo "Header Authorization recibido: " . (isset($_SERVER['HTTP_AUTHORIZATION']) || isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) ? "sí" : "no (normal si no se mandó)") . "\n\n";

// Cada archivo se carga por separado: un error de sintaxis se informa con archivo y línea
foreach (['config.php', 'firebase_token.php'] as $archivo) {
    echo "Cargando $archivo... ";
    try {
        require_once __DIR__ . '/' . $archivo;
        echo "ok\n";
    } catch (Throwable $e) {
        echo "ERROR: " . get_class($e) . ": " . $e->getMessage() . " (línea " . $e->getLine() . ")\n";
        exit;
    }
}

echo "conecta_mysql.php existe: " . (is_file(RUTA_CONECTA_MYSQL) ? "sí" : "NO (" . RUTA_CONECTA_MYSQL . ")") . "\n";
try {
    $db = DB_USUARIOS;
    ob_start();
    require RUTA_CONECTA_MYSQL;
    ob_end_clean();
    echo "Conexión a la base '" . DB_USUARIOS . "': " . (isset($conexion) && $conexion instanceof mysqli ? "ok" : "NO") . "\n";
    if (isset($conexion) && $conexion instanceof mysqli) {
        $r = $conexion->query("SHOW TABLES LIKE 'usuario%'");
        echo "Tablas usuario*: " . ($r ? $r->num_rows : 'error: ' . $conexion->error) . "\n";
        $r = $conexion->query('SELECT COUNT(*) FROM `' . DB_ESTACIONES . '`.`' . TABLA_ESTACIONES . '` WHERE habilitada > 0');
        echo "Estaciones habilitadas visibles: " . ($r ? $r->fetch_row()[0] : 'error: ' . $conexion->error) . "\n";
    }
} catch (Throwable $e) {
    @ob_end_clean();
    echo "ERROR al conectar: " . get_class($e) . ": " . $e->getMessage() . "\n";
}

// Prueba de la conexión de escritura (conecta_usuarios.php). El mensaje de MySQL dice con qué
// usuario y desde qué servidor llega la conexión, y si se envió contraseña; nunca la contraseña.
$archivo = __DIR__ . '/conecta_usuarios.php';
echo "\nconecta_usuarios.php existe: " . (is_file($archivo) ? "sí" : "NO") . "\n";
if (is_file($archivo)) {
    $db = DB_USUARIOS;
    unset($conexion);
    mysqli_report(MYSQLI_REPORT_OFF);
    ob_start();
    @include $archivo;
    ob_end_clean();
    if (!isset($conexion) || !($conexion instanceof mysqli)) {
        echo "conecta_usuarios.php no define \$conexion\n";
    } elseif ($conexion->connect_errno) {
        echo "Conexión de escritura: ERROR {$conexion->connect_errno}: {$conexion->connect_error}\n";
    } else {
        $r = $conexion->query('SELECT CURRENT_USER()');
        echo "Conexión de escritura: ok como " . ($r ? $r->fetch_row()[0] : '?') . "\n";
        $r = $conexion->query('SHOW GRANTS');
        while ($r && ($fila = $r->fetch_row())) {
            echo "  " . preg_replace('/IDENTIFIED BY .*/', '', $fila[0]) . "\n";
        }
    }
}

echo "Certificados de Google: ";
try {
    echo count(certificados_firebase()) . " (tiene que ser 2 o más)\n";
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}

echo "\nCargando comun.php... ";
try {
    // comun.php cambia el Content-Type a JSON; no importa para este diagnóstico
    require_once __DIR__ . '/comun.php';
    echo "ok\n";
} catch (Throwable $e) {
    echo "ERROR: " . get_class($e) . ": " . $e->getMessage() . " (línea " . $e->getLine() . ")\n";
}
echo "\nFin del diagnóstico. Borrá este archivo del servidor.\n";
