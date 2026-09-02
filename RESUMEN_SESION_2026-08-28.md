# Resumen técnico — GarageGo, sesión 2026-08-28

> Documento de traspaso para continuar en una ventana de contexto nueva. Generado a partir de una sesión larga que cubrió: cierre de la Fase E (mapa/ruta), 11 correcciones de un documento de QA, una saga de depuración de login con Google, armado de un development build con EAS, y el arranque de una migración de diseño hacia una especificación Figma (Fases 1-7 de 8).

## 1. Contexto de arranque

La sesión continuó un traspaso de otra sesión (Cowork), documentado en `CONTEXTO_GARAGEGO_PARA_CLAUDE_CODE.md`. El proyecto ya tenía completas las fases 1-8 originales (auth, CRUD de estacionamientos, búsqueda, reservas, calificaciones, mensajería) y 4 de 5 funcionalidades nuevas (A-D). Quedaba pendiente la **Fase E**: mapa con ruta dibujada ("Cómo llegar").

---

## 2. Fase E — Ruta con mapa (OSRM)

**Decisión del usuario:** usar OSRM (servidor demo público, sin key) en vez de Google Directions, por pedido explícito de costo cero.

**Archivos creados:**
- `src/features/directions/types.ts` — tipos `LatLngPoint`, `DirectionsResult`
- `src/features/directions/api.ts` — `getDirections()` contra `router.project-osrm.org`
- `src/features/directions/RouteMap.tsx` / `.web.tsx` — mapa nativo (react-native-maps) y web (@react-google-maps/api)
- `app/(client)/search/parking/[id]/route.tsx` — pantalla de ruta a pantalla completa

**Reestructuración:** `search/parking/[id].tsx` (archivo plano) → carpeta `search/parking/[id]/` con `_layout.tsx` + `index.tsx` + `route.tsx`, siguiendo el patrón ya establecido en el proyecto (evita el bug de "pantallas duplicadas" documentado en el contexto).

**Extra:** `.claude/launch.json` tenía una ruta de otra máquina (`C:\Users\Daniel\...`); se corrigió a `npx expo start --web`.

---

## 3. Documento "Modificaciones a realizar" — 11 correcciones en 2 entregas

### Entrega 1 (cliente)

**Fase 1 — Ubicación real en "Cómo llegar".**
- `src/hooks/useCurrentLocation.ts`: agregado `accuracy: Location.Accuracy.High`.
- **Nuevo** `src/hooks/useCurrentLocation.web.ts`: usa `navigator.geolocation` directo (no expo-location) con `enableHighAccuracy` y `maximumAge: 0`, replicando el patrón ya usado en `LocationPicker.web.tsx`.
- `route.tsx`: botón "Actualizar ubicación", "Abrir en Google Maps" movido fuera del bloque de éxito.

**Fase 2 — Reglas de tiempo en reservas.**
- **Bug encontrado:** `create_booking` validaba `p_date < current_date` (solo el día, nunca la hora) → se podía reservar un horario ya pasado del día actual.
- **Bug encontrado:** comparación de fechas en UTC vs. hora local argentina causaba falsos rechazos de madrugada.
- **Bug encontrado:** `complete_booking` cobraba sobretiempo con un desfasaje de ~3 horas por el mismo problema de zona horaria.
- Fix: `src/features/booking/availability.ts` recorta las ventanas de hoy contra la hora actual; las 5 RPC de reserva se reescribieron usando `now() at time zone 'America/Argentina/Buenos_Aires'`.
- Regla nueva: no se puede cancelar una reserva `confirmed` con menos de 1 hora de antelación (las `pending` sí, siempre). `ConfirmDialog.tsx` ganó la prop `hideCancel` para mostrar un cartel informativo de un solo botón.
- **Migración:** `supabase/migrations/0020_booking_time_rules.sql`.

**Fase 3 — Notificaciones: borrar y navegar.**
- **Bug encontrado:** la tabla `notifications` no tenía policy RLS de `DELETE` → un borrado fallaba en silencio (0 filas afectadas, sin error visible).
- `NotificationsView.tsx` reescrito: borrado individual y masivo, navegación al tocar (antes solo marcaba leído y con early-return si ya estaba leída).
- **Migración:** `supabase/migrations/0021_notifications_delete.sql`.

