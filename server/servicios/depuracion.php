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
 *   depuracionLimpiarActual($fila, $bajas, $estacion);       // último registro (tabla estaciones; también saca lo fuera de rango)
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

/** datos-24hs.php y datos-enfermedades.php: un registro (datos_estaciones) */
const DEPURACION_CAMPOS_REGISTRO = [
    'temperatura' => ['temp_af', 'temp_haf', 'temp_laf'],
    'humedad' => ['hum_af'],
    'lluvia' => ['lluvia', 'tasa_lluvia'],
    'viento' => ['viento_medio', 'viento_max', 'direccion', 'direccion_vmax', 'direccion_vmed'],
    'radiacion' => ['rad_solar', 'rad_solar_h'],
    'presion' => ['presion'],
    'hoja' => ['hum_hoja'],
    'et' => ['et'],
];

/** datos-alerta.php: lluvia y mínimas del período */
const DEPURACION_CAMPOS_ALERTA = [
    'lluvia' => ['totalLluvia', 'maxLluvia', 'maxLluviaDia', 'fechaMaxLluviaDia', 'registrosLluvia'],
    'temperatura' => ['minimaTemperatura', 'registrosHelada'],
];

/** lluvia-periodo.php */
const DEPURACION_CAMPOS_LLUVIA_PERIODO = [
    'lluvia' => ['mm', 'maxRegistro', 'registrosLluvia'],
];

/** datos-temperatura.php */
const DEPURACION_CAMPOS_TEMPERATURA_PERIODO = [
    'temperatura' => ['avg_temp_max', 'abs_max_temp', 'avg_temp_min', 'abs_min_temp', 'avg_temp_period', 'abs_max_date',
        'abs_min_date'],
];

