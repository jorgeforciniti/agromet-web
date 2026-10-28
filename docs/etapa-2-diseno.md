# Etapa 2: diseño técnico (preferencias en la cuenta, consultas guardadas y alertas en la web)

Estado: **implementada** (API en `/services/usuarios`, ver `server/usuario/LEEME.md`).
- Favoritas y predeterminada de la cuenta (`CuentaPreferenciasService`).
- Consultas guardadas: botón "Guardar consulta" junto a "Copiar enlace" y sección en `/mi-cuenta`.
- Alertas propias: se configuran en `/mi-cuenta#alertas` y se avisan arriba de "Mis estaciones".
  Como no hay máxima diaria publicada, la de calor compara con la última temperatura medida.
- Menú de usuario en la barra superior.
- La validación del token es propia (`firebase_token.php`), compatible con PHP 7.3 y sin curl.

---

## 1. Alcance

| Incluye | Queda para después |
|---|---|
| Favoritas y predeterminada guardadas en la cuenta (iguales en todos los dispositivos) | Avisos por email (Etapa 3: necesita cron y SMTP) |
| Consultas guardadas ("Mis consultas") | Descarga extendida (decisión institucional) |
| Alertas propias por umbral, vistas al entrar al sitio | Seguimiento de campaña calculado en el servidor (puede sumarse en una 2b) |
| Menú de usuario | Roles de personal / administración |

---

## 2. Punto de partida

- **Autenticación [verificado]:** Firebase Auth en el navegador. La API de solicitudes recibe el token
  como `Authorization: Bearer <idToken>` y lo valida en el servidor:
  - sin token → `401 {"ok":false,"error":"Falta header Authorization: Bearer TOKEN."}`;
  - token inválido → `401 {"ok":false,"error":"Token Firebase invalido o expirado."}`.
- **Formato de respuesta [verificado]:** `{"ok": true, ...}` o `{"ok": false, "error": "..."}`.
- **Preferencias hoy [verificado]:** `StationService` guarda favoritas (máx. 8), predeterminada y
  última estación en `localStorage` (`agromet.estaciones`).
- **Consultas [verificado]:** cada herramienta ya sabe expresar su consulta como enlace
  (`shared/enlace-consulta.ts`); una consulta guardada es ese mismo enlace con un nombre.
- **[a confirmar]** Nombre del archivo PHP de `solicitudes/api/` que valida el token, cómo obtiene el
  `uid`, y cómo se conecta a MySQL (sin mostrar credenciales).
- **[a confirmar]** Si la tabla de clientes de solicitudes ya guarda el `uid` de Firebase.

---

## 3. Base de datos (MySQL, utf8mb4)

Tablas nuevas, sin tocar las de solicitudes. El usuario se identifica por el `uid` de Firebase.

