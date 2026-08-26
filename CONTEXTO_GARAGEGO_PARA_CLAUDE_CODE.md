# Contexto de traspaso — GarageGo (de Cowork a Claude Code)

Este documento resume todo lo trabajado en una sesión anterior (Cowork) para que puedas continuar sin perder contexto. Léelo completo antes de tocar código.

## Qué es el proyecto

GarageGo es una app móvil (MVP) que conecta conductores buscando estacionamiento con propietarios que ofrecen espacios.

**Stack obligatorio:** React Native + Expo + Expo Router + TypeScript + Supabase (Auth/Postgres/Storage/RLS/Edge Functions).
**Prohibido:** Firebase, Google Antigravity, Google Stitch.

**Ruta del proyecto:** `C:\Users\Usuario\Desktop\GARAGEGO-2027-CLAUDE-feature-reservas\GARAGEGO-2027-CLAUDE-feature-reservas` (ojo: hay una carpeta contenedora con el mismo nombre; el proyecto real —donde están `package.json`, `app/`, `src/`, `supabase/`— está un nivel adentro).

No hay `node_modules` instalado ni archivo `.env` creado todavía (solo existe `.env.example`). Hace falta `npm install` y crear `.env` con las credenciales reales de Supabase (el usuario ya tiene la Project URL y la Publishable key — el nombre nuevo de Supabase para la anon key — de su proyecto).

## Reglas clave del proyecto (no negociables)

- Antes de implementar algo nuevo, inspeccionar el código existente y seguir sus patrones — no duplicar, separar UI/lógica/datos/tipos, RLS siempre activo.
- Las migraciones SQL van en `supabase/migrations/` y **el usuario las corre a mano** en el SQL Editor de Supabase (no hay conexión directa a la base, solo se cuenta con la Project URL y la anon/publishable key).
- Verificar cada cambio con `tsc --noEmit` + `npx expo start --web` antes de dar una fase por cerrada. El usuario es quien corre esto — pedile que lo haga y te pase el resultado.
- La `service_role` key **nunca** se usa en el proyecto (se expuso una vez sin querer, se pidió regenerar).
- El wallet es interno/placeholder (no hay pasarela de pago real todavía).
- Cada estacionamiento tiene capacidad = 1. Disponibilidad = horario recurrente semanal + excepciones puntuales, buffer de 15 min entre reservas, overtime a 1.5x con 5 min de gracia.
- Notificaciones vía Expo Push (no Firebase); las push reales todavía no están implementadas (hay un placeholder visual que lo indica).
- Mensajería: chat 1:1 por reserva vía Supabase Realtime, no hay bandeja general.
- Funciones sensibles (saldo, reservas, top-up) son siempre RPC de Postgres `security definer`, nunca updates directos desde el cliente.

## Patrones establecidos en el código (seguirlos, no inventar otros)

**Pantallas de flujo propio (crear/editar/listar) van en su propio Stack anidado dentro del grupo de Tabs — nunca como `Tabs.Screen` oculto (`href: null`) apuntando a un archivo plano.** Este bug (arrastrar estado viejo entre visitas) se corrigió más de una vez. El patrón correcto es: una carpeta con `_layout.tsx` (un `<Stack screenOptions={{headerShown:false}} />`) + `index.tsx` (lista o vista principal) + pantallas adicionales (`create.tsx`, `[id]/edit.tsx`, `settings.tsx`, etc.), con el `Tabs.Screen` del layout de nivel superior apuntando a esa carpeta (Expo Router resuelve solo a `carpeta/index`). Así están hechos: `search`, `parkings`, `vehicles`, `profile`.

**⚠️ Trampa recurrente:** el entorno de la sesión anterior (Cowork) trabajaba sobre la compu del usuario a través de un bridge que puede escribir archivos pero **no puede borrarlos**. Cada vez que un archivo plano (ej. `profile.tsx`) se reemplazó por una carpeta con el mismo nombre (ej. `profile/`), el archivo viejo quedó huérfano y el usuario tuvo que borrarlo a mano — si no, Expo Router tira `"A navigator cannot contain multiple 'Screen' components with the same name"`. Vos SÍ podés borrar archivos directamente, así que si heredás algún archivo plano obsoleto en el repo (poco probable a esta altura, pero revisar si aparece un error de pantallas duplicadas), podés borrarlo vos mismo sin pedirle nada al usuario.

