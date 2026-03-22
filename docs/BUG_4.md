# Bug 4 — Fuga de datos entre empresas (Data Tenant Leak)

## Resumen

Un usuario autenticado como empleado de **TechCorp** podía ver los tickets de soporte de **otras empresas** (ej. Orosi) sin ningún tipo de restricción. El endpoint `GET /api/tickets` devolvía todos los registros de la base de datos sin filtrar por empresa.

---

## Clasificación

| Atributo | Valor |
|---|---|
| Tipo | Broken Object Level Authorization (BOLA / IDOR) |
| Severidad | **Crítica** — exposición de datos confidenciales entre clientes |
| Archivo afectado | `src/app/api/tickets/route.ts` |
| Referencia OWASP | [API1:2023 – Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) |

---

## Descripción del bug

### Código original

```ts
// src/app/api/tickets/route.ts (ANTES)
const tickets = await prisma.ticket.findMany({
  orderBy: { createdAt: 'desc' },
  // Sin cláusula `where` → devuelve TODOS los tickets de la DB
})
```

La consulta a Prisma no incluía ningún filtro. Dado que la base de datos contiene tickets de múltiples empresas (`TechCorp`, `Orosi`, etc.), la respuesta siempre incluía todos los registros independientemente de qué usuario hiciera la petición.

### ¿Por qué es crítico?

En arquitecturas multi-tenant (donde una misma aplicación sirve a múltiples clientes), **la separación de datos entre tenants es un requisito de seguridad fundamental**. Una fuga así puede:

- Exponer información comercial confidencial de los clientes.
- Violar regulaciones de privacidad (GDPR, CCPA, etc.).
- Generar pérdida de confianza y responsabilidad legal para la empresa.

---

## Solución implementada

### Principio aplicado

> **Cada consulta a la base de datos debe estar acotada al scope del usuario autenticado.** El backend nunca debe confiar en que el frontend "ya filtra" los datos.

### Cambios realizados

#### 1. `src/lib/auth.ts` (nuevo)

Se creó una capa de autenticación centralizada que devuelve el `companyId` del usuario en sesión. Esto desacopla la lógica de resolución de la identidad de la lógica de negocio.

```ts
// src/lib/auth.ts
export function getCurrentCompanyId(): string {
  // En producción: reemplazar con getServerSession() o equivalente
  return 'TechCorp'
}
```

**¿Por qué un módulo separado y no hardcodear `'TechCorp'` en la ruta?**

- **Única fuente de verdad:** si mañana se integra NextAuth, solo cambia `auth.ts`.
- **Testeable:** los tests pueden mockear `getCurrentCompanyId()` para simular distintos usuarios.
- **Principio de responsabilidad única:** la ruta no debe saber cómo se resuelve la identidad, solo consumirla.

#### 2. `src/app/api/tickets/route.ts` (modificado)

```ts
// ANTES
const tickets = await prisma.ticket.findMany({
  orderBy: { createdAt: 'desc' },
})

// DESPUÉS
import { getCurrentCompanyId } from '@/lib/auth'

const companyId = getCurrentCompanyId()
const tickets = await prisma.ticket.findMany({
  where: { companyId }, // ← filtro obligatorio
  orderBy: { createdAt: 'desc' },
})
```

El filtro ocurre **en la base de datos** (cláusula `WHERE` en SQL), no en memoria después de traer todos los registros. Esto es importante por dos razones:

1. **Seguridad:** datos de otras empresas nunca llegan al servidor de aplicación.
2. **Rendimiento:** la DB solo transfiere los registros necesarios.

---

## Tests

Se agregó cobertura en `src/app/api/tickets/__tests__/route.test.ts` con los siguientes casos:

| Test | Qué verifica |
|---|---|
| `devuelve únicamente los tickets de la empresa en sesión` | Happy path con filtro correcto |
| `no filtra tickets de otras empresas` | No hay fuga de datos de Orosi |
| `usa el companyId de la capa de auth, no un valor hardcodeado` | El filtro es dinámico, no fijo |
| `devuelve los tickets ordenados por fecha descendente` | El ordering no se rompió |
| `devuelve 500 si la base de datos lanza un error` | Manejo de error intacto |
| `devuelve un array vacío si la empresa no tiene tickets` | Edge case de empresa sin tickets |

### Ejecutar los tests

```bash
npm install    # primera vez (instala vitest)
npm test       # ejecución única
npm run test:watch  # modo watch durante desarrollo
```

---

## Vulnerabilidad relacionada (no cubierta en este ticket)

El endpoint `PATCH /api/tickets/[id]` tampoco verifica que el ticket a actualizar pertenezca a la empresa del usuario autenticado. Un usuario malintencionado podría construir una petición manual para modificar tickets de otras empresas si conoce el `id`.

**Recomendación:** agregar la siguiente verificación en `src/app/api/tickets/[id]/route.ts`:

```ts
const companyId = getCurrentCompanyId()
if (ticket.companyId !== companyId) {
  return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
}
```

---

## Archivos modificados / creados

```
src/
  lib/
    auth.ts                              ← nuevo: capa de auth simulada
  app/
    api/
      tickets/
        route.ts                         ← fix: añade filtro where: { companyId }
        __tests__/
          route.test.ts                  ← nuevo: 6 tests del endpoint GET

vitest.config.ts                         ← nuevo: configuración de Vitest
package.json                             ← modificado: scripts test / test:watch + vitest dep
docs/
  BUG_4.md                              ← este archivo
```
