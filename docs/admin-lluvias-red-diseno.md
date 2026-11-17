# /admin → «Red pluviométrica»: diseño

Reemplaza el programa de Visual FoxPro `web.exe` (`D:\web`, menú «Lluvias»). Ese programa carga
las lluvias diarias y los totales mensuales de la red pluviométrica en la base `estaciones` de
192.168.0.84. Estado: **borrador para revisar**; todavía no hay código.

## 1. Qué hace hoy el programa de FoxPro

| Menú | Formulario | Lee al abrir | Graba |
|---|---|---|---|
| Lluvias mensuales | `lluvias.scx` | `SELECT * FROM datos_rr_mes` (toda la tabla) y `estaciones_rr` | Un `UPDATE datos_rr_mes … WHERE identificacion = ? AND anio = ?` por **cada fila de la tabla**, cambiada o no |
| Lluvias diarias (y «diarias 2», casi igual) | `lluvias_dia.scx` | `estaciones_rr` y **toda** `datos_rr_dia` ordenada por fecha, que después vacía en memoria (sólo quería la estructura) | Fecha (por defecto, ayer), estación buscada por nombre y mm (empieza en -999,9). «Actualizar» hace un `INSERT INTO datos_rr_dia` por fila |
| (fuera del menú) | `corrige_datos.scx` | Presión y horas de `datos_estaciones` / `datos_diarios` por estación y período | Igual que el mensual |

Problemas que **no** hay que copiar:

- Cada formulario abre una conexión nueva con el usuario `eeaoc` (`SQLSTRINGCONNECT` en el `Load`)
  en una variable pública compartida. Sólo el botón «Salir» la cierra: con la X, o al abrir otro
  formulario, la conexión queda abierta hasta cerrar el programa. Es el candidato principal del
  incidente del 17/11/2026 (~22 conexiones de `eeaoc` cortadas en el mismo segundo).
- Regraba toda `datos_rr_mes` en cada grabado: ~3 400 `UPDATE` sueltos. En MyISAM cada uno
  bloquea la tabla, y las lecturas del sitio («Lluvias por campaña») esperan.
- No revisa el resultado de ningún `SQLEXEC`: si falla la conexión o el SQL, no avisa.
- `STR(identificacion,3,0)` da `***` desde 1000 y `STR(x,7,2)` con valores grandes: el SQL falla
  sin aviso.
- El diario no controla duplicados (misma estación y fecha) ni rangos.
- No puede crear el año nuevo en `datos_rr_mes` (se hace a mano) ni dar de alta localidades.
- La contraseña de `eeaoc` está en texto plano en los `.SCT`, `web.DCT` y los `.exe` de una
  carpeta compartida.

«Lluvias diarias 2» y `corrige_datos` no se reemplazan: nadie sabe para qué se usaban y lo que
hacen queda cubierto por la pestaña nueva.

## 2. Qué lee el sitio de esas tablas

| PHP | Tablas | Nota |
|---|---|---|
| `services/datos-campania.php` | `estaciones_rr`, `datos_rr_mes` | Campaña `anio` y `anio + 1`. `INNER JOIN`: una estación sin fila ese año no aparece |
| `services/lluvias-estacion.php` | `estaciones_rr` (la versión de `id` más alto), `datos_rr_mes` | Mes y normal negativos (-999,9) = sin dato |
| `services/datos-campania-mes-en-curso.php` | `datos_rr_dia` | `SUM(mm)` del mes en curso. Usa `YEAR(fecha) = ? AND MONTH(fecha) = ?`, que no aprovecha índices, y suma también un -999,9 si lo hubiera (ver §7) |

Convenciones que la pestaña respeta:
- En `datos_rr_mes`, el mes sin dato es **-999,9**.
- En `estaciones_rr` vale la fila de `id` más alto de cada `identificacion`: una edición agrega una
  versión nueva, no pisa la anterior.
- Las normales `nene`…`ndic` negativas = sin normal.

## 3. Los datos y su uso

