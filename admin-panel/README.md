# GarageGo · Panel de administración

Backoffice interno del equipo de GarageGo: aprueba publicaciones, modera cocheras y reseñas,
atiende tickets de soporte, revisa movimientos de saldo y muestra métricas del sistema.

Es un proyecto **web independiente** de la app Expo: tiene su propio `package.json`, su propio
`node_modules` y su propio diseño. No comparte código con `src/`; solo importa los tipos y las
etiquetas de dominio de [`../shared/domain.ts`](../shared/domain.ts), que también usa la app, para
que los estados (aprobación, moderación, tickets, documentos) no se desincronicen.

Pensado para escritorio, pero se adapta a pantallas chicas: por debajo de 900 px la barra lateral
pasa a un menú y la lista y el detalle se apilan (al elegir un elemento, la pantalla baja al detalle).

**Tecnología:** React 19, React Router 7, Vite 7, TypeScript y `@supabase/supabase-js`. Sin
librerías de interfaz ni de gráficos: el sistema de diseño (botones, tablas, modales, gráficos SVG)
es propio, en `src/ui/` y `src/styles/`.

## Cómo correrlo

```bash
cd admin-panel
npm install                # una sola vez
cp .env.example .env       # completar con los valores del .env de la raíz
npm run dev                # http://localhost:5180
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en el puerto 5180 |
| `npm run typecheck` | Verificación de tipos (`tsc --noEmit`); también corre en el CI de GitHub |
| `npm run build` | Verifica los tipos y genera `dist/` |
| `npm run preview` | Sirve `dist/` en el puerto 5181 |

Los puertos (5180 dev, 5181 preview) están elegidos para no chocar con Metro (8081): el
`expo start` de la raíz y este servidor pueden correr al mismo tiempo.

### Variables de entorno

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | La misma URL de Supabase que usa la app (`EXPO_PUBLIC_SUPABASE_URL`) |
| `VITE_SUPABASE_ANON_KEY` | La misma clave anónima (`EXPO_PUBLIC_SUPABASE_ANON_KEY`) |

**Solo la clave anónima, nunca la `service_role`.** Este bundle se sirve al navegador y cualquiera
podría leerla desde las herramientas de desarrollo. Lo que el panel puede hacer lo limitan las
políticas de la base y las funciones que validan administrador (ver [Seguridad](#seguridad)).

## Habilitar un administrador

La migración `supabase/migrations/0033_admin_flag.sql` (en la raíz del repo) agrega la columna
`profiles.is_admin`. Para habilitar a alguien, desde el SQL Editor de Supabase:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'tu-mail@ejemplo.com');
```

Tiene que ser desde el SQL Editor: un trigger impide cambiar `is_admin` desde el cliente. Sin él,
cualquier usuario podría auto-promoverse con un PATCH a la API usando la clave anónima, porque la
política `profiles_update_own` no restringe columnas.

El panel valida el permiso al iniciar sesión (`src/auth/AuthProvider.tsx`): si la cuenta no tiene
`is_admin`, no entra.

## Secciones

| Sección | Qué hace | De dónde lee |
|---|---|---|
| **Dashboard** | Ocupación ahora, sesiones en curso, publicaciones esperando aprobación, movimientos de los últimos 30 días y crecimiento de usuarios (30 días, 6 o 12 meses; nuevos o acumulado) | `admin_active_sessions()`, `admin_growth()`, `admin_transaction_summary()` |
| **Usuarios** | Conductores y propietarios, con ficha completa (vehículos, reservas, cocheras, movimientos, correo); calificaciones y reseñas, que se pueden ocultar con motivo | `admin_user_directory()`, `admin_user_detail()`, `ratings`, `admin_set_rating_hidden()` |
| **Inventario** | *Aprobaciones*: cola por estado (pendientes, cambios pedidos, aprobadas, rechazadas). *Cocheras publicadas*: pausar, suspender o reactivar | `parking_lots` y `parking_images`, `parking_lot_documents`, `admin_review_parking_lot()`, `admin_set_parking_lot_moderation()`, `admin_lot_stats()` |
| **Soporte** | *Tickets*: lista paginada, filtros, respuesta y resolución. *Transacciones*: movimientos de saldo | `admin_tickets_page()`, `support_tickets` y `support_ticket_messages`, `admin_transactions()` |

