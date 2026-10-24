# GarageGo

Aplicación que conecta a **personas que necesitan estacionar** con **personas que tienen una
cochera o un estacionamiento con lugares libres** y quieren alquilarlos por hora.

Funciona en **Android, iOS y navegador** con un único código, y tiene un **panel de
administración** web para el equipo.

**Versión web publicada:** https://garagego.garagego2027.workers.dev

**APK de Android:** https://expo.dev/artifacts/eas/eC6hujrfHuFduDvULk357acyMvGc_111Z11kradBdaE.apk

---

## El problema

En zonas urbanas densas estacionar es caro, lento e incierto: no se sabe si va a haber lugar ni a
qué precio hasta llegar. Al mismo tiempo, muchas cocheras privadas quedan vacías durante gran
parte del día.

GarageGo cruza las dos puntas: el conductor reserva y paga por adelantado un lugar concreto para
un horario concreto, y el propietario obtiene ingresos con un espacio que de otra forma estaría
ocioso.

---

## Cómo funciona

Una sola cuenta puede operar con **dos roles** y cambiar entre ellos desde el perfil.

**Como conductor**

1. En **Inicio**, el mapa muestra todos los estacionamientos publicados; los pines verdes indican
   los **disponibles ahora**. Desde **Buscar** puede limitar por distancia, precio máximo y
   calificación mínima, en mapa o en lista, o buscar por una **dirección escrita**: el mapa encuadra
   los estacionamientos cercanos a ese lugar y muestra también el resto.
2. Elige fecha, horario y vehículo; solo se ofrecen los horarios realmente libres.
3. Reserva y paga con el saldo de su billetera de GarageGo.
4. Al llegar inicia el estacionamiento y lo finaliza al retirarse. Recibe un recordatorio el día
   anterior y un aviso 15 minutos antes del final.
5. Puede ver la ruta hasta la cochera, chatear con el propietario, cancelar con reintegro,
   calificar el lugar y consultar su historial.

**Como propietario**

1. Publica su espacio con un asistente de **5 pasos**: datos del lugar, tarifa y servicios
   (tipo, precio por hora, capacidad de 1 a 50 autos), disponibilidad semanal y días bloqueados,
   fotos (1 a 3) y **documentos de titularidad**.
2. La publicación pasa por **revisión del equipo** antes de aparecer en las búsquedas. Si el
   equipo pide cambios, indica qué campos corregir.
3. Recibe las reservas y ve quién llega y con qué vehículo.
4. Cobra automáticamente en su billetera cuando la reserva finaliza, y sigue su actividad en el
   dashboard y las estadísticas.

**Equipo de GarageGo (panel de administración)**

Revisa las publicaciones y sus documentos, pausa o suspende cocheras, atiende los tickets de
soporte, modera reseñas y consulta métricas, usuarios y transacciones.

---

## Estado actual

| Funciona hoy | Pendiente |
|---|---|
| Cuenta con correo o Google, recuperación de contraseña con código | Pagos con dinero real (Mercado Pago: diseño cerrado, sin implementar) |
| Búsqueda por ubicación y por dirección, «disponible ahora» | Retiro de fondos del propietario |
| Reserva, pago con billetera, inicio, fin, excedente y cancelación | Notificaciones push remotas |
| Cierre automático de reservas olvidadas y recordatorios | Eliminación de cuenta (el botón existe, sin función) |
| Publicación en 5 pasos con verificación de titularidad | Modo oscuro (paleta definida, sin activar) |
| Moderación con pedido de cambios validado | Publicación en Play Store y App Store |
| Chat, notificaciones por rol y centro de ayuda | Prueba de la versión iOS en un dispositivo |
| Panel de administración completo con datos reales | Correo propio (SMTP) para enviar el código de recuperación |

> **El saldo de la billetera es de prueba:** se carga con botones de recarga (hasta $ 50.000 por
> recarga y $ 200.000 de saldo total) y no tiene valor en dinero.

---

## Tecnologías

