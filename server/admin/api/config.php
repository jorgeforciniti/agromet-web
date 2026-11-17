<?php
/*
 * Configuración de la API de administración (/services/admin). Es el único archivo que hay que
 * ajustar al servidor. No contiene credenciales: la conexión la hace conecta_admin.php.
 */

// Únicas cuentas que pueden usar esta API (en minúsculas). Además tienen que tener el email
// confirmado: con usuario y contraseña cualquiera podría registrarse con estas direcciones.
// La lista del frontend (src/app/shared/administradores.ts) sólo decide qué se muestra.
const ADMINISTRADORES = [
    'jmedina@eeaoc.org.ar',
    'lorenasoule@eeaoc.org.ar',
    'jorgeforciniti@eeaoc.org.ar',
    'amleal@eeaoc.org.ar',
];

// Verificación del token: se reutiliza la de la API de usuarios (/services/usuarios)
const RUTA_FIREBASE_TOKEN = __DIR__ . '/../usuarios/firebase_token.php';
const FIREBASE_PROJECT_ID = 'agromet-web';

// Conexión con permisos de escritura en la base `admin` y lectura en `estaciones`: copia del
// admin-conecta.php que usaba admin.php (define $conexion). No se sube al repositorio.
const RUTA_CONECTA_ADMIN = __DIR__ . '/conecta_admin.php';

const DB_ADMIN = 'admin';
const DB_ESTACIONES = 'estaciones';

// Serie diaria de El Colmenar (pestaña «El Colmenar»): conexión aparte, con SELECT, INSERT y UPDATE
// sobre colmenar.clima_diario_el_colmenar. Recibe $db y define $conexion (ver
// conecta_colmenar.ejemplo.php). No se sube al repositorio.
const RUTA_CONECTA_COLMENAR = __DIR__ . '/conecta_colmenar.php';
const DB_COLMENAR = 'colmenar';
// Primer día de la serie: los días sin fila desde acá se cuentan como faltantes
const COLMENAR_DESDE = '1910-01-01';
// Valores aceptados al cargar: temperaturas en °C y lluvia diaria en mm
const LIMITES_COLMENAR = ['temp' => [-20, 50], 'pp' => 500];

// Red pluviométrica (pestaña «Red pluviométrica»): conexión aparte, con permisos sólo sobre
// estaciones_rr (SELECT, INSERT), datos_rr_dia (SELECT, INSERT, UPDATE, DELETE) y datos_rr_mes
// (SELECT, INSERT, UPDATE). Recibe $db y define $conexion (ver conecta_lluvias.ejemplo.php). No se
// sube al repositorio.
const RUTA_CONECTA_LLUVIAS = __DIR__ . '/conecta_lluvias.php';
// Lluvia en mm, con un decimal como máximo: por encima del aviso se pide confirmar; el límite no se acepta
const LIMITE_LLUVIA_DIA = 500;
const AVISO_LLUVIA_DIA = 150;
const LIMITE_LLUVIA_MES = 2000;
const AVISO_LLUVIA_MES = 800;
// Los datos diarios sólo sirven para el mes en curso: se carga ese mes y, hasta este día del mes
// siguiente, también el anterior
const DIAS_GRACIA_DIARIO = 10;
// Primer año que se acepta en los totales mensuales (datos históricos)
const LLUVIAS_DESDE = 1900;
// Caja aproximada de la red (Tucumán y alrededores): una localidad fuera de ella sólo genera un aviso
const ZONA_RED = ['lat' => [-30, -22], 'lon' => [-68, -62]];

// Carpeta pública de los informes (https://agromet.eeaoc.gob.ar/PDFS/). Con la API instalada
// en public_html/services/admin, queda dos niveles arriba.
const CARPETA_PDFS = __DIR__ . '/../../PDFS/';

// Categorías de informes (las mismas que /informes)
const CATEGORIAS = ['ll', 'he', 'bo', 'co', 'ad', 'rv', 'et', 'ta'];

// Archivos que se pueden publicar en PDFS/ (nunca scripts) y tamaño máximo
const EXTENSIONES = ['pdf', 'xlsx'];
const MAX_BYTES = 30 * 1024 * 1024;
