-- Etapa 2: preferencias de usuario, consultas guardadas y alertas.
-- Tablas nuevas; no modifica ninguna tabla existente.
-- Ejecutar en la base indicada en config.php (DB_USUARIOS). Revisar antes de ejecutar.

CREATE TABLE IF NOT EXISTS usuario (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  firebase_uid  VARCHAR(128) NOT NULL,
  email         VARCHAR(190) NULL,
  perfil_uso    ENUM('productor','tecnico','investigador','institucional','otro') NULL,
  creado        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_acceso DATETIME NULL,
  UNIQUE KEY uq_usuario_uid (firebase_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuario_preferencias (
  usuario_id              INT UNSIGNED PRIMARY KEY,
  estacion_predeterminada VARCHAR(10) NULL,
  actualizado             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pref_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuario_favorita (
  usuario_id  INT UNSIGNED NOT NULL,
  estacion_id VARCHAR(10)  NOT NULL,
  orden       TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (usuario_id, estacion_id),
  CONSTRAINT fk_fav_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuario_consulta (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  nombre      VARCHAR(80)   NOT NULL,
  herramienta VARCHAR(40)   NOT NULL,
  parametros  VARCHAR(1000) NOT NULL,  -- query string del enlace, sin "herramienta"
  creada      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usada       DATETIME NULL,
  KEY ix_consulta_usuario (usuario_id),
  CONSTRAINT fk_consulta_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuario_alerta (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  estacion_id VARCHAR(10)  NOT NULL,
  variable    ENUM('temp_min','temp_max','lluvia_dia') NOT NULL,
  operador    ENUM('<=','>=') NOT NULL,
  umbral      DECIMAL(6,1) NOT NULL,
  activa      TINYINT(1) NOT NULL DEFAULT 1,
  creada      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_alerta_usuario (usuario_id),
  CONSTRAINT fk_alerta_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
