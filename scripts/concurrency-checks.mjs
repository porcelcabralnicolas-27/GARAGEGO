// GarageGo — pruebas de concurrencia contra la base real (auditoría técnica, plan de pruebas 5.8).
//
// supabase/tests/audit_checks.sql prueba las reglas de a una, en una sola conexión. Las carreras
// necesitan conexiones simultáneas de verdad, y eso no se puede hacer desde el SQL Editor. Este
// script abre varias conexiones a Postgres y fuerza el orden:
//
//   1. La conexión A ejecuta la operación y NO hace commit (se queda con los locks).
//   2. La conexión B lanza la misma operación (u otra que compite).
//   3. Se comprueba que B quede ESPERANDO: si no espera, no hay lock y la carrera es posible.
//   4. A hace commit; B tiene que fallar, y tiene que haber un solo movimiento de plata.
//
// Sin los arreglos de la 0047/0048/0057, B no esperaría y pasaría: doble reembolso, doble cobro,
// reservas pegadas sin el margen de 15 min, o saldo por encima del tope.
//
// ── Uso (PowerShell) ─────────────────────────────────────────────────────────────────────────
//   $env:DATABASE_URL = "<Session pooler URI de Supabase, con la contraseña>"
//   $env:GG_DRIVER_ID = "<id de un conductor de prueba con al menos un vehículo>"
//   $env:GG_OWNER_ID  = "<id de otro usuario de prueba>"
//   npm run test:concurrency
//
// La URI está en Supabase > Project Settings > Database > Connection string > "Session pooler".
//
// ── Qué toca en la base ──────────────────────────────────────────────────────────────────────
// Las pruebas necesitan datos confirmados (commit) para que las otras conexiones los vean, así
// que no se pueden revertir como audit_checks.sql. Por eso:
//   * crea dos cocheras de prueba propias (ids dddddddd-…) con reservas lejos en el futuro;
//   * cambia el saldo de los dos usuarios de prueba durante la corrida;
// y al final (también si algo falla) borra las cocheras con todas sus reservas, movimientos y
// notificaciones, borra las recargas de prueba y restaura los saldos originales. Si se corta a
// la mitad, volver a correrlo limpia lo que haya quedado antes de empezar.
// Usar SIEMPRE usuarios de prueba: los saldos se restauran al valor del inicio de la corrida.

import pg from 'pg';

const { DATABASE_URL, GG_DRIVER_ID: DRIVER, GG_OWNER_ID: OWNER } = process.env;

if (!DATABASE_URL || !DRIVER || !OWNER) {
  console.error('Faltan variables de entorno: DATABASE_URL, GG_DRIVER_ID y GG_OWNER_ID (ver el encabezado del script).');
  process.exit(2);
}

const LOT = 'dddddddd-0000-0000-0000-00000000000d';
const OTHER_LOT = 'dddddddd-0000-0000-0000-00000000000e';
/** Cochera con capacidad 2 (0064): dos autos a la vez, no tres. */
const CAPACITY_LOT = 'dddddddd-0000-0000-0000-00000000000f';
const PRICE_PER_HOUR = 100;
/** Cuánto se espera antes de concluir que la segunda operación quedó bloqueada por un lock. */
const BLOCK_WAIT_MS = 1500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

/** Abre una transacción como si fuera el usuario, igual que una llamada de PostgREST. */
async function beginAs(client, userId) {
  await client.query('begin');
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  await client.query('set local role authenticated');
}

/** Envuelve una promesa para poder preguntar si ya terminó sin esperarla. */
function track(promise) {
  const state = { settled: false, ok: false, value: undefined, error: undefined };
  state.done = promise.then(
    (value) => Object.assign(state, { settled: true, ok: true, value }),
    (error) => Object.assign(state, { settled: true, ok: false, error })
  );
  return state;
}

/**
 * A ejecuta `first` y retiene la transacción; B lanza `second`. Se mide si B quedó esperando y
 * después A hace commit. Devuelve si B esperó y cómo terminó.
 */
async function race({ userA, first, userB, second }) {
  const a = await connect();
  const b = await connect();
  try {
    await beginAs(a, userA);
    await a.query(first.sql, first.params);

    await beginAs(b, userB);
    const call = track(b.query(second.sql, second.params));
    await sleep(BLOCK_WAIT_MS);
    const waited = !call.settled;

    await a.query('commit');
    await call.done;
    await b.query(call.ok ? 'commit' : 'rollback');
    return { waited, ok: call.ok, error: call.error?.message ?? null };
  } finally {
    await a.end().catch(() => {});
    await b.end().catch(() => {});
  }
}

