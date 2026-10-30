<?php
/*
 * GET → estado de las comunicaciones de las estaciones UDP (reemplaza datos.php del visor de estaciones).
 * {ok, ahora, resumen:{ok, retraso, sin}, estaciones:[...], eventos:[...], por_tipo:[{error_c, n}]}
 *
 * Estaciones habilitadas con gprs=1. La última recepción sale de `comunicaciones` (momento en que
 * llegó la trama al servidor) y el dato más reciente de `datos_estaciones` (momento de la medición).
 *   ok: recibió datos hace 20 min o menos; retraso: 20 a 60 min; sin: más de 60 min o nunca.
 */
require_once __DIR__ . '/comun.php';

exigir_metodo('GET');
administrador_actual();

$est = '`' . DB_ESTACIONES . '`';
$cx = conexion();

try {
    $estaciones = $cx->query("
        SELECT e.Identificacion AS id, e.nombre,
               (SELECT MAX(c.fechahora) FROM $est.comunicaciones c
                 WHERE c.estacion = e.Identificacion AND c.fechahora >= NOW() - INTERVAL 3 DAY AND c.error_c IN (9,2)) AS ult_recepcion,
               (SELECT COUNT(*) FROM $est.comunicaciones c
                 WHERE c.estacion = e.Identificacion AND c.fechahora >= NOW() - INTERVAL 1 HOUR AND c.error_c = 3) AS errores_1h,
               (SELECT TIMESTAMP(d.Fecha, d.Hora) FROM $est.datos_estaciones d
                 WHERE d.Identificacion = e.Identificacion ORDER BY d.Fecha DESC, d.Hora DESC LIMIT 1) AS ult_dato
        FROM $est.estaciones e
        WHERE e.habilitada > 0 AND e.gprs = 1
        ORDER BY e.nombre")->fetch_all(MYSQLI_ASSOC);

    $eventos = $cx->query("
        SELECT c.id, c.fechahora, c.error_c, c.estacion, c.detalle, e.nombre
        FROM $est.comunicaciones c LEFT JOIN $est.estaciones e ON e.Identificacion = c.estacion
        ORDER BY c.id DESC LIMIT 150")->fetch_all(MYSQLI_ASSOC);

    $por_tipo = $cx->query("
        SELECT error_c, COUNT(*) AS n FROM $est.comunicaciones
        WHERE id > (SELECT MAX(id) - 3000 FROM $est.comunicaciones) AND fechahora >= NOW() - INTERVAL 1 HOUR
        GROUP BY error_c")->fetch_all(MYSQLI_ASSOC);

    $ahora = $cx->query('SELECT NOW() AS ahora')->fetch_assoc()['ahora'];
} catch (mysqli_sql_exception $e) {
    error_tablas_estaciones($e);
}

$t_ahora = strtotime($ahora);
$minutos = function ($fecha) use ($t_ahora) {
    return $fecha ? (int) floor(($t_ahora - strtotime($fecha)) / 60) : null;
};

$resumen = ['ok' => 0, 'retraso' => 0, 'sin' => 0];
$estaciones = array_map(function ($e) use ($minutos, &$resumen) {
    $rec = $minutos($e['ult_recepcion']);
    $estado = $rec === null || $rec > 60 ? 'sin' : ($rec > 20 ? 'retraso' : 'ok');
    $resumen[$estado]++;
    return [
        'id' => (string) $e['id'],
        'nombre' => trim((string) $e['nombre']),
        'estado' => $estado,
        'min_recepcion' => $rec,
        'ult_dato' => $e['ult_dato'],
        // Negativo: el dato tiene fecha posterior a la del servidor (reloj de la estación adelantado)
        'min_dato' => $minutos($e['ult_dato']),
        'errores_1h' => (int) $e['errores_1h'],
    ];
}, $estaciones);

$eventos = array_map(function ($e) {
    return [
        'id' => (int) $e['id'],
        'fechahora' => $e['fechahora'],
        'error_c' => (int) $e['error_c'],
        'estacion' => (string) $e['estacion'],
        'nombre' => $e['nombre'] === null ? null : trim($e['nombre']),
        'detalle' => (string) $e['detalle'],
    ];
}, $eventos);

$por_tipo = array_map(function ($t) {
    return ['error_c' => (int) $t['error_c'], 'n' => (int) $t['n']];
}, $por_tipo);

echo json_encode([
    'ok' => true,
    'ahora' => $ahora,
    'resumen' => $resumen,
    'estaciones' => $estaciones,
    'eventos' => $eventos,
    'por_tipo' => $por_tipo,
], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
