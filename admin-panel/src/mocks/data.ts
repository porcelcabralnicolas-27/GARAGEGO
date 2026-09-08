/**
 * Generación del snapshot inicial del mock.
 *
 * Va todo en un archivo y en orden porque las entidades dependen unas de otras: las reservas
 * necesitan conductores y cocheras, las calificaciones necesitan reservas, y los movimientos de
 * billetera necesitan las reservas para referenciarlas. Partirlo en ocho archivos crearía un
 * enredo de imports para nada.
 *
 * Todo es determinista (ids fijos + PRNG con semilla): la demo se ve igual en cada recarga y las
 * cifras cuadran entre paneles.
 */

import {
  NOW,
  dateOnly,
  daysAgo,
  daysAhead,
  hoursAgo,
  id,
  intBetween,
  minutesAgo,
  pick,
  seeded,
  timeOnly,
} from './ids';
import { placeholderImage } from './images';
import type {
  AdminBooking,
  AdminParkingImage,
  AdminParkingLot,
  AdminProfile,
  AdminRating,
  AdminTicket,
  AdminTicketMessage,
  AdminTransaction,
  AdminVehicle,
  ApprovalStatus,
  ModerationEvent,
  ModerationState,
  MockState,
  TicketCategory,
  TransactionType,
} from './types';

const rand = seeded(20260907);

// ---------------------------------------------------------------- perfiles

const FIRST = [
  'Bruno', 'Lucía', 'Matías', 'Sofía', 'Nicolás', 'Camila', 'Tomás', 'Valentina',
  'Federico', 'Martina', 'Ignacio', 'Julieta', 'Santiago', 'Agustina', 'Facundo',
  'Micaela', 'Gonzalo', 'Rocío', 'Emiliano', 'Carla', 'Damián', 'Florencia',
  'Leandro', 'Paula',
];

const LAST = [
  'Bellot', 'Gutiérrez', 'Ferreyra', 'Molina', 'Ríos', 'Sosa', 'Cabrera', 'Ponce',
  'Aguirre', 'Vera', 'Ledesma', 'Ibáñez', 'Ojeda', 'Peralta', 'Villalba',
  'Maldonado', 'Bustos', 'Correa', 'Franco', 'Herrera', 'Acosta', 'Medina',
  'Cardozo', 'Núñez',
];

/** Quita tildes y eñes para armar el email. `NFD` separa la letra base del acento, y el rango
 *  U+0300-U+036F son justamente esos acentos sueltos. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
}

/** 24 perfiles: los primeros 8 son propietarios habilitados, el resto solo conductores.
 *  Las altas se reparten en 14 meses para que la curva de crecimiento tenga forma. */
const profiles: AdminProfile[] = FIRST.map((firstName, i) => {
  const lastName = LAST[i];
  const isOwner = i < 8;
  // Altas más densas hacia el presente, como suele crecer una app real.
  const ageDays = Math.round(420 * Math.pow(1 - i / FIRST.length, 1.6)) + intBetween(rand, 0, 12);
  return {
    id: id('user', i + 1),
    firstName,
    lastName,
    phone: rand() > 0.18 ? `11 ${intBetween(rand, 4000, 6999)}-${intBetween(rand, 1000, 9999)}` : null,
    avatarUrl: null,
    activeRole: isOwner && rand() > 0.4 ? 'owner' : 'client',
    isOwnerEnabled: isOwner,
    createdAt: daysAgo(ageDays),
    email: `${slug(firstName)}.${slug(lastName)}@ejemplo.com`,
    lastSeenAt: null,
  } satisfies AdminProfile;
});

const owners = profiles.filter((p) => p.isOwnerEnabled);
const drivers = profiles.filter((p) => !p.isOwnerEnabled);

// ---------------------------------------------------------------- vehículos

const BRANDS = [
  ['Volkswagen', 'Gol Trend'], ['Fiat', 'Cronos'], ['Toyota', 'Etios'],
  ['Renault', 'Sandero'], ['Peugeot', '208'], ['Chevrolet', 'Onix'],
  ['Ford', 'Ka'], ['Citroën', 'C3'],
] as const;

