# GarageGo — Estado y pendientes (2026-09-02)

Documento de traspaso para retomar en otra conversación. Cubre el estado del rediseño
Figma (Fase 8) y todo lo que quedó pendiente.

---

## 1. Estado del repositorio

- **Rama actual:** `rediseno/figma` (branch de `mapa/nuevo` @ `fa30073`).
  - Se usó `rediseno` sin `ñ` a propósito (evitar problemas de encoding/CI). Para renombrar:
    `git branch -m rediseño/figma`.
- **Sin remoto configurado** (`git remote -v` vacío). Los commits son locales. Antes de
  cualquier build de EAS hay que commitear — EAS empaqueta desde git, no desde el disco.
- **`mapa/nuevo` quedó intacta** en `fa30073` ("implemento mapa y chat real").

### Commits del rediseño (rama `rediseno/figma`)

```
62096b0  docs: resumen técnico de la sesión 2026-08-28
b6776e5  rediseño Figma: pantallas del propietario
8e9b042  rediseño Figma: pantallas de autenticación y del cliente
d83fb91  rediseño Figma: tokens de diseño y componentes compartidos
fa30073  implemento mapa y chat real   ← base (mapa/nuevo)
```

Total del rediseño: 80 archivos, +3066 / −1141. `npx tsc --noEmit` limpio en HEAD.

- **`.claude/settings.local.json`** quedó sin commitear a propósito (permisos locales, no del
  proyecto). Sigue como cambio en el working tree.

---

## 2. Qué está hecho (Fase 8 rediseño)

Migración completa a la especificación Figma **salvo** pantallas de sesión activa y pago:

- **Tokens:** `src/theme/` — spacing (4-8-12-16-24-32), radius (8/12/16/24/pill), shadows
  multiplataforma, paleta **lima `#BDD655`** (reemplazó la azul), tipografía **Inter**
  (expo-font).
- **Componentes nuevos:** `ScreenHeader`, `AuthHeading`, `Card`, `EmptyState`, `IconButton`,
  `FormSection`, `PhotoUploader`, `PriceStepper`, `BackButton` (reemplazó `BackHeader`),
  `ParkingListingWizard`. (`StatCard` eliminado).
- **Auth:** login / registro / recuperar / verificar / reset con `AuthHeading` (logo real +
  título centrado en mayúsculas). Se **mantuvo email** (no "usuario") y el flujo de
  recuperación **por link** (no el OTP de 4 dígitos del Figma). Google movido arriba en registro.
- **Cliente:** home con logo (sin saludo), buscador píldora, mapa redondeado; hoja "Reserva tu
  lugar" anclada abajo; Mis Reservas por secciones (`SectionList`: sesión activa / lugares
  reservados / pendientes / completadas / canceladas); pantallas de búsqueda con `ScreenHeader`.
- **Propietario:** dashboard (tarjeta de saldo + "Retiro de fondos" deshabilitado + 3 tiles +
  calificación + feed "Pagos recientes"); Mis Publicaciones con filtro Todas/Activas/Pausadas +
  badge ACTIVA/PAUSADA; **asistente de 3 pasos** (`ParkingListingWizard`) compartido entre
  crear y editar (datos → disponibilidad → fotos; el lote se crea inactivo en el paso 1 y se
  activa al terminar); Reservas Recibidas por secciones (pendientes / en curso / finalizadas /
  canceladas).
- **Perfil:** `ProfileView` ramificado por rol — propietario ve versión pelada (nombre + switch
  + cerrar sesión), cliente ve completa (saldo + vehículos + recarga).
- **Moneda:** `src/lib/money.ts` centraliza el formato en **pesos argentinos** (`es-AR` / `ARS`).
  Reemplazó todas las copias de `formatCurrency` (es-ES/USD) y los `$${x.toFixed(2)}` a mano.
  Presets de recarga de prueba: 1000 / 3000 / 5000 (el RPC `topup_wallet` topea en 10.000).
- **Logo:** `assets/logo.png` (PNG con fondo transparente, 350×120). `Logo.tsx` usa la imagen
  real en vez de la aproximación en texto.

**Limitación de verificación:** nada de lo autenticado se verificó sistemáticamente contra el
Figma. Todo está verificado por `tsc` + bundle. El usuario fue mirando en su dispositivo y
confirmando por partes, pero no hay un pase pantalla por pantalla.

