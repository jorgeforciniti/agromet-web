
<?php

header('Access-Control-Allow-Origin: *');

error_reporting (E_ALL  ^  E_NOTICE  ^  E_DEPRECATED);

// 1.- IDENTIFICACION nombre de la base, del usuario, clave y servidor

$db="estaciones";
include("conecta_mysql.php");

mysqli_set_charset($conexion,"utf8");

date_default_timezone_set("America/Argentina/Buenos_Aires");
set_time_limit(0);

$fec = isset($_GET['fecha']) ? intval($_GET['fecha']) : 0; // AAAAMMDD: va dentro del SQL
$arr = array();
$arr1 = array();
$arr2 = array();
$units= array();

$units['alt']="m";
$units['temp']="ºC";
$units['pressure']="hPa";
$units['humidity']="%";
$units['speed']="km/h";
$units['deg']="º";
$units['gust']="km/h";
$units['rad']="W/m2";

if ($fec<20220101){
    $arr = array();
    $error=array("Para datos anteriores al 2022 solicitar a jorgeforciniti@eeaoc.org.ar");
    $key=array("Error");
    $arr[0]=array_combine($key,$error);

}else{
    if($conexion){
        $peticion4="SELECT fecha,hora, estaciones.lat, estaciones.lon, estaciones.alt, estaciones.nombre, estaciones.identificacion, Temp_HAF, Temp_LAF, Lluvia, datos_estaciones.Presion, Rad_Solar, datos_estaciones.Hum_AF, datos_estaciones.Viento_medio, datos_estaciones.Viento_Max, Direccion_VMed, Direccion_VMax
        FROM `datos_estaciones` inner join estaciones on datos_estaciones.Identificacion = estaciones.Identificacion
        WHERE fecha = $fec and estaciones.habilitada>0 and (estaciones.identificacion between 40 and 59) order by estaciones.identificacion, hora";

        $hacer = $conexion->query($peticion4);
        $e=0;
        $h=0;
        while ($row=$hacer->fetch_assoc()){
            // pone un solo registro por fecha... el último
            if ($row['identificacion']==$e){
                if($row['hora']>$h){
                    $arr1['name']=$row['nombre'];
                    $arr1['id']=$row['identificacion'];
                    $arr1['lon']=$row['lon'];
                    $arr1['lat']=$row['lat'];
                    $arr1['alt']=$row['alt'];
                    $arr2['hora'] = $row['hora'];
                    $arr2['tempMax']=$row['Temp_HAF'];
                    $arr2['tempMin']=$row['Temp_LAF'];
                    $arr2['lluvia']=$row['Lluvia'];
                    $arr2['presion']=$row['Presion'];
                    $arr2['radSolar']=$row['Rad_Solar'];
                    $arr2['humRel']=$row['Hum_AF'];
                    $arr2['vientoMax']=$row['Viento_Max'];
                    $arr2['vientoMedio']=$row['Viento_medio'];
                    $arr2['dirVientoMed']=$row['Direccion_VMed'];
                    $arr2['dirVientoMax']=$row['Direccion_VMax'];
                    $arr[$row['identificacion']]['station'] = $arr1;
                    $arr[$row['identificacion']]['Units']=$units;
                    $arr[$row['identificacion']][$row['fecha']] = $arr2;
                }
            }else{
                $arr1['name']=$row['nombre'];
                $arr1['id']=$row['identificacion'];
                $arr1['lon']=$row['lon'];
                $arr1['lat']=$row['lat'];
                $arr1['alt']=$row['alt'];
                $arr2['hora'] = $row['hora'];
                $arr2['tempMax']=$row['Temp_HAF'];
                $arr2['tempMin']=$row['Temp_LAF'];
                $arr2['lluvia']=$row['Lluvia'];
                $arr2['presion']=$row['Presion'];
                $arr2['radSolar']=$row['Rad_Solar'];
                $arr2['humRel']=$row['Hum_AF'];
                $arr2['vientoMax']=$row['Viento_Max'];
                $arr2['vientoMedio']=$row['Viento_medio'];
                $arr2['dirVientoMed']=$row['Direccion_VMed'];
                $arr2['dirVientoMax']=$row['Direccion_VMax'];
                $arr[$row['identificacion']]['station'] = $arr1;
                $arr[$row['identificacion']]['Units']=$units;
                $arr[$row['identificacion']][$row['fecha']] = $arr2;
                $e = $row['identificacion'];
                $h = $row['hora'];
            }
        }
        mysqli_close($conexion);
    }
}

echo json_encode($arr);
set_time_limit(30);

?>