const COLORS = ['Blanco', 'Gris', 'Negro', 'Rojo', 'Azul', 'Plata'];

const vehicles: AdminVehicle[] = [];
profiles.forEach((p, i) => {
  const count = i < 18 ? intBetween(rand, 1, 2) : 0;
  for (let v = 0; v < count; v += 1) {
    const [brand, model] = pick(rand, BRANDS);
    const letters = String.fromCharCode(65 + intBetween(rand, 0, 25), 65 + intBetween(rand, 0, 25));
    vehicles.push({
      id: id('vehi', vehicles.length + 1),
      userId: p.id,
      plate: `A${letters} ${intBetween(rand, 100, 999)} ${String.fromCharCode(65 + intBetween(rand, 0, 25), 65 + intBetween(rand, 0, 25))}`,
      brand,
      model,
      color: pick(rand, COLORS),
      createdAt: daysAgo(intBetween(rand, 10, 300)),
    });
  }
});

// ---------------------------------------------------------------- cocheras

const BARRIOS = [
  ['Belgrano', -34.5627, -58.4568], ['Palermo', -34.5885, -58.4258],
  ['Caballito', -34.6187, -58.4413], ['Villa Urquiza', -34.5714, -58.4899],
  ['Almagro', -34.6089, -58.4204], ['Núñez', -34.5453, -58.4614],
  ['Recoleta', -34.5875, -58.3974], ['Avellaneda', -34.6634, -58.3654],
  ['Flores', -34.6280, -58.4640], ['Colegiales', -34.5761, -58.4497],
] as const;

const CALLES = [
  'Av. Cabildo', 'Av. Santa Fe', 'Av. Rivadavia', 'Av. Corrientes', 'Av. Belgrano',
  'Ciudad de la Paz', 'Av. Triunvirato', 'Av. Directorio', 'Av. Mitre', 'Av. Álvarez Thomas',
];

const TIPOS = ['Cochera cubierta', 'Garage', 'Estacionamiento', 'Cochera fija', 'Playa cubierta'];

const DESCRIPCIONES = [
  'Cochera cubierta en edificio con encargado. Portón automático y acceso directo desde la calle.',
  'Lugar fijo en garage familiar. Entrada amplia, apto camioneta chica.',
  'Estacionamiento a metros del subte. Iluminado y con cámaras 24 horas.',
  'Cochera en subsuelo, ideal para dejar el auto todo el día. Acceso con control remoto.',
  'Espacio descubierto en playa privada con vigilancia durante el horario comercial.',
];

/** Una descripción con datos de contacto adentro, para que el chequeo de política del panel de
 *  revisión tenga algo real que marcar. */
const DESCRIPCION_CON_CONTACTO =
  'Cochera cubierta en Belgrano, muy segura. Cualquier duda escribime al 11 5555-8899 o a ' +
  'miguel.cocheras@gmail.com y arreglamos directo, sin pasar por la app.';

type LotSeed = {
  approvalStatus: ApprovalStatus;
  moderationState: ModerationState;
  ageDays: number;
  suspicious?: boolean;
};

/** Reparto pensado para que cada filtro del panel tenga contenido:
 *  8 pendientes (una vieja para el SLA rojo, una con datos de contacto), 1 con cambios pedidos,
 *  2 rechazadas, y 19 aprobadas (2 pausadas por admin, 1 suspendida). */
