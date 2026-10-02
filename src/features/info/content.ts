// Texto de las pantallas Legal, Información y Seguridad de Ajustes. Sale de la documentación del
// proyecto (docs/01 a docs/07) y de lo que el sistema hace hoy: si cambia una regla de negocio
// (plazos, tarifas, límites), hay que actualizarla acá también.

export type InfoSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

/** Fecha de la última revisión de los textos. */
export const CONTENT_UPDATED_AT = 'octubre de 2026';

// ── Legal ─────────────────────────────────────────────────────────────────────────────────────

export type LegalTab = 'terms' | 'privacy' | 'refunds';

export const LEGAL_TABS: { value: LegalTab; label: string }[] = [
  { value: 'terms', label: 'Términos' },
  { value: 'privacy', label: 'Privacidad' },
  { value: 'refunds', label: 'Cancelaciones' },
];

export const LEGAL_CONTENT: Record<LegalTab, { title: string; intro: string; sections: InfoSection[] }> = {
  terms: {
    title: 'Términos y condiciones',
    intro: 'Al crear una cuenta y usar GarageGo aceptás estas condiciones. Leelas con calma: explican cómo funciona el servicio y qué se espera de cada parte.',
    sections: [
      {
        heading: '1. Qué es GarageGo',
        paragraphs: [
          'GarageGo es una plataforma que conecta a personas que necesitan estacionar (conductores) con personas que tienen una cochera libre y la alquilan por horas (propietarios).',
          'GarageGo es un intermediario: facilita la búsqueda, la reserva, el pago y la comunicación, pero no es dueño de las cocheras ni las administra.',
        ],
      },
      {
        heading: '2. Tu cuenta',
        bullets: [
          'Con una misma cuenta podés actuar como conductor y como propietario. Toda cuenta nueva empieza como conductor; el modo propietario se activa desde tu perfil.',
          'Tenés que cargar datos verdaderos y mantenerlos actualizados.',
          'Sos responsable de tu contraseña y de lo que se haga con tu cuenta. No la compartas.',
          'Podés registrarte con correo y contraseña o con tu cuenta de Google.',
        ],
      },
      {
        heading: '3. Si sos conductor',
        bullets: [
          'Reservás un horario concreto de una cochera disponible, indicando con qué vehículo vas a llegar. Podés tener hasta 3 vehículos cargados.',
          'El importe se paga por adelantado con el saldo de tu billetera. La reserva queda confirmada al pagar, sin que el propietario tenga que aprobarla.',
          'Podés iniciar tu estacionamiento desde 15 minutos antes del horario reservado y hasta el horario de fin. Al retirarte, tenés que finalizarlo.',
          'Un mismo vehículo no puede estar en dos reservas al mismo tiempo, ni iniciar una reserva mientras está en otra sesión en curso.',
          'Tenés que respetar el horario reservado y las indicaciones del propietario.',
        ],
      },
      {
        heading: '4. Si sos propietario',
        bullets: [
          'Solo podés publicar cocheras que tenés derecho a ofrecer. La descripción, las fotos (hasta 3), los servicios, la capacidad y los horarios tienen que ser verdaderos.',
          'Toda publicación pasa por una revisión del equipo antes de aparecer en las búsquedas. El equipo puede aprobarla, pedirte cambios o rechazarla; un rechazo es definitivo.',
          'El equipo puede pausar o suspender una publicación que incumpla estas condiciones.',
          'No podés reservar tu propia cochera.',
          'Cobrás el precio de cada reserva cuando esta finaliza, en tu billetera de GarageGo.',
        ],
      },
      {
        heading: '5. Precios, pagos y billetera',
        bullets: [
          'Todos los importes están en pesos argentinos.',
          'El precio de una reserva es el precio por hora de la cochera por la cantidad de horas, vigente al momento de reservar. Un cambio de precio posterior no afecta reservas ya hechas.',
          'El saldo de la billetera nunca puede quedar en negativo. Si no alcanza para pagar una reserva, no se crea.',
          'Cada movimiento (pago, cobro, reembolso, cargo) queda registrado en tu cuenta.',
          'Mientras GarageGo funcione en versión de prueba, el saldo es ficticio y no tiene valor en dinero: no hay pasarela de pago real ni retiro de fondos.',
        ],
      },
      {
        heading: '6. Tiempo excedido y cierre automático',
        bullets: [
          'Si seguís usando el lugar después del horario de fin, se cobra el tiempo excedido a 1,5 veces el precio por hora, con 5 minutos de tolerancia. Ese cargo no se le transfiere al propietario.',
          'Si no alcanza el saldo, se cobra lo que haya disponible.',
          'Una reserva que nadie finaliza se cierra sola 15 minutos después de su horario de fin. Te avisamos 15 minutos antes del final de una reserva en curso.',
          'Si nunca iniciás tu reserva, también se cierra a los 15 minutos del horario de fin: el lugar quedó reservado para vos y no pudo usarlo nadie más, por eso el importe se acredita al propietario. Una reserva sin entrada no se puede calificar.',
        ],
      },
      {
        heading: '7. Calificaciones y mensajes',
        bullets: [
          'Solo podés calificar una reserva propia que iniciaste y finalizaste. El puntaje va de 1 a 5 y el comentario es opcional.',
          'El chat de una reserva es privado entre el conductor y el propietario.',
          'Tenés que tratar a los demás con respeto. El equipo puede ocultar reseñas o contenidos inapropiados.',
        ],
      },
      {
        heading: '8. Conductas no permitidas',
        bullets: [
          'Cargar datos falsos o hacerte pasar por otra persona.',
          'Usar GarageGo para fines ilícitos o para perjudicar a otros usuarios.',
          'Intentar acceder a datos de otras personas o vulnerar la seguridad del sistema.',
          'Usar un lugar fuera del horario reservado o con un vehículo distinto al declarado.',
        ],
      },
      {
        heading: '9. Responsabilidad',
        paragraphs: [
          'GarageGo facilita el contacto entre las partes pero no garantiza las condiciones de cada cochera ni se hace responsable de lo que ocurra entre conductores y propietarios. Los servicios que figuran en una publicación (cámaras, vigilancia, iluminación y otros) los declara cada propietario.',
          'Cada persona es responsable de su vehículo y de su espacio. Ante cualquier problema, usá Soporte y ayuda para que el equipo pueda intervenir.',
        ],
      },
      {
        heading: '10. Cambios y ley aplicable',
        paragraphs: [
          'Podemos actualizar estas condiciones; la fecha de la última revisión figura al final de esta pantalla. Si seguís usando GarageGo después de un cambio, se entiende que lo aceptás.',
          'Estas condiciones se rigen por las leyes de la República Argentina.',
        ],
      },
    ],
  },

  privacy: {
    title: 'Política de privacidad',
    intro: 'Te contamos qué datos guardamos, para qué los usamos y quién puede verlos.',
    sections: [
      {
        heading: 'Qué datos guardamos',
        bullets: [
          'De tu cuenta: nombre, apellido, correo, teléfono (opcional) y foto de perfil si entrás con Google.',
          'De tus vehículos: patente, marca, modelo, color y foto (opcional).',
          'Tu ubicación, si das permiso, para mostrarte las cocheras cercanas y calcular la ruta. Solo se usa mientras usás la app.',
          'Tus reservas, los movimientos de tu billetera, tus calificaciones, tus mensajes y tus consultas de soporte.',
          'Si sos propietario: los datos y las fotos de tus publicaciones.',
        ],
      },
      {
        heading: 'Para qué los usamos',
        bullets: [
          'Crear y proteger tu cuenta.',
          'Gestionar reservas, pagos y cobros.',
          'Mostrarte cocheras cercanas y la ruta para llegar.',
          'Permitir que conductores y propietarios se comuniquen.',
          'Atender tus consultas de soporte y moderar publicaciones y reseñas.',
        ],
      },
      {
        heading: 'Quién puede ver tus datos',
        bullets: [
          'Tu nombre y tu foto pueden verlos otros usuarios de la app.',
          'Tu billetera y sus movimientos solo los ves vos.',
          'Una reserva la ven el conductor y el propietario de esa cochera. El propietario ve únicamente el vehículo asociado a una reserva suya.',
          'Los mensajes de una reserva los ven solo las dos partes.',
          'Tus consultas de soporte las ven vos y el equipo de GarageGo.',
          'Cada usuario accede únicamente a lo suyo: esas reglas las aplica la base de datos, no solo la pantalla.',
        ],
      },
      {
        heading: 'Servicios de terceros',
        paragraphs: [
          'Para funcionar usamos servicios externos: Supabase (base de datos, inicio de sesión y archivos), Google (inicio de sesión con Google y mapas) y OpenStreetMap, a través de un servidor público de rutas, que recibe tu ubicación y la de la cochera para calcular el recorrido.',
          'GarageGo nunca ve ni guarda tu contraseña: la gestiona el servicio de autenticación.',
        ],
      },
      {
        heading: 'Cuánto tiempo los conservamos',
        paragraphs: [
          'Guardamos tus datos mientras tu cuenta esté activa. Las reservas y los movimientos de dinero se conservan como registro de las operaciones, porque la otra parte también los necesita.',
          'Todavía no existe una opción para eliminar la cuenta desde la app. Si querés que eliminemos tus datos, pedilo desde Soporte y ayuda.',
        ],
      },
      {
        heading: 'Tus derechos',
        paragraphs: [
          'Podés acceder a tus datos y corregirlos desde tu perfil, y solicitar su supresión por Soporte y ayuda. La Ley 25.326 de Protección de los Datos Personales te reconoce estos derechos; la Agencia de Acceso a la Información Pública (AAIP) es el órgano de control de esa ley y atiende denuncias y reclamos.',
        ],
      },
    ],
  },

  refunds: {
    title: 'Cancelaciones y reembolsos',
    intro: 'Qué pasa con tu dinero cuando una reserva se cancela, no se usa o se pasa de hora.',
    sections: [
      {
        heading: 'Cancelar una reserva',
        bullets: [
          'El conductor puede cancelar hasta 1 hora antes del inicio. Dentro de esa última hora, ya no se puede.',
          'El propietario puede cancelar en cualquier momento, incluso sobre la hora, porque puede tener un impedimento real para recibirte.',
          'Solo se pueden cancelar reservas que todavía no finalizaron.',
        ],
      },
      {
        heading: 'Reembolso',
        bullets: [
          'Si se cancela una reserva, el importe vuelve completo a la billetera del conductor, sin penalidad, sin importar quién cancele.',
          'La reserva cancelada libera el horario y la cochera vuelve a ofrecerse.',
        ],
      },
      {
        heading: 'Si no te presentás',
        bullets: [
          'Si no iniciás tu reserva, se cierra sola 15 minutos después de su horario de fin.',
          'No hay reembolso: el lugar estuvo reservado para vos, y el importe se acredita al propietario.',
          'Una reserva a la que no llegaste no se puede calificar.',
        ],
      },
      {
        heading: 'Si te pasás de hora',
        bullets: [
          'Hay 5 minutos de tolerancia. Pasado ese margen se cobra el tiempo excedido a 1,5 veces el precio por hora.',
          'Si te olvidás de finalizar, la reserva se cierra sola 15 minutos después del final y se cobran esos minutos de excedente. Antes te enviamos un aviso.',
          'Si el saldo no alcanza, se cobra lo que haya disponible.',
        ],
      },
      {
        heading: 'Cuándo cobra el propietario',
        bullets: [
          'El propietario cobra el precio de la reserva cuando esta finaliza, no cuando se crea.',
          'El cargo por tiempo excedido no se le transfiere al propietario.',
        ],
      },
    ],
  },
};

