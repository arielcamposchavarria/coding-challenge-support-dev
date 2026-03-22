# Bug 2 — Mutación de estado de React impide actualización de la UI

## Resumen

Al hacer clic en "Resolver Ticket", el sistema enviaba la petición correctamente y la base de datos se actualizaba, pero **la UI no reflejaba el cambio**. El ticket seguía mostrándose como "Abierto" hasta que el usuario recargaba la página manualmente.

---

## Clasificación

| Atributo | Valor |
|---|---|
| Tipo | State mutation bug — violación del modelo de datos inmutables de React |
| Severidad | **Alta** — el flujo principal de trabajo de los agentes de soporte queda roto |
| Archivo afectado | `src/app/page.tsx` |
| Síntoma observable | El botón "Resolver Ticket" no desaparece y el estado no cambia a "Resuelto" |

---

## Descripción del bug

### Código original

```tsx
// src/app/page.tsx (ANTES)
const ticketIndex = tickets.findIndex((t) => t.id === updatedTicket.id)
if (ticketIndex !== -1) {
  tickets[ticketIndex] = updatedTicket   // ← MUTACIÓN directa del array
  setTickets(tickets)                    // ← misma referencia, React ignora el cambio
}
```

### ¿Por qué React no re-renderiza?

React usa `Object.is()` para comparar el valor anterior del estado con el nuevo antes de decidir si re-renderizar un componente.

```
Object.is(tickets, tickets) → true  (es la misma referencia en memoria)
```

Cuando mutamos `tickets[ticketIndex]` y luego llamamos `setTickets(tickets)`, React recibe **la misma referencia de array**. Aunque su contenido interno cambió, el puntero de memoria es idéntico. React concluye que no hay cambio y **cancela el re-render**.

```
Estado anterior: tickets  (referencia: 0x1A2B)
                   └── [0]: { id: 'tc-1', status: 'Abierto' }  ← mutado a 'Resuelto'

Nuevo estado:   tickets  (referencia: 0x1A2B)  ← ¡mismo puntero!

Object.is(0x1A2B, 0x1A2B) → true → React hace bail-out del re-render
```

La base de datos sí se actualiza correctamente (la petición PATCH funciona), pero la interfaz queda desincronizada hasta que se recarga la página, lo que fuerza una nueva llamada al GET.

---

## Solución implementada

### Principio: inmutabilidad del estado

En React, **el estado debe tratarse como inmutable**. La forma correcta de actualizar un elemento dentro de un array es crear un array nuevo con el elemento reemplazado.

### Código corregido

```tsx
// src/app/page.tsx (DESPUÉS)
setTickets((prev) =>
  prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t))
)
```

`Array.map()` siempre devuelve un **nuevo array** con una referencia diferente:

```
Estado anterior: prevTickets  (referencia: 0x1A2B)
Nuevo estado:    newTickets   (referencia: 0x3C4D)  ← referencia nueva

Object.is(0x1A2B, 0x3C4D) → false → React programa el re-render ✓
```

### ¿Por qué la forma funcional `(prev => ...)`?

Se usa `setTickets((prev) => prev.map(...))` en lugar de `setTickets(tickets.map(...))` por una razón importante:

El `handleResolve` es una función `async`. Entre el momento en que empieza y el momento en que llega la respuesta del PATCH, **el estado `tickets` podría haber cambiado** (si otro update llegó antes, si React hizo batching, etc.). La forma funcional recibe siempre el valor más reciente del estado (`prev`), evitando race-conditions y actualizaciones sobre datos obsoletos (stale closure).

```
// ❌ Puede usar un `tickets` stale (del closure en el momento del render)
setTickets(tickets.map((t) => ...))

// ✓ Siempre usa el estado más reciente en el momento de aplicar el update
setTickets((prev) => prev.map((t) => ...))
```

---

## Comparativa antes / después

```
ANTES                                    DESPUÉS
─────────────────────────────────────    ──────────────────────────────────────
Usuario hace clic en "Resolver"          Usuario hace clic en "Resolver"
  PATCH /api/tickets/tc-1 ......... ✓     PATCH /api/tickets/tc-1 ......... ✓
  tickets[0] = updatedTicket (mutación)   setTickets(prev => prev.map(...))
  setTickets(tickets) → misma ref         → nuevo array, nueva referencia
  React: Object.is() → true → skip        React: Object.is() → false → re-render
  UI: sigue mostrando "Abierto" ✗         UI: muestra "Resuelto" ✓
```

---

## Tests

Se agregó cobertura en `src/app/__tests__/page.test.tsx` con los siguientes casos:

| Test | Qué verifica |
|---|---|
| `muestra el ticket como Resuelto inmediatamente` | Re-render tras resolver (regresión del Bug 2) |
| `deshabilita el botón mientras el PATCH está en curso` | Estado de carga intermedio |
| `mantiene el ticket como Abierto si la API responde con error` | Rollback ante fallo de red |
| `muestra el spinner de carga inicial` | Estado de loading al montar |
| `muestra el mensaje vacío cuando no hay tickets` | Edge case de lista vacía |

El test crítico es el primero: si el bug estuviera activo, el `waitFor` de "Resuelto" agoraría su timeout y el test fallaría, validando que la corrección es necesaria.

### Ejecutar los tests

```bash
npm install    # instala @testing-library/react, user-event, jest-dom
npm test
```

---

## Archivos modificados / creados

```
src/
  app/
    page.tsx                              ← fix: setTickets con updater funcional + map
    __tests__/
      page.test.tsx                       ← nuevo: 5 tests del componente Dashboard

vitest.config.ts                          ← modificado: agrega setupFiles
vitest.setup.ts                           ← nuevo: importa @testing-library/jest-dom
package.json                              ← modificado: agrega 3 dependencias de testing

docs/
  BUG_2.md                               ← este archivo
```
