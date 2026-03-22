/**
 * Tests para PATCH /api/tickets/[id]
 *
 * Verifican que el endpoint actualice el estado de un ticket correctamente y,
 * en particular, que los tickets Urgentes se resuelvan sin bloquear la respuesta
 * HTTP (Bug 3).
 *
 * Estrategia de mocking:
 *  - Prisma se mockea para aislar la lógica de la ruta de la base de datos.
 *  - El módulo de notificaciones se mockea para verificar que se invoca sin
 *    bloquear, y para simular fallos sin afectar el resto de los tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from '../route'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ticket: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

// Mockeamos el servicio de notificaciones para poder:
//  a) Verificar que se llama con los argumentos correctos.
//  b) Simular fallos sin afectar la respuesta de la ruta.
vi.mock('@/lib/notifications', () => ({
  sendEmailNotification: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import { sendEmailNotification } from '@/lib/notifications'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Construye un Request de PATCH con el body indicado. */
function makePatchRequest(body: object): Request {
  return new Request('http://localhost/api/tickets/tc-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Construye el segundo argumento del handler (params como Promise). */
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// ISO strings, not Date objects: NextResponse.json() serializes dates to
// strings when passing through JSON, so fixtures must match what response.json()
// actually returns in order for toEqual() to pass.
const URGENT_TICKET = {
  id: 'tc-1',
  title: 'El dashboard no carga',
  description: 'Se queda en blanco.',
  status: 'Abierto',
  priority: 'Urgente',
  companyId: 'TechCorp',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const NORMAL_TICKET = {
  id: 'tc-2',
  title: 'Cambio de contraseña',
  description: 'Necesito cambiarla.',
  status: 'Abierto',
  priority: 'Normal',
  companyId: 'TechCorp',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /api/tickets/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- Bug 3: tickets urgentes no deben bloquear la respuesta ----

  it('resuelve un ticket urgente y retorna respuesta sin bloquearse (Bug 3)', async () => {
    const resolved = { ...URGENT_TICKET, status: 'Resuelto' }
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(URGENT_TICKET)
    vi.mocked(prisma.ticket.update).mockResolvedValue(resolved)

    // Si el bug estuviera activo, este `await` nunca terminaría.
    const response = await PATCH(
      makePatchRequest({ status: 'Resuelto' }),
      makeParams('tc-1')
    )
    const data = await response.json()

    // La ruta debe responder con éxito (no colgar).
    expect(response.status).toBe(200)
    expect(data).toEqual(resolved)
  })

  it('dispara la notificación al resolver un ticket urgente', async () => {
    const resolved = { ...URGENT_TICKET, status: 'Resuelto' }
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(URGENT_TICKET)
    vi.mocked(prisma.ticket.update).mockResolvedValue(resolved)

    await PATCH(makePatchRequest({ status: 'Resuelto' }), makeParams('tc-1'))

    // La notificación debe haberse invocado con los datos del ticket.
    expect(sendEmailNotification).toHaveBeenCalledOnce()
    expect(sendEmailNotification).toHaveBeenCalledWith(
      URGENT_TICKET.id,
      URGENT_TICKET.companyId
    )
  })

  it('completa la actualización aunque la notificación falle (fire-and-forget)', async () => {
    // Simulamos un fallo en el servicio de correo.
    vi.mocked(sendEmailNotification).mockRejectedValue(
      new Error('SMTP timeout')
    )
    const resolved = { ...URGENT_TICKET, status: 'Resuelto' }
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(URGENT_TICKET)
    vi.mocked(prisma.ticket.update).mockResolvedValue(resolved)

    // El fallo en la notificación NO debe afectar la respuesta HTTP.
    const response = await PATCH(
      makePatchRequest({ status: 'Resuelto' }),
      makeParams('tc-1')
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.status).toBe('Resuelto')
  })

  // ---- Tickets normales ----

  it('resuelve un ticket normal sin disparar notificación', async () => {
    const resolved = { ...NORMAL_TICKET, status: 'Resuelto' }
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(NORMAL_TICKET)
    vi.mocked(prisma.ticket.update).mockResolvedValue(resolved)

    const response = await PATCH(
      makePatchRequest({ status: 'Resuelto' }),
      makeParams('tc-2')
    )

    expect(response.status).toBe(200)
    // No se debe notificar para tickets de prioridad Normal.
    expect(sendEmailNotification).not.toHaveBeenCalled()
  })

  it('no dispara notificación si el ticket urgente cambia a un estado distinto de Resuelto', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(URGENT_TICKET)
    vi.mocked(prisma.ticket.update).mockResolvedValue({
      ...URGENT_TICKET,
      status: 'En progreso',
    })

    await PATCH(
      makePatchRequest({ status: 'En progreso' }),
      makeParams('tc-1')
    )

    expect(sendEmailNotification).not.toHaveBeenCalled()
  })

  // ---- Casos de error ----

  it('devuelve 404 si el ticket no existe', async () => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null)

    const response = await PATCH(
      makePatchRequest({ status: 'Resuelto' }),
      makeParams('no-existe')
    )

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data).toEqual({ error: 'Ticket no encontrado' })
  })

  it('devuelve 500 si la base de datos lanza un error', async () => {
    vi.mocked(prisma.ticket.findUnique).mockRejectedValue(
      new Error('DB connection failed')
    )

    const response = await PATCH(
      makePatchRequest({ status: 'Resuelto' }),
      makeParams('tc-1')
    )

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data).toEqual({ error: 'Error updating ticket' })
  })
})
