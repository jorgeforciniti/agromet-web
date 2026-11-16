<?php

// Habilitar CORS
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

// Configuración de errores
error_reporting(E_ALL);
ini_set('display_errors', 0); // No mostrar errores al usuario final

// Configuración de zona horaria
date_default_timezone_set('America/Argentina/Buenos_Aires');

// Conexión a la base de datos
$db="estaciones";
require_once 'conecta_mysql.php'; // Se espera que ahí estén las variables $conexion

mysqli_set_charset($conexion, 'utf8');

// Sensores dados de baja: sus campos no se mandan (ver depuracion.php)
require_once 'depuracion.php';

function validarFecha($fecha) {
    $d = DateTime::createFromFormat('Y-m-d', $fecha);
    return $d && $d->format('Y-m-d') === $fecha;
}

$desde = isset($_GET['desde']) ? $_GET['desde'] : null;
$hasta = isset($_GET['hasta']) ? $_GET['hasta'] : null;

$desde = (validarFecha($desde)) ? $desde : null;
$hasta = (validarFecha($hasta)) ? $hasta : null;

$estacion = isset($_GET['estacion']) ? filter_var($_GET['estacion'], FILTER_SANITIZE_NUMBER_INT) : null;

if (is_null($estacion) || is_null($desde) || is_null($hasta)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Faltan parámetros requeridos: estacion, desde o hasta.'
    ]);
    exit;
}

// Array de respuesta
$response = [];

// Validar conexión
if (!$conexion) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Error de conexión a la base de datos.'
    ]);
    exit;
}

// Consulta de los PDFs creados en los últimos 30 días
$sql = "SELECT max(temp_max) as xtx,
                min(temp_min) as ntn,
                avg(temp_max) as mtx,
                avg(temp_min) as mtn,
                avg(amplitud_termica) as mat,
				sum(t_hs_debajo_0) as hst0,
                sum(if(temp_min<=0,1,0)) as hst1,
                sum(t_hs_debajo_18) as hst18,
                sum(t_hs_sobre_32) as hst32,
				max(hr_max) as xhx,
                min(hr_min) as nhn,
                avg(hr_max) as mhx,
                avg(hr_min) as mhn,
                avg(amplitud_higrica) as mah,
				sum(hs_hr_debajo_20) as hsh20,
                sum(hs_hr_debajo_40) as hsh40,
                sum(hs_hr_sobre_80) as hsh80,
                sum(hs_hr_sobre_90) as hsh90,
				sum(rr_24) as rr,
                max(rr_24) as rrx,
                sum(if(rr_24>0,1,0)) as rr1,
				avg(presion_media_24) as mpr,
                avg(presion_max) as mprx,
                avg(presion_min) as mprn,
				avg(viento_medio) as mvm,
                max(viento_max) as xvx,
                sum(N) as dvn,
                sum(NNE) as dvnne,
                sum(NE) as dvne,
                sum(ENE) as dvene,
                sum(E) as dve,
                sum(ESE) as dvese,
                sum(SE) as dvse,
                sum(SSE) as dvsse,
                sum(S) as dvs,
                sum(SSW) as dvssw,
                sum(SW) as dvsw,
                sum(WSW) as dvwsw,
                sum(W) as dvw,
                sum(WNW) as dvwnw,
                sum(NW) as dvnw,
                sum(NNW) as dvnnw,
                sum(CALMA) as dvcalma,
				avg(rad_solar_media) as rsm,
                max(rad_solar_max) as rsx,
				sum(et) as et,
                sum(hum_hoja_hs) as hh,
                count(*) as cnt
				FROM datos_diarios where identificacion='$estacion' and fecha>='$desde' and fecha<='$hasta'";

$result = $conexion->query($sql);
$bajas = depuracionBajas($conexion, $estacion, $desde, $hasta);

// Verificar resultados
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $fila = [
            'TempMaxAbs' => (float)$row['xtx'],
            'TempMinAbs' => (float)$row['ntn'],
            'tempMaxMedia' => (float)$row['mtx'],
            'tempMinMedia' => (float)$row['mtn'],
            'amplitudTermica' => (float)$row['mat'],
            'horasHelada' => (float)$row['hst0'],
            'diasHelada' => (int)$row['hst1'],
            'horasTMenor18' => (float)$row['hst18'],
            'horasTMayor32' => (float)$row['hst32'],
            'humedadMaxAbs' => (int)$row['xhx'],
            'humedadMinAbs' => (int)$row['nhn'],
            'humedadMaxMedia' => (int)$row['mhx'],
            'humedadMinMedia' => (int)$row['mhn'],
            'amplitudHigrica' => (int)$row['mah'],
            'horasMenor20' => (float)$row['hsh20'],
            'horasMenor40' => (float)$row['hsh40'],
            'horasMayor80' => (float)$row['hsh80'],
            'horasMayor90' => (float)$row['hsh90'],
            'lluvia' => (float)$row['rr'],
            'lluviaMaxDiaria' => (float)$row['rrx'],
            'diasLluvia' => (int)$row['rr1'],
            'presionMedia' => (float)$row['mpr'],
            'presionMax' => (float)$row['mprx'],
            'presionMin' => (float)$row['mprn'],
            'vientoMedio' => (float)$row['mvm'],
            'VientoMaximo' => (float)$row['xvx'],
            'norte' => (int)$row['dvn'],
            'norNorEste' => (int)$row['dvnne'],
            'norEste' => (int)$row['dvne'],
            'esteNorEste' => (int)$row['dvene'],
            'este' => (int)$row['dve'],
            'esteSurEste' => (int)$row['dvese'],
            'surEste' => (int)$row['dvse'],
            'surSurEste' => (int)$row['dvsse'],
            'sur' => (int)$row['dvs'],
            'surSurOeste' => (int)$row['dvssw'],
            'surOeste' => (int)$row['dvsw'],
            'oesteSurOeste' => (int)$row['dvwsw'],
            'oeste' => (int)$row['dvw'],
            'oesteNorOeste' => (int)$row['dvwnw'],
            'norOeste' => (int)$row['dvnw'],
            'norNorOeste' => (int)$row['dvnnw'],
            'calma' => (int)$row['dvcalma'],
            'radSolarMedia' => (float)$row['rsm'],
            'radSolarMax' => (float)$row['rsx'],
            'evapotranspiracion' => (float)$row['et'],
            'horasHumedadHoja' => (float)$row['hh'],
            'cantidadRegistros' => (int)$row['cnt']
        ];
        depuracionLimpiarPeriodo($fila, $bajas, $estacion, $desde, $hasta, DEPURACION_CAMPOS_RESUMEN);
        $response[] = $fila;
    }
} else {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Error en la consulta de datos.'
    ]);
    exit;
}

// Cerrar conexión
$conexion->close();

// Enviar respuesta
echo json_encode([
    'status' => 'success',
    'data' => $response
]);

?>