| Dato | Para qué sirve | Vigencia |
|---|---|---|
| **Total mensual** (`datos_rr_mes`) | El dato oficial: «Lluvias por campaña», serie histórica de cada localidad | Permanente. Se carga aparte, de las planillas, no se calcula de los diarios |
| **Dato diario** (`datos_rr_dia`) | Sólo el acumulado del **mes en curso** en el sitio (`datos-campania-mes-en-curso.php`) | Provisorio: terminado el mes no se usa más |

Por eso el diario se rediseña como **«Mes en curso»**:

- Se carga y se corrige sólo el mes en curso y, durante los primeros `DIAS_GRACIA_DIARIO` días
  (10) del mes siguiente, también el anterior, para las planillas que llegan tarde. Las fechas más
  viejas se rechazan: ahí ya manda el total mensual.
- Sin dato = no hay fila. No se graba -999,9 en el diario.
- No se borra nada de lo viejo: son ~56 000 filas chicas, no molestan, y con el índice por fecha
  (§6.3) no se recorren.
- No se completa el mensual con los diarios: los totales vienen de las planillas. En la vista
  mensual, la suma de los diarios aparece en gris sólo como referencia.

## 4. La pestaña

Nueva pestaña **«Red pluviométrica»** en `/admin`, con `<ng-template matTabContent>` (no carga
nada hasta que se abre), al final de las pestañas (las de Control y Sensores se eligen por posición). Tres vistas con un selector arriba:
**Carga**, **Planilla anual** y **Localidades**.

**Localidades que se listan:** todas las que tienen al menos un dato mensual o diario, más las dadas
de alta en `estaciones_rr` aunque todavía no tengan datos. Nombre, zona y proveedor salen de la
versión vigente de `estaciones_rr`. Las que tienen datos pero no ficha aparecen como «Localidad N
(sin ficha)». `ultregrecibido` no se usa.

**Proveedor:** `estaciones_rr.proveedor` identifica quién provee el dato. No hay lista de nombres:
se muestra el código y sirve de filtro.

### 4.1 Carga rápida

Para tipear sin tocar el mouse. La misma pantalla carga datos diarios o totales mensuales:

```
 [ Diario ▾ ]   Fecha [ 17/11/2026 ]                        ← queda fija entre cargas
 Localidad [ fam            ]   mm [ 12,5 ]
           ┌──────────────────────────────┐
           │ ▸ Famaillá (67) · Z3 · PR    │   ← aparece al tipear
           │   Fronterita (112) · Z3 · IN │
           └──────────────────────────────┘
 Últimas cargas:  Famaillá 17/11 12,5 mm ✓   Lules 17/11 0 mm ✓   [Deshacer]
```

1. Se tipean **algunas letras** del nombre (sin importar mayúsculas ni acentos, en cualquier parte
   del nombre) o el **número** de la localidad. La lista se filtra en el navegador al instante, sin
   pedir nada al servidor: las localidades se traen una vez al abrir la pestaña.
2. **Enter** elige la primera de la lista (con ↑ ↓ se elige otra) y el foco pasa a mm.
3. Se escriben los **mm** (un decimal como máximo; acepta coma o punto) y **Enter** guarda.
4. El foco vuelve a Localidad, vacía, lista para la siguiente. La fecha (o el año y mes) queda fija.

Detalles:

- **Ya había un dato** para esa localidad y fecha (o mes): en vez de guardar muestra «Ya tenía 8,0 mm.
  Enter reemplaza, Esc cancela».
- **Valores raros:** más de `AVISO_LLUVIA_DIA` (150 mm) o `AVISO_LLUVIA_MES` (800 mm) pide un
  segundo Enter para confirmar. Más del tope (500 / 2000 mm) no se acepta.
- **Cada Enter guarda en el momento** (un pedido corto). Si falla, la línea queda en rojo con el
  motivo y el foco vuelve a mm, sin perder lo tipeado.
- **Últimas cargas:** debajo, las cargas de la sesión. Cada una se puede corregir o deshacer (el
  último Enter con Ctrl+Z).
