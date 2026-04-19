import { defineConfig } from 'vitest/config'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export default defineConfig({
  resolve: {
    conditions: ['node'],
    alias: {
      undici: require.resolve('undici')
    }
  },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**'
    ]
  }
})
