// @vitest-environment jsdom
// Extends TypeScript's Assertion type with @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveClass, toBeDisabled, etc.).
// Required because tsconfig doesn't include jest-dom in its "types" array.
/// <reference types="@testing-library/jest-dom" />
/**
 * Tests para el componente Dashboard (src/app/page.tsx)
 *
 * Cubre dos bugs del componente:
 *
 *  Bug 1 — El footer fijo en móvil tapa el botón "Resolver" del último ticket.
 *    Fix: padding inferior (pb-20 md:pb-0) en el contenedor principal.
 *    Tests: verifican que las clases de layout correctas estén presentes.
 *    Nota: jsdom no ejecuta CSS real, por lo que no puede simular solapamiento
 *    visual. Los tests de layout verifican la estructura (clases Tailwind) que
 *    produce el comportamiento correcto en un navegador real. Las pruebas de
 *    solapamiento pixel-perfect corresponden a tests E2E (Playwright/Cypress).
 *
 *  Bug 2 — Mutación directa del estado de React impide actualización de la UI.
 *    Fix: setTickets con updater funcional + Array.map() para crear nuevo array.
 *    Tests: verifican que la UI se actualice sin recargar la página.
 *
 * Estrategia general:
 *  - fetch se mockea globalmente para controlar las respuestas de la API.
 *  - @testing-library/react renderiza el componente real.
 *  - @testing-library/user-event simula interacciones del usuario.
 *  - Los tests validan comportamiento observable, no detalles de implementación.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import Dashboard from '../page'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OPEN_TICKET = {
  id: 'tc-1',
  title: 'El dashboard no carga',
  description: 'Se queda en blanco al iniciar sesión.',
  status: 'Abierto',
  priority: 'Normal',
  companyId: 'TechCorp',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const RESOLVED_TICKET = { ...OPEN_TICKET, status: 'Resuelto' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Configura el mock de fetch para la secuencia estándar de la prueba:
 *  1. GET /api/tickets  → devuelve la lista de tickets
 *  2. PATCH /api/tickets/:id → devuelve el ticket actualizado
 */
