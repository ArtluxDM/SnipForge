import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [vue()],
    test: {
        include: ['tests/**/*.test.ts'],
    },
    resolve: {
        // Don't let vite-plugin-electron-renderer intercept Node built-ins
        conditions: ['node'],
    },
})
