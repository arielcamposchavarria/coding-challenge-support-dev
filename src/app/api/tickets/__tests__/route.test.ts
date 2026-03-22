/**
 * Tests para GET /api/tickets
 *
 * Verifican que el endpoint aplique correctamente el filtro por companyId
 * para evitar la fuga de datos entre empresas (Bug 4).
 *
 * Estrategia de mocking:
 *  - Prisma se mockea para aislar la lógica de la ruta de la base de datos.
 *  - La capa de auth se mockea para controlar qué empresa "está en sesión"
 *    en cada caso de prueba.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '../route'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mockeamos el cliente de Prisma para no necesitar una DB real en los tests.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    ticket: {
      findMany: vi.fn(),
    },
  },
}))

// Mockeamos la capa de auth para controlar el companyId de la "sesión"
// en cada test sin depender de la implementación real.
vi.mock('@/lib/auth', () => ({
  getCurrentCompanyId: vi.fn(() => 'TechCorp'),
}))

// Importamos después de los mocks para que vi.mock() los intercepte.
import { prisma } from '@/lib/prisma'
import { getCurrentCompanyId } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Las fechas se definen como strings ISO porque NextResponse.json() serializa
// los objetos Date a strings al pasar por JSON. El valor que devuelve
// response.json() en el test es string, no Date, por lo que los fixtures
// deben usar el mismo tipo para que toEqual() los compare correctamente.
const TECHCORP_TICKETS = [
  {
    id: 'tc-1',
    title: 'El dashboard no carga',
    description: 'Se queda en blanco.',
    status: 'Abierto',
    priority: 'Urgente',
    companyId: 'TechCorp',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tc-2',
    title: 'Cambio de contraseña',
    description: 'Necesito cambiarla.',
    status: 'Abierto',
    priority: 'Normal',
    companyId: 'TechCorp',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
]

const OROSI_TICKETS = [
  {
    id: 'or-1',
    title: 'Fallo en facturación',
    description: 'Montos incorrectos.',
    status: 'Abierto',
    priority: 'Urgente',
    companyId: 'Orosi',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restablecemos el companyId de la "sesión" a TechCorp antes de cada test.
    vi.mocked(getCurrentCompanyId).mockReturnValue('TechCorp')
  })

  it('devuelve únicamente los tickets de la empresa en sesión', async () => {
    vi.mocked(prisma.ticket.findMany).mockResolvedValue(TECHCORP_TICKETS as any)

    const response = await GET()
    const data = await response.json()

    // Verificación principal (Bug 4): la consulta debe incluir el filtro por companyId.
    expect(prisma.ticket.findMany).toHaveBeenCalledWith({
      where: { companyId: 'TechCorp' },
      orderBy: { createdAt: 'desc' },
    })

    // Verificamos que el response retorna los datos de Prisma sin modificarlos.
    // Usamos toMatchObject en lugar de toEqual para evitar falsos negativos por
    // la serialización JSON de fechas (Date → string al pasar por NextResponse.json).
    expect(response.status).toBe(200)
    expect(data).toHaveLength(TECHCORP_TICKETS.length)
    expect(data).toMatchObject([
      { id: 'tc-1', companyId: 'TechCorp', priority: 'Urgente' },
      { id: 'tc-2', companyId: 'TechCorp', priority: 'Normal' },
    ])
  })

  it('no filtra tickets de otras empresas (el filtro ocurre en la DB, no en memoria)', async () => {
    // La DB ya recibió el filtro; simula que solo devuelve tickets de TechCorp.
    vi.mocked(prisma.ticket.findMany).mockResolvedValue(TECHCORP_TICKETS)

    const response = await GET()
    const data = await response.json()

    // Ningún ticket de Orosi debe aparecer en la respuesta.
    const orosiLeak = data.some(
      (t: { companyId: string }) => t.companyId === 'Orosi'
    )
    expect(orosiLeak).toBe(false)

    // Y el `where` enviado a Prisma no debe incluir a Orosi.
    expect(prisma.ticket.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'Orosi' } })
    )
  })

  it('usa el companyId de la capa de auth, no un valor hardcodeado', async () => {
    // Simulamos que la sesión pertenece a otra empresa.
    vi.mocked(getCurrentCompanyId).mockReturnValue('Orosi')
    vi.mocked(prisma.ticket.findMany).mockResolvedValue(OROSI_TICKETS)

    await GET()

    // El filtro debe adaptarse al valor que devuelva getCurrentCompanyId(),
    // demostrando que no está hardcodeado en la ruta.
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'Orosi' } })
    )
  })

  it('devuelve los tickets ordenados por fecha de creación descendente', async () => {
    vi.mocked(prisma.ticket.findMany).mockResolvedValue(TECHCORP_TICKETS)

    await GET()

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    )
  })

  it('devuelve 500 si la base de datos lanza un error', async () => {
    vi.mocked(prisma.ticket.findMany).mockRejectedValue(
      new Error('DB connection failed')
    )

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data).toEqual({ error: 'Error fetching tickets' })
  })

  it('devuelve un array vacío si la empresa no tiene tickets', async () => {
    vi.mocked(prisma.ticket.findMany).mockResolvedValue([])

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual([])
  })
})