// ── Información ───────────────────────────────────────────────────────────────────────────────

export const INFO_CONTENT: { intro: string; sections: InfoSection[] } = {
  intro:
    'GarageGo conecta a personas que necesitan estacionar con personas que tienen una cochera libre y quieren alquilarla por horas.',
  sections: [
    {
      heading: 'Qué problema resuelve',
      paragraphs: [
        'En las zonas urbanas densas estacionar es caro, lento e incierto: no se sabe si va a haber lugar hasta llegar. Al mismo tiempo, muchas cocheras particulares quedan vacías gran parte del día.',
        'El conductor reserva y paga por adelantado un lugar concreto para un horario concreto, y el propietario le saca provecho a un espacio que de otra forma estaría ocioso.',
      ],
    },
    {
      heading: 'Cómo funciona si sos conductor',
      bullets: [
        'Buscá cocheras cerca tuyo, en el mapa o en la lista, y filtrá por distancia, precio y calificación.',
        'Elegí fecha y horario: solo se puede reservar lo que está realmente libre.',
        'Reservá con el vehículo con el que vas a llegar y pagá con el saldo de tu billetera.',
        'Al llegar, iniciá tu estacionamiento. Al irte, finalizalo.',
        'Chateá con el propietario, calificá la cochera y consultá tu historial.',
      ],
    },
    {
      heading: 'Cómo funciona si sos propietario',
      bullets: [
        'Publicá tu cochera con dirección, precio por hora, capacidad, servicios, horarios y hasta 3 fotos.',
        'El equipo revisa la publicación antes de que aparezca en las búsquedas.',
        'Recibís las reservas y ves quién llega y con qué vehículo.',
        'Cobrás en tu billetera cuando cada reserva finaliza.',
      ],
    },
    {
      heading: 'Una cuenta, dos roles',
      paragraphs: [
        'Podés ser conductor y propietario con la misma cuenta y cambiar entre los dos modos desde tu perfil. Cada modo tiene sus propias reservas, notificaciones y consultas de soporte.',
      ],
    },
    {
      heading: 'Plazos y reglas que conviene conocer',
      bullets: [
        'Entre dos reservas de una misma cochera se deja un margen de 15 minutos.',
        'Podés iniciar tu estacionamiento desde 15 minutos antes del horario reservado.',
        'Podés cancelar hasta 1 hora antes del inicio, con reembolso completo.',
        'Si te pasás de hora, hay 5 minutos de tolerancia; después se cobra el excedente a 1,5 veces el precio por hora.',
        'La reserva se cierra sola 15 minutos después de su horario de fin.',
        'Te avisamos un día antes de una reserva futura y 15 minutos antes de que termine una reserva en curso.',
        'Cada cuenta puede tener hasta 3 vehículos, y cada cochera hasta 3 fotos.',
        'Un vehículo no puede estar en dos reservas al mismo tiempo.',
        'Todos los horarios son de Argentina (Buenos Aires) y los importes están en pesos argentinos.',
      ],
    },
    {
      heading: 'Preguntas frecuentes',
      bullets: [
        '¿Puedo reservar mi propia cochera? No: tus cocheras no aparecen en tus búsquedas.',
        '¿Qué pasa si llego tarde? Podés iniciar hasta el horario de fin de tu reserva. Después ya no se puede iniciar.',
        '¿Qué pasa si no llego? La reserva se cierra a los 15 minutos del final y el importe se acredita al propietario.',
        '¿Cuántos autos entran en una cochera? Lo define el propietario: figura como Capacidad en la ficha.',
        '¿Olvidé mi contraseña? En el inicio de sesión tocá "Olvidé mi contraseña": te enviamos un código por correo.',
        '¿Cómo hablo con el equipo? Desde Ajustes, en Soporte y ayuda, abrí una consulta vinculada a una reserva (conductor) o a una cochera (propietario).',
      ],
    },
  ],
};