**Fase 4 — Chat unificado por estacionamiento.**
- **Bug de fondo:** `messages.booking_id` era la única clave de agrupación → una conversación por cada reserva, duplicando chats entre las mismas dos personas.
- Resuelto **sin tocar el esquema**: agrupación en la capa de datos (`resolveThread`, `threadKeyOf`) por `(parking_lot_id, peer_id)`. `ChatView.tsx` reescrito con hora por mensaje y separador de día.
- **Bug latente encontrado:** al desactivar un estacionamiento, la policy RLS de `parking_lots` ocultaba la fila y el chat se perdía en silencio.
- **Migración:** `supabase/migrations/0022_chat_thread_access.sql` (función `has_booking_in_lot` + policy).
- Rutas `[bookingId].tsx` → `[lotId].tsx` en `app/(client)/messages/` y `app/(owner)/messages/`.

**Extra:** `src/features/vehicle/VehiclesScreen.tsx` (código muerto, llamaba `createVehicle` con firma vieja) — corregido por decisión explícita del usuario.

### Entrega 2 (propietario)

- **Fase 5a:** máximo 3 fotos por estacionamiento — trigger SQL + límite en `ImageManager.tsx`. **Migración `0023_parking_limits.sql`.**
- **Fase 5b:** `AvailabilityEditor.tsx` — selección múltiple de día, validación de solapamiento, y nuevo componente `TimeSelect.tsx` (reemplaza inputs de texto libre para la hora).
- **Fase 5c:** `ConfirmDialog` en el botón de desactivar publicación (antes ejecutaba sin preguntar).

---

## 4. Saga de autenticación con Google (la parte más larga)

**Síntoma:** login con Google desde Expo Go → error `localhost:3000 refused to connect`.

