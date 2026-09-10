# GarageGo · Panel de administración

Backoffice interno. Es un proyecto **web independiente** de la app Expo: tiene su propio
`package.json`, su propio `node_modules` y su propio diseño. No comparte código con `src/`.

Pensado para **escritorio**. Por debajo de 1100 px de ancho muestra un aviso en vez del panel.

## Cómo correrlo

```bash
cd admin-panel
npm install                # una sola vez
cp .env.example .env       # completar con los valores del .env de la raíz
npm run dev                # http://localhost:5180
```

Los puertos (5180 dev, 5181 preview) están elegidos para no chocar con Metro (8081). El
`expo start` de la raíz y este servidor pueden correr al mismo tiempo.

## Qué lee cada pantalla

Todo el panel funciona con datos reales de Supabase (migraciones **0033–0045**). No hay mock:
cada pantalla tiene su par `xxxApi.ts` + `useXxx.ts` y todo lo derivado se calcula ahí.

| Sección | Cómo lee | Migraciones |
|---|---|---|
| Login | Supabase Auth + `profiles.is_admin` | 0033 |
| Inventario (aprobaciones + pausar/suspender) | policy `is_admin()` sobre `parking_lots` + RPCs | 0034–0040 |
| Soporte · Tickets | `support_tickets` / `_messages` por policy + RPCs | 0041 |
| Soporte · Transacciones | `admin_transactions()` + `admin_transaction_summary()` | 0042, 0045 |
| Dashboard | `admin_active_sessions()`, `admin_growth()`, `admin_transaction_summary()` | 0042 |
| Usuarios · Conductores/Propietarios | `admin_user_directory()` + `admin_user_detail()` (incluye email de `auth.users`) | 0043 |
| Usuarios · Reseñas | `ratings` por policy + `admin_set_rating_hidden()` | 0044 |
| Badges de la sidebar | dos `count` (`src/shell/usePendingCounts.ts`) | — |

Tipos y helpers de dominio compartidos: `src/domain.ts`.

## Habilitar un administrador

La migración `supabase/migrations/0033_admin_flag.sql` (en la raíz del repo) agrega la columna.
Para habilitar a alguien, desde el SQL Editor de Supabase:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'tu-mail@ejemplo.com');
```

Tiene que ser desde el SQL Editor: un trigger impide cambiar `is_admin` desde el cliente. Sin él,
cualquier usuario podría auto-promoverse con un PATCH a PostgREST usando la anon key, porque la
policy `profiles_update_own` no restringe columnas.

## Estructura

```
src/
  auth/      Login real y guard de admin
  shell/     Sidebar, topbar, layout, contadores de la sidebar
  ui/        Sistema de diseño propio: botones, tabla, badges, modales, gráficos SVG
  domain.ts  Tipos y helpers de dominio compartidos
  pages/     Las 4 secciones — cada una con su xxxApi.ts + useXxx.ts
  lib/       Cliente de Supabase, formateo
  styles/    Tokens CSS y estilos
