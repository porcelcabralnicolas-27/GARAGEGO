# GarageGo

Aplicación móvil que conecta a **personas que necesitan estacionar** con **personas que tienen
una cochera libre** y quieren alquilarla por horas.

---

## El problema

En zonas urbanas densas estacionar es caro, lento e incierto: no se sabe si va a haber lugar
hasta llegar. Al mismo tiempo, miles de cocheras particulares quedan vacías durante gran parte
del día.

GarageGo cruza las dos puntas: el conductor reserva y paga por adelantado una cochera concreta
para un horario concreto, y el propietario monetiza un espacio que de otra forma estaría ocioso.

---

## Cómo funciona

Una sola cuenta puede operar con **dos roles** y cambiar entre ellos desde el perfil:

**Como conductor**

1. Busca cocheras cerca de su ubicación actual, en mapa o en lista, filtrando por distancia,
   precio máximo y calificación mínima.
2. Al elegir una cochera, selecciona fecha y horario; solo se puede reservar lo realmente libre.
3. Reserva y paga con el saldo de su billetera de GarageGo.
4. Al llegar inicia la sesión de estacionamiento, y la finaliza al retirarse.
5. Puede chatear con el propietario, calificar la cochera y consultar su historial.

**Como propietario**

1. Publica su cochera (dirección, precio por hora, horarios, fotos).
2. La publicación pasa por **revisión del equipo** antes de aparecer en las búsquedas.
3. Recibe las reservas, ve quién llega y con qué vehículo.
4. Cobra automáticamente en su billetera cuando la reserva finaliza.

Existe además un **panel de administración** interno (proyecto web aparte) donde el equipo
modera publicaciones, responde tickets de soporte y consulta métricas.

---

## Tecnologías

| Capa | Tecnología | Por qué |
|---|---|---|
| App móvil | **React Native + Expo (SDK 57)**, TypeScript | Un solo código para Android, iOS y web |
| Navegación | **expo-router** | Ruteo por archivos, igual que Next.js |
| Estado / datos | **Zustand** (sesión) + **TanStack Query** (datos del servidor) | Cache y revalidación sin boilerplate |
| Formularios | **react-hook-form** + **zod** | Validación tipada, compartida con TypeScript |
| Backend | **Supabase** (PostgreSQL, Auth, Storage, Realtime) | Auth, base, archivos y tiempo real sin servidor propio |
| Lógica de negocio | **PL/pgSQL** (funciones `security definer` + RLS) | Las reglas viven en la base, no en el cliente |
| Mapas | **Google Maps** (`react-native-maps` en nativo, `@react-google-maps/api` en web) | Cobertura y calidad de datos en Argentina |
| Rutas | **OSRM** (servidor demo público, datos de OpenStreetMap) | Gratuito y sin clave; ver limitaciones en [docs/07-SEGURIDAD.md](docs/07-SEGURIDAD.md) |
| Ubicación | **expo-location** (GPS del dispositivo) | Base de la búsqueda de cocheras cercanas |
| Tareas programadas | **pg_cron** | Cierre automático de reservas olvidadas |
| Panel de administración | **React + Vite**, TypeScript | Proyecto web independiente, solo escritorio |

> **No se usa un servidor propio (Node/Python/etc.).** Toda la lógica de servidor está escrita
> en SQL dentro de Supabase. Ver [docs/05-ARQUITECTURA.md](docs/05-ARQUITECTURA.md).

---

## Requisitos

- **Node.js 20+** y npm
- Una cuenta de **Supabase** con el proyecto creado y las migraciones aplicadas
- Una **API key de Google Maps** (Maps SDK for Android / Maps JavaScript API)
- Para probar en el celular: un **development build de EAS**, no Expo Go
  *(el login con Google no funciona en Expo Go porque requiere el scheme nativo `garagego://`)*

---

## Instalación

```bash
git clone <url-del-repo>
cd GARAGEGO-2027-CLAUDE-feature-reservas
npm install
```

Crear un archivo `.env` en la raíz:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key>