---

## 3. PENDIENTE — trabajo grande

### 3.1 Pantallas 4-6 del cliente + flujo de pago  ⚠️ EN DEBATE

El usuario quiere el flujo del Figma: **confirmar reserva → pantalla de pagos → validar pago →
(error | iniciar viaje) → progreso → finalizar → reserva finalizada.**

Choca con el modelo actual. Hay un **documento de decisión** publicado como artifact con las 14
cuestiones abiertas (Q1–Q14):

> **https://claude.ai/code/artifact/667b1654-853c-4762-ad16-2a60067b3b0d**
> (título: "Flujo de pago y sesión activa")

**No escribir código hasta acordar Q1, Q2 y Q4.** El usuario lo iba a debatir con su equipo.

Resumen de los puntos clave (el detalle completo está en el artifact):

- **Hoy `create_booking` es atómico:** valida + debita billetera + crea reserva `pending`. No
  hay pantalla de pago; el "pago" es el débito. No hay tarjetas ni pasarela.
- **Q1 (el más importante):** hoy el propietario debe aprobar (`pending`→`confirmed`) antes de
  que el cliente pueda `start_booking`. El flujo del Figma saltea eso. Recomendación: quitar la
  aprobación (pago = confirmada); el owner conserva `cancel_booking` sin límite horario.
- **Q2:** tarjetas no existen. Recomendación: solo billetera para el MVP; sección de tarjetas
  "Próximamente".
- **Q4:** recomendación: no separar creación y pago; la pantalla de método de pago va antes de
  `create_booking`, que no cambia.
- **Q7:** `start_booking` no valida ventana horaria — agregarla.
- **Q9:** solo el owner puede `complete_booking` hoy; el conductor necesita poder finalizar su
  sesión (pantalla 5).
- **Q10:** ver §4.1 (bug del payout).
- **Q11/Q12/Q13:** Q13 (moneda) ya resuelto (pesos). Q11 (comprobante descargable) y Q12
  ("correo con factura") → cambios menores de texto/alcance.

**Plan propuesto** (si se toman las recomendaciones):
- Fase 8.4 — pantallas de pago (frontend, sin cambios de RPC).
- Fase 8.5 — reserva activa (pantallas 4-6) + migración `0024` (`start_booking` con ventana
  horaria; `complete_booking` llamable por el cliente **y arreglo del payout Q10**;
  opcional: auto-cierre de reservas no finalizadas).
- Fase 8.6 — limpieza (notificaciones nuevas, texto del "correo").

### 3.2 Retiro de fondos del propietario

El dashboard muestra el botón "Retiro de fondos" **deshabilitado ("Próximamente")**.
Construirlo real requiere: RPC de payout + pantalla + método de cobro (¿CBU/alias?) + **depende
de arreglar el bug Q10 primero** (hoy la billetera del propietario nunca se acredita, así que no
hay nada que retirar).

---

## 4. PENDIENTE — bugs preexistentes encontrados

No los introdujo el rediseño — están en `main` desde antes. Se listan porque el trabajo de
pagos toca exactamente este código.

### 4.1 CRÍTICO — el propietario nunca cobra

En `supabase/migrations/`, la RPC `complete_booking`:
- `0010_credit_owner_on_complete.sql` acreditaba el importe al propietario (`wallet_transactions`
  tipo `earning`).
- `0015_booking_buffer_and_overtime.sql` la reescribió para agregar el cálculo de tiempo
  excedido y **borró el bloque de crédito al owner**, además de sacar `earning` del constraint
  de tipos.
- `0020_booking_time_rules.sql` mantuvo esa versión.

**Efecto:** el conductor paga al reservar, el dinero sale de su billetera y **nunca se acredita
a nadie**. Arreglarlo en la migración `0024` del flujo de pago: volver a acreditar al owner en
`complete_booking` y devolver `earning` (o un tipo nuevo `payout`) al constraint. Confirmar con
el equipo si ya hay un payout manual fuera de la app antes de asumir que es un bug a corregir.

### 4.2 A confirmar — constraint de `wallet_transactions.type`

El constraint actual es `(topup, booking_payment, refund, adjustment, overtime_charge)`.
Revisar que todos los `insert` de las RPC usen exactamente esos valores — un tipo fuera de la
lista hace fallar la transacción entera.