const LOT_SEEDS: LotSeed[] = [
  { approvalStatus: 'pending', moderationState: 'live', ageDays: 5, suspicious: true },
  { approvalStatus: 'pending', moderationState: 'live', ageDays: 4 },
  { approvalStatus: 'pending', moderationState: 'live', ageDays: 2.6 },
  { approvalStatus: 'pending', moderationState: 'live', ageDays: 2.1 },
  { approvalStatus: 'pending', moderationState: 'live', ageDays: 1.4 },
  { approvalStatus: 'pending', moderationState: 'live', ageDays: 0.9 },
  { approvalStatus: 'pending', moderationState: 'live', ageDays: 0.4 },
  { approvalStatus: 'pending', moderationState: 'live', ageDays: 0.1 },
  { approvalStatus: 'changes_requested', moderationState: 'live', ageDays: 6 },
  { approvalStatus: 'rejected', moderationState: 'live', ageDays: 12 },
  { approvalStatus: 'rejected', moderationState: 'live', ageDays: 20 },
  { approvalStatus: 'approved', moderationState: 'paused_by_admin', ageDays: 40 },
  { approvalStatus: 'approved', moderationState: 'paused_by_admin', ageDays: 55 },
  { approvalStatus: 'approved', moderationState: 'suspended', ageDays: 70 },
  ...Array.from({ length: 16 }, (_, i) => ({
    approvalStatus: 'approved' as ApprovalStatus,
    moderationState: 'live' as ModerationState,
    ageDays: 25 + i * 11,
  })),
];

const REJECTION_REASONS = [
  'Las fotos no permiten identificar el espacio: dos de las tres son de la fachada del edificio.',
  'La dirección no coincide con las coordenadas cargadas (están a 4 km de distancia).',
];

const parkingLots: AdminParkingLot[] = LOT_SEEDS.map((seed, i) => {
  const [barrio, lat, lng] = BARRIOS[i % BARRIOS.length];
  const owner = owners[i % owners.length];
  const submitted = daysAgo(seed.ageDays);
  const isReviewed = seed.approvalStatus !== 'pending';

  return {
    id: id('lot0', i + 1),
    ownerId: owner.id,
    name: `${TIPOS[i % TIPOS.length]} ${barrio}`,
    description: seed.suspicious ? DESCRIPCION_CON_CONTACTO : DESCRIPCIONES[i % DESCRIPCIONES.length],
    address: `${CALLES[i % CALLES.length]} ${intBetween(rand, 800, 6500)}, ${barrio}`,
    latitude: lat + (rand() - 0.5) * 0.02,
    longitude: lng + (rand() - 0.5) * 0.02,
    pricePerHour: [800, 1000, 1200, 1500, 1800, 2000, 2500][i % 7],
    ratingAvg: seed.approvalStatus === 'approved' ? Math.round((3.4 + rand() * 1.6) * 100) / 100 : 0,
    isActive: seed.approvalStatus === 'approved',
    createdAt: daysAgo(seed.ageDays + 0.2),
    updatedAt: submitted,
    approvalStatus: seed.approvalStatus,
    submittedAt: submitted,
    reviewedAt: isReviewed ? daysAgo(Math.max(0.2, seed.ageDays - 1)) : null,
    reviewedBy: isReviewed ? 'Equipo GarageGo' : null,
    rejectionReason:
      seed.approvalStatus === 'rejected'
        ? REJECTION_REASONS[i % REJECTION_REASONS.length]
        : seed.approvalStatus === 'changes_requested'
          ? 'Falta una foto donde se vea el acceso desde la calle. El resto está correcto.'
          : null,
    moderationState: seed.moderationState,
    pauseReason:
      seed.moderationState === 'paused_by_admin'
        ? 'Denuncias reiteradas de acceso bloqueado por otro vehículo.'
        : seed.moderationState === 'suspended'
          ? 'Verificación de titularidad pendiente.'
          : null,
    suspendedUntil: seed.moderationState === 'suspended' ? daysAhead(9) : null,
  } satisfies AdminParkingLot;
});

// Fotos: 3 por cochera salvo dos pendientes, que traen 2 a propósito para que el panel de
// revisión muestre el aviso de "faltan fotos".
const parkingImages: AdminParkingImage[] = [];
parkingLots.forEach((lot, lotIndex) => {
  const count = lotIndex === 1 || lotIndex === 4 ? 2 : 3;
  for (let p = 0; p < count; p += 1) {
    parkingImages.push({
      id: id('img0', parkingImages.length + 1),
      parkingLotId: lot.id,
      url: placeholderImage(`${lot.id}-${p}`, `${lot.name} · foto ${p + 1}`),
      position: p,
    });
  }
});

// ---------------------------------------------------------------- reservas

