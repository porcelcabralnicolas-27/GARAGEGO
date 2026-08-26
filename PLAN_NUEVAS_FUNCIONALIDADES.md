# Plan de acción — Nuevas funcionalidades GarageGo

Basado en el código actual del repo (fases 1-8 completas, migraciones hasta `0015_booking_buffer_and_overtime.sql`) y en las decisiones que confirmaste:

1. El botón de "inicio de reserva" **marca la llegada real** del cliente (guarda el momento exacto y avisa al propietario).
2. El trayecto se muestra como **ruta dibujada dentro de la app** (Google Directions API), no como link externo.
3. El formulario de vehículo admite **hasta 3 vehículos por usuario**, seleccionables al reservar.

El orden de fases evita que las más simples queden bloqueadas por la más compleja (el mapa de ruta, que depende de habilitar una API nueva en Google Cloud).

---

## Fase A — Vehículos del usuario (máx. 3)

**Base de datos** — `supabase/migrations/0016_vehicles.sql`
- Tabla `vehicles`: `id`, `user_id` (FK a `profiles`), `plate` (patente), `brand`, `model`, `color`, `created_at`.
- RLS: cada usuario ve y administra solo sus propios vehículos (mismo patrón que `parking_lots`).
- Trigger `BEFORE INSERT` que rechaza el 4º vehículo por usuario (`raise exception 'max_vehicles_reached'`), ya que no se puede expresar ese límite con un `CHECK` simple.
- Índice por `user_id`.

**Código nuevo**
- `src/features/vehicle/types.ts`, `schemas.ts` (validación con zod: patente obligatoria, marca/modelo/color opcionales), `api.ts` (`listMyVehicles`, `createVehicle`, `deleteVehicle`).
- `src/features/vehicle/VehicleForm.tsx` y `VehicleListItem.tsx` (siguiendo el estilo de `ParkingForm.tsx` / `TextField.tsx` ya existentes).
- Pantalla `app/(client)/profile/vehicles.tsx` (o dentro del futuro folder de Ajustes, ver Fase D): listado + alta + baja, con mensaje claro cuando ya hay 3 cargados.

**Código a tocar**
- `src/lib/supabase/database.types.ts`: agregar tabla `vehicles`.
- Actualizar memoria del proyecto: recordar correr `0016` manualmente en el SQL Editor de Supabase.

**Verificación:** `tsc --noEmit` + `npx expo start --web`, cargar 3 vehículos y confirmar que el 4to se rechaza con un mensaje entendible.

---

## Fase B — Selección de vehículo al reservar + botón "Inicio de reserva"

**Base de datos** — `supabase/migrations/0017_bookings_vehicle_and_start.sql`
- `alter table bookings add column vehicle_id uuid references vehicles(id) on delete set null;` (nullable para no romper reservas viejas).
- `alter table bookings add column actual_start_at timestamptz;`
- Modificar `create_booking(...)`: nuevo parámetro `p_vehicle_id uuid`, valida que el vehículo exista y sea del usuario (`auth.uid()`), lo guarda en la reserva.
- Nueva función `start_booking(p_booking_id uuid)` (`security definer`, mismo patrón que `confirm_booking`/`complete_booking`): solo el cliente dueño de la reserva, solo si `status = 'confirmed'` y `actual_start_at is null`; guarda `actual_start_at = now()` e inserta una notificación para el propietario ("El cliente llegó y comenzó a usar el estacionamiento").

**Código a tocar**
- `src/features/booking/api.ts`: `createBooking` recibe `vehicleId`; nueva función `startBooking(bookingId)`.
- `src/features/booking/types.ts`: `Booking.vehicleId`, `Booking.actualStartAt`; agregar datos del vehículo a `OwnerBookingItem` (patente/marca/modelo) para que el propietario sepa qué auto esperar.
- `app/(client)/search/booking/[parkingId].tsx`: nuevo paso "Elegí tu vehículo" (mismo componente `ChipSelect` que ya usás para fecha/hora), con link "+ Agregar vehículo" si la lista está vacía. Bloquea "Confirmar reserva" si no hay vehículo elegido.
- `app/(client)/bookings/index.tsx` y `src/components/booking/BookingCard.tsx`: mostrar botón "Iniciar" cuando `status === 'confirmed' && !actualStartAt`; una vez iniciada, mostrar estado "En curso" en lugar de "Confirmada".
- `app/(owner)/bookings/index.tsx`: mostrar la patente/vehículo del cliente en la tarjeta.
- `src/lib/supabase/database.types.ts`: actualizar tipos de `bookings` y de la función `create_booking`/agregar `start_booking`.

