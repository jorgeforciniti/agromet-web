<?php

header('Access-Control-Allow-Origin: *');

error_reporting (E_ALL  ^  E_NOTICE  ^  E_DEPRECATED);

// 1.- IDENTIFICACION nombre de la base, del usuario, clave y servidor

$db="estaciones";
include("conecta_mysql.php");

mysqli_set_charset($conexion,"utf8");

date_default_timezone_set("America/Argentina/Buenos_Aires");

$vble=$_GET['estacion'];

$hoy=date('Ymd');
$hora=date('H:i:s');
$ayer= date('Ymd',strtotime("-1 days"));
$hace30 = date('Ymd',strtotime("-30 days"));
$hy = new DateTime('today');          // hoy (sin hora)
$base = (clone $hy)->modify('-365 days');  // fecha de hace 365 días

$ene = (clone $base)
    ->modify('first day of next month') // 1° día del mes siguiente
    ->format('Ymd');                    // 20250301

$arr = array();
$arr2 = array();
$arr3 = array();

if($conexion){
    if($vble==0){

        //$peticion4="SELECT estaciones.lat, estaciones.lon, estaciones.alt, estaciones.nombre, sum(Lluvia) FROM `datos_estaciones` inner join estaciones on datos_estaciones.Identificacion = estaciones.Identificacion WHERE (fecha >= $ayer) and habilitada>0 group by estaciones.Identificacion";
        $peticion4="SELECT estaciones.lat, estaciones.lon, estaciones.alt, estaciones.nombre, sum(Lluvia) FROM `datos_estaciones` inner join estaciones on datos_estaciones.Identificacion = estaciones.Identificacion WHERE ((fecha>=$ayer and hora>='$hora') or fecha=$hoy) and habilitada>0 group by estaciones.Identificacion";

        $hacer = $conexion->query($peticion4);
        while ($row=$hacer->fetch_assoc()){
            $arr[] = $row;
        }

        mysqli_close($conexion);

        $key=array("lat","lon","alt","nombre","lluvia");

        foreach($arr as $i => $v){
            $arr[$i]=array_combine($key,$v);
        }
    }else{
//        $peticion4="SELECT hora, rr_24 FROM datos_diarios WHERE month(fecha)=month($ayer) and year(fecha)=year($ayer) and identificacion=$vble";
        $peticion4="SELECT hora, Lluvia FROM datos_estaciones WHERE fecha = $hoy and identificacion=$vble";

        $hacer = $conexion->query($peticion4);
        while ($row=$hacer->fetch_assoc()){
            $row['hora']=substr($row['hora'],0,5);
            $arr[] = $row;
        }
        $key=array("hora","lluvia");
        foreach($arr as $i => $v){
            $arr[$i]=array_combine($key,$v);
        }
        /* pide las lluvias de los últimos 30 días */
        $peticion4="SELECT fecha, rr_24 FROM datos_diarios WHERE fecha >= $hace30 and fecha <= $hoy and identificacion=$vble";
        $hacer = $conexion->query($peticion4);
        while ($row=$hacer->fetch_assoc()){
            $arr2[] = $row;
        }
        $key=array("dia","lluvia");
        foreach($arr2 as $i => $v){
            $arr2[$i]=array_combine($key,$v);
        }

        /* pide las lluvias del año */
        $peticion4="SELECT year(fecha), month(fecha), sum(rr_24) FROM datos_diarios WHERE fecha >= $ene and fecha <= $hoy and identificacion=$vble group by year(fecha), month(fecha)";
        $hacer = $conexion->query($peticion4);
        while ($row=$hacer->fetch_assoc()){
            $arr3[] = $row;
        }
        $key=array("anio","mes","lluvia");
        foreach($arr3 as $i => $v){
            $arr3[$i]=array_combine($key,$v);
        }

        mysqli_close($conexion);

        $arx = array();
        $arx[] = $arr;
        $arx[] = $arr2;
        $arx[] = $arr3;
        $arr = $arx;

    }
}

echo json_encode($arr);

?>
