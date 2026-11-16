<?php
/*
 * Cantidad de consultas de los feeds para terceros de /api/ (tabla `api_consultas`, la llena
 * /services/registro-consultas.php: una fila por día, feed e IP).
 *
 * GET ?dias=30 (de 7 a 400) →
 *   {ok, desde, hasta,
 *    apis:[{api, total, ips, ultima, por_dia:[{dia, consultas}]}],
 *    ips:[{api, ip, consultas, dias, ultima}]}
 */
require_once __DIR__ . '/comun.php';

exigir_metodo('GET');
administrador_actual();

$dias = isset($_GET['dias']) ? (int) $_GET['dias'] : 30;
$dias = max(7, min(400, $dias));
$hasta = date('Y-m-d');
$desde = date('Y-m-d', strtotime("$hasta -" . ($dias - 1) . ' day'));

$est = '`' . DB_ESTACIONES . '`';
$cx = conexion();

try {
    $st = $cx->prepare("SELECT api, dia, SUM(consultas) AS consultas FROM $est.api_consultas
        WHERE dia BETWEEN ? AND ? GROUP BY api, dia ORDER BY api, dia");
    $st->bind_param('ss', $desde, $hasta);
    $st->execute();
    $porDia = $st->get_result()->fetch_all(MYSQLI_ASSOC);

    $st = $cx->prepare("SELECT api, ip, SUM(consultas) AS consultas, COUNT(*) AS dias, MAX(ultima) AS ultima
        FROM $est.api_consultas WHERE dia BETWEEN ? AND ? GROUP BY api, ip ORDER BY consultas DESC");
    $st->bind_param('ss', $desde, $hasta);
    $st->execute();
    $porIp = $st->get_result()->fetch_all(MYSQLI_ASSOC);
} catch (mysqli_sql_exception $e) {
    if ($e->getCode() === 1146) {
        error_json('Falta crear la tabla api_consultas en la base `' . DB_ESTACIONES . '` (ver server/admin/LEEME.md).', 500);
    }
    if ($e->getCode() === 1142) {
        error_json('El usuario de conecta_admin.php no tiene permiso SELECT sobre la tabla api_consultas.', 500);
    }
    throw $e;
}

$apis = [];
foreach ($porDia as $f) {
    $api = $f['api'];
    if (!isset($apis[$api])) $apis[$api] = ['api' => $api, 'total' => 0, 'ips' => 0, 'ultima' => null, 'por_dia' => []];
    $apis[$api]['total'] += (int) $f['consultas'];
    $apis[$api]['por_dia'][] = ['dia' => $f['dia'], 'consultas' => (int) $f['consultas']];
}
foreach ($porIp as $f) {
    $api = $f['api'];
    if (!isset($apis[$api])) continue;
    $apis[$api]['ips']++;
    if ($apis[$api]['ultima'] === null || $f['ultima'] > $apis[$api]['ultima']) $apis[$api]['ultima'] = $f['ultima'];
}
usort($apis, function ($a, $b) {
    return $b['total'] - $a['total'];
});

responder([
    'ok' => true,
    'desde' => $desde,
    'hasta' => $hasta,
    'apis' => array_values($apis),
    'ips' => array_map(function ($f) {
        return [
            'api' => $f['api'],
            'ip' => $f['ip'],
            'consultas' => (int) $f['consultas'],
            'dias' => (int) $f['dias'],
            'ultima' => $f['ultima'],
        ];
    }, $porIp),
]);