// ── SQL de las operaciones ───────────────────────────────────────────────────────────────────

const createBooking = (lot, dayOffset, start, end, vehicleId) => ({
  sql: 'select public.create_booking($1, current_date + $2::int, $3::time, $4::time, $5)',
  params: [lot, dayOffset, start, end, vehicleId],
});
const cancelBooking = (id) => ({ sql: 'select public.cancel_booking($1)', params: [id] });
const completeBooking = (id) => ({ sql: 'select * from public.complete_booking($1)', params: [id] });
const topup = (amount) => ({ sql: 'select public.topup_wallet($1)', params: [amount] });

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

async function cleanup(admin) {
  const lots = [LOT, OTHER_LOT, CAPACITY_LOT];
  // Primero los movimientos: su FK a la reserva es `on delete set null` y quedarían huérfanos.
  await admin.query(
    'delete from public.wallet_transactions where related_booking_id in (select id from public.bookings where parking_lot_id = any($1))',
    [lots]
  );
  // Reservas, disponibilidad y notificaciones caen en cascada con la cochera.
  await admin.query('delete from public.parking_lots where id = any($1)', [lots]);
  // Vehículos de prueba que armó setup() para completar los 3 del conductor.
  await admin.query("delete from public.vehicles where user_id = $1 and plate like 'GGTEST%'", [DRIVER]);
}

async function setup(admin) {
  await cleanup(admin);

  const vehicle = await admin.query(
    'select id from public.vehicles where user_id = $1 order by created_at limit 3',
    [DRIVER]
  );
  if (vehicle.rowCount === 0) throw new Error('El conductor de prueba (GG_DRIVER_ID) no tiene ningún vehículo cargado.');
  // Desde la 0067 un vehículo no puede estar en dos reservas a la vez, así que los escenarios con
  // varios autos simultáneos necesitan vehículos distintos: se completan hasta los 3 que permite
  // el sistema (cleanup() borra los GGTEST al terminar).
  const vehicleIds = vehicle.rows.map((row) => row.id);
  for (let i = vehicleIds.length; i < 3; i += 1) {
    const created = await admin.query(
      "insert into public.vehicles (user_id, plate, brand, model) values ($1, $2, 'Prueba', 'Prueba') returning id",
      [DRIVER, `GGTEST${i}`]
    );
    vehicleIds.push(created.rows[0].id);
  }

  const wallets = await admin.query('select id, user_id, balance from public.wallets where user_id = any($1)', [
    [DRIVER, OWNER],
  ]);
  if (wallets.rowCount !== 2) throw new Error('No se encontraron las billeteras de GG_DRIVER_ID y GG_OWNER_ID.');

  for (const [id, name, capacity] of [
    [LOT, 'Cochera de prueba (concurrency-checks)', 1],
    [OTHER_LOT, 'Cochera de prueba 2 (concurrency-checks)', 1],
    [CAPACITY_LOT, 'Cochera de prueba con capacidad 2 (concurrency-checks)', 2],
  ]) {
    await admin.query(
      `insert into public.parking_lots
         (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status, moderation_state)
       values ($1, $2, $3, 'Dirección de prueba', -34.6037, -58.3816, $4, $5, true, 'approved', 'live')`,
      [id, OWNER, name, PRICE_PER_HOUR, capacity]
    );
    await admin.query(
      `insert into public.parking_availability_recurring (parking_lot_id, day_of_week, start_time, end_time)
       select $1, d, '08:00', '20:00' from generate_series(0, 6) d`,
      [id]
    );
  }

  const startedAt = (await admin.query('select now() as now')).rows[0].now;
  return {
    vehicleId: vehicleIds[0],
    vehicleIds,
    driverWalletId: wallets.rows.find((w) => w.user_id === DRIVER).id,
    originalBalances: wallets.rows.map((w) => ({ userId: w.user_id, balance: w.balance })),
    startedAt,
  };
}

async function teardown(admin, fixtures) {
  await cleanup(admin);
  await admin.query(
    `delete from public.wallet_transactions
     where wallet_id = $1 and type = 'topup' and payment_gateway_ref = 'dev-manual-topup' and created_at >= $2`,
    [fixtures.driverWalletId, fixtures.startedAt]
  );
  for (const { userId, balance } of fixtures.originalBalances) {
    await admin.query('update public.wallets set balance = $2 where user_id = $1', [userId, balance]);
  }
}

// ── Helpers de verificación ──────────────────────────────────────────────────────────────────