- **Modo mensual:** en lugar de la fecha van **año y mes**. El resto es igual. Sirve para cargar una
  planilla mensual de toda la red.

### 4.2 Planilla anual

Para revisar y corregir de a muchas, o cargar una planilla completa:

- **Por año:** localidades × enero…diciembre del año elegido. Debajo de cada valor, en gris, la suma
  de los diarios de ese mes y los días con dato, si los hay.
- **Por localidad:** años × enero…diciembre de una localidad. Es la vista para los **datos
  históricos** (§4.3).
- Se edita como una planilla: flechas, Tab y Enter se mueven entre celdas. Celda vacía = sin dato
  (-999,9).
- **Pegar desde Excel:** se puede pegar un bloque copiado de una planilla (columnas separadas por
  tabulación; se aceptan coma o punto decimal). Las celdas pegadas quedan marcadas hasta guardar.
- «Guardar» manda sólo las filas cambiadas, en una transacción: todo o nada. Antes muestra un
  resumen («Se cambian 14 valores en 3 años»).

### 4.3 Localidades

- **Alta de localidad:** nombre, zona, proveedor, latitud, longitud y altura. El número
  (`identificacion`) lo propone la API: el siguiente libre, `MAX(identificacion) + 1` entre
  `estaciones_rr`, `datos_rr_mes` y `datos_rr_dia`. Se puede cambiar si la localidad ya tiene un
  número asignado afuera.
- **Normales:** opcionales al dar de alta (`nene`…`ndic` y `periodo_normal`). Sin normales se graban
  en -999,9 y el sitio las toma como «sin normal».
- **Edición:** cambiar nombre, ubicación, zona, proveedor o normales agrega una **versión nueva** en
  `estaciones_rr` (copia de la vigente con los cambios), como ya se hace. Las versiones anteriores
  quedan para consulta.
- **Datos históricos:** después del alta, «Cargar historia» abre la planilla por localidad. Se agregan
  los años que hagan falta (desde `LLUVIAS_DESDE`, 1900) y se pega el bloque de Excel.
- Una localidad nueva queda incluida en el alta automática del año siguiente (§4.4).
- Campos de `estaciones_rr` que no se cargan: `foto` vacío, `normal` vacío y `ultregrecibido` con la
  fecha del alta (son `NOT NULL` y la pestaña no los usa).

### 4.4 El año nuevo se crea solo

Las filas de cada año en `datos_rr_mes` se creaban a mano. Ahora la API asegura las filas del año en
curso, todas en -999,9, para **todas las localidades**: las que tienen algún dato mensual o diario y
las dadas de alta en `estaciones_rr`. Así una localidad puede volver a informar o activarse en
cualquier momento sin tocar nada.

- **Una sola sentencia idempotente** (§5): con la clave única `(identificacion, anio)`, un
  `INSERT IGNORE … SELECT` no duplica nada si ya existen.
- **Cuándo corre:** la primera vez que alguien abre la pestaña en el año nuevo. Con eso alcanza:
  la red se carga todas las semanas, y antes de esa carga ningún dato falta, sólo no habría filas
  vacías.
- **Por qué no un evento de MariaDB el 1/1:** el `event_scheduler` del servidor ya tuvo fallas
  (`ev_colmenar_0930` y `ev_colmenar_1200`) y un evento que no corre no avisa a nadie. La misma
  sentencia puede quedar como evento anual de respaldo.
- La pestaña avisa cuántas filas creó («Se creó el año 2027 para 312 localidades»), y queda anotado
  en `lluvias.log`.
- **Efecto en el sitio:** las localidades sin datos ese año aparecen en «Lluvias por campaña» con los
  meses vacíos (hoy `datos-campania.php` las saca por el `INNER JOIN`). Si molesta, se puede hacer
  que el sitio oculte las localidades sin ningún dato en la campaña (§7).

## 5. API (`server/admin/api/`)

Con el patrón de `comun.php`: `administrador_actual()`, `error_json`, `exigir_metodo`, sentencias
preparadas, una sola conexión por pedido y transacción al grabar. Cada cambio se anota en
`lluvias.log` (fecha, email, IP, valor anterior → nuevo), como `colmenar.log`.

