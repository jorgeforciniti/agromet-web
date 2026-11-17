<?php

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('America/Argentina/Buenos_Aires');

$db = "estaciones";
require_once 'conecta_mysql.php';

if (!$conexion) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Error de conexión a la base de datos.']);
    exit;
}

mysqli_set_charset($conexion, 'utf8');

function validarMes($mes) {
    return ($mes >= 1 && $mes <= 12) ? (int)$mes : null;
}

function validarAnio($anio) {
    $anioActual = date("Y");
    return ($anio >= 1900 && $anio <= $anioActual) ? (int)$anio : null;
}

function devuelveMes($mes) {
    $meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return isset($meses[$mes - 1]) ? $meses[$mes - 1] : '';
}

$mes = isset($_GET['mes']) ? validarMes($_GET['mes']) : null;
$anio = isset($_GET['anio']) ? validarAnio($_GET['anio']) : null;

if (is_null($mes) || is_null($anio)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Faltan parámetros requeridos: mes y año.']);
    exit;
}

$response = [];

// Pedimos dos años por si los 12 meses cruzan el año
$sql = "SELECT 
            datos_rr_mes.identificacion as id, 
            nombre, lat, lon, 
            nene as n1, nfeb as n2, nmar as n3, nabr as n4, nmay as n5, njun as n6, 
            njul as n7, nago as n8, nsep as n9, noct as n10, nnov as n11, ndic as n12, 
            anio, 
            ene as r1, feb as r2, mar as r3, abr as r4, may as r5, jun as r6, 
            jul as r7, ago as r8, sep as r9, oct as r10, nov as r11, dic as r12, 
            zona, periodo_normal 
        FROM datos_rr_mes
        -- Sólo la versión vigente de cada localidad (la de id más alto): con todas, cada mes se
        -- repetía una vez por versión y la campaña quedaba cortada
        INNER JOIN (SELECT identificacion, MAX(id) AS id FROM estaciones_rr GROUP BY identificacion) vigente
                ON vigente.identificacion = datos_rr_mes.identificacion
        INNER JOIN estaciones_rr ON estaciones_rr.id = vigente.id
        WHERE anio = $anio OR anio = $anio + 1
        ORDER BY nombre, datos_rr_mes.identificacion, anio";

$result = $conexion->query($sql);

if ($result) {
    $estaciones = [];

    while ($row = $result->fetch_assoc()) {
        $id = (int)$row['id'];
        $anioRow = (int)$row['anio'];

        if (!isset($estaciones[$id])) {
            $estaciones[$id] = [
                'id' => $id,
                'name' => $row['nombre'],
                'lat' => (float)$row['lat'],
                'lon' => (float)$row['lon'],
                'zone' => $row['zona'],
                'reference_period' => $row['periodo_normal'],
                'dataset_raw' => []
            ];
        }

        for ($i = 1; $i <= 12; $i++) {
            $mesCorto = devuelveMes($i);
            $value = isset($row['r' . $i]) ? (float)$row['r' . $i] : null;
            $normal = isset($row['n' . $i]) ? (float)$row['n' . $i] : null;

            $estaciones[$id]['dataset_raw'][] = [
                'year' => $anioRow,
                'month_num' => $i,
                'month' => $mesCorto,
                'value' => $value,
                'normal' => $normal
            ];
        }
    }

    // Recortar a los 12 meses correctos desde $mes, respetando corte entre años
    foreach ($estaciones as $id => &$estacion) {
        $dataset = [];

        // Ordenar por año y mes
        usort($estacion['dataset_raw'], function($a, $b) {
            if ($a['year'] == $b['year']) {
                return $a['month_num'] - $b['month_num'];
            }
            return $a['year'] - $b['year'];
        });

        // Buscar los 12 meses a partir de mes y año seleccionados
        $encontrados = 0;
        $agregar = false;

        foreach ($estacion['dataset_raw'] as $dato) {
            if (!$agregar && $dato['year'] == $anio && $dato['month_num'] == $mes) {
                $agregar = true;
            }

            if ($agregar && $encontrados < 12) {
                $dataset[] = [
                    'year' => $dato['year'],
                    'month' => $dato['month'],
                    'value' => $dato['value'],
                    'normal' => $dato['normal']
                ];
                $encontrados++;
            }
        }

        // Las localidades sin ningún dato (todo en -999,9) se mandan igual: las oculta el diálogo
        // (rain-campaign-dialog), después de sumar el acumulado diario del mes en curso
        $estacion['dataset'] = $dataset;
        unset($estacion['dataset_raw']); // Limpieza
        $response[] = $estacion;
    }

} else {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Error en la consulta de datos.']);
    exit;
}

$conexion->close();

echo json_encode(['status' => 'success', 'data' => $response], JSON_UNESCAPED_UNICODE);