async function setDriverBalance(admin, amount) {
  await admin.query('update public.wallets set balance = $2 where user_id = $1', [DRIVER, amount]);
}

async function driverBalance(admin) {
  return Number((await admin.query('select balance from public.wallets where user_id = $1', [DRIVER])).rows[0].balance);
}

/** Crea una reserva confirmada y la deja commiteada, como la crearía la app. */
async function bookCommitted(fixtures, dayOffset, start = '10:00', end = '11:00') {
  const client = await connect();
  try {
    await beginAs(client, DRIVER);
    const { sql, params } = createBooking(LOT, dayOffset, start, end, fixtures.vehicleId);
    const { rows } = await client.query(sql, params);
    await client.query('commit');
    return rows[0].create_booking;
  } finally {
    await client.end().catch(() => {});
  }
}

async function markStarted(admin, bookingId) {
  await admin.query('update public.bookings set actual_start_at = now() where id = $1', [bookingId]);
}

async function bookingsOn(admin, lot, dayOffset) {
  const { rows } = await admin.query(
    `select id from public.bookings
     where parking_lot_id = $1 and date = current_date + $2::int and status in ('pending', 'confirmed')`,
    [lot, dayOffset]
  );
  return rows.map((r) => r.id);
}

async function txCount(admin, bookingIds, type) {
  const { rows } = await admin.query(
    'select count(*)::int as n from public.wallet_transactions where related_booking_id = any($1) and type = $2',
    [bookingIds, type]
  );
  return rows[0].n;
}

async function bookingStatus(admin, bookingId) {
  return (await admin.query('select status from public.bookings where id = $1', [bookingId])).rows[0].status;
}

// ── Escenarios ───────────────────────────────────────────────────────────────────────────────
// Cada uno devuelve { ok, detail }. Usan días distintos (current_date + 4xx) para no pisarse.