**`lluvias_localidades.php`**

- `GET` → `{ok, anio_creado, creadas, localidades:[{id, nombre, zona, proveedor, lat, lon, alt, ficha}]}`.
  Lo pide la pestaña una vez al abrirse (es la lista de la búsqueda rápida). Antes asegura el año en
  curso (§4.4).
- `GET ?id=N` → la versión vigente con normales, y la lista de versiones anteriores.
- `POST {localidad}` → alta (versión nueva con número nuevo). Valida: nombre de 1 a 50 caracteres;
  número libre; latitud entre -90 y 90, longitud entre -180 y 180 (y avisa si cae fuera de
  `ZONA_RED`, la caja de Tucumán y alrededores); normales de 0 a 2000 o vacías.
- `PUT {id, cambios}` → versión nueva de una localidad existente.

**`lluvias_dia.php`** (mes en curso)

- `GET ?mes=AAAA-MM` → `{ok, mes, editable, valores:[{id, fecha, mm}]}`. Una consulta por
  `fecha BETWEEN` (índice `fecha`).
- `POST {fecha, id, mm, reemplazar}` → guarda un valor. Si ya había uno y `reemplazar` no viene,
  responde 409 con el valor anterior. `mm` null borra la fila. Rechaza fechas fuera del mes en curso
  y del período de gracia (§3).
- Carga de a una, que es lo que usa la carga rápida. Con la clave única `(identificacion, fecha)`
  es un `INSERT … ON DUPLICATE KEY UPDATE`.

**`lluvias_mes.php`**

- `GET ?anio=AAAA` → `{ok, anio, filas:[{id, meses:[12], diarios:[12 {mm, dias}]}]}`. Una consulta a
  `datos_rr_mes WHERE anio = ?` y una a `datos_rr_dia` del año agrupada por localidad y mes (con
  `fecha BETWEEN` y `mm >= 0`).
- `GET ?id=N` → todos los años de una localidad.
- `POST {id, anio, mes, mm, reemplazar}` → un valor (carga rápida). Crea la fila del año si falta.
- `POST {filas:[{id, anio, meses:[12]}]}` (hasta 200 filas) → planilla; todo o nada. Crea las filas
  que falten.

Constantes en `config.php`:

| Constante | Valor |
|---|---|
| `LIMITE_LLUVIA_DIA` / `AVISO_LLUVIA_DIA` | 500 / 150 mm |
| `LIMITE_LLUVIA_MES` / `AVISO_LLUVIA_MES` | 2000 / 800 mm |
| `DIAS_GRACIA_DIARIO` | 10 |
| `LLUVIAS_DESDE` | 1900 |
| `ZONA_RED` | caja de lat/lon para el aviso de ubicación |

Todos los mm con un decimal como máximo (las columnas son `decimal(7,2)`; se valida en la API).

Alta automática del año (§4.4), con la clave única ya creada:

```sql
INSERT IGNORE INTO datos_rr_mes (identificacion, anio, ene, feb, mar, abr, may, jun, jul, ago, sep, oct, nov, dic)
SELECT l.identificacion, ?, -999.9, -999.9, -999.9, -999.9, -999.9, -999.9, -999.9, -999.9, -999.9, -999.9, -999.9, -999.9
  FROM (SELECT identificacion FROM datos_rr_mes
        UNION SELECT identificacion FROM datos_rr_dia
        UNION SELECT identificacion FROM estaciones_rr) l;
```

Sin la clave única no se habilita el alta automática: el `INSERT IGNORE` no tendría qué ignorar y
duplicaría filas.

## 6. Conexión y base de datos

Conexión aparte, como El Colmenar: `conecta_lluvias.php` (no va al repositorio; plantilla
`conecta_lluvias.ejemplo.php`) y `RUTA_CONECTA_LLUVIAS` en `config.php`. Usuario propio con sólo lo
necesario y topes por cuenta. Lo ejecuta un administrador de la base, no la API:

