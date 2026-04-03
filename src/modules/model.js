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
    elements.modelSelect.innerHTML = '<option value="">No models available</option>';
    elements.modelSelect.disabled = true;
    return;
  }

  // Group models by prefix (e.g., yolov8n, yolov8s, yolov11n)
  const grouped = {};
  models.forEach(model => {
    const prefix = model.name.replace(/\d+\.onnx$/, '').replace(/\.onnx$/, '');
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push(model);
  });

  let html = '<option value="">Select a model...</option>';
  Object.entries(grouped).forEach(([group, groupModels]) => {
    if (Object.keys(grouped).length > 1) {
      html += `<optgroup label="${group.toUpperCase()}">`;
    }
    groupModels.forEach(model => {
      html += `<option value="${model.url}" data-name="${model.name}">${model.name.replace('.onnx', '')} (${model.sizeFormatted})</option>`;
    });
    if (Object.keys(grouped).length > 1) {
      html += '</optgroup>';
    }
  });

  elements.modelSelect.innerHTML = html;
  elements.modelSelect.disabled = false;

  // Add change handler
  elements.modelSelect.onchange = () => {
    const option = elements.modelSelect.selectedOptions[0];
    if (option && option.value) {
      const name = option.dataset.name;
      const url = option.value;
      onSelect(name, url);
    }
  };
}

// Load model from server with progress tracking
export async function loadServerModel(name, url, backend, onLoadComplete) {
  updateModelStatus('loading', 'Loading...');

  try {
    let modelBuffer;

    // Try cache first (using URL as cache key)
    const cached = await loadModelFromCache(url);
    if (cached) {
      modelBuffer = cached;
      showToast('Model loaded from cache', 'success');
    } else {
      // Download with progress tracking via status text
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

    // Model ready, now ONNX Runtime will load WASM from CDN
    updateModelStatus('loading', 'Initializing runtime...');

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
    // no cleanup needed for select-based UI
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
    updateModelStatus('loading', 'Initializing runtime...');
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