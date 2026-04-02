import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const repo = env.VITE_GITHUB_REPO || 'ckfanzhe/quickinfer';
  const release = env.VITE_RELEASE_TAG || 'v1.0.0';
  const modelList = JSON.parse(env.VITE_MODELS || '[]');
  const modelUrls = JSON.stringify(modelList.map(m => ({
    name: m.name,
    url: `https://github.com/${repo}/releases/download/${release}/${m.name}`,
    sizeFormatted: m.size || '~12MB'
  })));
  // Use relative paths for local dev, absolute /quickinfer/ for github build
  const isGitHubBuild = mode === 'github';
  return {
    root: path.join(__dirname, 'src'),
    base: isGitHubBuild ? '/quickinfer/' : './',
    define: {
      'import.meta.env.VITE_GITHUB_REPO': JSON.stringify(repo),
      'import.meta.env.VITE_RELEASE_TAG': JSON.stringify(release),
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