const approvedLots = parkingLots.filter((l) => l.approvalStatus === 'approved');
const bookings: AdminBooking[] = [];

/** 12 sesiones activas: confirmadas, ya iniciadas y sin cerrar. Tres con exceso, para que el
 *  dashboard tenga chips de "en exceso". */
for (let i = 0; i < 12; i += 1) {
  const lot = approvedLots[i % approvedLots.length];
  const driver = drivers[i % drivers.length];
  const driverVehicle = vehicles.find((v) => v.userId === driver.id) ?? null;
  const isOvertime = i < 3;
  const startedHoursAgo = isOvertime ? 3 + i : 1 + rand() * 2;
  const startHour = new Date(NOW - startedHoursAgo * 3_600_000).getHours();
  const durationHours = isOvertime ? 2 : 3;

  bookings.push({
    id: id('book', bookings.length + 1),
    userId: driver.id,
    parkingLotId: lot.id,
    vehicleId: driverVehicle?.id ?? null,
    date: dateOnly(0),
    startTime: timeOnly(startHour),
    endTime: timeOnly(Math.min(23, startHour + durationHours)),
    status: 'confirmed',
    totalPrice: lot.pricePerHour * durationHours,
    actualStartAt: hoursAgo(startedHoursAgo),
    actualEndAt: null,
    overtimeMinutes: 0,
    overtimeCharge: 0,
    createdAt: daysAgo(intBetween(rand, 1, 5)),
  });
}

/** Reservas confirmadas a futuro: hacen que pausar una cochera muestre la advertencia real. */
for (let i = 0; i < 14; i += 1) {
  const lot = approvedLots[i % approvedLots.length];
  const driver = drivers[(i + 3) % drivers.length];
  const startHour = intBetween(rand, 8, 19);
  bookings.push({
    id: id('book', bookings.length + 1),
    userId: driver.id,
    parkingLotId: lot.id,
    vehicleId: vehicles.find((v) => v.userId === driver.id)?.id ?? null,
    date: dateOnly(intBetween(rand, 1, 6)),
    startTime: timeOnly(startHour),
    endTime: timeOnly(startHour + 2),
    status: 'confirmed',
    totalPrice: lot.pricePerHour * 2,
    actualStartAt: null,
    actualEndAt: null,
    overtimeMinutes: 0,
    overtimeCharge: 0,
    createdAt: daysAgo(intBetween(rand, 1, 8)),
  });
}

/** Historial: finalizadas y canceladas repartidas en 6 meses. */
for (let i = 0; i < 94; i += 1) {
  const lot = approvedLots[i % approvedLots.length];
  const driver = drivers[i % drivers.length];
  const ago = intBetween(rand, 1, 180);
  const startHour = intBetween(rand, 7, 20);
  const durationHours = intBetween(rand, 1, 4);
  const cancelled = rand() < 0.12;
  const overtimeMinutes = !cancelled && rand() < 0.18 ? intBetween(rand, 8, 95) : 0;

  bookings.push({
    id: id('book', bookings.length + 1),
    userId: driver.id,
    parkingLotId: lot.id,
    vehicleId: vehicles.find((v) => v.userId === driver.id)?.id ?? null,
    date: dateOnly(-ago),
    startTime: timeOnly(startHour),
    endTime: timeOnly(Math.min(23, startHour + durationHours)),
    status: cancelled ? 'cancelled' : 'completed',
    totalPrice: lot.pricePerHour * durationHours,
    actualStartAt: cancelled ? null : daysAgo(ago),
    actualEndAt: cancelled ? null : daysAgo(ago - 0.05),
    overtimeMinutes,
    overtimeCharge: overtimeMinutes
      ? Math.round(overtimeMinutes * ((lot.pricePerHour * 1.5) / 60) * 100) / 100
      : 0,
    createdAt: daysAgo(ago + 2),
  });
}

// ---------------------------------------------------------------- calificaciones

const COMMENTS_GOOD = [
  'Todo perfecto, el lugar es amplio y el acceso re fácil.',
  'Muy buena ubicación y el encargado super amable. Repito seguro.',
  'Impecable. Entré y salí sin problemas, bien iluminado.',
  'Cumplió con lo que decía la publicación. Recomendable.',
  null,
];

