/**
 * Simple HTTP server for ONNX YOLO Benchmark
 * Serves ONNX models for browser download
 *
 * Usage:
 *   node server.js                    # Default: port 3000
 *   node server.js 8080              # Custom port
 *   node server.js /path/to/models   # Custom models directory
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = process.argv[2] || process.env.PORT || 3000;
const MODELS_DIR = process.argv[3] || path.join(__dirname, 'models');
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const REQUIRED_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// MIME types
const MIME_TYPES = {
  '.onnx': 'application/octet-stream',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.wasm': 'application/wasm',
};

// Get file size in human readable format
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Parse URL and get file path
function getFilePath(url) {
  // Remove query string and decode
  const pathname = decodeURIComponent(url.split('?')[0]);

  // API endpoint for model list
  if (pathname === '/api/models') {
    return { path: null, isApi: true };
  }

  // Serve dist folder (client app)
  if (pathname.startsWith('/assets/')) {
    // Map /assets/* to dist/assets/*
    const clientPath = path.join(__dirname, 'dist', pathname);
    return { path: clientPath, isClient: true };
  }

  // Serve root index.html
  if (pathname === '/') {
    return { path: path.join(__dirname, 'dist', 'index.html'), isClient: true };
  }

  // Serve ONNX models
  if (pathname.startsWith('/models/')) {
    const modelPath = path.join(MODELS_DIR, pathname.slice(8));
    return { path: modelPath, isModel: true };
  }

  // Serve node_modules for onnxruntime-web WASM files
  if (pathname.startsWith('/node_modules/onnxruntime-web/')) {
    // Remove leading slash for path.join on Windows
    const relativePath = pathname.substring(1);
    const wasmPath = path.join(__dirname, relativePath);
    return { path: wasmPath, isWasm: true };
  }

  // Default to dist
  return { path: path.join(__dirname, 'dist', pathname), isClient: true };
}

// Get list of available models
function getModelList() {
  const models = [];

  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    return models;
  }

  const files = fs.readdirSync(MODELS_DIR);

  for (const file of files) {
    if (file.endsWith('.onnx')) {
      const filePath = path.join(MODELS_DIR, file);
      const stats = fs.statSync(filePath);
      models.push({
        name: file,
        size: stats.size,
        sizeFormatted: formatSize(stats.size),
        url: `/models/${file}`
      });
    }
  }

  return models;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  console.log(`[${new Date().toISOString()}] ${method} ${url}`);

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Only allow GET
  if (method !== 'GET') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  try {
    const { path: filePath, isApi, isModel, isWasm, isClient } = getFilePath(url);

    // API endpoint
    if (isApi) {
      const models = getModelList();
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models, serverVersion: '1.0.0' }));
      return;
    }

    // Model files - add extra headers for browser caching
    if (isModel) {
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Model not found' }));
        return;
      }

      const ext = path.extname(filePath);
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': mimeType,
        'Content-Length': fs.statSync(filePath).size,
        'Cache-Control': 'public, max-age=31536000', // 1 year cache
        'X-Model-Path': filePath
      });

      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // WASM files
    if (isWasm) {
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
        res.end('WASM file not found');
        return;
      }

      const ext = path.extname(filePath);
      const mimeType = MIME_TYPES[ext] || 'application/wasm';

      res.writeHead(200, {
        ...CORS_HEADERS,
        ...REQUIRED_HEADERS,
        'Content-Type': mimeType,
        'Content-Length': fs.statSync(filePath).size
      });

      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // Client files (dist folder) - need COOP/COEP headers for WASM
    if (isClient) {
      if (!fs.existsSync(filePath)) {
        // Fallback to index.html for SPA routing
        const indexPath = path.join(__dirname, 'dist', 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { ...CORS_HEADERS, ...REQUIRED_HEADERS, 'Content-Type': 'text/html' });
          fs.createReadStream(indexPath).pipe(res);
          return;
        }
        res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      const ext = path.extname(filePath);
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        ...CORS_HEADERS,
        ...REQUIRED_HEADERS,
        'Content-Type': mimeType
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // File not found
    res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           ONNX YOLO Benchmark Server                         ║
╠══════════════════════════════════════════════════════════════╣
║  Server running at:     http://localhost:${PORT}                ║
║  Models directory:     ${MODELS_DIR.padEnd(35)}║
║                                                              ║
║  Endpoints:                                                   ║
║    GET /              - Frontend app                          ║
║    GET /api/models    - List available models                 ║
║    GET /models/{name} - Download ONNX model                   ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // List available models
  const models = getModelList();
  if (models.length === 0) {
    console.log('  No models found in', MODELS_DIR);
    console.log('  Place your .onnx files in that directory');
  } else {
    console.log('  Available models:');
    models.forEach(m => {
      console.log(`    - ${m.name} (${m.sizeFormatted})`);
    });
  }
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => process.exit(0));
});