function mockFetchSequence(
  initialTickets: typeof OPEN_TICKET[],
  patchResponse: typeof OPEN_TICKET
) {
  vi.stubGlobal(
    'fetch',
    vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => initialTickets,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => patchResponse,
      })
  )
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  // Restauramos fetch global para no contaminar otros tests.
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard — Bug 2: actualización de estado sin recarga', () => {
  it('muestra el ticket como Resuelto en la UI inmediatamente tras hacer clic en Resolver', async () => {
    mockFetchSequence([OPEN_TICKET], RESOLVED_TICKET)

    render(<Dashboard />)

    // Esperamos que el ticket cargue (loading state → tickets visibles).
    await waitFor(() => {
      expect(screen.getByText('El dashboard no carga')).toBeInTheDocument()
    })

    // El ticket está abierto: debe mostrar el botón de acción.
    const resolveButton = screen.getByRole('button', { name: /resolver ticket/i })
    expect(resolveButton).toBeInTheDocument()

    // Simulamos el clic del usuario.
    await userEvent.click(resolveButton)

    // La UI debe actualizarse sin recarga: el ticket ahora muestra "Resuelto".
    // Si el bug estuviera activo (mutación del estado), React no re-renderizaría
    // y este waitFor fallaría por timeout.
    await waitFor(() => {
      expect(screen.getByText('Resuelto')).toBeInTheDocument()
    })

    // El botón "Resolver Ticket" ya no debe existir (ticket resuelto).
    expect(
      screen.queryByRole('button', { name: /resolver ticket/i })
    ).not.toBeInTheDocument()
  })

  it('deshabilita el botón mientras la petición PATCH está en curso', async () => {
    // Retrasamos la respuesta del PATCH para poder observar el estado intermedio.
    let resolvePatch!: (value: unknown) => void
    const patchPromise = new Promise((resolve) => { resolvePatch = resolve })

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => [OPEN_TICKET] })
        .mockReturnValueOnce(patchPromise)
    )

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('El dashboard no carga')).toBeInTheDocument()
    })

    const resolveButton = screen.getByRole('button', { name: /resolver ticket/i })
    await userEvent.click(resolveButton)

    // Mientras el PATCH está pendiente, el botón debe estar deshabilitado.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resolviendo/i })).toBeDisabled()
    })

    // Resolvemos el PATCH y verificamos que la UI se actualiza.
    resolvePatch({ ok: true, json: async () => RESOLVED_TICKET })

    await waitFor(() => {
      expect(screen.getByText('Resuelto')).toBeInTheDocument()
    })
  })

  it('mantiene el ticket como Abierto si la API responde con error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => [OPEN_TICKET] })
        .mockResolvedValueOnce({ ok: false })
    )

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('El dashboard no carga')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /resolver ticket/i }))

    // Después de un PATCH fallido, el ticket debe seguir mostrándose como Abierto.
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /resolver ticket/i })
      ).toBeInTheDocument()
    })
  })

  it('muestra el spinner de carga mientras obtiene los tickets iniciales', async () => {
    let resolveGet!: (value: unknown) => void
    const getPromise = new Promise((resolve) => { resolveGet = resolve })

    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(getPromise))

    render(<Dashboard />)

    // Durante la carga inicial debe mostrar el spinner (no los tickets).
    expect(screen.queryByText('El dashboard no carga')).not.toBeInTheDocument()

    // Resolvemos el GET para terminar la carga.
    resolveGet({ ok: true, json: async () => [OPEN_TICKET] })

    await waitFor(() => {
      expect(screen.getByText('El dashboard no carga')).toBeInTheDocument()
    })
  })

  it('muestra el mensaje vacío cuando no hay tickets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    }))

    render(<Dashboard />)

    await waitFor(() => {
      expect(
        screen.getByText(/no hay tickets pendientes/i)
      ).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Bug 1: footer fijo en móvil tapa el botón "Resolver"
// ---------------------------------------------------------------------------

describe('Dashboard — Bug 1: layout móvil con footer fijo', () => {
  // Helper compartido: renderiza el Dashboard con un ticket cargado.
  async function renderWithTicket() {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [OPEN_TICKET],
    }))
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('El dashboard no carga')).toBeInTheDocument()
    })
  }

  it('el contenedor principal tiene pb-20 para reservar espacio bajo el footer móvil', async () => {
    await renderWithTicket()

    // pb-20 empuja el contenido hacia arriba exactamente la altura del footer fijo,
    // evitando que el último ticket quede oculto tras él en móvil.
    const wrapper = screen.getByTestId('page-wrapper')
    expect(wrapper).toHaveClass('pb-20')
  })

  it('el contenedor principal tiene md:pb-0 para cancelar el padding en desktop', async () => {
    await renderWithTicket()

    // En desktop el footer no se muestra (md:hidden), por lo que el padding
    // extra no debe existir y el espacio se aprovecha completamente.
    const wrapper = screen.getByTestId('page-wrapper')
    expect(wrapper).toHaveClass('md:pb-0')
  })

  it('el footer móvil está posicionado como fixed en la parte inferior', async () => {
    await renderWithTicket()

    // El footer debe ser fixed y pegarse al bottom para que pb-20 sea suficiente.
    const footer = screen.getByTestId('mobile-footer')
    expect(footer).toHaveClass('fixed')
    expect(footer).toHaveClass('bottom-0')
  })

  it('el footer móvil tiene md:hidden para ocultarse en pantallas grandes', async () => {
    await renderWithTicket()

    // md:hidden garantiza que el padding de compensación (md:pb-0) y la
    // visibilidad del footer estén siempre sincronizados.
    const footer = screen.getByTestId('mobile-footer')
    expect(footer).toHaveClass('md:hidden')
  })
})
