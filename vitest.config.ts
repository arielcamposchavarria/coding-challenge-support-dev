import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Entorno Node por defecto: apropiado para route handlers de Next.js
    // que no dependen del DOM.
    // Los tests de componentes React declaran `// @vitest-environment jsdom`
    // en su cabecera para sobreescribir este valor por archivo.
    environment: 'node',
    globals: true,
    // Archivo de setup global: extiende los matchers de Vitest con los de
    // @testing-library/jest-dom (toBeInTheDocument, toHaveTextContent, etc.)
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    // Replica el alias @/* de tsconfig.json para que los imports funcionen
    // en el contexto de los tests igual que en la aplicación.
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