```

## Historia: cómo se conectó cada sección

### Inventario (moderación de publicaciones) — migraciones 0034–0040

`0034_listing_moderation.sql` agrega a `parking_lots` las columnas `approval_status`,
`moderation_state` y compañía, hace el backfill (lo ya publicado se da por aprobado), suma el
helper `is_admin()`, y ajusta la policy de lectura pública + `search_parking_lots` para que
exijan `approval_status = 'approved' and moderation_state = 'live'`.

`0035_listing_moderation_rpcs.sql` agrega las RPC `admin_review_parking_lot` y
`admin_set_parking_lot_moderation`, ambas `security definer` y con validación de admin adentro.

`0036_notify_owner_on_review.sql` reemplaza `admin_review_parking_lot` para que además le inserte
una notificación al propietario (`audience = 'owner'`) con el resultado de la revisión.

`0037_protect_parking_lot_moderation.sql` — trigger que congela esas columnas para el cliente
(sin él, un propietario se auto-aprueba con un PATCH).

`0038_rejection_is_terminal.sql` — ajusta ese trigger: la única transición que el propietario
puede hacer es `changes_requested` → `pending` (reenvío tras "Pedir cambios"). Una publicación
`rejected` es definitiva.

`0039_admin_lot_stats.sql` — RPC `security definer` `admin_lot_stats()` con los agregados de
`bookings` por cochera (reservas/30 d, sesión en curso, próximas 7 días), que el admin no puede
leer directo. La usa la pestaña "Cocheras publicadas".

`0040_booked_lot_stays_visible.sql` — el conductor que ya reservó una cochera sigue viendo su
nombre aunque el admin la pause/suspenda (`or public.user_has_booking_on_lot(id)` en la policy
de lectura; el helper es `security definer` para no recursar con `bookings_select`).

Del lado de la app Expo, "Mis publicaciones" del propietario muestra el estado (En revisión /
Corregir / Rechazada) y el reenvío.

### Tickets de soporte — migración 0041

`0041_support_tickets.sql` crea `support_tickets` + `support_ticket_messages`. El conductor
abre un ticket sobre una reserva suya, el propietario sobre una cochera suya (RLS lo obliga).
Triggers `security definer`: un mensaje del usuario reabre un ticket resuelto; el equipo
respondiendo o resolviendo le notifica al usuario (`notifications.related_ticket_id`, tipos
`support_reply` / `support_resolved`). RPC `admin_ticket_context()` para el nombre de la
cochera (el admin no lee `bookings`). Del lado de la app: `src/features/support/` +
`app/(client|owner)/profile/support/`, entrada desde Perfil → "Centro de ayuda".

### Dashboard — migración 0042

`0042_admin_dashboard.sql` agrega tres RPCs `security definer`: `admin_active_sessions()`
(sesiones en curso con cochera / propietario / conductor / patente), `admin_growth(days, buckets)`
y `admin_transaction_summary(days)` (volumen y desglose de movimientos). La ocupación total sale
de un `count` directo sobre `parking_lots`.

El gráfico de crecimiento es un **funnel, no dos tipos disjuntos**: "usuarios nuevos"
(`profiles.created_at`) y "publicaron su 1ª cochera" (`min(parking_lots.created_at)` por owner),
que es un subconjunto — en la app todo el que se registra es conductor y ser propietario es un
flag sin fecha.

### Usuarios — migración 0043

`0043_admin_users.sql` agrega `admin_user_directory()` (una fila por usuario: perfil + email de
`auth.users` + agregados de vehículos / reservas / cocheras / plata) y `admin_user_detail(id)`
(la ficha completa como `jsonb`). El email se lee dentro del RPC `security definer` (postgres
sí puede leer `auth.users`).

### Moderación de reseñas — migración 0044

`0044_rating_moderation.sql` agrega `ratings.is_hidden` / `hidden_reason` / `hidden_at` /
`hidden_by`, cambia la policy de lectura (el público no ve las ocultas; el autor sí ve la suya;
el admin ve todo) y agrega `admin_set_rating_hidden(id, hidden, reason)`. Ocultar deja de
mostrarla en la ficha pública **pero sigue contando para el promedio**. Del lado de la app:
`listRatingsForParkingLot` filtra `is_hidden = false`.

### Transacciones — migración 0045

`0045_admin_transactions.sql` agrega `admin_transactions(limit)`: los N movimientos más
recientes con el titular y (si aplica) la cochera. El resumen ya lo daba `admin_transaction_summary`.

## Además: RLS

Por policy directa, un admin lee `profiles`, `ratings` (ambas `using (true)`) y `parking_lots`
(`... or public.is_admin(auth.uid())`, migración 0034). Todo lo demás que el panel usa —
`bookings`, `vehicles`, `wallet_transactions`, `support_tickets`— entra por **RPCs
`security definer`** que validan admin adentro y devuelven agregados o listas acotadas, nunca
acceso libre. `wallets` y las notificaciones ajenas siguen sin ningún acceso (nadie los usa aún).

El camino descartado es el backend con service key: este bundle se sirve al navegador.