```sql
CREATE USER 'agromet_lluvias'@'172.18.30.10' IDENTIFIED BY '…'
  WITH MAX_USER_CONNECTIONS 5 MAX_STATEMENT_TIME 30;
GRANT SELECT, INSERT ON estaciones.estaciones_rr TO 'agromet_lluvias'@'172.18.30.10';
GRANT SELECT, INSERT, UPDATE, DELETE ON estaciones.datos_rr_dia TO 'agromet_lluvias'@'172.18.30.10';
GRANT SELECT, INSERT, UPDATE ON estaciones.datos_rr_mes TO 'agromet_lluvias'@'172.18.30.10';
```

`estaciones_rr` sólo necesita `INSERT`: las ediciones son versiones nuevas.

### 6.1 Las tablas hoy (`SHOW CREATE TABLE`, 17/11/2026)

| Tabla | Motor | Filas (según `AUTO_INCREMENT`) | Índices | Observaciones |
|---|---|---|---|---|
| `datos_rr_dia` | MyISAM, latin1 | ~56 000 | Sólo `UNIQUE (Id)` | **Sin índice por fecha ni por localidad**: toda consulta recorre la tabla entera. Nada impide dos filas para la misma localidad y fecha. `mm decimal(7,2) NOT NULL` |
| `datos_rr_mes` | MyISAM, latin1 | ~3 400 | `PRIMARY (id)`, `KEY (identificacion)` | Nada impide dos filas para la misma localidad y año. `id smallint`: alcanza hasta 32 767 filas |
| `estaciones_rr` | MyISAM, latin1 | ~950 versiones | `PRIMARY (id)`, `KEY (identificacion)` | Una fila por versión; vale la de `id` más alto. Todos los campos `NOT NULL` |

Son tablas chicas: recorrerlas enteras lleva milisegundos. Lo que pesa del FoxPro no es el volumen.
Pesan las conexiones que deja abiertas y los miles de `UPDATE` sueltos, cada uno con bloqueo de toda
la tabla, en MyISAM.

**Ojo con `datos_rr_mes.id smallint`:** llega hasta 32 767 filas y hoy hay ~3 400. El alta
automática suma una fila por localidad cada año, y cargar la historia de localidades nuevas suma
muchas más de golpe. Conviene pasarlo a `int` en el mismo `ALTER` (§6.3) para no tener que pensarlo.

### 6.2 Controles antes de cambiar nada

```sql
-- Repetidos que impedirían las claves únicas
SELECT identificacion, fecha, COUNT(*) AS n, GROUP_CONCAT(Id ORDER BY Id) AS ids, GROUP_CONCAT(mm ORDER BY Id) AS mm
  FROM datos_rr_dia GROUP BY identificacion, fecha HAVING n > 1;
SELECT identificacion, anio, COUNT(*) AS n, GROUP_CONCAT(id ORDER BY id) AS ids
  FROM datos_rr_mes GROUP BY identificacion, anio HAVING n > 1;
-- ¿Hay -999,9 u otros negativos en el diario? (el sitio los sumaría al mes en curso)
SELECT COUNT(*) AS negativos, MIN(fecha), MAX(fecha) FROM datos_rr_dia WHERE mm < 0;
-- Localidades con datos que no están en estaciones_rr
SELECT DISTINCT d.identificacion FROM (SELECT identificacion FROM datos_rr_dia
                                       UNION SELECT identificacion FROM datos_rr_mes) d
  LEFT JOIN estaciones_rr e ON e.identificacion = d.identificacion WHERE e.id IS NULL;
-- ¿Hay valores con más de un decimal? (la pestaña acepta uno)
SELECT COUNT(*) FROM datos_rr_dia WHERE mm * 10 <> FLOOR(mm * 10);
```

Si aparecen repetidos, se decide caso por caso cuál queda: el sitio hoy usa el de `id` más alto en
el mensual. Se borran a mano, con copia previa.

### 6.3 Cambios propuestos (en un horario sin uso, después de una copia)

