# GarageGo

Aplicación que conecta a **personas que necesitan estacionar** con **personas que tienen una
cochera o un estacionamiento con lugares libres** y quieren alquilarlos por hora.

Funciona en **Android, iOS y navegador** con un único código, y tiene un **panel de
administración** web para el equipo.

**Versión web publicada:** https://garagego.garagego2027.workers.dev

**APK de Android:** __APK_LINK__
*(build del 17/11/2026 sobre `main`, con todas las migraciones hasta la 0097)*

**Repositorio:** https://github.com/porcelcabralnicolas-27/GARAGEGO · versión **1.0.0** en la rama
`main`

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
3. Reserva y paga con el saldo de su billetera de GarageGo, que carga con **Mercado Pago**
   (modo de prueba), o paga la reserva directamente con Mercado Pago.
4. Al llegar inicia el estacionamiento y lo finaliza al retirarse. Recibe un recordatorio el día
   anterior y un aviso 15 minutos antes del final.
5. Puede ver la ruta hasta la cochera, chatear con el propietario, cancelar con reintegro,
   calificar el lugar y consultar su historial.

**Como propietario**

1. Publica su espacio con un asistente de **5 pasos**: datos del lugar, tarifa y servicios
   (tipo, precio por hora, capacidad), disponibilidad semanal y días bloqueados, fotos y
   **documentos de titularidad**. La cantidad de fotos, el rango de capacidad, los servicios y los
   documentos que se piden los define el equipo desde el panel.
2. La publicación pasa por **revisión del equipo** antes de aparecer en las búsquedas. Si el
   equipo pide cambios, indica qué campos corregir.
3. Recibe las reservas y ve quién llega y con qué vehículo.
4. Cobra automáticamente en su billetera cuando la reserva finaliza, y sigue su actividad en el
   dashboard y las estadísticas.

**Equipo de GarageGo (panel de administración)**

Revisa las publicaciones y sus documentos, pausa o suspende cocheras, atiende los tickets de
soporte, modera reseñas y consulta métricas, usuarios y transacciones. Desde **Configuración**
ajusta las reglas del sistema sin tocar el código.

**Configuración del panel** (migraciones 0092 a 0097)

| Pestaña | Qué se configura |
|---|---|
| Aprobación y titularidad | Checklist de aprobación: puntos obligatorios u opcionales, por tipo de lugar, solo en altas o en ediciones, «solo si cambió…» (tarifa, fotos, dirección…) y controles automáticos (fotos, datos de contacto, tarifa comparada con la mediana). Documentos que se piden: qué documento cumple cada requisito, a quién (titular, inquilino, administrador) y si es obligatorio, opcional o no se pide |
| Límites | Fotos por publicación, vehículos por país, capacidad mínima y máxima, saldo máximo, recarga mínima y máxima, montos rápidos |
| Catálogos | Servicios de las cocheras (con nombre en inglés e ícono) y categorías de tickets de soporte (por rol) |
| Moderación | Motivos de rechazo, pausa y ocultar reseña; plazos de la cola de aprobación (24/48/72 h) y factor del control de tarifa |

El servidor valida y hace cumplir cada regla; la app y el panel las leen al abrir y, si no pueden,
usan los valores de siempre.

**Demo regional (Estados Unidos)**

Desde **Ajustes → País/región** se puede pasar a Estados Unidos: la app cambia a inglés en el
recorrido del conductor, muestra los precios en dólares (tipo de cambio fijo de demo) y los
horarios en hora de Nueva York, y centra el mapa en Manhattan, con 5 cocheras de ejemplo. Las
reservas, notificaciones y vehículos quedan separados por país. En Estados Unidos solo se paga con
la billetera.

---

## Estado actual

| Funciona hoy | Pendiente |
|---|---|
| Cuenta con correo o Google, recuperación de contraseña con código (tolera la demora del servidor de correo al guardar la clave nueva) | Mercado Pago en producción (credenciales reales, webhook de producción y temas legales) |
| Búsqueda por ubicación y por dirección, «disponible ahora» | Retiro de fondos del propietario |
| Reserva, pago con billetera o con Mercado Pago, inicio, fin, excedente y cancelación con reintegro | Notificaciones push remotas |
| Recarga de saldo con Mercado Pago (modo de prueba) y reintegros al medio de pago | Modo oscuro (paleta definida, sin activar) |
| Cierre automático de reservas olvidadas y recordatorios | Publicación en Play Store y App Store |
| Publicación en 5 pasos con verificación de titularidad (se verifica una sola vez) | Prueba de la versión iOS en un dispositivo |
| Moderación con pedido de cambios validado y checklist configurable | Correo propio (SMTP) para enviar el código de recuperación |
| Chat, notificaciones por rol y centro de ayuda | Buscador inteligente que recomiende cocheras según destino, horario, precio y reservas anteriores |
| Panel de administración con datos reales y Configuración de reglas sin tocar el código | Sesión guardada de forma cifrada, servidor de rutas propio y pruebas automáticas de punta a punta |
| Eliminación de cuenta (avisa reservas y saldo pendientes) | Inglés en todas las pantallas (hoy, solo en el recorrido de la demo regional) |
| Demo regional de Estados Unidos: idioma, moneda y zona horaria | |

