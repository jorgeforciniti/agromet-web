<?php
/*
 * Cantidad de consultas de los feeds para terceros (/api/: SMN, COVIAR, Citrusvil, CONICET, valles,
 * El Charco). Suma una consulta por día, feed e IP en la tabla `estaciones.api_consultas` (no guarda
 * los parámetros ni la respuesta). Se ve en /admin, pestaña «Consultas de APIs».
 *
 * Uso (después de conecta_mysql.php):
 *   require_once 'registro-consultas.php';
 *   registrarConsulta($conexion, 'smn');
 *
 * Si la tabla no existe o falta el permiso, no hace nada: el feed responde igual.
 */

if (basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

function registrarConsulta($conexion, $api) {
    if (!$conexion) return;
    $ip = isset($_SERVER['REMOTE_ADDR']) ? substr((string)$_SERVER['REMOTE_ADDR'], 0, 45) : '';
    try {
        $st = @$conexion->prepare("INSERT INTO api_consultas (dia, api, ip, consultas, ultima)
            VALUES (CURDATE(), ?, ?, 1, NOW())
            ON DUPLICATE KEY UPDATE consultas = consultas + 1, ultima = NOW()");
        if ($st) {
            $st->bind_param('ss', $api, $ip);
            @$st->execute();
            $st->close();
        }
    } catch (Throwable $e) {
        // sin la tabla o sin permiso: el feed sigue igual
    }
}
