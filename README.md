# Coding Challenge: Soporte TechCorp 🚨

¡Hola! Gracias por aplicar. Para esta prueba técnica, queremos simular un escenario real de nuestro día a día. No hay requerimientos abstractos, sino un problema real de soporte que debes resolver.

Se evaluará tu capacidad para:
- Entender código existente (Node.js, React/Next.js, Tailwind).
- Utilizar herramientas de IA (Claude, Cursor, Gemini, etc.) para acelerar tu diagnóstico y resolución.
- Priorizar tareas críticas bajo presión.
- Mantener el orden y las buenas prácticas al corregir bugs.

## El Contexto

Acabas de iniciar tu día y recibes el siguiente mensaje por Slack de José (Project Manager):

> **De:** José
> **Para:** Equipo de Soporte
> 
> "Hola chicos, buenos días. Les paso contexto de unos inconvenientes urgentes que tenemos en la plataforma de TechCorp. Austin (del cliente) me indica que no puede ingresar a resolver los tickets desde su celular, el botón de 'Resolver' simplemente no le hace nada. 
>
> Además, al parecer están teniendo que recargar toda la página para ver cuando un ticket cambia de estado. Es un tema urgente porque las personas de soporte de ellos no pueden gestionar los casos marcados como 'Urgente', dicen que el sistema se queda cargando y nunca termina. Ya estoy creando los tickets en Jira.
> 
> Y por último, y esto es lo más crítico: me acaban de confirmar que un usuario pudo ver los tickets de OTRA empresa. Necesitamos revisar qué está interfiriendo ahí con la base de datos o el servicio, no podemos tener esa fuga de datos.
>
> Me confirman cuando lo tengan listo para coordinar pruebas finales con ellos. Mil gracias."

## Tu Misión

1. Clona este repositorio e instala las dependencias (`npm install`).
2. Levanta la base de datos local poblada de prueba (`npm run db:setup`) y el servidor (`npm run dev`).
3. Identifica y resuelve los 4 problemas mencionados por José en su mensaje.
4. Sube tu código a un repositorio público (GitHub/GitLab) y envíanos el enlace.

**Nota:** Tienes total libertad de usar herramientas de IA para apoyarte. Lo que nos importa es cómo analizas el problema, cómo guías a la IA y la calidad de la solución final. ¡Éxitos!

---

## Solución

Los 4 bugs fueron identificados y resueltos. A continuación un resumen de cada uno, los archivos modificados y dónde encontrar la documentación detallada.

---

### Bug 1 — Footer fijo en móvil tapa el botón "Resolver"

**Síntoma:** En dispositivos móviles el botón "Resolver Ticket" del último ticket era imposible de pulsar porque el footer de navegación fijo lo cubría.

**Fix:** Se agregó `pb-20 md:pb-0` al contenedor principal de la página para reservar espacio equivalente a la altura del footer en móvil y anularlo en desktop (donde el footer está oculto con `md:hidden`).

| Tipo | Archivo |
|---|---|
| Fix | `src/app/page.tsx` |
| Tests | `src/app/__tests__/page.test.tsx` |
| Documentación | [`docs/BUG_1.md`](docs/BUG_1.md) |

---

### Bug 2 — Mutación de estado de React impide actualización de la UI

**Síntoma:** Al resolver un ticket la UI no se actualizaba. El ticket seguía mostrándose como "Abierto" hasta que el usuario recargaba la página manualmente.

**Fix:** Se reemplazó la mutación directa del array de estado (`tickets[i] = x`) por un updater funcional inmutable (`setTickets(prev => prev.map(...))`). `Array.map()` crea una nueva referencia que React detecta como cambio de estado y dispara el re-render.

| Tipo | Archivo |
|---|---|
| Fix | `src/app/page.tsx` |
| Tests | `src/app/__tests__/page.test.tsx` |
| Documentación | [`docs/BUG_2.md`](docs/BUG_2.md) |

---

### Bug 3 — Promise sin resolver congela las requests de tickets urgentes

**Síntoma:** Marcar como "Resuelto" un ticket de prioridad Urgente dejaba la request colgada indefinidamente. El spinner de "Resolviendo..." giraba para siempre.

**Fix (dos partes):**
1. `sendEmailNotification` se extrajo a `src/lib/notifications.ts` como función `async` que resuelve correctamente (una `async function` settle sola al terminar su cuerpo).
2. Se invoca con **fire-and-forget** (sin `await`) para que el envío del correo no bloquee la respuesta HTTP. Los errores se capturan con `.catch()`.

| Tipo | Archivo |
|---|---|
| Fix | `src/app/api/tickets/[id]/route.ts` |
| Nuevo módulo | `src/lib/notifications.ts` |
| Tests | `src/app/api/tickets/[id]/__tests__/route.test.ts` |
| Documentación | [`docs/BUG_3.md`](docs/BUG_3.md) |

---

### Bug 4 — Fuga de datos entre empresas (Data Tenant Leak)

**Síntoma:** Un usuario de TechCorp podía ver los tickets de otras empresas (Orosi, etc.). El endpoint `GET /api/tickets` devolvía todos los registros de la base de datos sin filtrar.

**Fix:** Se agrega `where: { companyId }` a la consulta de Prisma, obteniendo el `companyId` desde una capa de autenticación centralizada (`src/lib/auth.ts`) en lugar de hardcodearlo en la ruta.

| Tipo | Archivo |
|---|---|
| Fix | `src/app/api/tickets/route.ts` |
| Nuevo módulo | `src/lib/auth.ts` |
| Tests | `src/app/api/tickets/__tests__/route.test.ts` |
| Documentación | [`docs/BUG_4.md`](docs/BUG_4.md) |

---

## Archivos nuevos o modificados

```
src/
  app/
    page.tsx                                   ← fix Bug 1 + Bug 2
    __tests__/
      page.test.tsx                            ← tests Bug 1 + Bug 2
    api/
      tickets/
        route.ts                               ← fix Bug 4
        __tests__/
          route.test.ts                        ← tests Bug 4
        [id]/
          route.ts                             ← fix Bug 3
          __tests__/
            route.test.ts                      ← tests Bug 3
  lib/
    auth.ts                                    ← nuevo: capa de auth simulada (Bug 4)
    notifications.ts                           ← nuevo: servicio de notificaciones (Bug 3)

docs/
  BUG_1.md                                     ← documentación Bug 1
  BUG_2.md                                     ← documentación Bug 2
  BUG_3.md                                     ← documentación Bug 3
  BUG_4.md                                     ← documentación Bug 4

vitest.config.ts                               ← configuración de tests
vitest.setup.ts                                ← setup global de jest-dom
package.json                                   ← dependencias de testing agregadas
```

## Comandos

```bash
npm install          # instalar dependencias (incluye las de testing)
npm run db:setup     # crear y poblar la base de datos local
npm run dev          # levantar el servidor de desarrollo
npm test             # correr todos los tests
npm run test:watch   # tests en modo watch
```