Los números de la barra lateral (publicaciones por aprobar, tickets abiertos) se actualizan solos.

Cada pantalla tiene su par `xxxApi.ts` (llamadas a Supabase) y `useXxx.ts` (estado), y todo lo
derivado se calcula ahí. No hay datos de ejemplo: todo viene de la base real.

### Revisión de publicaciones

La ficha de una publicación pendiente reúne lo que el revisor necesita:

- **Datos y fotos** de la cochera, con el punto en el mapa y un aviso si tiene menos de 3 fotos o
  ninguna.
- **Datos de contacto** en la descripción (teléfonos, correos), resaltados: suele ser un intento de
  cerrar el trato por fuera de la app.
- **Titularidad:** la relación que declaró el propietario con el lugar (titular, inquilino o
  administrador) y los documentos que subió (DNI y los que acreditan que es el dueño o tiene
  permiso), con URLs firmadas que vencen.
- **Edición de una publicación ya aprobada:** se marca como tal. Si el propietario cambió los datos
  del lugar, la tarifa y servicios o las fotos, vuelve a la cola; los horarios no se revisan.
- **Checklist:** "Aprobar y publicar" queda deshabilitado hasta tildar los cinco puntos (fotos,
  dirección, precio, descripción y titularidad), y también si faltan documentos o fotos.
- **Decisiones:** aprobar, pedir cambios (se marca qué campos hay que modificar) o rechazar con
  motivo. Un rechazo es definitivo. El propietario recibe una notificación con el resultado.

**Los documentos se borran al decidir.** Al aprobar o rechazar, el panel borra los archivos del
bucket privado `ownership-docs` y sus filas (con "Pedir cambios" se conservan, porque el
propietario tiene que reenviar). Queda en la cochera solo la fecha y el revisor de la verificación.
Si el borrado falla, se reintenta solo la próxima vez que se carga la cola. Esto lo hace el panel
porque los archivos de Storage no se pueden borrar con SQL.

## Estructura

```
src/
  auth/      Inicio de sesión y guard de administrador
  shell/     Barra lateral, barra superior, layout, contadores de pendientes
  ui/        Sistema de diseño propio: botones, tablas, badges, modales, gráficos SVG
  domain.ts  Tipos y helpers de dominio del panel (reexporta lo de shared/domain.ts)
  pages/     dashboard, usuarios, inventario y soporte, cada una con su xxxApi.ts + useXxx.ts
  lib/       Cliente de Supabase, formato, sondeo periódico y actualización en tiempo real
  styles/    Tokens de diseño (CSS) y estilos
```

## Base de datos

El panel depende de migraciones de la raíz del repo (`supabase/migrations/`). Se corren a mano,
en orden, desde el SQL Editor de Supabase.

| Migraciones | Qué aportan al panel |
|---|---|
| 0033 | `profiles.is_admin` y el trigger que lo protege |
| 0034–0040 | Moderación de publicaciones: estados de aprobación y moderación, `is_admin()`, RPC de revisión y de pausa, aviso al propietario, protección de columnas, `admin_lot_stats()` |
| 0041, 0054, 0063, 0076 | Tickets de soporte (por reserva, por cochera, por rol y generales) |
| 0042, 0045, 0056 | Dashboard, transacciones y directorio de usuarios |
| 0043, 0044 | Usuarios y ocultar reseñas |
| 0053 | Cocheras archivadas al eliminarse |
| 0059, 0060 | Listas paginadas del panel y actualización en tiempo real |
| 0061 | Recarga de saldo de prueba: las transacciones muestran la marca "Demo" |
| 0072 | "Pedir cambios" indica qué campos modificar y se valida el reenvío |
| 0078, 0079 | Verificación de titularidad: documentos, bucket privado, sello de verificación, permiso del equipo para borrarlos |
| 0081, 0082 | Edición de una aprobada vuelve a revisión; toda publicación necesita al menos una foto |