| Capa | Tecnología | Por qué |
|---|---|---|
| App | **React Native 0.86 + Expo SDK 57**, TypeScript | Un solo código para Android, iOS y web |
| Navegación | **expo-router** | Ruteo por archivos y enlaces profundos (`garagego://`) |
| Estado y datos | **Zustand** (sesión) + **TanStack Query** (datos del servidor) | Caché, revalidación y paginación |
| Formularios | **react-hook-form** + **zod** | Validación tipada y probada con tests |
| Backend | **Supabase** (PostgreSQL, Auth, Storage, Realtime) | Auth, base, archivos y tiempo real sin servidor propio |
| Lógica de negocio | **PL/pgSQL** (funciones + RLS + disparadores) | Las reglas viven en la base y no se pueden esquivar desde la app |
| Búsqueda por distancia | **PostGIS** | Una sola consulta espacial en el servidor |
| Tareas programadas | **pg_cron** | Cierre automático, avisos y limpieza, cada minuto |
| Mapas | **Google Maps** (`react-native-maps` en nativo, `@react-google-maps/api` en web) | Cobertura y calidad en Argentina |
| Rutas | **OSRM** (servidor demo público, OpenStreetMap) | Gratuito y sin clave |
| Panel de administración | **React 19 + Vite 7**, TypeScript | Proyecto web independiente, solo escritorio |
| Pruebas | **Jest**, scripts SQL, **node-postgres** | Unitarias, de reglas y de concurrencia real |
| CI | **GitHub Actions** | Tipos y tests en cada push |
| Distribución | **EAS Build** (APK) y **Cloudflare Workers** (web y panel) | Compilación en la nube y hosting gratuito |
| Herramientas | **Claude Code** (desarrollo), **Codex** (auditoría y testeos), **Visual Studio Code** | Desarrollar con criterio, auditar el sistema completo y revisar el código |

> **No se usa un servidor propio.** Toda la lógica de servidor está escrita en SQL dentro de
> Supabase. Ver la sección 5 de la documentación técnica.

---

## Requisitos

- **Node.js 22.13 o superior** y npm (lo exige el SDK 57).
- Un proyecto de **Supabase** con las extensiones `postgis` y `pg_cron` habilitadas.
- Una **clave de Google Maps** (Maps SDK for Android y Maps JavaScript API).
- Para probar en el celular: un **development build de EAS**, no Expo Go
  *(el login con Google no funciona en Expo Go porque requiere el esquema nativo `garagego://`)*.

---

## Instalación

```bash
git clone https://github.com/porcelcabralnicolas-27/GARAGEGO-2027-CLAUDE.git
cd GARAGEGO-2027-CLAUDE
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

La clave de Google Maps para **Android** va en [`app.json`](app.json)
(`android.config.googleMaps.apiKey`), no en el `.env`. Las dos claves deben estar restringidas en
Google Cloud (por paquete y firma, y por dominio).

### Base de datos

1. Ejecutar **en orden** las **83 migraciones** de [`supabase/migrations/`](supabase/migrations/)
   desde el SQL Editor de Supabase (o con `supabase db push`). Todas son idempotentes. Algunas
   indican en su encabezado un orden especial (por ejemplo, la 0051).
2. En **Authentication**: habilitar Email (con código de recuperación) y Google; agregar
   `garagego://**` y la URL de la web en *Redirect URLs*; configurar un SMTP propio.
3. Dar de alta un administrador desde el SQL Editor:

   ```sql
   update public.profiles set is_admin = true where id = '<id del usuario>';
   ```

4. Verificar con los scripts de [`supabase/tests/`](supabase/tests/) (cada uno indica en su
   encabezado qué ids de prueba completar).

---

## Cómo ejecutarlo

```bash
npx expo start --dev-client   # abrir en el development build de Android
npx expo start --web          # abrir en el navegador
```

**Panel de administración** (proyecto aparte, puede correr en simultáneo):

```bash
cd admin-panel
npm install
npm run dev                   # http://localhost:5180
```

Ver [admin-panel/README.md](admin-panel/README.md).

---

## Pruebas

| Comando | Qué verifica |
|---|---|
| `npx tsc --noEmit` | Tipos de la app |
| `npm test` | Tests unitarios (Jest): precio, disponibilidad, capacidad, horas, validaciones |
| `npm run test:tz` | Los mismos tests con el «teléfono» en 6 zonas horarias distintas |
| `npm run test:concurrency` | 12 escenarios de operaciones simultáneas contra la base real (requiere `DATABASE_URL`, `GG_DRIVER_ID` y `GG_OWNER_ID`; ver el encabezado del script) |
| `supabase/tests/*.sql` | Reglas de negocio y permisos contra las políticas reales; revierten sus propios datos |

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) corre tipos, tests y tests
de zona horaria de la app y del panel en cada push.

---

## Despliegue