```sql
CREATE TABLE usuario (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  firebase_uid  VARCHAR(128) NOT NULL UNIQUE,
  email         VARCHAR(190) NULL,
  perfil_uso    ENUM('productor','tecnico','investigador','institucional','otro') NULL,
  creado        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_acceso DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE usuario_preferencias (
  usuario_id              INT UNSIGNED PRIMARY KEY,
  estacion_predeterminada VARCHAR(10) NULL,
  actualizado             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE usuario_favorita (
  usuario_id  INT UNSIGNED NOT NULL,
  estacion_id VARCHAR(10)  NOT NULL,
  orden       TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (usuario_id, estacion_id),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE usuario_consulta (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  nombre      VARCHAR(80)  NOT NULL,
  herramienta VARCHAR(40)  NOT NULL,
  parametros  VARCHAR(1000) NOT NULL,   -- query string del enlace, sin "herramienta"
  creada      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usada       DATETIME NULL,
  INDEX (usuario_id),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE usuario_alerta (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  estacion_id VARCHAR(10)  NOT NULL,
  variable    ENUM('temp_min','temp_max','lluvia_dia') NOT NULL,
  operador    ENUM('<=','>=') NOT NULL,
  umbral      DECIMAL(6,1) NOT NULL,
  activa      TINYINT(1) NOT NULL DEFAULT 1,
  creada      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (usuario_id),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Límites (en el PHP): 8 favoritas, 30 consultas, 20 alertas por usuario.

---

## 4. API

Carpeta nueva en el servidor: `/services/usuarios/` (separada de `/solicitudes/api/`, pero reutilizando su
validación del token con `require_once`). Todos los endpoints:

- exigen `Authorization: Bearer <idToken>` y responden 401 como solicitudes si falta o no es válido;
- toman el usuario **sólo del `uid` del token**, nunca de un id enviado por el navegador;
- crean la fila de `usuario` la primera vez (y actualizan `ultimo_acceso`);
- usan consultas preparadas (mysqli) y validan cada dato (estación existente y habilitada, umbrales
  en rango físico, nombres ≤ 80 caracteres, herramienta dentro de la lista conocida);
- responden JSON `{"ok":true,...}` / `{"ok":false,"error":"..."}` con códigos 400/401/404/422.

| Endpoint | Método | Cuerpo | Respuesta |
|---|---|---|---|
| `preferencias.php` | GET | — | `{ok, favoritas:["73","28"], predeterminada:"28", perfil:"tecnico"}` |
| `preferencias.php` | POST | `{favoritas:[...], predeterminada, perfil}` | `{ok}` (reemplaza todo) |
| `consultas.php` | GET | — | `{ok, consultas:[{id,nombre,herramienta,parametros,creada,usada}]}` |
| `consultas.php` | POST | `{nombre, herramienta, parametros}` | `{ok, id}` |
| `consulta_borrar.php` | POST | `{id}` | `{ok}` |
| `consulta_usada.php` | POST | `{id}` | `{ok}` (ordena por uso reciente) |
| `alertas.php` | GET | — | `{ok, alertas:[{id,estacion_id,variable,operador,umbral,activa}]}` |
| `alertas.php` | POST | `{id?, estacion_id, variable, operador, umbral, activa}` | `{ok, id}` (crea o edita) |
| `alerta_borrar.php` | POST | `{id}` | `{ok}` |
| `cuenta_borrar.php` | POST | — | `{ok}` (borra sus datos de estas tablas; la cuenta Firebase la borra el usuario) |

Desarrollo local: agregar `"/services/usuarios"` a `proxy.conf.json` (como `/api/colmenar`), para no
depender de CORS.

---

## 5. Frontend (Angular)

**`PreferenciasService`** (nuevo, junto a `StationService`). Dos juegos de preferencias separados:
el **del visitante** (`localStorage`, como hoy) y el **de la cuenta** (servidor). Nunca se mezclan sin
que el usuario lo pida.
- al iniciar sesión: `GET preferencias.php` y se muestran **las de la cuenta**.
  - Si la cuenta todavía no tiene favoritas y el navegador sí → se ofrece una sola vez
    "¿Agregar a tu cuenta las 3 favoritas de este navegador?".
- con sesión iniciada, cada cambio de favoritas o predeterminada va **sólo a la cuenta** → `POST` con
  espera de ~1 s (agrupa varios clics); el juego del visitante no se toca;
- copia local de las de la cuenta (otra clave, `agromet.estaciones.cuenta`) para mostrarlas al instante
  al recargar y si falla la red; se reintenta en el próximo cambio;
- al cerrar sesión: se borra esa copia local y vuelven las preferencias del visitante. Así, en una
  computadora compartida las favoritas de la cuenta no quedan a la vista de otra persona.

**Consultas guardadas:**
- botón "Guardar consulta" junto a "Copiar enlace a esta consulta" (sólo con sesión; sin sesión
  ofrece iniciarla);
- pide un nombre y guarda `herramienta` + parámetros del mismo enlace;
- "Mis consultas" (menú de usuario): lista con abrir, renombrar y borrar; abrir = navegar al enlace.

**Alertas en la web:**
- en cada tarjeta de "Mis estaciones": "Avisarme si…" (mínima ≤, máxima ≥, lluvia del día ≥);
- se evalúan **en el navegador** al cargar "Mis estaciones", con los datos que ya trae
  `estaciones.php` y la mínima de `datos-alerta.php` [verificado: devuelve `minimaTemperatura`];
- si se supera un umbral: franja arriba del bloque ("Monteros: mínima −1,2 °C · tu umbral 0 °C").
  Con el mismo estilo de los avisos de la red;
- avisa de lo **medido**, no de lo pronosticado; descarta lecturas fuera de rango físico.

**Menú de usuario** (reemplaza el email suelto de la barra): Mis estaciones · Mis consultas ·
Mis alertas · Mis solicitudes · Cerrar sesión; en celular, un menú desplegable.

---

## 6. Seguridad y datos personales

- Toda restricción se aplica en el PHP; la interfaz sólo oculta lo que no corresponde.
- Datos guardados: uid, email, perfil declarado y preferencias. Nada más.
- Borrado: `cuenta_borrar.php` + `ON DELETE CASCADE`.
- Los datos meteorológicos siguen públicos; nada de esta etapa los restringe.
- **Decisión institucional:** texto de política de privacidad y uso de datos (enlazado desde el registro).

---

## 7. Orden de trabajo propuesto

1. Confirmar lo marcado **[a confirmar]** (archivo de validación del token, conexión a MySQL).
2. Crear las tablas (script SQL, revisado antes de ejecutarlo).
3. Escribir los PHP en `server/usuario/api/` dentro del repositorio para revisarlos y subirlos por WinSCP.
4. Probar cada endpoint con un token real (curl) en el servidor.
5. Frontend: `PreferenciasService` → menú de usuario → consultas guardadas → alertas en la web.
6. Probar con dos navegadores (misma cuenta) que las favoritas se sincronicen.

## 8. Decisiones pendientes

- Límites: 8 favoritas, 30 consultas, 20 alertas (¿de acuerdo?).
- ¿Se pide el perfil de uso al registrarse, o sólo en Preferencias (opcional)?
- ¿Vincular `usuario` con el cliente de solicitudes (mismo uid/email) o mantenerlos separados?
- Política de privacidad.