# Solo para el mapa en la versión web
EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY=<tu-api-key-web>
```

> Solo la **anon key**. Nunca la `service_role`: el bundle de la app se distribuye al usuario
> final y cualquiera podría leerla.

La key de Google Maps para **Android** va en [`app.json`](app.json)
(`android.config.googleMaps.apiKey`), no en el `.env`.

Aplicar las migraciones de la base (las 45 de `supabase/migrations/`, en orden) desde el SQL
Editor de Supabase o con la CLI:

```bash
supabase db push
```

---

## Cómo ejecutarlo

```bash
npx expo start            # elegir plataforma desde el menú
npx expo start --android  # abrir en el development build de Android
npx expo start --web      # abrir en el navegador
```

**Panel de administración** (proyecto aparte, puede correr en simultáneo):

```bash
cd admin-panel
npm install
npm run dev               # http://localhost:5180
```

**Generar un APK instalable** (para el equipo o beta-testers):

```bash
eas build --platform android --profile preview
```

---

## Estructura del proyecto

```
GARAGEGO/
├── app/                      # Pantallas y rutas (expo-router)
│   ├── (auth)/               # Login, registro, recuperar contraseña
│   ├── (client)/             # Experiencia del conductor
│   │   ├── search/           # Mapa, lista, detalle, flujo de reserva y pago
│   │   ├── bookings/         # Reservas activas, sesión en curso, historial
│   │   ├── messages/         # Chat con el propietario
│   │   ├── vehicles/         # Vehículos del usuario
│   │   └── profile/          # Perfil, billetera, soporte
│   └── (owner)/              # Experiencia del propietario
│       ├── parkings/         # Publicar y gestionar cocheras
│       ├── bookings/         # Reservas recibidas
│       ├── dashboard.tsx     # Resumen de actividad
│       └── stats.tsx         # Métricas de sus cocheras
│
├── src/
│   ├── features/             # Lógica por dominio (api + tipos + pantallas)
│   │   ├── auth/  booking/  parking/  vehicle/  profile/
│   │   ├── messaging/  notifications/  rating/  support/
│   │   └── directions/  stats/
│   ├── components/           # Componentes reutilizables (ui/, booking/, parking/)
│   ├── lib/supabase/         # Cliente de Supabase y tipos generados de la base
│   ├── store/                # Estado global (sesión y rol activo)
│   ├── theme/                # Tokens de diseño (colores, tipografía, espaciado)
│   └── hooks/                # Hooks compartidos
│
├── supabase/migrations/      # 45 migraciones SQL: esquema, RLS, RPCs y triggers
│
├── admin-panel/              # Backoffice web (Vite + React), proyecto independiente
│
├── assets/                   # Íconos de la app y favicon
├── app.json                  # Configuración de Expo
└── eas.json                  # Perfiles de build de EAS
```

---

## Integrantes

<!-- COMPLETAR: nombre y rol de cada integrante del equipo -->

| Integrante | Rol |
|---|---|
| — | — |

---

## Diseño

<!-- COMPLETAR: pegar el link al archivo de Figma -->

Figma: _(pendiente)_

---

## Documentación

| Documento | Responde a |
|---|---|
| [01-REQUERIMIENTOS.md](docs/01-REQUERIMIENTOS.md) | ¿Qué problema resolvemos? ¿Qué entra y qué no en el MVP? |
| [02-HISTORIAS-USUARIO.md](docs/02-HISTORIAS-USUARIO.md) | ¿Qué puede hacer cada usuario? |
| [03-REGLAS-NEGOCIO.md](docs/03-REGLAS-NEGOCIO.md) | ¿Qué reglas debe respetar el sistema? |
| [04-CASOS-USO.md](docs/04-CASOS-USO.md) | ¿Cómo interactúan los actores con el sistema? |
| [05-ARQUITECTURA.md](docs/05-ARQUITECTURA.md) | ¿Cómo está construido y por qué? |
| [06-BASE-DATOS.md](docs/06-BASE-DATOS.md) | ¿Qué datos maneja? |
| [07-SEGURIDAD.md](docs/07-SEGURIDAD.md) | ¿Cómo se protegen los datos? (RLS, roles, claves) |
| [08-UI-UX.md](docs/08-UI-UX.md) | ¿Cómo se diseñó la experiencia? |
| [09-TESTING.md](docs/09-TESTING.md) | ¿Cómo comprobamos que funciona? |
| [10-MANUAL-USUARIO.md](docs/10-MANUAL-USUARIO.md) | ¿Cómo lo usa una persona? |
| [11-MANUAL-TECNICO.md](docs/11-MANUAL-TECNICO.md) | ¿Cómo lo mantiene otro desarrollador? |
| [admin-panel/README.md](admin-panel/README.md) | Panel de administración interno |
