import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import mkcert from 'vite-plugin-mkcert';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Load env from project root (parent of src) before setting root to src
  const env = loadEnv(mode, __dirname, '');
  // ModelScope configuration
  const modelScopeRepo = env.VITE_MODELSCOPE_REPO || 'Xenova/yolov8-pose-onnx';
  const modelBranch = env.VITE_MODELSCOPE_BRANCH || 'master';
  const modelList = JSON.parse(env.VITE_MODELS || '[]');
  const modelUrls = JSON.stringify(modelList.map(m => ({
    name: m.name,
    url: `https://modelscope.cn/models/${modelScopeRepo}/resolve/${modelBranch}/${m.name}`,
    sizeFormatted: m.size || '~12MB'
  })));
  // Use relative paths for local dev, absolute /quickinfer/ for github build
  const isGitHubBuild = mode === 'github';
  return {
    root: path.join(__dirname, 'src'),
    base: isGitHubBuild ? '/quickinfer/' : './',
    plugins: isGitHubBuild ? [] : [mkcert()],
    define: {
      'import.meta.env.VITE_MODELSCOPE_REPO': JSON.stringify(modelScopeRepo),
      'import.meta.env.VITE_MODELSCOPE_BRANCH': JSON.stringify(modelBranch),
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
      },
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    }
  };
});
