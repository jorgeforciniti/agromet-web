
<?php

header('Access-Control-Allow-Origin: *');

error_reporting (E_ALL  ^  E_NOTICE  ^  E_DEPRECATED);

// 1.- IDENTIFICACION nombre de la base, del usuario, clave y servidor

$db="estaciones";
include("conecta_mysql.php");

mysqli_set_charset($conexion,"utf8");

date_default_timezone_set("America/Argentina/Buenos_Aires");

$vble=$_GET['estacion'];

$hoy = date("Ymd");
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

    if ($vble == -1){
        $inicio = date("Ymd");
    }
    if ($vble == -2){
        $month = date('m');
        $year = date('Y');
        $inicio = date('Ymd', mktime(0,0,0, $month, 1, $year));
        $vble = -1;
    }
    if ($vble == -3){
        $year = date('Y');
        $year= $year-1;
        $inicio = date('Ymd', mktime(0,0,0, 1, 1, $year));
        $vble = -2;
    }
    if($vble==0){
        $peticion4="SELECT estaciones.lat, estaciones.lon, estaciones.alt, estaciones.nombre, max(Temp_HAF) FROM `datos_estaciones` inner join estaciones on datos_estaciones.Identificacion = estaciones.Identificacion WHERE fecha = $hoy and estaciones.habilitada>0 group by estaciones.Identificacion";

        $hacer = $conexion->query($peticion4);
        while ($row=$hacer->fetch_assoc()){
            $arr[] = $row;
        }

        mysqli_close($conexion);

        $key=array("lat","lon","alt","nombre","temperatura");

        foreach($arr as $i => $v){
            $arr[$i]=array_combine($key,$v);
        }
    }else if($vble==-1){
//        $peticion4="SELECT estaciones.lat, estaciones.lon, estaciones.alt, estaciones.nombre, min(Temp_LAF) FROM `datos_estaciones` inner join estaciones on datos_estaciones.Identificacion = estaciones.Identificacion WHERE fecha = $hoy and estaciones.habilitada>0 group by estaciones.Identificacion";
        $peticion4 = "SELECT lat, lon, alt, nombre,  min(temp_min), max(t_hs_debajo_0), count(*), SUM(CASE WHEN temp_min <=0 THEN 1 ELSE 0 END), min(CASE WHEN temp_min <=0 THEN fecha ELSE NULL END), max(CASE WHEN temp_min <=0 THEN fecha ELSE NULL END),
         sum(t_hs_debajo_0),datos_diarios.identificacion  FROM datos_diarios inner join estaciones ON datos_diarios.identificacion=estaciones.identificacion where fecha>=$inicio and fecha<=$hoy and habilitada>0 group by datos_diarios.identificacion order by estaciones.nombre";

        $hacer = $conexion->query($peticion4);
        while ($row=$hacer->fetch_assoc()){
            $arr[] = $row;
        }

        mysqli_close($conexion);

        $key=array("lat","lon","alt","nombre","temperatura","duracion","registros","dias","fph","fuh","duracion_t", "identificacion");

        foreach($arr as $i => $v){
            $arr[$i]=array_combine($key,$v);
        }
    }else if($vble==-2){
//        $peticion4="SELECT estaciones.lat, estaciones.lon, estaciones.alt, estaciones.nombre, min(Temp_LAF) FROM `datos_estaciones` inner join estaciones on datos_estaciones.Identificacion = estaciones.Identificacion WHERE fecha = $hoy and estaciones.habilitada>0 group by estaciones.Identificacion";
        $peticion4 = "SELECT year(fecha), lat, lon, alt, nombre,  min(temp_min), max(t_hs_debajo_0), count(*), SUM(CASE WHEN temp_min <=0 THEN 1 ELSE 0 END), min(CASE WHEN temp_min <=0 THEN fecha ELSE NULL END), max(CASE WHEN temp_min <=0 THEN fecha ELSE NULL END),
         sum(t_hs_debajo_0),datos_diarios.identificacion  FROM datos_diarios inner join estaciones ON datos_diarios.identificacion=estaciones.identificacion where fecha>=$inicio and fecha<=$hoy and habilitada>0 group by datos_diarios.identificacion, year(fecha) order by estaciones.nombre";

        $hacer = $conexion->query($peticion4);
        while ($row=$hacer->fetch_assoc()){
            $arr[] = $row;
        }

        mysqli_close($conexion);

        $key=array("anio","lat","lon","alt","nombre","temperatura","duracion","registros","dias","fph","fuh","duracion_t", "identificacion");

        foreach($arr as $i => $v){
            $arr[$i]=array_combine($key,$v);
        }


    }else{
        /* pide las temperaturas de las últimas */
        $peticion4="SELECT hora, Temp_HAF FROM `datos_estaciones` WHERE fecha = $hoy and identificacion=$vble";
        $hacer = $conexion->query($peticion4);
        while ($row=$hacer->fetch_assoc()){
            $row['hora']=substr($row['hora'],0,5);
            $arr[] = $row;
        }
        $key=array("hora","temperatura");
        foreach($arr as $i => $v){
            $arr[$i]=array_combine($key,$v);
        }

        /* pide las temperaturas de los últimos 30 días */
        $peticion4="SELECT fecha, temp_max, temp_min FROM `datos_diarios` WHERE fecha >= $hace30 and fecha <= $hoy and identificacion=$vble";
        $hacer = $conexion->query($peticion4);
        while ($row=$hacer->fetch_assoc()){
            $arr2[] = $row;
        }
        $key=array("fecha","t_max","t_min");
        foreach($arr2 as $i => $v){
            $arr2[$i]=array_combine($key,$v);
        }

        /* pide las temperaturas del año */
        $peticion4="SELECT year(fecha), month(fecha), avg(temp_max), avg(temp_min) FROM `datos_diarios` WHERE fecha >= $ene and fecha <= $hoy and identificacion=$vble group by year(fecha), month(fecha)";
        $hacer = $conexion->query($peticion4);
        while ($row=$hacer->fetch_assoc()){
            $arr3[] = $row;
        }
        $key=array("anio","mes","t_max","t_min");
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