**Diagnóstico, paso a paso:**
1. `localhost:3000` es el *Site URL* por defecto de Supabase — el fallback cuando el `redirect_to` no es válido.
2. Intentos con wildcards en Redirect URLs (`exp://*/**`, luego `exp://**`) no funcionaron.
3. Con logs temporales en `signInWithGoogle()` se confirmó el valor real: `exp://192.168.0.53:8081/--/`.
4. **Causa raíz encontrada:** [supabase/auth#2039](https://github.com/supabase/auth/issues/2039) — GoTrue rechaza cualquier redirect cuyo *host* sea una IP numérica, **antes** de mirar la lista de Redirect URLs. Ningún wildcard podía funcionar.
5. Intento de modo túnel (`expo start --tunnel`) falló por un problema de instalación de `@expo/ngrok`.
6. Intento de hostname vía mDNS (`REACT_NATIVE_PACKAGER_HOSTNAME=DESKTOP-K45BDPD.local`) falló: el Android del usuario no resuelve `.local`.
7. **Solución definitiva:** development build con EAS, que usa el scheme propio `garagego://` (sin IP).

**Trabajo de infraestructura para el build:**
- `npx expo install expo-dev-client` + plugin en `app.json`.
- `eas.json` nuevo (perfil `development`, `buildType: apk`).
- `git init` + primer commit (`23d3ede`) — necesario porque EAS empaqueta desde git, no desde el disco.
- Variables de entorno de Supabase cargadas en el proyecto EAS (el `.env` local no viaja al build).
- **Bug de versiones encontrado:** `react-native-worklets` resuelto fuera del rango que esperaba `expo-modules-core`, causando un error de compilación C++ (`no member named 'executeSync'`). Fix: `npx expo install --fix` (commit `a7e9bc9`) + fijar versiones exactas `react-native-reanimated@4.5.1` / `react-native-worklets@0.10.1` (commit `6322149`).
- Build exitoso: APK instalado, login con Google confirmado funcionando.
- Commit `fa30073` (hecho por el usuario) limpió los `console.log` de debug en `src/features/auth/api.ts`.

**Cuenta EAS:** `garagego` (brunobellot22@gmail.com). Proyecto `@garagego/garagego`. Build de referencia: `https://expo.dev/accounts/garagego/projects/garagego/builds/c8f3750f-19fa-4b71-8506-2cc452cffc40`.

---

## 5. Conexión a GitHub

Se instaló GitHub CLI (`winget install GitHub.cli`) y se guió el login por navegador (`gh auth login`). El usuario resolvió la conexión a su repo de equipo por su cuenta ("ya lo solucioné") — **no hay remoto configurado en este checkout** (`git remote -v` vacío), así que ese paso quedó del lado del usuario o pendiente de verificar.

---

## 6. Migración de diseño Figma — en curso, Fases 1-7 de 8

**Restricciones no negociables del documento de especificación** (`documento esoecificacion front.docx`, subido por el usuario): no reconstruir desde cero, no romper lógica de negocio, Figma con contenido mockup a ignorar (nombres, precios, HRK), priorizar reutilización sobre creación.

**Diagnóstico previo** (sin tocar código): artifact publicado comparando código actual vs. especificación — 65 archivos ya usan un tema centralizado, pero faltaban 3 de 5 grupos de tokens y cero sombras en toda la app.

**Decisiones de producto tomadas:**
- Mantener los **nombres de tokens actuales** (convención Material: `onSurface`, `outline`) en vez de renombrar a los del documento (`textPrimary`, `border`) — evita tocar 65 archivos sin ganancia funcional. La equivalencia queda documentada en comentarios de `colors.ts`.
- **Modo oscuro fuera de alcance por ahora**: la especificación solo define paleta clara. `useTheme()` devuelve siempre `lightColors`; la paleta oscura se mantiene en el código (ya migrada a azul) para reactivar sin rehacer trabajo.

**Fase 1 — Tokens:** `src/theme/spacing.ts` (escala 4-8-12-16-24-32), `src/theme/radius.ts` (8/12/9999), `src/theme/shadows.ts` (multiplataforma: `elevation` en Android, `boxShadow` en web, `shadow*` en iOS — se detectó que `react-native-web` 0.21 deprecó las props `shadow*`).

**Fase 2 — Paleta azul:** `colors.ts` migrado completo a la paleta de la sección 4.1 del documento (`primary: #0058BC`, etc.).

**Fase 3 — Tipografía Inter:**
- `npx expo install expo-font @expo-google-fonts/inter`.
- `typography.ts` reescrito: cada estilo nombra la familia exacta (`Inter_400Regular`/`600SemiBold`/`700Bold`) porque `fontWeight` no funciona con fuentes custom.
- `app/_layout.tsx`: `useFonts()` con fallback seguro (si falla, la app arranca igual con la fuente del sistema).
- **Bug encontrado y corregido:** `Logo.tsx` tenía `fontWeight: '800'` hardcodeado, que habría quedado en la fuente del sistema mientras el resto usaba Inter.
- Verificado en navegador: 3 variantes cargadas y en uso, sin desbordes de texto.

**Fase 4 — Componentes base:**
- `Button.tsx`: altura 48→56, radio 24→12 (antes era una píldora, que el documento descarta explícitamente), props nuevas `icon` y `fullWidth`.
- `TextField.tsx`: radio 8→12, agregado estado de foco (antes solo tenía error).
- `BackHeader.tsx` **eliminado** → **nuevo** `BackButton.tsx` (48×48, solo ícono, con `accessibilityLabel`), renombrado en 16 archivos.
- **Nuevos:** `IconButton.tsx` (reemplaza el patrón `Pressable+Ionicons` repetido 61 veces), `EmptyState.tsx`.
- Verificado en navegador con valores computados reales (56px/12px en botón, foco a `#0058BC`/2px).

**Fase 5 — Tarjetas de dominio:**
- **Nuevo** `Card.tsx`: contenedor compartido con sombra + recorte en capas separadas (necesario para que la sombra no se corte en iOS con `overflow: hidden`).
- Migradas: `ParkingCard`, `BookingCard`, `ConversationListItem`, `NotificationListItem`, `VehicleListItem`.
- **Nuevo** `PhotoUploader.tsx`: unifica `ImageManager.tsx` y `VehicleImageManager.tsx`, que eran casi clones (mismo patrón, distinto bucket/API).

**Fase 6 — Pantallas del cliente:**
- **Cambio de comportamiento:** `app/(client)/index.tsx` (mapa nativo) ahora muestra una tarjeta de vista previa al tocar un marcador (`ParkingPreviewSheet.tsx`, nuevo) en vez de navegar directo al detalle. Se descubrió que la versión web (`index.web.tsx`) ya tenía esta tarjeta y las dos plataformas habían divergido; ahora comparten el mismo componente.
- `EmptyState` aplicado en Mis reservas, Mensajes, resultados de búsqueda, Mis vehículos, Notificaciones — 3 de ellas ganaron una acción (antes no tenían salida desde el estado vacío).

**Fase 7 — Pantallas del propietario:**
- `EmptyState` en Mis estacionamientos, Reservas recibidas, Mis vehículos.
- **Nuevo** `FormSection.tsx`: el formulario de publicación (`ParkingForm.tsx`) pasó de ser un bloque plano a 5 secciones con encabezado (Fotos, Datos del lugar, Ubicación, Precio, Disponibilidad).
- Limpieza de imports/estilos huérfanos tras los reemplazos.

**Verificación en cada fase:** `npx tsc --noEmit` (siempre limpio) + navegador (bundle sin errores de consola, valores CSS computados, ausencia de desbordes de texto/scroll horizontal). **Limitación constante y reconocida:** no se pudo verificar ninguna pantalla autenticada (login, dashboard, reservas) por no tener credenciales — todo lo de Fases 5-7 está verificado por compilación, no visualmente.

---

## 7. Estado del repositorio al cierre de esta sesión

```
Rama actual: mapa/nuevo
Commits: 23d3ede → a7e9bc9 → 6322149 → fa30073
Remoto: ninguno configurado en este checkout
```

Todos los cambios de las **Fases 1-7 de diseño están sin commitear** (modificados o nuevos, ver `git status`). Antes de un próximo build de EAS hay que commitearlos — recordar que EAS empaquea desde git, no desde el disco (ya costó una vuelta extra de build por esto).

Migraciones SQL en el repo, **corridas por el usuario a mano en Supabase, orden**: `0001` … `0019` (confirmadas en sesiones previas) → `0020_booking_time_rules.sql` → `0021_notifications_delete.sql` → `0022_chat_thread_access.sql` → `0023_parking_limits.sql`.

---

## 8. Siguiente paso exacto

Dos cosas quedaron sobre la mesa, sin decisión tomada:

**A) Fase 8 — QA visual (la última fase, y la que no se puede hacer sin el usuario).** Requiere comparar cada pantalla contra las imágenes reales del Figma. Se le explicó al usuario cómo exportarlas (Figma → seleccionar frame → Export → PNG 2x, nombrados por pantalla, en tandas por flujo) porque no hay conector de Figma disponible en la cuenta y el servidor MCP oficial de Figma requiere plan pago (Dev/Full seat en Professional/Organization/Enterprise) + app de escritorio. **Quedó esperando que el usuario mande las imágenes**, empezando idealmente por el flujo de reserva.

