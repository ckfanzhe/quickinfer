import elements from './elements.js';

// Toast notifications
export function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Format bytes to human readable
export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Update model status indicator
export function updateModelStatus(status, text) {
  elements.modelStatus.className = `model-status ${status}`;
  elements.modelStatus.querySelector('.status-text').textContent = `Model: ${text}`;
}

// Update run button state
export function updateRunButton(ready, running = false) {
  elements.runBtn.disabled = !ready;
  elements.runBtn.className = running ? 'run-btn running' : 'run-btn';
  elements.runBtn.innerHTML = running
    ? '<span class="spinner"></span> Running...'
    : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><polygon points="4,2 16,10 4,18" fill="currentColor"/></svg> Run Inference`;

  elements.runHint.textContent = ready ? 'Ready to run inference' : 'Load a model and upload an image first';
}

// Check if ready to run inference
export function checkReadyState(session, imageData) {
  const ready = session !== null && imageData !== null;
  updateRunButton(ready);
  return ready;
}

// Update backend display badge
export function updateBackendDisplay(backend) {
  const text = backend === 'auto' ? 'Auto' : (backend === 'wasm' ? 'WASM' : (backend === 'webgpu' ? 'WebGPU' : 'WebGL'));
  const color = backend === 'wasm' ? 'var(--secondary)' : (backend === 'webgl' ? 'var(--warning)' : (backend === 'webgpu' ? 'var(--success)' : 'var(--primary)'));

  elements.backendCurrent.textContent = text;
  elements.backendCurrent.style.color = color;

  elements.backendBadge.textContent = text;
  elements.backendBadge.style.background = 'rgba(0, 255, 136, 0.15)';
  elements.backendBadge.style.borderColor = color;
  elements.backendBadge.style.color = color;
}

// Get backend display name
export function getBackendDisplayName(backend) {
  return backend === 'auto' ? 'Auto' : (backend === 'wasm' ? 'WASM' : (backend === 'webgpu' ? 'WebGPU' : 'WebGL'));
}