const COMMENTS_BAD = [
  'Cuando llegué había otro auto en el lugar. Tuve que esperar 40 minutos.',
  'El portón no abría y no había nadie para atender. Perdí el turno.',
  'La cochera es bastante más chica de lo que se ve en las fotos, no entra una camioneta.',
  'No pude acceder nunca, el propietario no contestó los mensajes.',
  'Estaba todo sucio y con olor a humedad. No es lo que muestra la publicación.',
];

const completedBookings = bookings.filter((b) => b.status === 'completed');
const ratings: AdminRating[] = completedBookings.slice(0, 60).map((booking, i) => {
  const bad = i < 8;
  const score = bad ? intBetween(rand, 1, 2) : intBetween(rand, 4, 5);
  return {
    id: id('rate', i + 1),
    bookingId: booking.id,
    userId: booking.userId,
    parkingLotId: booking.parkingLotId,
    score,
    comment: bad ? COMMENTS_BAD[i % COMMENTS_BAD.length] : COMMENTS_GOOD[i % COMMENTS_GOOD.length],
    createdAt: booking.actualEndAt ?? booking.createdAt,
    // Dos ya moderadas, para que el filtro "Ocultas" no arranque vacío.
    isHidden: i === 2 || i === 5,
    hiddenReason: i === 2 || i === 5 ? 'Contiene datos personales de terceros.' : null,
  } satisfies AdminRating;
});

// ---------------------------------------------------------------- movimientos de billetera

const transactions: AdminTransaction[] = [];
const walletOf = (userId: string) => id('wall', profiles.findIndex((p) => p.id === userId) + 1);

function pushTx(
  userId: string,
  type: TransactionType,
  amount: number,
  createdAt: string,
  relatedBookingId: string | null = null,
  status: AdminTransaction['status'] = 'completed'
) {
  transactions.push({
    id: id('txn0', transactions.length + 1),
    walletId: walletOf(userId),
    userId,
    type,
    amount,
    relatedBookingId,
    status,
    paymentGatewayRef: type === 'topup' ? 'dev-manual-topup' : null,
    createdAt,
  });
}

// Un pago por cada reserva, y la contraparte del propietario si se completó.
bookings.forEach((booking) => {
  const lot = parkingLots.find((l) => l.id === booking.parkingLotId);
  if (!lot) return;
  pushTx(booking.userId, 'booking_payment', -booking.totalPrice, booking.createdAt, booking.id);

  if (booking.status === 'completed') {
    pushTx(lot.ownerId, 'earning', booking.totalPrice, booking.actualEndAt ?? booking.createdAt, booking.id);
    if (booking.overtimeCharge > 0) {
      pushTx(booking.userId, 'overtime_charge', -booking.overtimeCharge, booking.actualEndAt ?? booking.createdAt, booking.id);
    }
  }
  if (booking.status === 'cancelled') {
    pushTx(booking.userId, 'refund', booking.totalPrice, booking.createdAt, booking.id);
  }
});

// Recargas, con algunas fallidas y pendientes para que los filtros de estado tengan contenido.
for (let i = 0; i < 46; i += 1) {
  const driver = drivers[i % drivers.length];
  const status = i < 4 ? 'failed' : i < 7 ? 'pending' : 'completed';
  pushTx(driver.id, 'topup', pick(rand, [1000, 3000, 5000]), daysAgo(intBetween(rand, 1, 120)), null, status);
}

// Un par de ajustes manuales: hoy `adjustment` está en el constraint pero ningún código lo emite.
pushTx(drivers[0].id, 'adjustment', 1500, daysAgo(9), null);
pushTx(owners[1].id, 'adjustment', -800, daysAgo(21), null);

transactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

// ---------------------------------------------------------------- tickets

type TicketSeed = {
  subject: string;
  category: TicketCategory;
  status: 'open' | 'resolved';
  side: 'client' | 'owner';
  hoursAgo: number;
  body: string;
  reply?: string;
};

