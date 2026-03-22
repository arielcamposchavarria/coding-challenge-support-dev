/**
 * Servicio de notificaciones simulado.
 *
 * En una aplicación real este módulo encapsularía las llamadas HTTP a un
 * proveedor de correo transaccional (SendGrid, AWS SES, Resend, etc.).
 * Tenerlo en su propio archivo permite:
 *   - Mockearlo en tests sin tocar la lógica de las rutas.
 *   - Intercambiar el proveedor en un solo lugar.
 */

/**
 * Envía una notificación por correo cuando un ticket urgente es resuelto.
 *
 * @param ticketId  - ID del ticket que fue resuelto.
 * @param companyId - Empresa propietaria del ticket (para dirigir el correo).
 *
 * TODO: Reemplazar el `console.log` con la llamada real al proveedor, ej.:
 *   await resend.emails.send({ to: ..., subject: ..., html: ... })
 */
export async function sendEmailNotification(
  ticketId: string,
  companyId: string
): Promise<void> {
  // Simulación: en producción aquí iría la llamada al servicio de correo.
  console.log(
    `Notificación urgente enviada — ticket: ${ticketId}, empresa: ${companyId}`
  )
}
