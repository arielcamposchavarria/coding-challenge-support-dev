import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmailNotification } from '@/lib/notifications'

/**
 * PATCH /api/tickets/[id]
 *
 * Actualiza el estado de un ticket. Si el ticket es Urgente y pasa a Resuelto,
 * dispara una notificación por correo de forma asíncrona.
 *
 * Bug 3 (corregido): la función `sendEmailNotification` original devolvía una
 * Promise que nunca llamaba a `resolve()`, bloqueando indefinidamente cualquier
 * request sobre tickets urgentes.
 *
 * Fix en dos partes:
 *  1. `sendEmailNotification` ahora resuelve correctamente (ver src/lib/notifications.ts).
 *  2. Se invoca con fire-and-forget: la notificación es un efecto secundario que
 *     NO debe bloquear la respuesta HTTP. Si el envío falla, se loguea el error
 *     pero el usuario recibe su respuesta igualmente.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { status } = await request.json()

    const ticket = await prisma.ticket.findUnique({
      where: { id },
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })
    }

    if (ticket.priority === 'Urgente' && status === 'Resuelto') {
      // Fire-and-forget: lanzamos la notificación sin bloquear la respuesta.
      // El `.catch` garantiza que un fallo en el correo no rompa la operación
      // principal ni deje la Promise sin manejar (unhandled rejection).
      sendEmailNotification(ticket.id, ticket.companyId).catch((err) =>
        console.error(`Error al enviar notificación para ticket ${ticket.id}:`, err)
      )
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id },
      data: { status },
    })

    return NextResponse.json(updatedTicket)
  } catch (error) {
    console.error('Error updating ticket:', error)
    return NextResponse.json({ error: 'Error updating ticket' }, { status: 500 })
  }
}
