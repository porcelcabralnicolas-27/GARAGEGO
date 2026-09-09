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

## Qué es real y qué es simulado

**Real:**

- El inicio de sesión. Se autentica contra Supabase Auth y después lee la bandera
  `profiles.is_admin` del propio perfil. Si no es admin, cierra la sesión.
- **Toda la sección Inventario** (`src/pages/inventory/`). Lee `parking_lots` con dueños, fotos
  y estadísticas de reservas.
  - "Aprobaciones": aprobar / rechazar / pedir cambios con `admin_review_parking_lot`.
  - "Cocheras publicadas": pausar / suspender / reactivar con `admin_set_parking_lot_moderation`.
  Migraciones **0034–0040**.
- **La pestaña "Tickets" de Soporte** (`src/pages/support/ticketsApi.ts` + `useTickets.ts`).
  Lee `support_tickets` / `support_ticket_messages`, responde, resuelve y reabre. Migración
  **0041**. La pestaña "Transacciones" de esa misma página sigue en mock (es parte de Dashboard).
- Los badges de la sidebar (`src/shell/usePendingCounts.ts`): dos `count` reales.

**Simulado:** Usuarios, Dashboard, y la pestaña Transacciones de Soporte. Los datos viven en
`src/mocks/` con un reducer en `src/state/`. El botón "Restablecer datos de demo" de la sidebar
vuelve ese estado al inicial.

La topbar lleva el chip **"Datos simulados"**: sigue ahí mientras queden secciones demo.

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
  auth/      Login real y guard de admin (lo único que toca la base)
  shell/     Sidebar, topbar y layout
  ui/        Sistema de diseño propio: botones, tabla, badges, modales, gráficos SVG
  mocks/     Tipos + generación determinista de los datos de demo
  state/     Reducer del mock y SELECTORES (ver abajo)
  pages/     Las 4 secciones
  styles/    Tokens CSS y estilos
```

**`src/state/selectors.ts` es la pieza clave para el futuro.** Todo lo derivado (ocupación,
series de crecimiento, filas de tablas, estadísticas) se calcula ahí y solo ahí. Cuando llegue el
momento de conectar la base, se reemplazan esos selectores por queries y **las vistas no cambian**.

## Lo que falta en la base para que esto sea real

### 1. Inventario (moderación de publicaciones) — ✅ HECHO (migraciones 0034–0040)

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

### 2. Tickets de soporte — ✅ HECHO (migración 0041)

`0041_support_tickets.sql` crea `support_tickets` + `support_ticket_messages`. El conductor
abre un ticket sobre una reserva suya, el propietario sobre una cochera suya (RLS lo obliga).
Triggers `security definer`: un mensaje del usuario reabre un ticket resuelto; el equipo
respondiendo o resolviendo le notifica al usuario (`notifications.related_ticket_id`, tipos
`support_reply` / `support_resolved`). RPC `admin_ticket_context()` para el nombre de la
cochera (el admin no lee `bookings`). Del lado de la app: `src/features/support/` +
`app/(client|owner)/profile/support/`, entrada desde Perfil → "Centro de ayuda".

### 3. Moderación de reseñas

`ratings` no tiene flag de moderación, y tampoco tiene policy de UPDATE ni DELETE: hoy nadie
puede tocar una reseña desde el cliente. Haría falta `ratings.is_hidden` + `hidden_reason`.

### 4. Email y presencia

- **Email**: no está en `profiles`, vive en `auth.users` y es ilegible con la anon key. Se
  resuelve con una vista `security definer` que haga el join, o con la Admin API desde un
  backend. **Nunca con la service key en este bundle**, que se sirve al navegador.
- **Presencia**: no hay ningún campo de actividad. Sería `profiles.last_seen_at` o Realtime
  Presence de Supabase.

Un detalle que **no** necesita migración: la serie de "propietarios" del gráfico de crecimiento
se calcula con la fecha de la primera cochera de cada owner
(`min(parking_lots.created_at) group by owner_id`), que ya son datos existentes.

## Además: RLS

Hoy un admin autenticado como usuario normal **solo puede leer `profiles` y `ratings` completas**
(las dos tienen policy `using (true)`). No vería reservas ajenas, billeteras, notificaciones, ni
las cocheras inactivas — justo las que necesita moderar.

Para conectar datos reales hay tres caminos: policies con un predicado `is_admin(auth.uid())` en
cada tabla, RPCs `security definer` que validen admin adentro, o un backend con la service key.

Para moderación de publicaciones ya se tomó el camino mixto (migraciones 0034/0035): la lectura
de `parking_lots` va por policy (`... or public.is_admin(auth.uid())`) y las escrituras por RPC
`security definer`. El resto de las tablas sigue sin acceso de admin.