**Verificación:** flujo completo cliente — elegir vehículo, reservar, propietario confirma, cliente toca "Iniciar", propietario recibe notificación y ve el auto correcto.

---

## Fase C — Notificaciones de mensajes (ícono de nuevo mensaje sin abrir)

Hoy `messages` no tiene ningún tracking de leído/no leído, y enviar un mensaje no genera notificación. Se resuelve reutilizando la tabla `notifications` que ya tiene lectura en tiempo real habilitada (`0014_notifications_realtime.sql`).

**Base de datos** — `supabase/migrations/0018_message_notifications.sql`
- `alter table notifications add column related_booking_id uuid references bookings(id) on delete cascade;` (para poder identificar a qué conversación pertenece cada notificación de mensaje).
- Trigger `AFTER INSERT on messages` → función `notify_new_message()`: calcula quién es "la otra parte" de la reserva (cliente u propietario, el que no envió el mensaje) e inserta una notificación `type = 'new_message'` con `related_booking_id`.

**Código a tocar**
- `src/features/notifications/api.ts`: nueva función `countUnreadByType(userId, type)` o traer todas las no leídas y filtrar client-side; nueva `markMessageNotificationsAsRead(userId, bookingId)`.
- Nuevo hook `src/features/notifications/useUnreadMessagesCount.ts`: carga el conteo inicial + se suscribe con `subscribeToNotifications` (ya existe) filtrando `type === 'new_message'`.
- `app/(client)/_layout.tsx` y `app/(owner)/_layout.tsx`: usar el hook y setear `tabBarBadge` en el `Tabs.Screen` de "Mensajes" (Expo Router/React Navigation ya soporta esta prop, no hace falta un componente custom).
- `src/features/messaging/ConversationListItem.tsx`: punto/badge si esa conversación tiene notificaciones sin leer (cruzar `related_booking_id` con `thread.bookingId`).
- `app/(client)/messages/[bookingId].tsx` y `app/(owner)/messages/[bookingId].tsx`: al entrar, llamar `markMessageNotificationsAsRead` para esa reserva puntual (no todas).

**Verificación:** mandar un mensaje desde un usuario de prueba, confirmar que aparece el badge en la tab de Mensajes del otro usuario sin haber entrado al chat, y que desaparece al abrir esa conversación puntual (no las demás).

---

## Fase D — Tuerca de ajustes en Perfil

El proyecto ya tiene una regla establecida (documentada en el resumen que compartiste): las pantallas de flujo propio deben vivir en su **Stack anidado dentro del grupo de Tabs**, nunca como `Tabs.Screen` oculto — por eso mismo bug se corrigió dos veces. Vamos a seguir ese patrón acá.

**Reestructuración de rutas**
- `app/(client)/profile.tsx` (archivo) pasa a ser `app/(client)/profile/` (carpeta) con:
  - `_layout.tsx` (un `<Stack>` nuevo, igual que `parkings/_layout.tsx`)
  - `index.tsx` (el `ProfileView` actual)
  - `settings.tsx` (pantalla nueva)
- Mismo cambio en `app/(owner)/profile.tsx` → `app/(owner)/profile/`.
- El `Tabs.Screen name="profile"` en ambos `_layout.tsx` de nivel superior sigue apuntando a `profile/index` automáticamente (Expo Router lo resuelve solo).

**Código nuevo**
- Ícono de tuerca (`Ionicons name="settings-outline"`) en la esquina superior derecha de `ProfileView.tsx`, navega a `profile/settings`.
- `src/features/profile/SettingsView.tsx` (o reutilizar `ProfileView` con una sección nueva): agrupa "Mis vehículos" (Fase A), "Cerrar sesión" (hoy vive suelto al final de `ProfileView`, se puede mover acá para despejar la pantalla principal), y un placeholder para notificaciones push cuando se implemente la Fase 8 pendiente del plan original.

Esto es una sugerencia de contenido para Ajustes — si preferís mantener "Cerrar sesión" visible en la pantalla principal de Perfil, no hay problema, es un cambio de una línea.

**Verificación:** navegar Perfil → tuerca → Ajustes → volver, en cliente y propietario, confirmando que no arrastra estado viejo entre visitas (el motivo por el que existe la regla del Stack anidado).

---

## Fase E — Mapa con el trayecto dibujado (Google Directions API)

La más grande de las cinco, por eso va al final.

