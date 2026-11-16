<?php

header('Access-Control-Allow-Origin: *');

error_reporting (E_ALL  ^  E_NOTICE  ^  E_DEPRECATED);
$db="estaciones";
include("conecta_mysql.php");

mysqli_set_charset($conexion,"utf8");

// Sensores dados de baja (depuración de datos, /services/depuracion.php): no se mandan sus valores.
// Si el archivo no está, responde como antes.
$depuracion = __DIR__ . "/../services/depuracion.php";
if (!is_file($depuracion) && !empty($_SERVER["DOCUMENT_ROOT"])) {
    $depuracion = $_SERVER["DOCUMENT_ROOT"] . "/services/depuracion.php";
}
if (is_file($depuracion)) {
    require_once $depuracion;
}
// Para controlar desde afuera si depura (activa) o responde como antes (sin-archivo)
header("X-Depuracion: " . (function_exists("depuracionLimpiarActual") ? "activa" : "sin-archivo"));
date_default_timezone_set("America/Argentina/Buenos_Aires");
$vble=$_GET['habilitada'];

$hoy = date("Ymd");

$arr = array();
$variables="Identificacion, nombre, lat, lon, alt, habilitada, fecha_I, temp_af, hum_af, RR_dia, rr_mes, presion, viento_medio, viento_max, rr_15, pronostico, zona, desde, direc, rafaga24, tiempo, Localidad, departamento, provincia";

if($conexion){
    if($vble==0){
        $peticion4="SELECT $variables FROM estaciones order by nombre";
    }

    if($vble==99){
        $variables="estaciones.Identificacion, nombre, lat, lon, alt, habilitada, fecha_I, temp_af, hum_af, RR_dia, rr_mes, presion, estaciones.viento_medio, estaciones.viento_max, zona, desde, direc, rafaga24, tiempo, Localidad, departamento, provincia, datos_diarios.temp_max, datos_diarios.temp_min";
        $peticion4 = "SELECT $variables FROM estaciones INNER JOIN datos_diarios ON estaciones.Identificacion = datos_diarios.Identificacion WHERE habilitada >0 AND fecha =$hoy ORDER BY nombre";
    }else{
//        $peticion4="SELECT $variables FROM estaciones where habilitada>=$vble order by nombre";
//        $variables="estaciones.Identificacion, nombre, lat, lon, alt, habilitada, fecha_I, temp_af, hum_af, RR_dia, rr_mes, presion, estaciones.viento_medio, estaciones.viento_max, zona, desde, direc, rafaga24, tiempo, Localidad, departamento, provincia, datos_diarios.temp_max, datos_diarios.temp_min";
//        $peticion4 = "SELECT $variables FROM estaciones INNER JOIN datos_diarios ON estaciones.Identificacion = datos_diarios.Identificacion WHERE habilitada >0 AND fecha =$hoy ORDER BY nombre";

        $peticion4 = "SELECT  e.Identificacion, e.nombre, e.lat, e.lon, e.alt, e.habilitada, e.fecha_I, e.temp_af, e.hum_af, e.RR_dia, e.rr_mes, e.presion, e.viento_medio, e.viento_max, e.zona, e.desde, e.direc, e.rafaga24, e.tiempo, e.Localidad, e.departamento, e.provincia, dd.tmax, dd.tmin FROM estaciones e JOIN ( SELECT Identificacion, MAX(temp_max) AS tmax, MIN(temp_min) AS tmin FROM datos_diarios GROUP BY Identificacion ) dd ON dd.Identificacion = e.Identificacion WHERE e.habilitada > 0 ORDER BY e.nombre ";

    }

    $bajas = function_exists("depuracionBajas") ? depuracionBajas($conexion) : array();
    $hoyIso = date("Y-m-d");

    $hacer = $conexion->query($peticion4);
    while ($row=$hacer->fetch_assoc()){
        $id = $row['Identificacion'];
        if ($bajas) {
            depuracionLimpiarActual($row, $bajas, $id, $row['fecha_I']);
            // Extremos del día (habilitada=99) y de toda la serie (tmax/tmin)
            if (depuracionHayBaja($bajas, $id, 'temperatura', $hoyIso)) {
                unset($row['temp_max'], $row['temp_min']);
            }
            if (depuracionHayBaja($bajas, $id, 'temperatura', '1900-01-01', $hoyIso)) {
                unset($row['tmax'], $row['tmin']);
            }
        }
        $newkey="fecha";
        $row[$newkey] = date('d-m-Y',strtotime($row['fecha_I']));
        $newkey="hora";
        $row[$newkey] = date('H:i',strtotime($row['fecha_I']));
        $arr[] = $row;
    }
    mysqli_close($conexion);
}else{
    $arr["error"] = "'Error de coneccion'";
}
echo json_encode($arr);

?>
