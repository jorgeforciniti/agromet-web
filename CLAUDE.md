# agromet-web

Portal de Agrometeorología de la EEAOC (https://agromet.eeaoc.gob.ar). Todo el código, los
comentarios, los nombres y los mensajes de commit van en **español**.

## Stack

- Angular 19 con componentes standalone y rutas `loadComponent` (`src/app/app.routes.ts`).
  Angular Material, Chart.js, Leaflet, Font Awesome.
- Firebase Auth (`@angular/fire`) para las cuentas. El token de Firebase se manda a las APIs PHP.
- Backend: PHP 7.3+ con mysqli, en `server/`. Se sube a mano al servidor (WinSCP); no hay deploy
  automático.
  - `server/admin/api` → `/services/admin` (página `/admin`). Ver `server/admin/LEEME.md`.
  - `server/usuario/api` → `/services/usuarios` (favoritas, consultas, alertas). Ver
    `server/usuario/LEEME.md` y `docs/etapa-2-diseno.md`.
  - `server/servicios` → PHP sueltos de `/services/`.
- En desarrollo, `proxy.conf.json` redirige `/PDFS`, `/api/colmenar`, `/services/usuarios` y
  `/services/admin` al servidor de producción.

## Comandos

- `npm start` (`ng serve`): servidor de desarrollo en http://localhost:4200
- `npm run build` (`ng build`): compilación de producción en `dist/`
- Chequeo rápido de tipos: `npx tsc --noEmit -p tsconfig.app.json` (no revisa los templates; para
  eso, `ng build`)

## Estructura

- `src/app/<seccion>/`: un componente por sección o diálogo (`*-dialog`). Los servicios HTTP están en
  `src/app/services/`. Hay compartidos en `shared/`, `directives/`, `pipes/` y `models/`.
- `services/station.service.ts`: la estación activa se comparte entre secciones (`activa$`,
  `selectedStation$`).
- Administración: `shared/administradores.ts` (sólo decide qué se ve) tiene que coincidir con
  `ADMINISTRADORES` en `server/admin/api/config.php` (el control real).

## Reglas del proyecto

- **Secretos**: `.htaccess` con contraseñas, `conecta_*.php` y similares **no se suben al
  repositorio**. Hay que usar los `*.ejemplo.php`.
- **Descargas y copia de datos** (en todo el sitio): los gráficos se descargan en PNG con la fuente;
  el CSV sólo donde está permitido y con 31 días como máximo (`[maxFilas]` de
  `shared/exportar-grafico.component.ts`). Las tablas no se pueden seleccionar ni copiar (regla
  global en `styles.css`). Quien necesite más datos los pide a la Sección. La excepción es `/admin`.
- **El Colmenar** (`/estadisticas-historicas`): sólo PNG; sin CSV, tablas de datos crudos ni texto
  seleccionable.
- **Código comentado a propósito** (por ejemplo los accesos a Solicitudes/Trámites): no se reactiva ni
  se expone en la navegación sin pedido explícito.
- Los PHP nuevos siguen el patrón de `comun.php` de su carpeta (respuestas `error_json`, validar el
  token, etc.). Cuando cambia lo que hay que instalar en el servidor, se actualiza su `LEEME.md`.
- Imágenes de `src/assets`: optimizarlas antes de commitear (idealmente menos de 300 KB).
- Commits: un mensaje corto en español con el formato "Sección: qué cambia".
