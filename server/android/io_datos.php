<?php

header('Access-Control-Allow-Origin: *');

error_reporting(E_ALL ^ E_NOTICE ^ E_DEPRECATED);

// 1.- IDENTIFICACION nombre de la base, del usuario, clave y servidor

$db = "estaciones";
include("conecta_mysql.php");

mysqli_set_charset($conexion, "utf8");

date_default_timezone_set("America/Argentina/Buenos_Aires");

$en_csv = "";

$vble = $_GET['estacion'];
$arr = "";

if ($conexion) {

    //$peticion4="SELECT fecha_i,temp_af,hum_af,rr_dia,presion,viento_medio,direc,viento_max FROM estaciones where identificacion=$vble";
    $peticion4 = "SELECT * FROM estaciones where identificacion=$vble";
    $hacer = $conexion->query($peticion4);
    while ($row = $hacer->fetch_assoc()) {
        $arr = $row;
    }
    $dir = isset($arr['direc']) ? strtoupper(trim($arr['direc'])) : '';

    // Normaliza posibles variantes
    $dir = str_replace(['NNE', 'NN E'], ['NNE', 'NNE'], $dir); // por si viene con espacios raros
    $dir = str_replace('NNE', 'NNE', $dir); // idempotente
    $dir = str_replace('NNE', 'NNE', $dir); // (sí, soy insoportable 😌)

    // Mapa de rumbos a grados
    $map = [
        'N'   => 0.0,
        'NNE' => 22.5,
        'NE'  => 45.0,
        'ENE' => 67.5,
        'E'   => 90.0,
        'ESE' => 112.5,
        'SE'  => 135.0,
        'SSE' => 157.5,
        'S'   => 180.0,
        'SSW' => 202.5,
        'SW'  => 225.0,
        'WSW' => 247.5,
        'W'   => 270.0,
        'WNW' => 292.5,
        'NW'  => 315.0,
        'NNW' => 337.5,
        'CALMA' => null,
    ];

    // Acepta "NNe" (y otras mezclas) porque ya pasamos a strtoupper,
    // pero por si viniera con typo raro, limpiamos todo salvo letras.
    $dir_key = preg_replace('/[^A-Z]/', '', $dir);

    $arr['viento_dir'] = array_key_exists($dir_key, $map) ? $map[$dir_key] : null;

///////////////////////////////////////////////////////////////////////////////

    mysqli_close($conexion);
}

echo json_encode($arr);

?>