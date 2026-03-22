import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentCompanyId } from '@/lib/auth'

/**
 * GET /api/tickets
 *
 * Devuelve únicamente los tickets que pertenecen a la empresa del usuario
 * autenticado. Anteriormente la consulta carecía de cláusula `where`, lo que
 * provocaba que se retornaran todos los tickets de la base de datos, incluidos
 * los de otras empresas (Bug 4 — fuga de datos entre tenants).
 *
 * Fix: se obtiene el companyId desde la capa de autenticación y se usa como
 * filtro obligatorio en la consulta a Prisma.
 */
export async function GET() {
  try {
    // Obtenemos el companyId del usuario en sesión a través de la capa de auth.
    // Esto garantiza que el filtro siempre refleje la empresa correcta y que
    // el valor nunca quede hardcodeado en la lógica de negocio.
    const companyId = getCurrentCompanyId()

    const tickets = await prisma.ticket.findMany({
      where: { companyId }, // ← fix: acota la consulta a la empresa del usuario
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(tickets)
  } catch (error) {
    console.error('Error fetching tickets:', error)
    return NextResponse.json({ error: 'Error fetching tickets' }, { status: 500 })
  }
}
