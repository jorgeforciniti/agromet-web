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
// LEFT JOIN: también aparecen las estaciones habilitadas sin registros (para ver las que faltan).
// Las deshabilitadas aparecen si tienen registros en el período (para revisar sus datos).
// Los registros se filtran y agrupan antes del JOIN con un rango simple de `fecha` (usa el índice
// `Fecha`); las horas del primer y del último día se descartan aparte. Con el OR entre fecha y hora
// dentro del ON, MySQL recorría la tabla de registros entera (más de 800 s con la tabla bloqueada).
$sql = "SELECT e.identificacion AS id, e.nombre, e.tiempo, e.habilitada,
               d.mm, COALESCE(d.registros, 0) AS registros, COALESCE(d.registros_temp, 0) AS registros_temp
        FROM $est.estaciones e
        LEFT JOIN (
            SELECT identificacion,
                   SUM(lluvia) AS mm, COUNT(lluvia) AS registros, COUNT(temp_AF) AS registros_temp
            FROM $est.datos_estaciones
            WHERE fecha BETWEEN ? AND ?
              AND NOT (fecha = ? AND hora <= '09:00:00')
              AND NOT (fecha = ? AND hora > '09:00:00')
            GROUP BY identificacion
        ) d ON d.identificacion = e.identificacion
        WHERE e.habilitada > 0 OR d.identificacion IS NOT NULL
        ORDER BY e.nombre";
$st = conexion()->prepare($sql);
$st->bind_param('ssss', $desde, $hasta, $desde, $hasta);
$st->execute();
$filas = $st->get_result()->fetch_all(MYSQLI_ASSOC);

$estaciones = array_map(function ($f) {
    $registros = (int) $f['registros'];
    return [
        'id' => (string) $f['id'],
        'nombre' => trim($f['nombre']),
        'habilitada' => (int) $f['habilitada'] > 0,
        'mm' => $registros > 0 ? round((float) $f['mm'], 1) : null,
        // Igual que RR9a9.php: registros × intervalo de la estación (minutos) / 60
        'horas' => round((int) $f['registros_temp'] * (float) $f['tiempo'] / 60, 2),
    ];
}, $filas);

responder(['ok' => true, 'desde' => $desde, 'hasta' => $hasta, 'estaciones' => $estaciones]);