```sql
-- Copia previa (desde la consola del servidor)
-- mysqldump -u … estaciones datos_rr_dia datos_rr_mes estaciones_rr > lluvias_AAAAMMDD.sql

ALTER TABLE estaciones.datos_rr_dia
  ENGINE = InnoDB,
  DROP KEY `Id`, ADD PRIMARY KEY (`Id`),
  ADD UNIQUE KEY `estacion_fecha` (`identificacion`, `fecha`),
  ADD KEY `fecha` (`fecha`);

ALTER TABLE estaciones.datos_rr_mes
  ENGINE = InnoDB,
  MODIFY `id` int NOT NULL AUTO_INCREMENT,
  ADD UNIQUE KEY `estacion_anio` (`identificacion`, `anio`);

ALTER TABLE estaciones.estaciones_rr ENGINE = InnoDB;
```

Por el tamaño de las tablas, cada `ALTER` debería tardar segundos. Con InnoDB, las lecturas del sitio
ya no esperan a las escrituras. Las claves únicas impiden los repetidos desde la base, aunque alguien
cargue desde phpMyAdmin. Los `ALTER` no cambian nada de lo que leen los PHP del sitio.

El juego de caracteres queda en latin1: la conexión de la API es utf8mb4 y MariaDB convierte.

## 7. Arreglos relacionados en el sitio

- `services/datos-campania-mes-en-curso.php`: cambiar `YEAR(fecha) = ? AND MONTH(fecha) = ?` por
  `fecha BETWEEN ? AND ?`, para que use el índice, y sumar sólo `mm >= 0`.
- `services/datos-campania.php`: no mandar las localidades que no tienen ningún mes con dato en la
  campaña, para que el alta automática del año no llene «Lluvias por campaña» de filas vacías.

## 8. Archivos

- `server/admin/api/lluvias_localidades.php`, `lluvias_dia.php`, `lluvias_mes.php`,
  `lluvias_comun.php` (conexión, validación de mm, alta del año, `lluvias.log`),
  `conecta_lluvias.ejemplo.php`
- `server/admin/api/config.php`: `RUTA_CONECTA_LLUVIAS` y las constantes de §5
- `server/admin/LEEME.md`: instalación, usuario de MySQL y archivos
- `src/app/services/admin-api.service.ts`: tipos y métodos
- `src/app/admin/lluvias-red/`: `admin-lluvias-red` (contenedor y selector), `carga-rapida`,
  `planilla-anual`, `localidades`
- `src/app/admin/admin.component.html`: la pestaña, con `matTabContent`

## 9. Puesta en marcha

1. Correr los controles (§6.2), limpiar repetidos, hacer la copia y aplicar los `ALTER` (§6.3).
2. Crear el usuario de MySQL (§6).
3. Instalar la API y publicar el sitio.
4. Usar las dos herramientas en paralelo unos días, cargando en la nueva y comparando.
5. Retirar el FoxPro de las PC (agromet01 y las demás).
6. Cambiar la contraseña de `eeaoc` y dejar de compartir `D:\Compartir\web`.

## 10. Decisiones (17/11/2026)

- Los totales mensuales **se cargan aparte** de los diarios.
- Los diarios sólo sirven para el mes en curso: **nuevo plan «Mes en curso»** (§3).
- Se informa **hasta un decimal**.
- Se listan **todas las localidades con al menos un dato mensual o diario**; `ultregrecibido` no
  sirve. `proveedor` identifica quién provee el dato; **no hay lista de nombres**.
- El año nuevo se crea **solo, para todas las localidades** (§4.4).
- Hace falta **alta de localidades nuevas**, a veces con datos históricos (§4.3).
- La carga tiene que ser **ágil**: unas letras del nombre, Enter, mm, Enter y la siguiente (§4.1).
- «Lluvias diarias 2» y `corrige_datos` no se reemplazan.
- Período de gracia del diario: **10 días** del mes siguiente.
- Número de localidad nueva: **el siguiente libre**.
- En «Lluvias por campaña» **se ocultan** las localidades sin ningún dato en la campaña (§7).