---

## 5. PENDIENTE — funcionalidad del Figma dejada afuera

- **"Eliminar cuenta"** — en editar perfil (cliente y propietario). La app no tiene borrado de
  cuenta. Diferido por decisión.
- **Pantalla de código OTP** ("INTRODUCE EL CÓDIGO", 4 casillas) — se decidió mantener el flujo
  por link. Esa pantalla no se implementa.
- **Modo oscuro** — fuera de alcance de toda la Fase 8. La paleta oscura existe en el código
  (`src/theme/colors.ts`, ya migrada a lima) pero `useTheme()` siempre devuelve la clara.
- **"● Online" en el chat** — presencia en tiempo real, no implementado.
- **Precios "/day" "/event"** — la app es solo por hora. Se trató como mockup.
- **"Zone A-013" / plazas numeradas** — la app no modela inventario de plazas.
- **Toggle por vehículo** en Mis Vehículos ("vehículo predeterminado"?) — no está en el modelo
  de datos.
- **Botón de filtro suelto** en el Home del cliente — los filtros viven en `/search`; no se
  agregó.
- **Pantallas de éxito/error a pantalla completa** (cliente + propietario) — genéricas, ninguna
  ruta las usa hoy.

---

## 6. PENDIENTE — deuda técnica menor

- **`ChatView`** — el encabezado del chat sigue con `BackButton` (es el único uso real que
  queda de ese componente). Es un caso especial: muestra el nombre de la otra persona, no un
  título centrado. Migrarlo a algo consistente queda pendiente.
- **`VehiclesScreen.tsx`** (`src/features/vehicle/`) — código muerto, corregido en sesión previa
  pero sin importar desde ninguna ruta. Las pantallas de vehículos reales están en
  `app/(client|owner)/vehicles/`.
- **`BackButton` / `ScreenHeader` usan `router.replace()`** (no `router.back()`) — descartan el
  historial. Puede ser deliberado (bug viejo de pantallas duplicadas). No se tocó.
- **Pantallas de vehículos** (crear/editar auto, detalle) — recibieron `ScreenHeader` pero **no
  se compararon campo por campo** contra `formularioAuto` / `detalles_auto` del Figma.

---

## 7. PENDIENTE — infraestructura / build

- **API key de Google Maps para Android** — placeholder `REPLACE_WITH_ANDROID_GOOGLE_MAPS_KEY`
  en `app.json`, sin completar. Sin ella el mapa no carga en el celular → bloquea probar "Cómo
  llegar" con GPS real. Pasos acordados: sacar el SHA-1 del keystore desde el panel de EAS,
  habilitar "Maps SDK for Android" en Google Cloud, crear la key restringida por paquete
  (`com.garagego.app`) + esa huella, ponerla en `app.json`, y lanzar un build nuevo (la key se
  embebe en la parte nativa, no se actualiza en caliente).
- **Migraciones SQL corridas a mano** por el usuario en Supabase, orden: `0001` … `0023`. La
  `0024` va cuando se haga el flujo de pago.
- **Verificación real en dispositivo** del rediseño completo — el usuario fue mirando
  parcialmente, no hay un pase sistemático.

---

## 8. Memoria persistente de Claude Code (ya guardada)

En `~/.claude/projects/.../memory/`:
- `garagego-development-build.md` — el proyecto se prueba con development build, no Expo Go.
- `garagego-pendiente-google-maps-key.md` — el pendiente de la API key de Maps.
- `garagego-flujo-pago-decisiones.md` — Fase 8 pantallas 4-6, las 14 cuestiones, sin código
  hasta acordar Q1/Q2/Q4. Q13 (moneda) ya resuelto.
- `garagego-owner-payout-bug.md` — el bug del §4.1.

---

## 9. Restricciones del proyecto (no negociables)

Del documento de especificación (`documento esoecificacion front.docx`):
- No reconstruir desde cero.
- No romper lógica de negocio.
- Figma con contenido mockup a ignorar (nombres, precios, "HRK", fotos de ejemplo).
- Priorizar reutilización sobre creación.

Y de `AGENTS.md`: **Expo SDK 57** — leer los docs versionados en
`https://docs.expo.dev/versions/v57.0.0/` antes de escribir código.
