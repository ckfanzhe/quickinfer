import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  // Separate model repo using Git LFS
  const modelRepo = env.VITE_MODEL_REPO || 'ckfanzhe/quick-infer-models';
  const modelBranch = env.VITE_MODEL_BRANCH || 'main';
  const modelList = JSON.parse(env.VITE_MODELS || '[]');
  const modelUrls = JSON.stringify(modelList.map(m => ({
    name: m.name,
    url: `https://raw.githubusercontent.com/${modelRepo}/${modelBranch}/${m.name}`,
    sizeFormatted: m.size || '~12MB'
  })));
  // Use relative paths for local dev, absolute /quickinfer/ for github build
  const isGitHubBuild = mode === 'github';
  return {
    root: path.join(__dirname, 'src'),
    base: isGitHubBuild ? '/quickinfer/' : './',
    define: {
      'import.meta.env.VITE_MODEL_REPO': JSON.stringify(modelRepo),
      'import.meta.env.VITE_MODEL_BRANCH': JSON.stringify(modelBranch),
      'import.meta.env.VITE_MODEL_URLS': modelUrls
    },
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