| Qué | Cómo |
|---|---|
| App web | `npm run build:web` y `npx wrangler deploy` en la raíz (Worker `garagego`) |
| Panel | `npm run build` y `npx wrangler deploy` dentro de `admin-panel/` (Worker `garagego-admin`) |
| APK de Android | `eas build --platform android --profile preview` (EAS empaqueta desde Git: commitear antes) |
| Base de datos | Las migraciones nuevas se ejecutan a mano en el SQL Editor de Supabase |

El procedimiento completo está en la sección 11 de la documentación técnica.

---

## Estructura del proyecto

```
GARAGEGO/
├── app/                        # Pantallas y rutas (expo-router)
│   ├── (auth)/                 # Login, registro, verificación y recuperación de contraseña
│   ├── (client)/               # Experiencia del conductor
│   │   ├── search/             # Mapa, lista, ficha, ruta, reserva y pago
│   │   ├── bookings/           # Reservas activas, sesión en curso, historial
│   │   ├── messages/           # Chat con el propietario
│   │   ├── vehicles/           # Vehículos del usuario
│   │   └── profile/            # Perfil, billetera, ajustes, soporte, legal
│   └── (owner)/                # Experiencia del propietario
│       ├── parkings/           # Publicar y gestionar cocheras
│       ├── bookings/           # Reservas recibidas y su detalle
│       ├── dashboard.tsx       # Resumen de actividad e ingresos
│       └── stats.tsx           # Estadísticas por cochera
│
├── src/
│   ├── features/               # Lógica por dominio (api + tipos + pantallas)
│   │   ├── auth/  booking/  parking/  vehicle/  profile/  search/
│   │   ├── messaging/  notifications/  rating/  support/
│   │   └── directions/  stats/  info/
│   ├── components/             # Componentes reutilizables (ui/, booking/, parking/)
│   ├── lib/                    # Cliente de Supabase, tipos de la base, dinero, paginación
│   ├── store/                  # Estado global (sesión y rol activo)
│   ├── theme/                  # Tokens de diseño (colores, tipografía, espaciado)
│   └── hooks/                  # Hooks compartidos (ubicación, navegación)
│
├── shared/                     # Dominio y manejo de horas compartidos con el panel
├── supabase/
│   ├── migrations/             # 83 migraciones SQL: esquema, RLS, funciones, disparadores y jobs
│   └── tests/                  # Scripts de verificación SQL
├── scripts/                    # Pruebas de concurrencia y de zonas horarias
├── admin-panel/                # Panel de administración (Vite + React), proyecto independiente
├── docs/                       # Documentación técnica, manual de usuario y diagramas
├── assets/                     # Íconos, logo y pines del mapa
├── .github/workflows/ci.yml    # Integración continua
├── app.json · eas.json         # Configuración de Expo y perfiles de build
├── wrangler.jsonc              # Despliegue de la web en Cloudflare
└── metro.config.js             # Evita que Metro tome las dependencias del panel
```

---

## Integrantes

| Integrante | Rol |
|---|---|
| Bruno Bellot | Líder de proyecto · Product Owner |
| Nicolás Porcel | Desarrollo backend y base de datos |
| Ignacio Quintana | Desarrollo frontend móvil |
| Braian Carballo | Diseño UX/UI y panel de administración |
| Gianluca Polizzi | QA, seguridad y documentación |

**Metodología:** Scrum con sprints semanales y desarrollo guiado por especificaciones (SDD).
Se trabajó con una rama por etapa y commits descriptivos para cada cambio.

Proyecto de **Prácticas Profesionalizantes III** · Tecnicatura en Análisis de Sistemas ·
Instituto Tecnológico Beltrán · 2026.

---

## Diseño

Diseño de las pantallas en Figma:
[GARAGEGO](https://www.figma.com/design/oGHdhF6kc1ydCaQjtDKK6t/GARAGEGO?node-id=181-98&p=f)

---

## Documentación

**Documentos de entrega** (en `docs/`):

| Documento | Contenido |
|---|---|
| `Documentacion_Tecnica_GarageGo.docx` / `Documentacionfinal_Tecnica_GarageGo.pdf` | Documentación técnica completa: requerimientos, casos de uso, arquitectura, base de datos, seguridad, pruebas, instalación y despliegue |
| `Manual_de_Usuario_GarageGo.docx` | Manual de usuario |
| `diagramas/` | Arquitectura, casos de uso, modelo de datos, estados de la reserva y navegación |
