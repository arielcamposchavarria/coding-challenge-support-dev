"use client"

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle, Clock } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

// Definición simple del tipo Ticket basado en nuestro modelo Prisma
type Ticket = {
  id: string
  title: string
  description: string
  status: string
  priority: string
  companyId: string
  createdAt: string
  updatedAt: string
}

export default function Dashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  useEffect(() => {
    fetchTickets()
  }, [])

  const fetchTickets = async () => {
    try {
      const res = await fetch("/api/tickets")
      const data = await res.json()
      setTickets(data)
    } catch (error) {
      console.error("Error fetching tickets:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async (ticket: Ticket) => {
    if (ticket.status === "Resuelto") return
    
    setResolvingId(ticket.id)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Resuelto" }),
      })

      if (res.ok) {
        const updatedTicket = await res.json()

        // Fix Bug 2: nunca mutar el array de estado directamente.
        //
        // React detecta cambios de estado por referencia (Object.is). Si mutamos
        // el array existente y llamamos setTickets con la misma referencia, React
        // considera que el estado no cambió y omite el re-render: la UI se queda
        // congelada hasta que el usuario recarga la página.
        //
        // prev.map() siempre devuelve un array nuevo → React detecta el cambio
        // y vuelve a renderizar la UI de inmediato.
        //
        // Se usa la forma funcional (prev => ...) en lugar de capturar `tickets`
        // del closure para evitar race-conditions si hay múltiples actualizaciones
        // en vuelo al mismo tiempo.
        setTickets((prev) =>
          prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t))
        )
      }
    } catch (error) {
      console.error("Error resolving ticket:", error)
    } finally {
      setResolvingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    // Fix Bug 1: pb-20 reserva espacio en móvil igual a la altura del footer fijo,
    // evitando que éste tape el último ticket y su botón "Resolver".
    // md:pb-0 elimina ese espacio en desktop donde el footer no se muestra (md:hidden).
    <div data-testid="page-wrapper" className="min-h-screen bg-gray-50 relative pb-20 md:pb-0">
      
      {/* Header Fijo */}
      <header className="bg-blue-600 text-white shadow-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">TechCorp Soporte</h1>
          <span className="text-sm bg-blue-700 px-3 py-1 rounded-full">Usuario Actual: Admin</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-6 flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Tickets Asignados</h2>
            <p className="text-gray-500">Gestiona las solicitudes de los clientes.</p>
          </div>
        </div>

        <div className="space-y-4">
          {tickets.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-lg shadow-sm border border-gray-100 text-gray-500">
              No hay tickets pendientes. ¡Buen trabajo!
            </div>
          ) : (
            tickets.map((ticket) => (
              <div 
                key={ticket.id} 
                className={`bg-white rounded-lg shadow-sm border p-5 transition-colors ${
                  ticket.status === "Resuelto" ? "border-green-200 bg-green-50/30" : "border-gray-200"
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex gap-2 items-center">
                    {ticket.priority === "Urgente" ? (
                      <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        <AlertCircle className="w-3 h-3" />
                        URGENTE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        NORMAL
                      </span>
                    )}
                    <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">
                      {ticket.companyId}
                    </span>
                  </div>
                  
                  {ticket.status === "Resuelto" ? (
                    <span className="flex items-center text-green-600 text-sm font-medium gap-1">
                      <CheckCircle className="w-4 h-4" />
                      Resuelto
                    </span>
                  ) : (
                    <span className="flex items-center text-orange-500 text-sm font-medium gap-1">
                      <Clock className="w-4 h-4" />
                      Abierto
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-1">{ticket.title}</h3>
                <p className="text-gray-600 text-sm mb-4">{ticket.description}</p>

                <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    Creado hace {formatDistanceToNow(new Date(ticket.createdAt), { locale: es })}
                  </span>
                  
                  {ticket.status !== "Resuelto" && (
                    <button
                      onClick={() => handleResolve(ticket)}
                      disabled={resolvingId === ticket.id}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {resolvingId === ticket.id ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          Resolviendo...
                        </>
                      ) : (
                        "Resolver Ticket"
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Footer de navegación móvil — solo visible en pantallas pequeñas (md:hidden) */}
      <div data-testid="mobile-footer" className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] p-4 flex justify-around items-center z-50">
        <div className="flex flex-col items-center text-blue-600">
          <Clock className="w-6 h-6 mb-1" />
          <span className="text-xs font-medium">Pendientes</span>
        </div>
        <div className="flex flex-col items-center text-gray-400 hover:text-gray-600 transition-colors">
          <CheckCircle className="w-6 h-6 mb-1" />
          <span className="text-xs font-medium">Resueltos</span>
        </div>
      </div>

    </div>
  )
}
