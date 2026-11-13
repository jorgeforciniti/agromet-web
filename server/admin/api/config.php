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

// Carpeta pública de los informes (https://agromet.eeaoc.gob.ar/PDFS/). Con la API instalada
// en public_html/services/admin, queda dos niveles arriba.
const CARPETA_PDFS = __DIR__ . '/../../PDFS/';

// Categorías de informes (las mismas que /informes)
const CATEGORIAS = ['ll', 'he', 'bo', 'co', 'ad', 'rv', 'et', 'ta'];

// Archivos que se pueden publicar en PDFS/ (nunca scripts) y tamaño máximo
const EXTENSIONES = ['pdf', 'xlsx'];
const MAX_BYTES = 30 * 1024 * 1024;
