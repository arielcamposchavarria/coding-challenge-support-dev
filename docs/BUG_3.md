# Bug 3 — Promise que nunca se resuelve bloquea tickets urgentes

## Resumen

Al intentar marcar como **Resuelto** un ticket de prioridad **Urgente**, el sistema se quedaba cargando indefinidamente. El endpoint `PATCH /api/tickets/[id]` nunca enviaba respuesta al cliente porque ejecutaba `await` sobre una Promise que jamás llamaba a `resolve()`.

---

## Clasificación

| Atributo | Valor |
|---|---|
| Tipo | Liveness bug — Promise que nunca se asienta (never-settling Promise) |
| Severidad | **Alta** — funcionalidad crítica completamente bloqueada |
| Archivos afectados | `src/app/api/tickets/[id]/route.ts` |
| Síntoma observable | El spinner de "Resolviendo..." en la UI gira para siempre en tickets urgentes |

---

## Descripción del bug

### Código original

```ts
// src/app/api/tickets/[id]/route.ts (ANTES)
async function sendEmailNotification(ticketId: string, companyId: string) {
  return new Promise((resolve) => {
    console.log(`Enviando notificación urgente para el ticket ${ticketId}...`)
    // ← resolve() NUNCA es llamado
  })
}

// En el handler:
if (ticket.priority === 'Urgente' && status === 'Resuelto') {
  await sendEmailNotification(ticket.id, ticket.companyId) // ← cuelga aquí
}
```

### ¿Por qué cuelga?

El constructor `new Promise((resolve, reject) => { ... })` requiere que el callback llame a `resolve()` o `reject()` para que la Promise se asiente (*settle*). Si ninguno es llamado, la Promise permanece en estado **pending** para siempre.

Cuando el handler ejecuta `await` sobre esa Promise pendiente, Node.js suspende la corrutina sin posibilidad de reanudarla. El servidor no envía respuesta, el cliente espera hasta que agota su timeout (o el usuario recarga la página).

```
Cliente          Servidor (Node.js)
  |                     |
  | PATCH /tickets/tc-1 |
  |-------------------->|
  |                     | findUnique() ✓
  |                     | await sendEmailNotification() ← cuelga
  |                     |    Promise: pending... pending... pending...
  |   (timeout)         |
  |<--------------------| (sin respuesta)
```

---

## Solución implementada

El fix tiene **dos partes complementarias**:

### Parte 1 — Corregir la Promise

Se extrae `sendEmailNotification` a `src/lib/notifications.ts` como función `async` que resuelve correctamente. Usar `async function` es equivalente a devolver una Promise que se resuelve cuando la función termina, sin necesidad de gestionar `resolve`/`reject` manualmente.

```ts
// src/lib/notifications.ts (DESPUÉS)
export async function sendEmailNotification(
  ticketId: string,
  companyId: string
): Promise<void> {
  // async function → se resuelve sola cuando el cuerpo termina
  console.log(`Notificación enviada — ticket: ${ticketId}, empresa: ${companyId}`)
  // En producción: await resend.emails.send({ ... })
}
```

### Parte 2 — Fire-and-forget (no bloquear la respuesta HTTP)

Incluso con una Promise que resuelve correctamente, hacer `await` en el envío de un correo es una mala práctica:

- El correo es un **efecto secundario**, no la operación principal.
- Ata el tiempo de respuesta al tiempo del proveedor de correo (latencia de red, downtime del servicio).
- Un fallo en el correo haría fallar la actualización del ticket desde la perspectiva del cliente.

La solución correcta es **fire-and-forget**: lanzar la notificación sin `await` y manejar errores con `.catch()`.

```ts
// src/app/api/tickets/[id]/route.ts (DESPUÉS)
if (ticket.priority === 'Urgente' && status === 'Resuelto') {
  // Sin await: la respuesta HTTP no espera al correo.
  // .catch() evita "unhandled promise rejection" si el envío falla.
  sendEmailNotification(ticket.id, ticket.companyId).catch((err) =>
    console.error(`Error al enviar notificación para ticket ${ticket.id}:`, err)
  )
}

// La actualización ocurre inmediatamente, sin esperar al correo.
const updatedTicket = await prisma.ticket.update(...)
return NextResponse.json(updatedTicket) // ← responde al cliente
```

### ¿Por qué extraer a un módulo separado?

`sendEmailNotification` vivía como función local no exportada, lo que la hacía imposible de mockear en tests. Al moverla a `src/lib/notifications.ts`:

- Los tests pueden hacer `vi.mock('@/lib/notifications')`.
- El día que se cambie de proveedor de correo, sólo cambia un archivo.
- La ruta no conoce los detalles de implementación del envío.

---

## Comparativa antes / después

```
ANTES (bug activo)                    DESPUÉS (fix)
─────────────────────────────────     ─────────────────────────────────
PATCH /tickets/tc-1 (Urgente)         PATCH /tickets/tc-1 (Urgente)
  findUnique() .............. ✓         findUnique() .............. ✓
  await sendEmail() ......... ∞         sendEmail().catch() ....... → (async, no bloquea)
  [cuelga indefinidamente]              update() .................. ✓
                                        return 200 ................ ✓
```

---

## Tests

Se agregó cobertura en `src/app/api/tickets/[id]/__tests__/route.test.ts`:

| Test | Qué verifica |
|---|---|
| `resuelve un ticket urgente sin bloquearse` | El `await` ya no cuelga (regresión del Bug 3) |
| `dispara la notificación al resolver un ticket urgente` | Se llama con los argumentos correctos |
| `completa la actualización aunque la notificación falle` | El `.catch()` aísla el fallo del correo |
| `resuelve un ticket normal sin disparar notificación` | Solo tickets urgentes activan el correo |
| `no dispara notificación si el estado no es Resuelto` | Condicional `priority + status` funciona |
| `devuelve 404 si el ticket no existe` | Manejo del not-found intacto |
| `devuelve 500 si la base de datos lanza un error` | Manejo del error de DB intacto |

---

## Archivos modificados / creados

```
src/
  lib/
    notifications.ts                          ← nuevo: servicio de notificaciones
  app/
    api/
      tickets/
        [id]/
          route.ts                            ← fix: fire-and-forget + import notifications
          __tests__/
            route.test.ts                     ← nuevo: 7 tests del endpoint PATCH

docs/
  BUG_3.md                                   ← este archivo
```
