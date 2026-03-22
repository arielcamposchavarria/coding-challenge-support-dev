import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Entorno Node: apropiado para testar route handlers de Next.js
    // que no dependen del DOM.
    environment: 'node',
    globals: true,
  },
  resolve: {
    // Replica el alias @/* de tsconfig.json para que los imports funcionen
    // en el contexto de los tests igual que en la aplicación.
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
