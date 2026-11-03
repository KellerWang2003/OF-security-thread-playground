import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

export default defineConfig({
  // The same React Compiler the app is built with, so the tests run the components as they ship
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/**/*.test.{ts,tsx}'] },
})