**Migraciones idempotentes:** desde la migración `0016` en adelante, todo el SQL nuevo se escribe con `IF NOT EXISTS`, `DROP POLICY/TRIGGER IF EXISTS` + `CREATE`, `CREATE OR REPLACE`, porque el SQL Editor de Supabase corta la ejecución en el primer error y una corrida a medias deja objetos sin crear sin que el usuario lo note. Seguí este mismo criterio en migraciones nuevas. Excepción importante: si una función RPC cambia de firma (distinta cantidad/tipo de parámetros), `create or replace function` NO la reemplaza — hay que `drop function if exists nombre(tipos_viejos);` antes.

**RLS al cruzar datos entre dueños distintos:** cuando una pantalla necesita mostrar datos de una tabla que pertenece a OTRO usuario (ej. el propietario viendo la patente de un vehículo del cliente), la policy RLS por defecto ("select solo lo propio") bloquea el join **silenciosamente** — no tira error, devuelve 0 filas, y el dato sale `null`/vacío en la UI sin ningún mensaje. Antes de asumir que "no se ve el dato X" es un bug de frontend, revisar si hace falta una policy de RLS adicional para ese cruce puntual (acotada a la relación real, no acceso total a la tabla). Ya pasó con `vehicles` (resuelto en la migración `0018`, agregando una policy que solo deja ver un vehículo si está asociado a una reserva del estacionamiento del que consulta).

**Errores genéricos ocultan la causa real:** varios `catch` del código original mostraban un mensaje fijo (ej. "No se pudo enviar el mensaje") sin exponer el error real de Supabase, lo que complicó bastante el diagnóstico más de una vez. Se fue corrigiendo para que el catch muestre `error.message` cuando existe (ver `VehicleImageManager.tsx`, `ChatView.tsx` como ejemplos). Aplicá el mismo criterio en código nuevo: nunca tragarse el mensaje de error real sin mostrarlo en algún lado (banner, log) cuando estás developeando/depurando.

## Estado de las fases originales (1-8): completas

Setup Expo Router, Auth (email + Google OAuth vía Supabase), perfil/rol/wallet, módulo Propietario (CRUD + fotos + disponibilidad + mapa), búsqueda/lista/mapa Cliente, reservas completas (crear/confirmar/finalizar/cancelar), calificaciones (1-5 estrellas + trigger de promedio), dashboard/estadísticas + mensajería 1:1 por reserva.

Pendiente del plan original (no es urgente): notificaciones push reales, pulido de accesibilidad, datos de prueba masivos (20 estacionamientos ficticios).

## Migraciones SQL — todas confirmadas corridas y funcionando por el usuario

Orden: `0001_init` → `0002_google_oauth_metadata` → `0003_ensure_profile_function` → `0004_fix_name_split_and_backfill` → `0005_fix_avatar_from_identities` → `0006_parking_images_storage` → `0007_search_parking_lots` → `0008_booking_functions` → `0009_wallet_topup` → `0010_credit_owner_on_complete` → `0011_rating_average_trigger` → `0012_get_booked_intervals` → `0013_messages` → `0014_notifications_realtime` → `0015_booking_buffer_and_overtime` → `0016_vehicles` → `0017_bookings_vehicle_and_start` → `0018_vehicles_visible_to_booking_owner` → `0019_message_notifications`.

**La próxima migración a crear (Fase E, ver abajo) debería numerarse `0020`.**

## Trabajo en curso: rediseño visual

Paleta cambiada de azul/violeta a amarillo pastel `#FFEE8C` + token `accent` (`#8A6D00` claro / `#F0DE72` oscuro) para texto/íconos sobre fondos claros, inspirado en un Figma llamado "CarPark". Ya aplicado: `theme/colors.ts`, `Logo.tsx` nuevo, ~15 usos de `accent` en componentes. **Falta:** adaptar estructura/layout (tarjetas con sombra, bottom sheets de confirmación, estilo de búsqueda) al estilo de los mockups de Figma. Esto quedó en pausa mientras se hacían las 5 fases nuevas (ver abajo) — retomarlo si el usuario lo pide.

