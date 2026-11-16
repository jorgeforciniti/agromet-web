<?php
/*
 * Depuración de datos en el servidor: saca de las respuestas los valores de los sensores dados de
 * baja (tabla `sensores_baja`, se cargan en /admin), para que la app móvil y quien lea los PHP
 * directamente reciban lo mismo que muestra el sitio. Es la misma regla de
 * src/app/shared/depuracion.ts (el sitio la aplica también, como segunda barrera):
 *   - un campo de un sensor dado de baja no se manda (se quita la clave, no va en null ni en 0);
 *   - también las bajas «A confirmar:» (datos dudosos: mejor no mostrarlos hasta confirmar);
 *   - la ET se quita si está de baja la temperatura, la humedad, el viento o la radiación;
 *   - las estaciones sin sensor de radiación (estaciones.isRadiation = 0) no mandan radiación;
 *   - en un resumen de período, la variable se quita si la baja toca algún día del período.
 *
 * Uso (después de conecta_mysql.php):
 *   require_once 'depuracion.php';
 *   $bajas = depuracionBajas($conexion, $estacion, $desde, $hasta);
 *   depuracionLimpiarDia($fila, $bajas, $estacion, $fecha, DEPURACION_CAMPOS_DIARIOS);
 *   depuracionLimpiarPeriodo($fila, $bajas, $estacion, $desde, $hasta, DEPURACION_CAMPOS_RESUMEN);
 *   depuracionLimpiarActual($fila, $bajas, $estacion);       // último registro (tabla estaciones)
 *   if (depuracionHayBaja($bajas, $estacion, 'lluvia', $desde, $hasta)) { ...se saca la fila... }
 *
 * Si no puede leer sensores_baja, no quita nada: el PHP responde como antes.
 */