/** datos-heladas.php */
const DEPURACION_CAMPOS_HELADAS = [
    'temperatura' => ['minAbs', 'hsDebajo-4', 'hsDebajo-2', 'maxHsDebajo0', 'diasHeladas', 'FPH', 'FUH', 'hsDebajo0'],
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

/**
 * Registro crudo de datos_estaciones (nombres de columna de la tabla, sin importar mayúsculas):
 * los feeds de terceros de /api/. Ahí no se quita la clave sino que el valor pasa a null, para no
 * cambiar el formato que reciben (cada feed lo muestra como ya mostraba un dato faltante).
 */
const DEPURACION_COLUMNAS_REGISTRO = [
    'temperatura' => ['Temp_AF', 'Temp_HAF', 'Temp_LAF'],
    'humedad' => ['Hum_AF'],
    'lluvia' => ['Lluvia', 'Tasa_Lluvia'],
    'viento' => ['Viento_Medio', 'Viento_Max', 'Direccion_VMed', 'Direccion_VMax'],
    'radiacion' => ['Rad_Solar', 'Rad_Solar_H'],
    'presion' => ['Presion'],
    'hoja' => ['Hum_Hoja'],
    'et' => ['ET'],
];

/** Columnas de datos_diarios (feed io_valles.php) */
const DEPURACION_COLUMNAS_DIARIAS = [
    'temperatura' => ['temp_max', 'temp_min'],
    'humedad' => ['hr_max', 'hr_min'],
    'lluvia' => ['rr_24'],
    'viento' => ['Viento_medio', 'Viento_Max'],
    'radiacion' => ['Rad_Solar_media', 'Rad_Solar_max'],
    'presion' => ['Presion_max', 'Presion_min', 'presion_media_24'],
    'hoja' => ['hum_hoja_hs'],
    'et' => ['et'],
];

/** Pone en null (sin quitar la clave) los campos de las variables dadas; compara sin mayúsculas */
function depuracionAnular(&$fila, $variables, $campos) {
    $porNombre = [];
    foreach (array_keys($fila) as $k) $porNombre[strtolower($k)] = $k;
    foreach ($variables as $v) {
        if (!isset($campos[$v])) continue;
        foreach ($campos[$v] as $campo) {
            $k = strtolower($campo);
            if (isset($porNombre[$k])) $fila[$porNombre[$k]] = null;
        }
    }
}

/**
 * Registro crudo de un día: anula los sensores de baja ese día. Toma identificacion y fecha del
 * registro (sin importar mayúsculas); $columnas: DEPURACION_COLUMNAS_REGISTRO o _DIARIAS.
 */
function depuracionAnularRegistro(&$row, $bajas, $columnas = DEPURACION_COLUMNAS_REGISTRO) {
    $id = null;
    $fecha = null;
    foreach ($row as $k => $v) {
        $k = strtolower($k);
        if ($k === 'identificacion') $id = $v;
        if ($k === 'fecha') $fecha = $v;
    }
    if ($id === null || $fecha === null) return;
    depuracionAnular($row, depuracionVariables($bajas, $id, substr((string)$fecha, 0, 10)), $columnas);
}

/**
 * Rango posible de cada campo del último registro (tabla estaciones). Cuando un sensor falla, la
 * consola manda valores de relleno (Davis: 1802,6 °C, 255 % de humedad, 410,4 km/h de viento) que
 * en datos_estaciones quedan en null pero en la tabla estaciones quedan tal cual. Fuera de rango, el
 * campo se trata como el de un sensor de baja. Temperatura: el mismo mínimo que datos-temperatura.php
 * y el máximo de la app móvil; los demás, los de la app (home.page.ts, lluvias.page.html), que
 * también los aplica de su lado (estaciones.service.ts, EstacionWidget.java). Claves sin importar
 * mayúsculas (datos-online.php usa rr_dia).
 */
const DEPURACION_RANGOS_ACTUALES = [
    'temp_af' => [-25, 55],
    'hum_af' => [1, 100],
    'presion' => [500, 1100],
    'viento_medio' => [0, 220],
    'viento_max' => [0, 260],
    'rafaga24' => [0, 260],
    'rr_15' => [0, 150],
    'rr_dia' => [0, 399.99],
    'rr_mes' => [0, 2000],
];

/** Campos del último registro fuera de rango (los nombres tal como están en $fila) */
function depuracionFueraDeRango($fila) {
    $fuera = [];
    foreach ($fila as $k => $v) {
        $rango = DEPURACION_RANGOS_ACTUALES[strtolower($k)] ?? null;
        if ($rango === null || $v === null || $v === '') continue;
        if (!is_numeric($v) || (float)$v < $rango[0] || (float)$v > $rango[1]) $fuera[] = $k;
    }
    return $fuera;
}

/** Último registro de una estación sin quitar claves (feeds viejos de /api/): anula en vez de quitar */
function depuracionAnularActual(&$fila, $bajas, $estacion, $fecha = null) {
    foreach (depuracionFueraDeRango($fila) as $k) $fila[$k] = null;
    $dia = $fecha ? substr((string)$fecha, 0, 10) : date('Y-m-d');
    depuracionAnular($fila, depuracionVariables($bajas, $estacion, $dia), DEPURACION_CAMPOS_ACTUALES);
    if (depuracionHayBaja($bajas, $estacion, 'lluvia', substr($dia, 0, 7) . '-01', $dia)) depuracionAnular($fila, ['lluvia'], ['lluvia' => ['rr_mes']]);
}

/** Fila de un día de una estación */
function depuracionLimpiarDia(&$fila, $bajas, $estacion, $fecha, $campos) {
    depuracionQuitar($fila, depuracionVariables($bajas, $estacion, substr((string)$fecha, 0, 10)), $campos);
}

/** Totales de un período de una estación: se quita la variable si la baja toca algún día */
function depuracionLimpiarPeriodo(&$fila, $bajas, $estacion, $desde, $hasta, $campos) {
    depuracionQuitar($fila, depuracionVariables($bajas, $estacion, $desde, $hasta), $campos);
}

/**
 * Último registro de una estación: el día del registro ($fecha, fecha_I; sin ella, hoy). rr_mes se
 * quita si la lluvia estuvo de baja en el mes de ese día.
 */
function depuracionLimpiarActual(&$fila, $bajas, $estacion, $fecha = null) {
    foreach (depuracionFueraDeRango($fila) as $k) unset($fila[$k]);
    $dia = $fecha ? substr((string)$fecha, 0, 10) : date('Y-m-d');
    depuracionQuitar($fila, depuracionVariables($bajas, $estacion, $dia), DEPURACION_CAMPOS_ACTUALES);
    if (depuracionHayBaja($bajas, $estacion, 'lluvia', substr($dia, 0, 7) . '-01', $dia)) unset($fila['rr_mes']);
}

/** ¿La variable de la estación estuvo de baja algún día entre $desde y $hasta (o sólo el día $desde)? */
function depuracionHayBaja($bajas, $estacion, $variable, $desde, $hasta = null) {
    return in_array($variable, depuracionVariables($bajas, $estacion, $desde, $hasta), true);
}
