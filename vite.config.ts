import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';

// Only src/ and public/ reach the bundle. references/ (client workbooks) is never imported.
export default defineConfig({
  plugins: [react()],
  server: {fs: {deny: ['references/**', '**/*.xlsx', '**/*.xlsm', '**/*.docx']}},
  build: {sourcemap: false, chunkSizeWarningLimit: 900},
  test: {environment: 'node', include: ['src/**/*.test.{ts,tsx}']},
});
