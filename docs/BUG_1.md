# Bug 1 — Footer fijo en móvil tapa el botón "Resolver Ticket"

## Resumen

En dispositivos móviles, la barra de navegación inferior (fixed footer) se solapaba
visualmente con el último ticket de la lista. El botón "Resolver Ticket" quedaba
**físicamente debajo del footer** y era imposible de pulsar: existía en el DOM pero
los eventos de clic los interceptaba el footer, no el botón.

---

## Clasificación

| Atributo | Valor |
|---|---|
| Tipo | Layout bug — elemento fixed sin espacio de compensación en el scroll container |
| Severidad | **Alta** — bloquea la acción principal de los agentes de soporte en móvil |
| Archivo afectado | `src/app/page.tsx` |
| Síntoma observable | El botón "Resolver Ticket" del último ticket no responde al toque en móvil |

---

## Descripción del bug

### Estructura del layout (antes del fix)

```
┌─────────────────────────────┐  ← header sticky (top)
│  TechCorp Soporte           │
├─────────────────────────────┤
│  Ticket 1                   │
│  [Resolver Ticket]  ✓       │
├─────────────────────────────┤
│  Ticket 2                   │
│  [Resolver Ticket]  ✓       │
├─────────────────────────────┤
│  Ticket 3  ← último ticket  │
│  descripción...             │
│  [Resolver Ticket] ← OCULTO │  ← el botón existe pero está debajo del footer
├═════════════════════════════╡  ← footer fixed (bottom), z-index: 50
│  🕐 Pendientes  ✓ Resueltos │
└─────────────────────────────┘
```

### Código original

```tsx
// src/app/page.tsx (ANTES)
<div className="min-h-screen bg-gray-50 relative">
  {/* ...contenido... */}

  {/* Footer fixed que flota sobre el contenido */}
  <div className="md:hidden fixed bottom-0 left-0 right-0 ... z-50">
```

El footer tiene `position: fixed; bottom: 0`, lo que lo saca del flujo normal del
documento. El contenedor principal (`min-h-screen`) no reserva ningún espacio para
compensar esa altura: el contenido llega hasta el fondo de la pantalla y el footer
lo tapa.

### ¿Por qué el botón no responde al toque?

1. El footer tiene `z-index: 50`, mayor que cualquier elemento del contenido.
2. Al estar superpuesto, el footer recibe todos los eventos de puntero en esa zona.
3. El botón existe en el DOM y TypeScript/React no reportan error: el bug es
   puramente visual/de interacción y solo aparece en tamaños de pantalla móvil.

---

## Solución implementada

### Principio: compensar la altura de elementos fixed con padding en el scroll container

Cuando un elemento usa `position: fixed`, se necesita añadir al contenedor de scroll
un `padding-bottom` equivalente a la altura del elemento fixed para que el contenido
"empuje" hacia arriba y quede visible por encima del overlay.

### Altura del footer

```
padding vertical:  p-4 = 16px × 2 = 32px
icono:             h-6 = 24px
separación:        mb-1 = 4px
texto xs:          ≈ 16px (line-height incluida)
────────────────────────────────
Total aproximado:  ≈ 76px
```

`pb-20` = `5rem` = `80px` → margen suficiente con 4px de holgura.

### Código corregido

```tsx
// src/app/page.tsx (DESPUÉS)
<div
  data-testid="page-wrapper"
  className="min-h-screen bg-gray-50 relative pb-20 md:pb-0"
>
```

| Clase | Efecto |
|---|---|
| `pb-20` | 80px de padding inferior en **móvil** — el último ticket queda por encima del footer |
| `md:pb-0` | Elimina ese padding en **desktop** — el footer tiene `md:hidden`, no hay nada que compensar |

Las dos clases están siempre sincronizadas con la visibilidad del footer (`md:hidden`
y `md:pb-0` usan el mismo breakpoint), lo que hace la solución robusta frente a cambios
de breakpoint.

```
DESPUÉS (fix aplicado)
┌─────────────────────────────┐
│  TechCorp Soporte           │
├─────────────────────────────┤
│  Ticket 1   [Resolver ✓]    │
├─────────────────────────────┤
│  Ticket 2   [Resolver ✓]    │
├─────────────────────────────┤
│  Ticket 3                   │
│  [Resolver Ticket]  ✓ VISIBLE│  ← pb-20 lo empuja por encima del footer
├─────────────────────────────┤
│  (espacio de compensación)  │  ← 80px reservados por pb-20
├═════════════════════════════╡
│  🕐 Pendientes  ✓ Resueltos │
└─────────────────────────────┘
```

---

## Tests

Se agregó un `describe` block en `src/app/__tests__/page.test.tsx`.

> **Nota sobre estrategia de testing para bugs de layout:**
> jsdom (el entorno DOM simulado de Vitest) **no ejecuta CSS real**. No calcula
> posiciones, no aplica `z-index`, ni detecta solapamientos visuales. Por lo tanto,
> no es posible hacer un test que diga "el botón no está cubierto por el footer".
>
> La estrategia correcta es:
> - **Tests unitarios** (aquí): verifican que las clases Tailwind responsables del
>   fix estén presentes en los elementos correctos.
> - **Tests E2E** (Playwright/Cypress): verifican en un navegador real que el botón
>   es interactuable en un viewport móvil (ej. 390×844).

| Test | Qué verifica |
|---|---|
| `pb-20 en el contenedor principal` | El padding de compensación existe en móvil |
| `md:pb-0 en el contenedor principal` | El padding se cancela en desktop |
| `footer tiene fixed y bottom-0` | La posición del footer que requiere la compensación |
| `footer tiene md:hidden` | Footer y padding están sincronizados en el mismo breakpoint |

### Ejecutar los tests

```bash
npm install    # instala @testing-library/react, user-event y jest-dom si aún no se hizo
npm test
```

---

## Archivos modificados / creados

```
src/
  app/
    page.tsx                    ← fix: pb-20 md:pb-0 en el wrapper + data-testid
    __tests__/
      page.test.tsx             ← modificado: nuevo describe block con 4 tests de layout

docs/
  BUG_1.md                     ← este archivo
```