const TICKET_SEEDS: TicketSeed[] = [
  { subject: 'No pude entrar a la cochera, el portón estaba trabado', category: 'access', status: 'open', side: 'client', hoursAgo: 2,
    body: 'Reservé para las 9 y cuando llegué el portón no abría. Estuve 25 minutos esperando y me tuve que ir. Quiero que me devuelvan el importe.' },
  { subject: 'Me cobraron tiempo excedido pero salí en horario', category: 'payment', status: 'open', side: 'client', hoursAgo: 5,
    body: 'Salí 10:58 y la reserva era hasta las 11. Igual me descontaron un cargo por exceso. Adjunto el ticket de salida del garage.' },
  { subject: 'Mi publicación no aparece en la búsqueda', category: 'listing', status: 'open', side: 'owner', hoursAgo: 9,
    body: 'Cargué la cochera hace tres días y todavía no me aparece cuando busco desde la app. ¿Falta algo de mi lado?' },
  { subject: 'El conductor dejó el auto fuera del espacio asignado', category: 'behavior', status: 'open', side: 'owner', hoursAgo: 15,
    body: 'Ocupó parte del lugar del vecino y me hicieron un reclamo a mí. Necesito que quede registrado.' },
  { subject: 'La cochera no coincide con las fotos', category: 'listing', status: 'open', side: 'client', hoursAgo: 22,
    body: 'En las fotos se ve un espacio cubierto y en realidad es un patio descubierto de tierra.' },
  { subject: 'No me acreditaron el cobro de una reserva finalizada', category: 'payment', status: 'open', side: 'owner', hoursAgo: 30,
    body: 'La reserva del martes figura como finalizada pero mi saldo no cambió.',
    reply: 'Hola, estamos revisando el movimiento con el equipo de pagos. Te confirmamos en el día.' },
  { subject: 'Quiero dar de baja mi publicación temporalmente', category: 'listing', status: 'open', side: 'owner', hoursAgo: 46,
    body: 'Me voy de viaje un mes y no quiero recibir reservas en ese período.' },
  { subject: 'El acceso requiere una llave que nadie me dio', category: 'access', status: 'open', side: 'client', hoursAgo: 52,
    body: 'La publicación no aclara que hace falta una llave del portón. No pude usar el lugar.' },
  { subject: 'Cobro duplicado en la recarga de saldo', category: 'payment', status: 'open', side: 'client', hoursAgo: 71,
    body: 'Hice una sola recarga de 3000 y me figuran dos movimientos iguales.' },
  { subject: 'Consulta sobre cómo cambiar mi teléfono', category: 'other', status: 'resolved', side: 'client', hoursAgo: 96,
    body: 'No encuentro dónde editar el número.',
    reply: 'Se edita desde Perfil → Editar datos. Ya quedó actualizado, cualquier cosa avisanos.' },
  { subject: 'Reclamo por cancelación sobre la hora', category: 'behavior', status: 'resolved', side: 'client', hoursAgo: 120,
    body: 'El propietario me canceló 20 minutos antes y me dejó sin lugar.',
    reply: 'Registramos el caso y hablamos con el propietario. Te reintegramos el importe completo.' },
  { subject: 'No puedo subir la tercera foto', category: 'listing', status: 'resolved', side: 'owner', hoursAgo: 140,
    body: 'Me dice que llegué al máximo pero solo tengo dos cargadas.',
    reply: 'Había una foto en borrador ocupando el cupo. Ya la liberamos.' },
  { subject: 'El auto apareció rayado al retirarlo', category: 'behavior', status: 'resolved', side: 'client', hoursAgo: 200,
    body: 'Dejé el auto a las 8 y al volver tenía una raya en la puerta del acompañante.',
    reply: 'Lamentamos mucho lo ocurrido. Pusimos en contacto a las partes y quedó resuelto entre ustedes.' },
  { subject: 'Quiero eliminar mi cuenta', category: 'other', status: 'resolved', side: 'client', hoursAgo: 260,
    body: 'No voy a usar más la app y quiero borrar mis datos.',
    reply: 'Procesamos la baja. Los datos de facturación se conservan por obligación legal.' },
];