Verificaciones SQL de esas reglas: `supabase/tests/` (por ejemplo `ownership_checks.sql`,
`cleanup_checks.sql` y `photo_address_checks.sql`).

### Historia de las secciones más antiguas

- **Inventario (0034–0040).** `0034` agrega a `parking_lots` las columnas `approval_status` y
  `moderation_state`, hace el relleno (lo ya publicado se da por aprobado) y ajusta la política de
  lectura pública y `search_parking_lots` para exigir `approved` y `live`. `0035` suma las RPC de
  revisión y de pausa, ambas `security definer` y con validación de administrador adentro. `0036`
  hace que la revisión le inserte una notificación al propietario. `0037` y `0038` protegen esas
  columnas con un trigger (sin él, un propietario se auto-aprueba con un PATCH): la única
  transición permitida al propietario es `changes_requested` a `pending`. `0039` agrega
  `admin_lot_stats()` (reservas de 30 días, sesión en curso, próximas 7 días) porque el panel no
  puede leer `bookings` directo. `0040` deja que el conductor que ya reservó siga viendo el nombre
  de la cochera aunque la pausen.
- **Tickets (0041).** Crea `support_tickets` y `support_ticket_messages`. Un mensaje del usuario
  reabre un ticket resuelto, y la respuesta o resolución del equipo le notifica al usuario.
- **Dashboard (0042).** Tres RPC: sesiones activas, crecimiento y resumen de movimientos. El
  gráfico de crecimiento es un embudo, no dos tipos disjuntos: "usuarios nuevos" y "publicaron su
  primera cochera", que es un subconjunto.
- **Usuarios (0043).** `admin_user_directory()` y `admin_user_detail()` leen el correo de
  `auth.users` dentro de una función `security definer`, porque la clave anónima no puede.
- **Reseñas (0044).** Ocultar una reseña la saca de la ficha pública pero **sigue contando para el
  promedio**.

## Seguridad

Por política directa, un administrador lee `profiles`, `ratings` y `parking_lots` (con
`is_admin()`, migración 0034), además de las tablas de soporte y los documentos de titularidad.
Todo lo demás que el panel usa (`bookings`, `vehicles`, movimientos de billetera) entra por **RPC
`security definer`** que validan administrador adentro y devuelven agregados o listas acotadas,
nunca acceso libre. `wallets` y las notificaciones ajenas siguen sin ningún acceso.

El camino descartado es un backend con clave de servicio: este bundle se sirve al navegador.

Los documentos de titularidad viven en un bucket **privado** y el panel los abre con URLs firmadas
que vencen; ningún otro usuario puede verlos.

## Despliegue

Se publica en Cloudflare Workers como un proyecto aparte de la app web (otro nombre,
`garagego-admin`, y otra URL). Desde esta carpeta:

```bash
npm run build
npx wrangler deploy
```

La configuración está en [`wrangler.jsonc`](./wrangler.jsonc): sirve `dist/` como archivos
estáticos y devuelve `index.html` para cualquier ruta (`/inventario`, `/usuarios`…), porque el
panel usa rutas del navegador y, sin eso, recargar daría un 404. No usar un archivo `_redirects`:
Cloudflare lo rechaza por posible bucle infinito.

Las migraciones no se despliegan con el panel: se corren aparte en Supabase.

**Pendiente de seguridad:** hoy cualquiera que conozca la URL ve la pantalla de inicio de sesión
(solo entran las cuentas con `is_admin`). Conviene activar Cloudflare Access sobre el Worker para
que únicamente el equipo llegue a la página, y revisar que las cuentas administradoras tengan
contraseñas fuertes.