**Decisión de arquitectura a confirmar antes de arrancar:** para dibujar la ruta hace falta llamar a la Google Directions API, que es una API *paga más allá de una cuota gratuita* y distinta de la que ya usás para pintar el mapa (`Maps JavaScript API` / SDK nativo). Hay dos formas de integrarla:

- **Opción recomendada — Supabase Edge Function como proxy:** se crea una función `get-directions` que llama a Directions API con una key guardada como secreto de Supabase (nunca viaja al celular ni al navegador). Sigue el mismo criterio que ya usás para el resto de las operaciones sensibles (RPC `security definer` en vez de lógica en el cliente). *Contras:* es la primera vez que el proyecto usa Edge Functions, así que hace falta instalar el Supabase CLI, hacer login, linkear el proyecto y correr `supabase functions deploy` — un paso operativo nuevo que no usaste hasta ahora (las migraciones las corriste siempre a mano en el SQL Editor).
- **Alternativa más simple — llamar a Directions API directo desde la app:** con una API key nueva, restringida en Google Cloud Console por paquete Android / bundle iOS / referrer web (igual que ya restringís la key de mapa). Es menos código y no requiere CLI, pero la key queda visible en el tráfico de red de la app (mitigado, no eliminado, por las restricciones).

El plan de abajo asume la Opción recomendada; avisame si preferís la alternativa y ajusto los puntos marcados con *(cliente-directo)*.

**Google Cloud**
- Habilitar "Directions API" en el mismo proyecto de Google Cloud que ya usás.
- Generar una key nueva restringida a Directions API *(o reusar con cuidado si preferís la alternativa cliente-directo, restringiéndola por plataforma)*.

**Backend**
- `supabase/functions/get-directions/index.ts`: recibe `{ originLat, originLng, destLat, destLng }`, llama a Directions API, devuelve `{ polyline, distanceMeters, durationSeconds }`.
- Guardar la key como secreto: `supabase secrets set GOOGLE_DIRECTIONS_API_KEY=...` (no va en `.env` de la app).

**Código nuevo**
- `src/features/directions/api.ts`: `getDirections(origin, destination)` → `supabase.functions.invoke('get-directions', { body: {...} })`.
- Un decodificador de polyline chico, escrito a mano (~20 líneas, sin agregar dependencias nuevas al proyecto) en `src/features/directions/polyline.ts`.
- `src/features/directions/RouteMap.tsx` (nativo, con `react-native-maps` + su componente `Polyline`) y `RouteMap.web.tsx` (con `@react-google-maps/api` + su `Polyline`) — mismo patrón `.tsx`/`.web.tsx` que ya usás en `LocationPicker`.
- Nueva pantalla `app/(client)/search/parking/[id]/route.tsx` con su propio `_layout.tsx` (Stack anidado, mismo criterio que Fase D), que muestra el mapa a pantalla completa con la ruta, distancia y tiempo estimado.
- En `app/(client)/search/parking/[id].tsx`: botón "Cómo llegar" junto a "Reservar" que navega a esa pantalla.
- Opcional de bajo costo: además del mapa dibujado, dejar un botón secundario "Abrir en Google Maps" (deep link `https://www.google.com/maps/dir/?api=1&destination=lat,lng`) para quien prefiera navegación turn-by-turn real — no reemplaza el mapa en la app, es un extra sin costo de API.

**Verificación:** desde el detalle de un estacionamiento, tocar "Cómo llegar", confirmar permiso de ubicación, ver la ruta dibujada en nativo y en `--web`, y que distancia/tiempo mostrados sean razonables.

---

## Resumen de migraciones nuevas (a correr en orden, a mano, en el SQL Editor de Supabase)

| Archivo | Contenido |
|---|---|
| `0016_vehicles.sql` | Tabla `vehicles` + RLS + límite de 3 por usuario |
| `0017_bookings_vehicle_and_start.sql` | `vehicle_id` y `actual_start_at` en `bookings`, `create_booking` actualizada, nueva `start_booking` |
| `0018_message_notifications.sql` | `related_booking_id` en `notifications`, trigger `notify_new_message` |

La Fase E no agrega migración SQL (usa una Edge Function, no una tabla nueva), salvo que prefieras loguear las consultas de ruta — no es necesario para el MVP.

## Orden sugerido de implementación

A (vehículos) → B (selección de vehículo + inicio de reserva) → C (badge de mensajes) → D (ajustes) → E (mapa de ruta)

Las fases A-D no dependen de habilitar nada nuevo en Google Cloud ni de aprender el Supabase CLI, así que se pueden avanzar y verificar en el navegador enseguida. La Fase E queda al final para no bloquear el resto mientras se resuelve la key/Edge Function.