const scenarios = [
  {
    name: 'Dos reservas simultáneas del mismo horario',
    async run(admin, fx) {
      const r = await race({
        userA: DRIVER,
        first: createBooking(LOT, 401, '10:00', '11:00', fx.vehicleId),
        userB: DRIVER,
        second: createBooking(LOT, 401, '10:00', '11:00', fx.vehicleId),
      });
      const booked = await bookingsOn(admin, LOT, 401);
      const payments = await txCount(admin, booked, 'booking_payment');
      return {
        ok: r.waited && !r.ok && booked.length === 1 && payments === 1,
        detail: `B esperó: ${r.waited} · B: ${r.error ?? 'pasó'} · reservas: ${booked.length} · pagos: ${payments}`,
      };
    },
  },
  {
    name: 'Reservas simultáneas pegadas (margen de 15 min)',
    // 10-11 y 11-11:30 no se pisan, pero violan el margen. Lo frena el lock por cochera de la
    // 0048 (desde la 0064 ya no hay exclusion constraint: es la única barrera).
    async run(admin, fx) {
      const r = await race({
        userA: DRIVER,
        first: createBooking(LOT, 402, '10:00', '11:00', fx.vehicleId),
        userB: DRIVER,
        second: createBooking(LOT, 402, '11:00', '11:30', fx.vehicleId),
      });
      const booked = await bookingsOn(admin, LOT, 402);
      return {
        ok: r.waited && !r.ok && /buffer_conflict/.test(r.error ?? '') && booked.length === 1,
        detail: `B esperó: ${r.waited} · B: ${r.error ?? 'pasó'} · reservas: ${booked.length}`,
      };
    },
  },
  {
    name: 'Ráfaga de 5 reservas simultáneas del mismo horario',
    // Sin orden forzado: las cinco salen a la vez, como cinco teléfonos tocando "Pagar".
    async run(admin, fx) {
      const clients = await Promise.all(Array.from({ length: 5 }, connect));
      try {
        await Promise.all(clients.map((c) => beginAs(c, DRIVER)));
        const { sql, params } = createBooking(LOT, 403, '10:00', '11:00', fx.vehicleId);
        const results = await Promise.allSettled(
          clients.map(async (c) => {
            try {
              await c.query(sql, params);
              await c.query('commit');
            } catch (error) {
              await c.query('rollback');
              throw error;
            }
          })
        );
        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        const booked = await bookingsOn(admin, LOT, 403);
        const payments = await txCount(admin, booked, 'booking_payment');
        return {
          ok: succeeded === 1 && booked.length === 1 && payments === 1,
          detail: `exitosas: ${succeeded} de 5 · reservas: ${booked.length} · pagos: ${payments}`,
        };
      } finally {
        await Promise.all(clients.map((c) => c.end().catch(() => {})));
      }
    },
  },
  {
    name: 'Ráfaga de 3 reservas del mismo horario en una cochera de capacidad 2',
    // Sin la exclusion constraint (0064), lo único que impide un tercer auto es el lock por
    // cochera + el conteo de ocupación de _assert_slot_bookable.
    async run(admin, fx) {
      const clients = await Promise.all(Array.from({ length: 3 }, connect));
      try {
        await Promise.all(clients.map((c) => beginAs(c, DRIVER)));
        const results = await Promise.allSettled(
          clients.map(async (c, i) => {
            try {
              // Un vehículo distinto por reserva: con el mismo, la 0067 las rechazaría a todas menos una.
              const { sql, params } = createBooking(CAPACITY_LOT, 411, '10:00', '11:00', fx.vehicleIds[i]);
              await c.query(sql, params);
              await c.query('commit');
            } catch (error) {
              await c.query('rollback');
              throw error;
            }
          })
        );
        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        const rejected = results.find((r) => r.status === 'rejected');
        const booked = await bookingsOn(admin, CAPACITY_LOT, 411);
        const payments = await txCount(admin, booked, 'booking_payment');
        return {
          ok:
            succeeded === 2 &&
            booked.length === 2 &&
            payments === 2 &&
            /buffer_conflict/.test(rejected?.reason?.message ?? ''),
          detail: `exitosas: ${succeeded} de 3 · reservas: ${booked.length} · pagos: ${payments} · rechazada: ${rejected?.reason?.message ?? 'ninguna'}`,
        };
      } finally {
        await Promise.all(clients.map((c) => c.end().catch(() => {})));
      }
    },
  },
  {
    name: 'Mismo vehículo reservado a la vez en dos cocheras distintas',
    // Las dos cocheras no se serializan entre sí (cada una tiene su lock): lo único que frena la
    // segunda es el lock por vehículo de la 0067.
    async run(admin, fx) {
      const r = await race({
        userA: DRIVER,
        first: createBooking(LOT, 412, '10:00', '11:00', fx.vehicleId),
        userB: DRIVER,
        second: createBooking(OTHER_LOT, 412, '10:30', '11:30', fx.vehicleId),
      });
      const booked = [...(await bookingsOn(admin, LOT, 412)), ...(await bookingsOn(admin, OTHER_LOT, 412))];
      return {
        ok: r.waited && /vehicle_busy/.test(r.error ?? '') && booked.length === 1,
        detail: `B esperó: ${r.waited} · B: ${r.error ?? 'pasó'} · reservas: ${booked.length}`,
      };
    },
  },
  {
    name: 'Dos reservas simultáneas que juntas superan el saldo',
    // Cocheras distintas: no las serializa el lock por cochera, solo el de la billetera. Horarios
    // distintos para que no salte la regla del vehículo (0067) antes que la del saldo.
    async run(admin, fx) {
      await setDriverBalance(admin, PRICE_PER_HOUR);
      try {
        const r = await race({
          userA: DRIVER,
          first: createBooking(LOT, 404, '10:00', '11:00', fx.vehicleId),
          userB: DRIVER,
          second: createBooking(OTHER_LOT, 404, '12:00', '13:00', fx.vehicleId),
        });
        const balance = await driverBalance(admin);
        const booked = [...(await bookingsOn(admin, LOT, 404)), ...(await bookingsOn(admin, OTHER_LOT, 404))];
        return {
          ok: r.waited && /insufficient_balance/.test(r.error ?? '') && booked.length === 1 && balance === 0,
          detail: `B esperó: ${r.waited} · B: ${r.error ?? 'pasó'} · reservas: ${booked.length} · saldo final: ${balance}`,
        };
      } finally {
        await setDriverBalance(admin, 100000);
      }
    },
  },
  {
    name: 'Dos cancelaciones simultáneas (mismo conductor, dos dispositivos)',
    async run(admin, fx) {
      const id = await bookCommitted(fx, 405);
      const r = await race({ userA: DRIVER, first: cancelBooking(id), userB: DRIVER, second: cancelBooking(id) });
      const refunds = await txCount(admin, [id], 'refund');
      return {
        ok: r.waited && !r.ok && refunds === 1,
        detail: `B esperó: ${r.waited} · B: ${r.error ?? 'pasó'} · reembolsos: ${refunds}`,
      };
    },
  },
  {
    name: 'Conductor y propietario cancelan a la vez',
    async run(admin, fx) {
      const id = await bookCommitted(fx, 406);
      const r = await race({ userA: OWNER, first: cancelBooking(id), userB: DRIVER, second: cancelBooking(id) });
      const refunds = await txCount(admin, [id], 'refund');
      return {
        ok: r.waited && !r.ok && refunds === 1,
        detail: `B esperó: ${r.waited} · B: ${r.error ?? 'pasó'} · reembolsos: ${refunds}`,
      };
    },
  },
  {
    name: 'Dos finalizaciones simultáneas (propietario y conductor)',
    async run(admin, fx) {
      const id = await bookCommitted(fx, 407);
      await markStarted(admin, id);
      const r = await race({ userA: OWNER, first: completeBooking(id), userB: DRIVER, second: completeBooking(id) });
      const earnings = await txCount(admin, [id], 'earning');
      const overtime = await txCount(admin, [id], 'overtime_charge');
      return {
        ok: r.waited && !r.ok && earnings === 1 && overtime <= 1 && (await bookingStatus(admin, id)) === 'completed',
        detail: `B esperó: ${r.waited} · B: ${r.error ?? 'pasó'} · acreditaciones: ${earnings} · excedentes: ${overtime}`,
      };
    },
  },
  {
    name: 'Cancelar mientras se finaliza (gana la cancelación)',
    async run(admin, fx) {
      const id = await bookCommitted(fx, 408);
      await markStarted(admin, id);
      const r = await race({ userA: OWNER, first: cancelBooking(id), userB: DRIVER, second: completeBooking(id) });
      const refunds = await txCount(admin, [id], 'refund');
      const earnings = await txCount(admin, [id], 'earning');
      return {
        ok: r.waited && !r.ok && refunds === 1 && earnings === 0,
        detail: `B esperó: ${r.waited} · B: ${r.error ?? 'pasó'} · reembolsos: ${refunds} · acreditaciones: ${earnings}`,
      };
    },
  },
  {
    name: 'Finalizar mientras se cancela (gana la finalización)',
    async run(admin, fx) {
      const id = await bookCommitted(fx, 409);
      await markStarted(admin, id);
      const r = await race({ userA: DRIVER, first: completeBooking(id), userB: OWNER, second: cancelBooking(id) });
      const refunds = await txCount(admin, [id], 'refund');
      const earnings = await txCount(admin, [id], 'earning');
      return {
        ok: r.waited && !r.ok && refunds === 0 && earnings === 1,
        detail: `B esperó: ${r.waited} · B: ${r.error ?? 'pasó'} · reembolsos: ${refunds} · acreditaciones: ${earnings}`,
      };
    },
  },
  {
    name: 'Dos recargas simultáneas contra el tope de saldo',
    // Saldo 190.000 y tope 200.000 (0074): entra una recarga de 6.000, no dos.
    async run(admin) {
      await setDriverBalance(admin, 190000);
      try {
        const r = await race({ userA: DRIVER, first: topup(6000), userB: DRIVER, second: topup(6000) });
        const balance = await driverBalance(admin);
        return {
          ok: r.waited && /topup_limit_reached/.test(r.error ?? '') && balance === 196000,
          detail: `B esperó: ${r.waited} · B: ${r.error ?? 'pasó'} · saldo final: ${balance}`,
        };
      } finally {
        await setDriverBalance(admin, 100000);
      }
    },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────────────────────

const admin = await connect();
let fixtures;
let failures = 0;

try {
  fixtures = await setup(admin);
  await setDriverBalance(admin, 100000);

  for (const [index, scenario] of scenarios.entries()) {
    let result;
    try {
      result = await scenario.run(admin, fixtures);
    } catch (error) {
      result = { ok: false, detail: `ERROR INESPERADO: ${error.message}` };
    }
    if (!result.ok) failures += 1;
    console.log(`${String(index + 1).padStart(2)} | ${result.ok ? 'OK   ' : 'FALLA'} | ${scenario.name}\n   | ${result.detail}`);
  }
} catch (error) {
  failures += 1;
  console.error(`No se pudo preparar la prueba: ${error.message}`);
} finally {
  if (fixtures) {
    await teardown(admin, fixtures).catch((error) => {
      failures += 1;
      console.error(`ATENCIÓN: no se pudo limpiar todo (${error.message}). Volver a correr el script limpia lo que quedó.`);
    });
  }
  await admin.end();
}

console.log(failures === 0 ? '\nTodas las pruebas de concurrencia pasaron.' : `\n${failures} prueba(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