if (basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

/** Las variables cuya baja también quita la ET (la calculan con ellas) */
const DEPURACION_VARIABLES_ET = ['temperatura', 'humedad', 'viento', 'radiacion'];

/** datos-diarios.php: una fila por día (datos_diarios) */
const DEPURACION_CAMPOS_DIARIOS = [
    'temperatura' => ['temp_max', 'temp_min'],
    'humedad' => ['HR_max', 'HR_min'],
    'lluvia' => ['rr_24'],
    'viento' => ['viento_medio', 'viento_max'],
    'radiacion' => ['rad_solar_media', 'rad_solar_max'],
    'presion' => ['presion_media_24'],
    'hoja' => ['hum_hoja_hs'],
    'et' => ['et'],
];

/**
 * Tabla estaciones (último registro): estaciones.php, datos-online.php y la app móvil. rr_mes va
 * aparte (es del mes: ver depuracionLimpiarActual); viento_dir lo agrega io_datos.php.
 */
const DEPURACION_CAMPOS_ACTUALES = [
    'temperatura' => ['temp_af'],
    'humedad' => ['hum_af'],
    'lluvia' => ['RR_dia', 'rr_dia', 'rr_15'],
    'viento' => ['viento_medio', 'viento_max', 'rafaga24', 'direc', 'viento_dir'],
    'presion' => ['presion'],
];

/** datos-resumen.php: totales y promedios del período */
const DEPURACION_CAMPOS_RESUMEN = [
    'temperatura' => ['TempMaxAbs', 'TempMinAbs', 'tempMaxMedia', 'tempMinMedia', 'amplitudTermica', 'horasHelada',
        'diasHelada', 'horasTMenor18', 'horasTMayor32'],
    'humedad' => ['humedadMaxAbs', 'humedadMinAbs', 'humedadMaxMedia', 'humedadMinMedia', 'amplitudHigrica',
        'horasMenor20', 'horasMenor40', 'horasMayor80', 'horasMayor90'],
    'lluvia' => ['lluvia', 'lluviaMaxDiaria', 'diasLluvia'],
    'viento' => ['vientoMedio', 'VientoMaximo', 'norte', 'norNorEste', 'norEste', 'esteNorEste', 'este', 'esteSurEste',
        'surEste', 'surSurEste', 'sur', 'surSurOeste', 'surOeste', 'oesteSurOeste', 'oeste', 'oesteNorOeste', 'norOeste',
        'norNorOeste', 'calma'],
    'radiacion' => ['radSolarMedia', 'radSolarMax'],
    'presion' => ['presionMedia', 'presionMax', 'presionMin'],
    'hoja' => ['horasHumedadHoja'],
    'et' => ['evapotranspiracion'],
];

/**
 * Bajas que tocan el período, por estación: [id => [[variable, desde, hasta|null], ...]].
 * $estacion: un id, una lista de ids o null (todas). $desde/$hasta: AAAA-MM-DD o null (sin límite).
 */
function depuracionBajas($conexion, $estacion = null, $desde = null, $hasta = null) {
    $ids = null;
    if ($estacion !== null) {
        $ids = [];
        foreach ((array)$estacion as $id) $ids[] = "'" . $conexion->real_escape_string((string)$id) . "'";
        if (!$ids) return [];
    }
    $donde = [];
    if ($ids !== null) $donde[] = 'identificacion IN (' . implode(',', $ids) . ')';
    if ($desde !== null) $donde[] = "(hasta IS NULL OR hasta >= '" . $conexion->real_escape_string($desde) . "')";
    if ($hasta !== null) $donde[] = "desde <= '" . $conexion->real_escape_string($hasta) . "'";
    $sql = 'SELECT identificacion, variable, desde, hasta FROM sensores_baja' . ($donde ? ' WHERE ' . implode(' AND ', $donde) : '');

    $bajas = [];
    try {
        $res = @$conexion->query($sql);
    } catch (Throwable $e) {
        $res = false; // con mysqli en modo estricto, la tabla inexistente lanza una excepción
    }
    if ($res !== false) {
        while ($f = $res->fetch_assoc()) {
            $bajas[(string)$f['identificacion']][] = [$f['variable'], (string)$f['desde'], $f['hasta'] === null ? null : (string)$f['hasta']];
        }
    }

    // Estaciones sin sensor de radiación: una baja permanente
    $sql = 'SELECT Identificacion FROM estaciones WHERE isRadiation = 0' . ($ids !== null ? ' AND Identificacion IN (' . implode(',', $ids) . ')' : '');
    try {
        $res = @$conexion->query($sql);
    } catch (Throwable $e) {
        $res = false;
    }
    if ($res !== false) {
        while ($f = $res->fetch_assoc()) $bajas[(string)$f['Identificacion']][] = ['radiacion', '1900-01-01', null];
    }
    return $bajas;
}

/** Variables de baja de la estación en el día (AAAA-MM-DD), o en algún día del período si se da $hasta */
function depuracionVariables($bajas, $estacion, $fecha, $hasta = null) {
    $hasta = $hasta === null ? $fecha : $hasta;
    $variables = [];
    if (!isset($bajas[(string)$estacion])) return [];
    foreach ($bajas[(string)$estacion] as $b) {
        if ($b[1] <= $hasta && ($b[2] === null || $b[2] >= $fecha)) $variables[$b[0]] = true;
    }
    foreach (DEPURACION_VARIABLES_ET as $v) {
        if (isset($variables[$v])) $variables['et'] = true;
    }
    return array_keys($variables);
}

/** Quita de $fila los campos de las variables dadas */
function depuracionQuitar(&$fila, $variables, $campos) {
    foreach ($variables as $v) {
        if (!isset($campos[$v])) continue;
        foreach ($campos[$v] as $campo) unset($fila[$campo]);
    }
}

/** Fila de un día de una estación */
function depuracionLimpiarDia(&$fila, $bajas, $estacion, $fecha, $campos) {
    depuracionQuitar($fila, depuracionVariables($bajas, $estacion, substr((string)$fecha, 0, 10)), $campos);
}

/** Totales de un período de una estación: se quita la variable si la baja toca algún día */
function depuracionLimpiarPeriodo(&$fila, $bajas, $estacion, $desde, $hasta, $campos) {
    depuracionQuitar($fila, depuracionVariables($bajas, $estacion, $desde, $hasta), $campos);
}

/** Último registro de una estación (hoy); rr_mes se quita si la lluvia estuvo de baja en el mes */
function depuracionLimpiarActual(&$fila, $bajas, $estacion) {
    $hoy = date('Y-m-d');
    depuracionQuitar($fila, depuracionVariables($bajas, $estacion, $hoy), DEPURACION_CAMPOS_ACTUALES);
    if (depuracionHayBaja($bajas, $estacion, 'lluvia', date('Y-m-01'), $hoy)) unset($fila['rr_mes']);
}

/** ¿La variable de la estación estuvo de baja algún día entre $desde y $hasta (o sólo el día $desde)? */
function depuracionHayBaja($bajas, $estacion, $variable, $desde, $hasta = null) {
    return in_array($variable, depuracionVariables($bajas, $estacion, $desde, $hasta), true);
}
