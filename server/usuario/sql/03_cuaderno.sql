-- Cuaderno de aplicaciones de la app móvil (Más → Cuaderno), guardado en la cuenta.
-- Tabla nueva; no modifica ninguna tabla existente. Ejecutar en la base DB_USUARIOS (usuarios).
-- `uid` lo genera el celular: así una anotación hecha sin conexión y subida después no se duplica.

CREATE TABLE IF NOT EXISTS usuario_cuaderno (
  usuario_id  INT UNSIGNED  NOT NULL,
  uid         VARCHAR(40)   NOT NULL,
  fecha       DATETIME      NOT NULL,          -- hora del celular (Argentina)
  lote        VARCHAR(80)   NOT NULL DEFAULT '',
  producto    VARCHAR(80)   NOT NULL DEFAULT '',
  dosis       VARCHAR(40)   NOT NULL DEFAULT '',
  notas       VARCHAR(500)  NOT NULL DEFAULT '',
  condiciones VARCHAR(1000) NULL,              -- JSON: estación, temperatura, humedad, viento, ΔT, semáforo…
  creado      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, uid),
  KEY ix_cuaderno_fecha (usuario_id, fecha),
  CONSTRAINT fk_cuaderno_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