## Las 5 funcionalidades nuevas (plan entregado en `PLAN_NUEVAS_FUNCIONALIDADES.md`, en la raíz del repo)

### Fase A — Vehículos del usuario (máx. 3) — ✅ COMPLETA Y CONFIRMADA FUNCIONANDO
Tabla `vehicles` + `vehicle_images` + bucket Storage `vehicle-images` (migración `0016`). Incluye: fotos por vehículo, validación de patente en formato Argentino (viejo `LLL###` y Mercosur `LL###LL`), edición de vehículos, lista con foto de portada. Pantallas: `app/(client|owner)/vehicles/{_layout.tsx,index.tsx,create.tsx,[id]/edit.tsx}`.

### Fase B — Selección de vehículo al reservar + botón "Iniciar reserva" — ✅ COMPLETA Y CONFIRMADA FUNCIONANDO
Migración `0017`: agrega `vehicle_id` y `actual_start_at` a `bookings`; `create_booking` ahora pide `p_vehicle_id` (valida que sea del cliente); nueva RPC `start_booking(p_booking_id)` que el cliente usa al llegar (marca `actual_start_at = now()`, notifica al propietario). El propietario ve la patente del cliente en "Reservas recibidas" gracias a la policy agregada en `0018` (ver lección de RLS arriba).

### Fase C — Notificaciones de mensajes (badge sin abrir el chat) — ✅ COMPLETA Y CONFIRMADA FUNCIONANDO
Migración `0019`: agrega `related_booking_id` a `notifications`; trigger `notify_new_message` (AFTER INSERT en `messages`) crea automáticamente una notificación `type='new_message'` para la otra parte de la reserva. En la app: badge numérico en la tab "Mensajes" (`tabBarBadge`), punto de color en la conversación con mensajes sin leer, se marca como leído solo esa conversación al entrar al chat (no todas). Hook: `useUnreadMessagesCount`.

### Fase D — Tuerca de ajustes en Perfil — ✅ COMPLETA Y CONFIRMADA FUNCIONANDO
`app/(client)/profile.tsx` y `app/(owner)/profile.tsx` (archivos planos) pasaron a `profile/` (carpeta) con `_layout.tsx` + `index.tsx` (`ProfileView`) + `settings.tsx` (`SettingsView` nueva). El ícono de tuerca en `ProfileView` navega a Ajustes, donde ahora viven "Mis vehículos", un placeholder de notificaciones push, y "Cerrar sesión" (antes estaban sueltos en la pantalla principal de Perfil). No agregó migración SQL, solo reestructuración de código. El usuario confirmó que anda bien y ya borró los archivos planos viejos.

### Fase E — Mapa con la ruta dibujada — 🔴 EN DISCUSIÓN, NO EMPEZADA TODAVÍA (esto es lo próximo)

**Contexto importante:** el mapa que YA existe en la app (pantalla Inicio, y el selector de ubicación al crear un estacionamiento) usa Google Maps SOLO para dibujar el mapa/marcadores — no calcula rutas. Nativo: `react-native-maps` con `PROVIDER_GOOGLE` (keys en `app.json`, todavía como placeholder `REPLACE_WITH_IOS_GOOGLE_MAPS_KEY` / `REPLACE_WITH_ANDROID_GOOGLE_MAPS_KEY`). Web: `@react-google-maps/api` con `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY`. Archivos clave del patrón `.tsx` (nativo) / `.web.tsx` (web) a replicar: `src/features/parking/LocationPicker.tsx` y `LocationPicker.web.tsx`.

**El usuario pidió explícitamente NO pagar nada** para la función de "cómo llegar" (ruta dibujada + distancia/tiempo estimado). El plan original (`PLAN_NUEVAS_FUNCIONALIDADES.md`) proponía Google Directions API vía una Supabase Edge Function — **esa parte del plan quedó descartada** por el pedido de costo cero. Se le presentaron dos alternativas 100% gratuitas al usuario, y **quedó pendiente que elija una** (última pregunta sin responder al momento de este traspaso):