**B) Verificación real en dispositivo, todavía no hecha.** Van 7 fases de cambios visuales sin que el usuario haya abierto la app corrida ni una vez. Se le insistió dos veces (fin de Fase 6 y Fase 7) en que corra `npx expo start` y mire, antes de seguir acumulando cambios no verificados. **Esto sigue pendiente de respuesta.**

**Además, sin resolver:**
- **Formato de moneda:** la etiqueta del precio dice "USD" pero `formatCurrency()` (duplicado, dentro de `ProfileView.tsx`) usa locale `es-ES`. Se preguntó qué moneda usa la app realmente; sin respuesta todavía.
- **API key de Google Maps para Android** (`REPLACE_WITH_ANDROID_GOOGLE_MAPS_KEY` en `app.json`, placeholder sin completar) — sin ella el mapa no carga en el celular, lo que bloquea poder probar "Cómo llegar" con GPS real. Pasos acordados: sacar el SHA-1 del keystore desde el panel de EAS, habilitar "Maps SDK for Android" en Google Cloud, crear la key restringida por paquete (`com.garagego.app`) + esa huella, ponerla en `app.json`, y lanzar un build nuevo (la key se embebe en la parte nativa, no se actualiza en caliente).
- **Cuenta de vehículo muerto arreglado:** `VehiclesScreen.tsx` fue corregido pero sigue sin estar importado por ninguna ruta real (las pantallas de vehículos tienen su propia implementación en `app/(client|owner)/vehicles/index.tsx`).

## 9. Memoria persistente ya guardada (independiente de este archivo)

En `~/.claude/projects/.../memory/`:
- `garagego-development-build.md` — por qué el proyecto se prueba con development build y no con Expo Go (bug de IP en GoTrue).
- `garagego-pendiente-google-maps-key.md` — el pendiente de la API key de Maps, con los pasos acordados.

Estos dos archivos persisten en la máquina y se recuerdan automáticamente en sesiones futuras de Claude Code en este proyecto; este `.md` es el complemento pensado para pasar de una ventana de contexto a otra dentro de la misma sesión de trabajo activa.
