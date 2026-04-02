import { loadModelFromCache, saveModelToCache } from '../model-cache.js';
import { showToast, updateModelStatus, formatBytes, updateBackendDisplay, getBackendDisplayName } from './utils.js';
import elements from './elements.js';

// Model URLs from Vite build config
const MODEL_URLS = import.meta.env.VITE_MODEL_URLS || '[]';

// Server Models - fully static, no server API needed
export function fetchServerModels() {
  try {
    return Array.isArray(MODEL_URLS) ? MODEL_URLS : JSON.parse(MODEL_URLS || '[]');
  } catch {
    return [];
  }
}

export function renderModelList(models, onSelect) {
  if (models.length === 0) {
    elements.modelList.innerHTML = '<div class="model-empty">No models available</div>';
    return;
  }

  elements.modelList.innerHTML = models.map(model => `
    <div class="model-item" data-url="${model.url}" data-name="${model.name}">
      <span class="model-item-name">${model.name.replace('.onnx', '')}</span>
      <span class="model-item-size">${model.sizeFormatted}</span>
      <div class="model-download-bar" style="display: none;">
        <div class="model-download-progress"></div>
      </div>
    </div>
  `).join('');

  // Add click handlers
  elements.modelList.querySelectorAll('.model-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      const url = item.dataset.url;
      onSelect(name, url, item);
    });
  });
}

// Load model from server with progress tracking
export async function loadServerModel(name, url, item, backend, onLoadComplete) {
  const downloadBar = item.querySelector('.model-download-bar');
  const downloadProgress = item.querySelector('.model-download-progress');

  // Highlight selected
  elements.modelList.querySelectorAll('.model-item').forEach(i => i.classList.remove('selected'));
  item.classList.add('selected', 'loading');

  updateModelStatus('loading', 'Loading...');

  try {
    let modelBuffer;

    // Try cache first (using URL as cache key)
    const cached = await loadModelFromCache(url);
    if (cached) {
      modelBuffer = cached;
      showToast('Model loaded from cache', 'success');
    } else {
      // Download with progress tracking
      downloadBar.style.display = 'block';
      downloadProgress.style.width = '0%';
      updateModelStatus('loading', 'Downloading... 0%');

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentLength = parseInt(response.headers.get('Content-Length'), 10) || 0;
      const reader = response.body.getReader();
      const chunks = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        if (contentLength > 0) {
          const percent = Math.round((receivedLength / contentLength) * 100);
          downloadProgress.style.width = percent + '%';
          updateModelStatus('loading', `Downloading... ${percent}%`);
        }
      }

      // Concatenate chunks into a single Uint8Array
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      modelBuffer = new Uint8Array(totalLength);
      let position = 0;
      for (const chunk of chunks) {
        modelBuffer.set(chunk, position);
        position += chunk.length;
      }
      modelBuffer = modelBuffer.buffer;

      await saveModelToCache(url, modelBuffer);
      showToast('Model downloaded and cached', 'success');
    }

    // Create session
    const executionProviders = backend === 'auto' ? [] : [backend];
    const session = await window.ort.InferenceSession.create(modelBuffer, { executionProviders });

    // Update UI
    elements.modelInfo.style.display = 'block';
    elements.infoName.textContent = name;
    elements.infoSize.textContent = formatBytes(modelBuffer.byteLength);

    updateModelStatus('ready', 'Ready');
    updateBackendDisplay(backend);

    if (onLoadComplete) {
      onLoadComplete(session, modelBuffer, { name, size: modelBuffer.byteLength, provider: backend });
    }

  } catch (error) {
    console.error('Load error:', error);
    updateModelStatus('error', 'Error');
    if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
      showToast('Download blocked. Use "Upload Local ONNX" instead.', 'error');
    } else {
      showToast(`Failed to load model: ${error.message}`, 'error');
    }
  } finally {
    item.classList.remove('loading');
    downloadBar.style.display = 'none';
  }
}

// Load local ONNX file
export async function loadLocalModel(file, backend, onLoadComplete) {
  if (!file.name.endsWith('.onnx')) {
    showToast('Please select an ONNX file', 'error');
    return;
  }

  updateModelStatus('loading', 'Loading...');
  elements.localModelBtn.classList.add('loading');
  elements.localModelBtn.disabled = true;
  const btnText = elements.localModelBtn.querySelector('.btn-text');
  const originalText = btnText.textContent;
  btnText.innerHTML = '<span class="spinner"></span> Loading...';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const executionProviders = backend === 'auto' ? [] : [backend];
    const session = await window.ort.InferenceSession.create(arrayBuffer, { executionProviders });

    elements.modelInfo.style.display = 'block';
    elements.infoName.textContent = file.name;
    elements.infoSize.textContent = formatBytes(arrayBuffer.byteLength);

    updateModelStatus('ready', 'Ready');
    showToast('Local model loaded', 'success');
    updateBackendDisplay(backend);

    if (onLoadComplete) {
      onLoadComplete(session, arrayBuffer, { name: file.name, size: arrayBuffer.byteLength, provider: backend });
    }

  } catch (error) {
    console.error('Load error:', error);
    updateModelStatus('error', 'Error');
    showToast(`Failed to load model: ${error.message}`, 'error');
  } finally {
    elements.localModelBtn.classList.remove('loading');
    elements.localModelBtn.disabled = false;
    btnText.textContent = originalText;
  }
}

// Switch backend for current model
export async function switchBackend(modelBuffer, currentBackend, newBackend, onSwitchComplete) {
  if (!modelBuffer) {
    showToast('Please load a model first', 'error');
    return;
  }

  updateModelStatus('loading', 'Switching backend...');

  try {
    const executionProviders = newBackend === 'auto' ? [] : [newBackend];
    const session = await window.ort.InferenceSession.create(modelBuffer, { executionProviders });

    updateModelStatus('ready', 'Ready');
    updateBackendDisplay(newBackend);
    showToast(`Switched to ${getBackendDisplayName(newBackend)}`, 'success');

    if (onSwitchComplete) {
      onSwitchComplete(session, newBackend);
    }
  } catch (error) {
    console.error('Backend switch error:', error);
    updateModelStatus('error', 'Error');
    if (error.message && error.message.includes('resize') && error.message.includes('nearest')) {
      showToast(`${getBackendDisplayName(newBackend)} does not support this model. Try another backend.`, 'error');
    } else {
      showToast(`Failed to switch backend: ${error.message}`, 'error');
    }
  }
}