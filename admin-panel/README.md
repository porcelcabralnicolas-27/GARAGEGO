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

**Real:** solamente el inicio de sesión. Se autentica contra Supabase Auth y después lee la
bandera `profiles.is_admin` del propio perfil. Si no es admin, cierra la sesión.

**Simulado:** absolutamente todo lo demás. Los datos viven en `src/mocks/` y se manipulan con un
reducer en `src/state/`. Las acciones (aprobar, pausar, ocultar, responder) modifican ese estado
en memoria y se guardan en `sessionStorage`, así una recarga durante una demo no pierde lo hecho.
El botón "Restablecer datos de demo" de la sidebar vuelve todo al estado inicial.

La topbar lleva siempre el chip **"Datos simulados"** para que nadie confunda la demo con
producción.

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

El panel muestra cuatro cosas que hoy **no existen** en el esquema. Cada pantalla lo aclara con
una nota al pie. Estas migraciones están pensadas pero **no escritas**:

### 1. Moderación de publicaciones

Es la funcionalidad central del panel y hoy no tiene contraparte. `parking_lots` solo tiene
`is_active`, y ese campo **ya está ocupado**: `ParkingListingWizard.tsx` crea la cochera con
`is_active: false` como borrador y la activa al terminar. Un estado de aprobación tiene que ser
un campo nuevo.

```sql
alter table public.parking_lots
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected','changes_requested')),
  add column if not exists rejection_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles (id),
  add column if not exists moderation_state text not null default 'live'
    check (moderation_state in ('live','paused_by_admin','suspended')),
  add column if not exists pause_reason text,
  add column if not exists suspended_until timestamptz;

-- Backfill: lo que ya está publicado se da por aprobado.
update public.parking_lots set approval_status = 'approved' where is_active;

-- Y la policy de lectura pública pasa a exigir aprobación:
--   (is_active and approval_status = 'approved' and moderation_state = 'live')
--   or owner_id = auth.uid()
-- Ojo: `search_parking_lots` (0032) también tiene que filtrar por esto.
```

### 2. Tickets de soporte

No existe ninguna tabla. El único canal de la app es `messages`, atado a una reserva; no hay
canal usuario ↔ plataforma. Harían falta `support_tickets` y `support_ticket_messages`.

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
Ninguno está hecho todavía.