// ── Seguridad ─────────────────────────────────────────────────────────────────────────────────

export const SECURITY_CONTENT: { intro: string; sections: InfoSection[] } = {
  intro: 'Cómo protegemos tu cuenta, tus datos y tus cobros, y qué podés hacer vos para cuidarlos.',
  sections: [
    {
      heading: 'Tu cuenta',
      bullets: [
        'GarageGo nunca ve ni guarda tu contraseña: la valida un servicio de autenticación que le devuelve a la app una sesión con vencimiento.',
        'Si entrás con Google, el inicio de sesión se abre en el navegador del teléfono, no dentro de la app, así tu contraseña de Google no pasa por GarageGo.',
        'Si olvidás tu contraseña, te mandamos un código por correo que vence a la hora. Para no revelar qué correos están registrados, la respuesta es la misma exista o no la cuenta.',
      ],
    },
    {
      heading: 'Tus datos',
      bullets: [
        'Cada usuario solo puede ver y modificar lo suyo: sus reservas, vehículos, billetera y mensajes. Esas reglas las aplica la base de datos, así que se cumplen aunque alguien modifique la app.',
        'Tu billetera y sus movimientos son privados.',
        'Los mensajes de una reserva solo los ven las dos partes.',
        'Nadie puede darse a sí mismo permisos de administrador desde la app.',
      ],
    },
    {
      heading: 'Tus publicaciones',
      bullets: [
        'Una publicación nueva no aparece en las búsquedas hasta que el equipo la aprueba, y nadie puede aprobar su propia publicación.',
        'Mientras tu publicación está aprobada podés editarla sin que salga de circulación.',
        'Si una reserva está en curso, el conductor sigue viendo los datos reales de tu cochera aunque el equipo la pause.',
      ],
    },
    {
      heading: 'Tus cobros',
      bullets: [
        'El pago del conductor y la reserva se registran en un solo paso: si algo falla, no queda ni reserva ni débito.',
        'Cobrás cuando la reserva finaliza, y cada movimiento queda registrado en tu billetera.',
        'El saldo nunca puede quedar en negativo.',
      ],
    },
    {
      heading: 'Qué podés hacer vos',
      bullets: [
        'Usá una contraseña propia, que no uses en otros servicios, y no la compartas.',
        'No le pases a nadie el código que te llega por correo.',
        'Cerrá sesión si usás la app en un teléfono ajeno o compartido.',
        'Antes de dejar entrar a un conductor, compará su vehículo con la patente y los datos que figuran en el detalle de la reserva.',
        'Coordiná con el conductor por el chat de la app: así queda registro de lo hablado.',
        'Si algo no coincide con la reserva, no habilites el acceso y avisanos desde Soporte y ayuda.',
      ],
    },
    {
      heading: 'Si sospechás de un acceso no autorizado',
      bullets: [
        'Cambiá tu contraseña desde "Olvidé mi contraseña" en el inicio de sesión.',
        'Revisá tus reservas y los movimientos de tu billetera.',
        'Escribinos desde Soporte y ayuda contando qué pasó, así el equipo puede ayudarte.',
      ],
    },
  ],
};