1. **OSRM** (servidor demo público `router.project-osrm.org`): sin key, sin registro, gratis para siempre. Contras confirmados por la documentación oficial del proyecto: es "mejor esfuerzo", sin garantía de actividad, pueden cortar el acceso sin previo aviso, no está pensado para producción — apto para desarrollo/pruebas. Si se usa en la app hay que dar atribución visible a OSRM/OpenStreetMap. Como no requiere ninguna key, **no hace falta Edge Function ni Supabase CLI** — se puede llamar directo desde el cliente.
2. **OpenRouteService** (`openrouteservice.org`, mantenido por HeiGIT): también gratis, pero pide crear una cuenta (con email, sin tarjeta) para generar una key personal. Cuota diaria generosa para una app chica (miles de consultas gratis por día — confirmar el número exacto en su panel al momento de crear la cuenta, cambió con el tiempo). Pensado para uso real, más estable que el demo de OSRM. Recomendado por la sesión anterior mientras se esperaba la decisión del usuario.

**Antes de escribir código de la Fase E, preguntale al usuario cuál de las dos eligió** (o si prefiere seguir con el plan original de Google Directions + Edge Function, aunque explícitamente pidió evitar costos). No asumas la respuesta.

**Una vez que el usuario elija, el plan de implementación (ajustado del original, sin Google Directions/Edge Function si elige OSRM u OpenRouteService) es:**
- Si elige **OpenRouteService**: guardar la key en `.env` como `EXPO_PUBLIC_OPENROUTESERVICE_API_KEY` y llamar directo desde el cliente (no hace falta esconderla en una Edge Function porque la cuota gratuita no es sensible de la misma manera que una key de Google que factura — igual se puede restringir por dominio si el usuario quiere extremar precauciones). Si elige **OSRM**, ni siquiera hace falta variable de entorno.
- `src/features/directions/api.ts`: función `getDirections(origin, destination)` que llama al servicio elegido y devuelve `{ coordinates, distanceMeters, durationSeconds }`. Si se pide `geometries=geojson` (ambos servicios lo soportan), la respuesta ya viene como array de coordenadas `[lng, lat]` — **no hace falta escribir un decodificador de polyline** (esto simplifica el plan original, que asumía Google Directions con polyline codificado).
- `src/features/directions/RouteMap.tsx` (nativo, con `react-native-maps` + su componente `Polyline`) y `RouteMap.web.tsx` (con `@react-google-maps/api` + su `Polyline`) — mismo patrón `.tsx`/`.web.tsx` que `LocationPicker`.
- Nueva pantalla `app/(client)/search/parking/[id]/route.tsx` con su propio `_layout.tsx` (Stack anidado, mismo criterio que las demás fases) — mapa a pantalla completa con la ruta, distancia y tiempo estimado.
- En `app/(client)/search/parking/[id].tsx`: botón "Cómo llegar" junto a "Reservar" que navega a esa pantalla.
- Opcional de costo cero: botón secundario "Abrir en Google Maps" (deep link `https://www.google.com/maps/dir/?api=1&destination=lat,lng`) para navegación turn-by-turn real fuera de la app.
- **Verificación:** desde el detalle de un estacionamiento, tocar "Cómo llegar", confirmar permiso de ubicación, ver la ruta dibujada tanto en nativo como en `--web`, y que distancia/tiempo mostrados sean razonables.
- Esta fase NO necesita ninguna migración SQL nueva (a menos que se decida loguear las consultas de ruta, que no es necesario para el MVP).

## Cómo trabajar con este usuario (estilo de la sesión anterior)

- El usuario prueba todo él mismo en su compu (`npx tsc --noEmit`, `npx expo start --web`) — no esperes que vos puedas correr la app.
- Reporta errores casi siempre con capturas de pantalla o pegando el texto del error. Pedile el texto exacto o que revise la consola del navegador (F12) cuando un mensaje de error en la app es genérico.
- Es una relación de trabajo iterativa fase por fase: se entrega el código de una fase, el usuario la prueba, reporta bugs puntuales, se corrigen, y recién ahí se pasa a la siguiente. No conviene adelantarse a implementar fases que no pidió.
- Usa "che"/"vos" en tono relajado (español rioplatense/argentino) — el usuario mismo escribe así.
