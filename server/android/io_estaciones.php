<?php

header('Access-Control-Allow-Origin: *');

error_reporting (E_ALL  ^  E_NOTICE  ^  E_DEPRECATED);
$db="estaciones";
include("conecta_mysql.php");

mysqli_set_charset($conexion,"utf8");
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

    $hacer = $conexion->query($peticion4);
    while ($row=$hacer->fetch_assoc()){
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
