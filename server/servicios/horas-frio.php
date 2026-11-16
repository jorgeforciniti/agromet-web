<?php
/*
 * Horas de frío y unidades Utah por día de una estación (app móvil, Más → Herramientas).
 *
 * GET /services/horas-frio.php?estacion=<id>&desde=AAAA-MM-DD&hasta=AAAA-MM-DD&base=7
 *
 * Mismo cálculo que chill-hours-dialog del sitio (shared/registros-diarios.ts): cada registro vale el
 * intervalo de la estación ese día (mediana de registros por hora), un día cuenta sólo con al menos 5/6
 * de los registros esperados, horas = registros con temp_af ≤ base, Utah según Richardson (1974).
 * Se hace acá para que el celular no baje los registros cada 15 minutos (unos 7 MB por cinco meses).
 * Período máximo: HORAS_FRIO_DIAS_MAXIMO días. Sin los sensores dados de baja (depuracion.php).
 */

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

error_reporting(E_ALL);
ini_set('display_errors', 0);

date_default_timezone_set('America/Argentina/Buenos_Aires');

$db = "estaciones";
require_once 'conecta_mysql.php';
require_once 'depuracion.php';

mysqli_set_charset($conexion, 'utf8');

define('HORAS_FRIO_DIAS_MAXIMO', 186);

function error_json($codigo, $mensaje)
{
    http_response_code($codigo);
    echo json_encode(['status' => 'error', 'message' => $mensaje]);
    exit;
}

function validarFecha($fecha)
{
    $d = DateTime::createFromFormat('Y-m-d', $fecha);
    return $d && $d->format('Y-m-d') === $fecha;
}

/* Unidades Utah por hora (Richardson et al., 1974) */
function unidadesUtah($t)
{
    if ($t < 1.5) return 0;
    if ($t <= 2.5) return 0.5;
    if ($t <= 9.2) return 1;
    if ($t <= 12.5) return 0.5;
    if ($t <= 16) return 0;
    if ($t <= 18) return -0.5;
    return -1;
}

$desde = isset($_GET['desde']) ? $_GET['desde'] : null;
$hasta = isset($_GET['hasta']) ? $_GET['hasta'] : null;
$estacion = isset($_GET['estacion']) ? intval($_GET['estacion']) : 0;
$base = isset($_GET['base']) && is_numeric($_GET['base']) ? (float) $_GET['base'] : 7.0;

if ($estacion <= 0 || !validarFecha($desde) || !validarFecha($hasta)) {
    error_json(400, 'Faltan parametros requeridos: estacion, desde o hasta.');
}
if ($desde > $hasta) {
    error_json(400, 'El parametro desde no puede ser mayor que hasta.');
}
$dias = (new DateTime($desde))->diff(new DateTime($hasta))->days + 1;
if ($dias > HORAS_FRIO_DIAS_MAXIMO) {
    error_json(400, 'El periodo no puede superar ' . HORAS_FRIO_DIAS_MAXIMO . ' dias.');
}
if ($base < -5 || $base > 15) {
    error_json(400, 'La temperatura base tiene que estar entre -5 y 15.');
}
if (!$conexion) {
    error_json(500, 'Error de conexion a la base de datos.');
}

$sql = "SELECT Fecha, Hora, Temp_AF
        FROM datos_estaciones
        WHERE Identificacion = $estacion
          AND Fecha >= '$desde'
          AND Fecha <= '$hasta'
        ORDER BY Fecha, Hora";

$result = $conexion->query($sql);
if (!$result) {
    error_json(500, 'Error en la consulta de datos.');
}

$bajas = depuracionBajas($conexion, $estacion, $desde, $hasta);

// Registros por día: [fecha => [[minutos, temp|null], ...]]
$porDia = [];
while ($row = $result->fetch_assoc()) {
    $fila = ['temp_af' => is_numeric($row['Temp_AF']) ? (float) $row['Temp_AF'] : null];
    depuracionLimpiarDia($fila, $bajas, $estacion, $row['Fecha'], DEPURACION_CAMPOS_REGISTRO);
    $partes = explode(':', (string) $row['Hora']);
    if (count($partes) < 2) continue;
    $minutos = intval($partes[0]) * 60 + intval($partes[1]);
    $temp = array_key_exists('temp_af', $fila) ? $fila['temp_af'] : null;
    $porDia[(string) $row['Fecha']][] = [$minutos, $temp];
}
$conexion->close();

$data = [];
foreach ($porDia as $fecha => $registros) {
    // Intervalo: 60 / mediana de registros por hora (evaluarDia de registros-diarios.ts)
    $porHora = [];
    foreach ($registros as $r) {
        $h = intdiv($r[0], 60);
        $porHora[$h] = (isset($porHora[$h]) ? $porHora[$h] : 0) + 1;
    }
    $cuentas = array_values($porHora);
    sort($cuentas);
    $mediana = $cuentas[intdiv(count($cuentas), 2)];
    $intervalo = 60 / $mediana;
    $horasPorRegistro = $intervalo / 60;

    $validos = array_filter($registros, function ($r) { return $r[1] !== null; });
    $esperados = 1440 / $intervalo;
    $suficiente = count($validos) >= ceil($esperados * 5 / 6);

    $horas = 0;
    $utah = 0;
    if ($suficiente) {
        foreach ($validos as $r) {
            if ($r[1] <= $base) $horas += $horasPorRegistro;
            $utah += unidadesUtah($r[1]) * $horasPorRegistro;
        }
    }

    $data[] = [
        'fecha' => $fecha,
        'horas' => $suficiente ? round($horas, 2) : null,
        'utah' => $suficiente ? round($utah, 2) : null,
        'registros' => count($validos),
        'suficiente' => $suficiente,
    ];
}

echo json_encode(['status' => 'success', 'base' => $base, 'data' => $data]);