> **Mercado Pago está en modo de prueba:** se paga con las tarjetas y el comprador de prueba de
> Mercado Pago, y el saldo no tiene valor en dinero. Los topes (por defecto, recargas de $ 100 a
> $ 50.000 y saldo máximo de $ 200.000) se cambian desde Configuración → Límites.

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
| Pagos | **Mercado Pago** (API de Orders) + **Supabase Edge Functions** (Deno) | Checkout, webhook firmado, vuelta del pago y reintegros sin servidor propio |
| Idioma y región | i18n propio (`t()` con el texto en castellano como clave) | Inglés para la demo de Estados Unidos sin reescribir pantallas |
| Búsqueda por distancia | **PostGIS** | Una sola consulta espacial en el servidor |
| Tareas programadas | **pg_cron** | Cierre automático, avisos y limpieza, cada minuto |
| Mapas | **Google Maps** (`react-native-maps` en nativo, `@react-google-maps/api` en web) | Cobertura y calidad en Argentina |
| Rutas | **OSRM** (servidor demo público, OpenStreetMap) | Gratuito y sin clave |
| Panel de administración | **React 19 + Vite 7**, TypeScript | Proyecto web independiente; pensado para escritorio y adaptado a pantallas chicas |
| Pruebas | **Jest**, scripts SQL, **node-postgres** | Unitarias, de reglas y de concurrencia real |
| CI | **GitHub Actions** | Tipos y tests en cada push y en cada pull request |
| Distribución | **EAS Build** (APK) y **Cloudflare Workers** (web y panel) | Compilación en la nube y hosting gratuito |
| Herramientas | **Claude Code** (desarrollo), **Codex** (auditoría y testeos), **Visual Studio Code** | Desarrollar con criterio, auditar el sistema completo y revisar el código |

> **No se usa un servidor propio.** La lógica de servidor está escrita en SQL dentro de Supabase;
> solo lo que habla con Mercado Pago (y la baja de la cuenta) corre en Edge Functions. Ver la
> sección 5 de la documentación técnica.

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
git clone https://github.com/porcelcabralnicolas-27/GARAGEGO.git
cd GARAGEGO
npm install
```

Crear un archivo `.env` en la raíz (hay un modelo en [`.env.example`](.env.example)):

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

1. Ejecutar **en orden** las **97 migraciones** de [`supabase/migrations/`](supabase/migrations/)
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
5. Desplegar las **Edge Functions** de [`supabase/functions/`](supabase/functions/)
   (`mp-create-order`, `mp-webhook`, `mp-return`, `mp-sync` y `delete-account`) y cargar sus secretos:

   ```bash
   npx supabase@latest functions deploy --project-ref <tu-proyecto> --use-api
   npx supabase@latest secrets set MP_ACCESS_TOKEN=... MP_WEBHOOK_SECRET=... MP_SYNC_CRON_SECRET=... --project-ref <tu-proyecto>
   ```

   En Mercado Pago, apuntar el webhook a `https://<tu-proyecto>.supabase.co/functions/v1/mp-webhook`.
   La migración 0085 programa con pg_cron la sincronización de pagos pendientes (`mp-sync`).

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
de zona horaria de la app, y los tipos del panel, en cada push y en cada pull request.

---

## Despliegue

| Qué | Cómo |
|---|---|
| App web | `npm run build:web` y `npx wrangler deploy` en la raíz (Worker `garagego`) |
| Panel | `npm run build` y `npx wrangler deploy` dentro de `admin-panel/` (Worker `garagego-admin`) |
| APK de Android | `eas build --platform android --profile preview` (EAS empaqueta desde Git: commitear antes) |
| Base de datos | Las migraciones nuevas se ejecutan a mano en el SQL Editor de Supabase |
| Edge Functions | `npx supabase@latest functions deploy --project-ref <tu-proyecto> --use-api` |

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
│   │   ├── profile/            # Perfil, billetera, recarga, región, ajustes, soporte, legal
│   │   └── payment-return.tsx  # Vuelta del checkout de Mercado Pago
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
│   │   └── directions/  stats/  info/  payments/
│   ├── components/             # Componentes reutilizables (ui/, booking/, parking/)
│   ├── lib/                    # Supabase, dinero, región, i18n, límites, catálogos y documentos
│   ├── store/                  # Estado global (sesión y rol activo)
│   ├── theme/                  # Tokens de diseño (colores, tipografía, espaciado)
│   └── hooks/                  # Hooks compartidos (ubicación, navegación)
│
├── shared/                     # Dominio y manejo de horas compartidos con el panel
├── supabase/
│   ├── migrations/             # 97 migraciones SQL: esquema, RLS, funciones, disparadores y jobs
│   ├── functions/              # Edge Functions: Mercado Pago y baja de la cuenta
│   └── tests/                  # Scripts de verificación SQL
├── scripts/                    # Pruebas de concurrencia y de zonas horarias
├── admin-panel/                # Panel de administración (Vite + React), proyecto independiente
│                               #   src/pages/settings/: pestañas de Configuración
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
Se trabajó con una rama por etapa y commits descriptivos para cada cambio. Las ramas se unieron a
`main` con el pull request #1 (24/10/2026); desde entonces el trabajo sigue directamente en `main`.

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
| `Documentacionfinal_Tecnica_GarageGo.pdf` | Documentación técnica completa: requerimientos, casos de uso, arquitectura, base de datos, seguridad, pruebas, instalación, despliegue y estado final |
| `Manual_de_Usuario_GarageGo.docx` | Manual de usuario |
| `diagramas/` | Arquitectura, casos de uso, modelo de datos, estados de la reserva y navegación |
