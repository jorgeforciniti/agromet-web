<?php
/*
 * GET ?fecha=AAAA-MM-DD → lluvia de 9 a 9 que termina ese día a las 9:00 (reemplaza RR9a9.php):
 *   desde el día anterior después de las 9:00 hasta ese día a las 9:00 inclusive.
 * {ok, desde, hasta, estaciones:[{id, nombre, mm, horas}]}
 *   mm: null si la estación no tiene registros en el período.
 *   horas: horas cubiertas por los registros (24 = período completo).
 */
require_once __DIR__ . '/comun.php';

exigir_metodo('GET');
administrador_actual();

$hasta = validar_fecha($_GET['fecha'] ?? '', 'fecha');
$desde = date('Y-m-d', strtotime("$hasta -1 day"));

$est = '`' . DB_ESTACIONES . '`';
// LEFT JOIN: también aparecen las estaciones habilitadas sin registros (para ver las que faltan)
$sql = "SELECT e.identificacion AS id, e.nombre, e.tiempo,
               SUM(d.lluvia) AS mm, COUNT(d.lluvia) AS registros, COUNT(d.temp_AF) AS registros_temp
        FROM $est.estaciones e
        LEFT JOIN $est.datos_estaciones d
               ON d.identificacion = e.identificacion
              AND ((d.fecha = ? AND d.hora <= '09:00:00') OR (d.fecha = ? AND d.hora > '09:00:00'))
        WHERE e.habilitada > 0
        GROUP BY e.identificacion, e.nombre, e.tiempo
        ORDER BY e.nombre";
$st = conexion()->prepare($sql);
$st->bind_param('ss', $hasta, $desde);
$st->execute();
$filas = $st->get_result()->fetch_all(MYSQLI_ASSOC);

$estaciones = array_map(function ($f) {
    $registros = (int) $f['registros'];
    return [
        'id' => (string) $f['id'],
        'nombre' => trim($f['nombre']),
        'mm' => $registros > 0 ? round((float) $f['mm'], 1) : null,
        // Igual que RR9a9.php: registros × intervalo de la estación (minutos) / 60
        'horas' => round((int) $f['registros_temp'] * (float) $f['tiempo'] / 60, 2),
    ];
}, $filas);

responder(['ok' => true, 'desde' => $desde, 'hasta' => $hasta, 'estaciones' => $estaciones]);
