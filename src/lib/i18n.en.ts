// Traducciones al inglés de la demo de Estados Unidos (0086). Clave: el texto en español tal como
// está en el código (ver src/lib/i18n.ts). El test src/lib/__tests__/i18n.test.ts verifica que
// cada t() del código y cada etiqueta indirecta (estados, servicios, días, errores) esté acá.

export const EN: Record<string, string> = {
  // ── Pestañas ────────────────────────────────────────────────────────────────────────────
  Inicio: 'Home',
  Reservas: 'Bookings',
  Mensajes: 'Messages',
  Notificaciones: 'Notifications',
  Perfil: 'Profile',

  // ── Mapa de inicio ──────────────────────────────────────────────────────────────────────
  'No se pudieron cargar los estacionamientos.': "We couldn't load the parking spots.",
  '¿A dónde vas?': 'Where are you going?',
  'Obteniendo tu ubicación…': 'Getting your location…',
  'Falta configurar EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY en .env para ver el mapa en la versión web.':
    'Set EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY in .env to see the map on the web version.',
  'No se pudo cargar Google Maps.': "Google Maps couldn't be loaded.",
  'Estás acá': 'You are here',
  'Centrar el mapa en mi ubicación': 'Center the map on my location',

  // ── Búsqueda ────────────────────────────────────────────────────────────────────────────
  Buscar: 'Search',
  'Buscar por dirección': 'Search by address',
  'Ej.: Av. Mitre 1500, Avellaneda': 'E.g. 350 5th Ave, New York',
  'Buscar esta dirección en el mapa': 'Find this address on the map',
  'No encontramos esa dirección. Probá con calle, número y localidad.':
    "We couldn't find that address. Try street, number and city.",
  'No se pudo buscar la dirección. Revisá tu conexión e intentá de nuevo.':
    "We couldn't search that address. Check your connection and try again.",
  'O buscá cerca de donde estás': 'Or search near you',
  'Reintentar ubicación': 'Retry location',
  Distancia: 'Distance',
  'Se aplica a «Ver en mapa» y «Ver en lista». El mapa de Inicio muestra todos los estacionamientos.':
    'Applies to "Show on map" and "Show as list". The Home map shows every parking spot.',
  'Precio máximo por hora (opcional)': 'Maximum price per hour (optional)',
  'Sin límite': 'No limit',
  'Calificación mínima': 'Minimum rating',
  Cualquiera: 'Any',
  '3+ estrellas': '3+ stars',
  '4+ estrellas': '4+ stars',
  'Ver en lista': 'Show as list',
  'Ver en mapa': 'Show on map',
  'Más de {count} resultados': 'More than {count} results',
  '1 resultado': '1 result',
  '{count} resultados': '{count} results',
  'Sin resultados': 'No results',
  'No encontramos estacionamientos con esos filtros. Probá ampliar la distancia o el precio.':
    "We couldn't find parking spots with those filters. Try a larger distance or price.",

  // ── Detalle de la cochera ───────────────────────────────────────────────────────────────
  Estacionamiento: 'Parking lot',
  'Cochera de casa': 'Home garage',
  'No se pudo cargar el estacionamiento.': "We couldn't load this parking spot.",
  'No se pudo cargar este estacionamiento.': "We couldn't load this parking spot.",
  Servicios: 'Amenities',
  'Horario disponible': 'Opening hours',
  'El propietario todavía no definió un horario recurrente.': "The owner hasn't set regular hours yet.",
  Opiniones: 'Reviews',
  'Todavía no hay opiniones sobre este estacionamiento.': 'There are no reviews for this parking spot yet.',
  'Ver más opiniones': 'See more reviews',
  'Cargar más opiniones': 'Load more reviews',
  'Ver menos': 'See less',
  'Cómo llegar': 'Directions',
  Reservar: 'Book',
  'El propietario no indicó servicios.': "The owner didn't list any amenities.",
  'Cámaras de seguridad': 'Security cameras',
  'Personal de vigilancia': 'Security staff',
  'Iluminación y señalización': 'Lighting and signage',
  'Cargador para eléctricos': 'EV charger',
  Sanitarios: 'Restrooms',
  Domingo: 'Sunday',
  Lunes: 'Monday',
  Martes: 'Tuesday',
  Miércoles: 'Wednesday',
  Jueves: 'Thursday',
  Viernes: 'Friday',
  Sábado: 'Saturday',

  // ── Vista previa en el mapa ─────────────────────────────────────────────────────────────
  'Reserva tu lugar': 'Book your spot',
  Cerrar: 'Close',
  'Disponible ahora': 'Available now',
  'No disponible ahora · podés reservar para más tarde': 'Not available now · you can book for later',
  Continuar: 'Continue',
  'Ver detalle': 'View details',

  // ── Reserva ─────────────────────────────────────────────────────────────────────────────
  'No se pudo cargar la disponibilidad de este estacionamiento.': "We couldn't load this parking spot's availability.",
  'Este estacionamiento no tiene horarios disponibles en los próximos 30 días.':
    'This parking spot has no available times in the next 30 days.',
  Fecha: 'Date',
  'Hora de inicio': 'Start time',
  'No hay horarios disponibles ese día.': 'There are no available times that day.',
  'Hora de fin': 'End time',
  'Tu vehículo': 'Your vehicle',
  'Todavía no cargaste ningún vehículo.': "You haven't added a vehicle yet.",
  '+ Agregar vehículo': '+ Add vehicle',
  'Total estimado': 'Estimated total',
  'Continuar al pago': 'Continue to payment',
  'Elegí fecha, hora de inicio y hora de fin.': 'Choose a date, start time and end time.',
  'Elegí el vehículo con el que vas a llegar.': "Choose the vehicle you'll arrive in.",
  'Ese horario no está disponible. Elegí otro.': 'That time is not available. Choose another one.',
  'Los horarios están en hora de Nueva York.': 'Times are shown in New York time.',
  'Los horarios están en hora de Argentina, donde está la cochera.':
    'Times are shown in Argentina time, where the parking spot is.',

  // ── Pago ────────────────────────────────────────────────────────────────────────────────
  Pago: 'Payment',
  'Elegí el método de pago': 'Choose a payment method',
  Lugar: 'Place',
  Horario: 'Time',
  Total: 'Total',
  'Billetera GarageGo': 'GarageGo Wallet',
  'Saldo: {amount}': 'Balance: {amount}',
  'Te falta saldo para esta reserva. Pagá con Mercado Pago o cargá saldo desde tu perfil.':
    "You don't have enough balance for this booking. Pay with Mercado Pago or top up from your profile.",
  'Te falta saldo para esta reserva.': "You don't have enough balance for this booking.",
  'Mercado Pago': 'Mercado Pago',
  'Tarjeta de crédito, débito o dinero en tu cuenta': 'Credit card, debit card or account balance',
  'Te guardamos el lugar 10 minutos mientras completás el pago en Mercado Pago.':
    "We'll hold your spot for 10 minutes while you complete the payment in Mercado Pago.",
  'Pagar {amount} con billetera': 'Pay {amount} with wallet',
  'Pagar {amount} con Mercado Pago': 'Pay {amount} with Mercado Pago',

  // ── Resultado del pago ──────────────────────────────────────────────────────────────────
  '¡Pago realizado con éxito!': 'Payment successful!',
  'Ha ocurrido un error': 'Something went wrong',
  'Ya reservaste tu lugar. Podés ver el comprobante y el detalle en Mis reservas.':
    'Your spot is booked. You can see the receipt and details in My bookings.',
  'No pudimos procesar el pago. Intentá de nuevo.': "We couldn't process the payment. Please try again.",
  'Ver mi reserva': 'View my booking',
  'Volver al inicio': 'Back to home',
  'Volver a intentar': 'Try again',
  'Elegir otro horario': 'Choose another time',

  // ── Procesamiento del pago (Mercado Pago) ───────────────────────────────────────────────
  'Enlace de pago inválido': 'Invalid payment link',
  'Revisá tus reservas.': 'Check your bookings.',
  'Pagar con Mercado Pago': 'Pay with Mercado Pago',
  'Cancelar reserva': 'Cancel booking',
  'Buscar otro lugar': 'Find another spot',
  'Mis reservas': 'My bookings',
  'Volver al perfil': 'Back to profile',
  'No encontramos este pago': "We couldn't find this payment",
  'Te devolvimos el dinero': 'We refunded your money',
  'La reserva se canceló y el pago volvió a tu cuenta de Mercado Pago.':
    'The booking was cancelled and the payment went back to your Mercado Pago account.',
  'Estamos devolviendo tu dinero': "We're refunding your money",
  'La reserva se canceló. El pago vuelve a tu cuenta de Mercado Pago en unos minutos.':
    'The booking was cancelled. The payment will be back in your Mercado Pago account in a few minutes.',
  'La reserva se canceló': 'The booking was cancelled',
  'No recibimos el pago a tiempo o la cancelaste. El lugar quedó libre: podés reservar de nuevo.':
    "We didn't receive the payment in time or you cancelled it. The spot is free again: you can book again.",
  'El pago fue rechazado': 'The payment was declined',
  'Probá de nuevo con otro medio de pago. Te guardamos el lugar {time} más.':
    "Try again with another payment method. We'll hold your spot for {time} more.",
  'Verificando el pago…': 'Checking the payment…',
  'Si pagaste, la reserva se confirma en unos segundos. Si no, se cancela sola.':
    "If you paid, the booking will be confirmed in a few seconds. If not, it'll be cancelled automatically.",
  'Esperando la confirmación del pago…': 'Waiting for payment confirmation…',
  'Procesando tu pago…': 'Processing your payment…',
  'Si ya pagaste, esperá unos segundos. Si no llegaste a pagar, podés hacerlo ahora: te guardamos el lugar {time}.':
    "If you already paid, wait a few seconds. If you didn't get to pay, you can do it now: we'll hold your spot for {time}.",
  'No encontramos esta recarga': "We couldn't find this top-up",
  'Revisá tu saldo en el perfil.': 'Check your balance in your profile.',
  'Recarga acreditada': 'Top-up credited',
  'Se sumaron {amount} a tu billetera.': '{amount} was added to your wallet.',
  'Te devolvemos el dinero': "We're refunding your money",
  'No pudimos acreditar este pago y lo devolvemos a tu cuenta de Mercado Pago.':
    "We couldn't credit this payment, so we're refunding it to your Mercado Pago account.",
  'No se acreditó nada. Podés intentar de nuevo desde tu perfil con otro medio de pago.':
    'Nothing was charged. You can try again from your profile with another payment method.',
  'Procesando tu recarga…': 'Processing your top-up…',
  'Si ya pagaste, el saldo se acredita en unos segundos.': 'If you already paid, your balance will update in a few seconds.',
  'La recarga no se completó': "The top-up wasn't completed",
  'No recibimos el pago. Podés intentar de nuevo desde tu perfil.':
    "We didn't receive the payment. You can try again from your profile.",
  '1 minuto': '1 minute',
  '{count} minutos': '{count} minutes',

  // ── Mis reservas ────────────────────────────────────────────────────────────────────────
  'No se pudieron cargar tus reservas.': "We couldn't load your bookings.",
  'Ver historial de reservas': 'See booking history',
  'No tenés reservas activas': "You don't have active bookings",
  'Acá vas a ver tu sesión en curso y los lugares que tengas reservados. Las finalizadas están en el historial.':
    "Here you'll see your current session and the spots you've booked. Finished ones are in your history.",
  'Sesión activa': 'Active session',
  'Lugares reservados': 'Booked spots',
  'Esperando pago': 'Awaiting payment',
  'Ver menos de {section}': 'See less of {section}',
  'Ver las {count} reservas de {section}': 'See all {count} bookings in {section}',
  'VER MENOS': 'SEE LESS',
  'VER TODO': 'SEE ALL',
  Cancelar: 'Cancel',
  '¿Seguro que querés cancelar esta reserva? El monto pagado se te reintegrará a tu saldo. Tené en cuenta que vas a poder cancelarla hasta 1 hora antes del inicio.':
    'Are you sure you want to cancel this booking? The amount paid will be refunded. Keep in mind you can cancel up to 1 hour before it starts.',
  '¿Seguro que querés cancelar esta reserva? El monto pagado se te reintegrará a tu saldo.':
    'Are you sure you want to cancel this booking? The amount paid will be refunded.',
  'Ya no se puede cancelar': 'It can no longer be cancelled',
  'Falta menos de 1 hora para que empiece esta reserva, así que ya no se puede cancelar. Si no vas a poder ir, escribile al propietario por el chat.':
    "This booking starts in less than 1 hour, so it can no longer be cancelled. If you can't make it, message the owner in the chat.",
  Entendido: 'Got it',
  'Buscar estacionamientos': 'Find parking',
  Confirmada: 'Confirmed',
  Cancelada: 'Cancelled',
  Finalizada: 'Completed',
  'En curso': 'In progress',
  'No se presentó': 'No-show',
  'Ver la reserva de {place}': 'View booking at {place}',

  // ── Historial ───────────────────────────────────────────────────────────────────────────
  'No se pudo cargar tu historial.': "We couldn't load your history.",
  'No se pudo borrar la reserva del historial.': "We couldn't remove the booking from your history.",
  Historial: 'History',
  'Tu historial está vacío': 'Your history is empty',
  'Acá van a quedar tus reservas finalizadas y canceladas.': 'Your completed and cancelled bookings will show up here.',
  Calificar: 'Rate',
  Borrar: 'Remove',
  'Borrar del historial': 'Remove from history',
  'Esta reserva se saca de tu historial y no la vas a ver más. No afecta al propietario, que la sigue viendo en el suyo.':
    "This booking will be removed from your history and you won't see it again. It doesn't affect the owner, who still sees it in theirs.",
  Volver: 'Back',

  // ── Detalle de la reserva ───────────────────────────────────────────────────────────────
  'Te pasaste {minutes} min del horario reservado. Se debitaron {amount} de tu billetera.':
    'You went {minutes} min over your booked time. {amount} was charged to your wallet.',
  Reserva: 'Booking',
  'No se pudo cargar esta reserva.': "We couldn't load this booking.",
  'Cargando…': 'Loading…',
  Dirección: 'Address',
  Vehículo: 'Vehicle',
  'Total a pagar': 'Total to pay',
  Pagado: 'Paid',
  'El horario de esta reserva ya terminó.': 'The time for this booking is over.',
  'Ya podés comenzar tu estacionamiento.': 'You can start your parking now.',
  'COMIENZA EN': 'STARTS IN',
  'El botón se habilita 15 minutos antes.': 'The button is enabled 15 minutes before.',
  Comenzar: 'Start',
  'TIEMPO EXCEDIDO': 'OVERTIME',
  'TIEMPO RESTANTE': 'TIME LEFT',
  'Se está cobrando tiempo excedido. Finalizá para detener el cargo.': "Overtime is being charged. End your parking to stop it.",
  'Finalizar estacionamiento': 'End parking',
  COMPLETADO: 'COMPLETED',
  'NO SE PRESENTÓ': 'NO-SHOW',
  'La reserva no se inició y se cerró automáticamente 15 minutos después del horario.':
    "The booking wasn't started and closed automatically 15 minutes after its time.",
  'Registro de actividades': 'Activity log',
  Entrada: 'Check-in',
  Salida: 'Check-out',
  'Tiempo excedido': 'Overtime',
  'Esta reserva está esperando el pago con Mercado Pago. Si no se paga a tiempo, se cancela sola y el lugar queda libre.':
    "This booking is waiting for payment with Mercado Pago. If it isn't paid in time, it's cancelled automatically and the spot is freed.",
  'Completar el pago': 'Complete payment',
  'Esta reserva está cancelada.': 'This booking is cancelled.',
  'Te pasaste del horario reservado. Al finalizar se te va a cobrar el tiempo excedido.':
    "You're over your booked time. Overtime will be charged when you end your parking.",
  '¿Terminaste de usar el lugar? Una vez finalizada, la reserva se cierra.':
    'Are you done using the spot? Once ended, the booking is closed.',
  Finalizar: 'End',

  // ── Perfil ──────────────────────────────────────────────────────────────────────────────
  Reintentar: 'Retry',
  'Cerrar sesión': 'Sign out',
  'Cargando perfil…': 'Loading profile…',
  Ajustes: 'Settings',
  'Editar perfil': 'Edit profile',
  Nombre: 'First name',
  Apellido: 'Last name',
  Teléfono: 'Phone',
  Guardar: 'Save',
  'Nombre completo': 'Full name',
  'Correo electrónico': 'Email',
  'No registrado': 'Not provided',
  'Mis estadísticas': 'My stats',
  'Saldo:': 'Balance:',
  'Recargar saldo': 'Top up balance',
  Región: 'Region',
  Argentina: 'Argentina',
  'Estados Unidos': 'United States',
  CONDUCTOR: 'DRIVER',
  PROPIETARIO: 'OWNER',
  'Cambiar entre modo conductor y modo propietario': 'Switch between driver and owner mode',
  'No pudimos guardar los cambios. Intenta nuevamente.': "We couldn't save your changes. Please try again.",
  'No pudimos cambiar la región. Intenta nuevamente.': "We couldn't change the region. Please try again.",
  'No pudimos cambiar de rol. Intenta nuevamente.': "We couldn't switch roles. Please try again.",

  // ── Errores de reservas y pagos (getBookingErrorMessage / getPaymentErrorMessage) ────────
  'No tenés saldo suficiente para esta reserva.': "You don't have enough balance for this booking.",
  'Ese horario ya no está disponible. Elegí otro.': 'That time is no longer available. Choose another one.',
  'Ese horario ya no tiene lugar disponible (cada reserva deja 15 minutos de margen). Elegí otro.':
    'That time has no space left (each booking keeps a 15-minute buffer). Choose another one.',
  'Ese horario ya pasó. Elegí uno posterior.': 'That time has already passed. Choose a later one.',
  'Falta menos de 1 hora para el inicio: esta reserva ya no se puede cancelar.':
    'It starts in less than 1 hour: this booking can no longer be cancelled.',
  'No podés reservar tu propio estacionamiento.': "You can't book your own parking spot.",
  'Elegí un vehículo para esta reserva.': 'Choose a vehicle for this booking.',
  'Ese vehículo ya no está disponible. Elegí otro.': 'That vehicle is no longer available. Choose another one.',
  'Ese vehículo ya tiene otra reserva en ese horario. Elegí otro vehículo o cambiá el horario.':
    'That vehicle already has another booking at that time. Choose another vehicle or change the time.',
  'Ese vehículo está en otra reserva en curso. Finalizala antes de iniciar esta, o usá otro vehículo.':
    'That vehicle is in another booking in progress. End it before starting this one, or use another vehicle.',
  'Esta reserva ya fue iniciada.': 'This booking has already started.',
  'Todavía es muy temprano. Podés iniciar desde 15 minutos antes del horario reservado.':
    "It's still too early. You can start from 15 minutes before your booked time.",
  'El horario de esta reserva ya terminó, así que no se puede iniciar.':
    "This booking's time is over, so it can't be started.",
  'Este estacionamiento ya no está disponible.': 'This parking spot is no longer available.',
  'Ese horario está fuera de la disponibilidad del estacionamiento. Elegí otro.':
    "That time is outside the parking spot's opening hours. Choose another one.",
  'La reserva tiene que durar al menos 30 minutos, en tramos de 30.':
    'A booking must last at least 30 minutes, in 30-minute steps.',
  'Esta reserva todavía no se inició, así que no se puede finalizar.':
    "This booking hasn't started yet, so it can't be ended.",
  'Esta reserva cambió de estado mientras tanto. Actualizá la pantalla.':
    'This booking changed in the meantime. Refresh the screen.',
  'Ocurrió un error inesperado. Intenta nuevamente.': 'An unexpected error occurred. Please try again.',
  'Tenés dos reservas esperando el pago. Pagá o cancelá alguna antes de hacer otra.':
    'You have two bookings awaiting payment. Pay or cancel one before making another.',
  'Se terminó el tiempo para pagar esta reserva.': 'The time to pay for this booking is over.',
  'Esta reserva ya no está esperando el pago.': 'This booking is no longer awaiting payment.',
  'Llegaste al máximo de intentos de pago para esta reserva. Cancelala y reservá de nuevo.':
    "You've reached the maximum payment attempts for this booking. Cancel it and book again.",
  'No pudimos conectarnos con Mercado Pago. Intentá de nuevo en unos minutos.':
    "We couldn't connect to Mercado Pago. Try again in a few minutes.",
  'El monto de la recarga tiene que ser de entre {min} y {max}.': 'A top-up has to be between {min} and {max}.',
  'Con esa recarga pasarías el saldo máximo de {max}.': 'That top-up would exceed the maximum balance of {max}.',
  'Tenés recargas sin terminar. Esperá unos minutos antes de iniciar otra.':
    'You have unfinished top-ups. Wait a few minutes before starting another one.',
  'No se pudo iniciar el pago desde esta versión de la app.': "The payment couldn't be started from this version of the app.",

  // ── Ajustes y País/región ───────────────────────────────────────────────────────────────
  'País/región': 'Country/region',
  '¿En qué país querés usar GarageGo?': 'Which country do you want to use GarageGo in?',
  'Cambia el idioma, la moneda, la hora y la ubicación. Las reservas, los mensajes y las notificaciones de cada país se ven por separado.':
    'It changes the language, currency, time and location. Bookings, messages and notifications are kept separate for each country.',
  'Español · Pesos (ARS)': 'Spanish · Pesos (ARS)',
  'English · Dólares (USD)': 'English · Dollars (USD)',
  Listo: 'Done',
  'Mis vehículos': 'My vehicles',
  'Soporte y ayuda': 'Support and help',
  Legal: 'Legal',
  Información: 'Information',
  Seguridad: 'Security',
  Próximamente: 'Coming soon',
  próximamente: 'coming soon',
  'Eliminar cuenta': 'Delete account',
  'Esta acción es irreversible': 'This action cannot be undone',
  'Reservas tuyas activas o próximas: {count}.': 'Your active or upcoming bookings: {count}.',
  'Reservas activas o próximas en tus cocheras: {count}.': 'Active or upcoming bookings at your parking spots: {count}.',
  'Todavía no podés eliminar tu cuenta': "You can't delete your account yet",
  'Cuando terminen o se cancelen, vas a poder eliminarla.': 'Once they end or are cancelled, you will be able to delete it.',
  'Vas a perder el saldo de tu billetera ({amount}).': 'You will lose your wallet balance ({amount}).',
  '¿Eliminar tu cuenta?': 'Delete your account?',
  'Se borran tus datos personales y tus vehículos, y tus publicaciones dejan de aparecer. Las reservas pasadas y los movimientos de dinero se conservan sin tu nombre, porque la otra parte los necesita.':
    'Your personal data and vehicles are deleted, and your listings stop showing. Past bookings and money movements are kept without your name, because the other party needs them.',
  'No se puede deshacer.': 'This cannot be undone.',
  'Eliminar mi cuenta': 'Delete my account',
  'Tenés reservas activas o próximas. Cuando terminen o las canceles, vas a poder eliminar tu cuenta.':
    'You have active or upcoming bookings. Once they end or you cancel them, you will be able to delete your account.',
  'No se pudo eliminar la cuenta. Revisá tu conexión y volvé a intentar.':
    "Your account couldn't be deleted. Check your connection and try again.",
};
