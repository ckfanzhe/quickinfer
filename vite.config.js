import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  return {
    root: path.join(__dirname, 'src'),
    base: env.VITE_BASE_PATH || '/',
    build: {
      outDir: path.join(__dirname, 'dist'),
      emptyOutDir: true
    },
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3000',
        '/models': 'http://localhost:3000'
      }
    },
    assetsInclude: ['**/*.wasm']
  };
});