const tickets: AdminTicket[] = TICKET_SEEDS.map((seed, i) => {
  const pool = seed.side === 'owner' ? owners : drivers;
  const reporter = pool[i % pool.length];
  const ticketId = id('tick', i + 1);
  const createdAt = hoursAgo(seed.hoursAgo);

  const messages: AdminTicketMessage[] = [
    {
      id: id('tmsg', i * 10 + 1),
      ticketId,
      authorSide: 'user' as const,
      authorName: `${reporter.firstName} ${reporter.lastName}`,
      body: seed.body,
      createdAt,
    },
  ];

  if (seed.reply) {
    messages.push({
      id: id('tmsg', i * 10 + 2),
      ticketId,
      authorSide: 'admin' as const,
      authorName: 'Equipo GarageGo',
      body: seed.reply,
      createdAt: hoursAgo(Math.max(0.5, seed.hoursAgo - 3)),
    });
  }

  return {
    id: ticketId,
    code: `TCK-${String(i + 1).padStart(4, '0')}`,
    subject: seed.subject,
    category: seed.category,
    status: seed.status,
    reporterId: reporter.id,
    reporterSide: seed.side,
    relatedBookingId: i % 3 === 0 ? bookings[i % bookings.length].id : null,
    relatedParkingLotId: i % 2 === 0 ? parkingLots[i % parkingLots.length].id : null,
    createdAt,
    updatedAt: messages[messages.length - 1].createdAt,
    messages,
  } satisfies AdminTicket;
});

// ---------------------------------------------------------------- historial de moderación

const moderationEvents: ModerationEvent[] = [];
parkingLots.forEach((lot, i) => {
  moderationEvents.push({
    id: id('mev0', moderationEvents.length + 1),
    parkingLotId: lot.id,
    label: 'Enviada a revisión',
    detail: null,
    at: lot.submittedAt,
  });
  if (lot.reviewedAt) {
    moderationEvents.push({
      id: id('mev0', moderationEvents.length + 1),
      parkingLotId: lot.id,
      label:
        lot.approvalStatus === 'approved'
          ? 'Aprobada por el equipo'
          : lot.approvalStatus === 'rejected'
            ? 'Rechazada por el equipo'
            : 'Se pidieron cambios',
      detail: lot.rejectionReason,
      at: lot.reviewedAt,
    });
  }
  if (lot.moderationState !== 'live') {
    moderationEvents.push({
      id: id('mev0', moderationEvents.length + 1),
      parkingLotId: lot.id,
      label: lot.moderationState === 'suspended' ? 'Suspendida por el equipo' : 'Pausada por el equipo',
      detail: lot.pauseReason,
      at: daysAgo(2 + (i % 5)),
    });
  }
});

// ---------------------------------------------------------------- presencia

/** Presencia simulada: los conductores con sesión activa siempre están en línea (si no, el
 *  dashboard se contradice), más algunos propietarios. */
const activeDriverIds = bookings
  .filter((b) => b.status === 'confirmed' && b.actualStartAt && !b.actualEndAt)
  .map((b) => b.userId);

/** Los propietarios en línea tienen que estar EN modo propietario: si no, el panel los cuenta
 *  como conductores y la columna de propietarios queda siempre vacía. */
const onlineOwners = [owners[0], owners[2], owners[5]];
onlineOwners.forEach((o) => {
  o.activeRole = 'owner';
});

const onlineUserIds = Array.from(
  new Set([
    ...activeDriverIds.slice(0, 4),
    ...onlineOwners.map((o) => o.id),
    drivers[7].id,
  ])
);

profiles.forEach((p) => {
  p.lastSeenAt = onlineUserIds.includes(p.id)
    ? minutesAgo(intBetween(rand, 0, 6))
    : daysAgo(intBetween(rand, 1, 40));
});

// ---------------------------------------------------------------- snapshot

export function buildInitialState(): MockState {
  return {
    profiles,
    vehicles,
    parkingLots,
    parkingImages,
    bookings,
    ratings,
    transactions,
    tickets,
    moderationEvents,
    now: NOW,
    onlineUserIds,
  };
}
