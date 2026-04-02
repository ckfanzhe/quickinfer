import elements from './elements.js';
import { renderExampleImages } from './ui.js';
import { showToast, checkReadyState, updateRunButton } from './utils.js';
import { EXAMPLE_IMAGES } from './constants.js';
import { handleImageUpload, renderImagePreview, clearImagePreview, setupDragDrop } from './image.js';

// Setup all event handlers
export function setupEventHandlers(state, handlers) {
  const {
    onFileSelect,       // When a file is selected
    onModelSelect,      // When a server model is selected
    onLocalModelLoad,   // When a local model file is selected
    onRunInference,     // When run button is clicked
    onExportResults,    // When export button is clicked
    onBackendSwitch,   // When backend is changed
    onClearImage        // When image is cleared
  } = handlers;

  // File input - click to upload
  elements.uploadZone.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      const file = e.target.files[0];
      handleImageUpload(file, (img) => {
        state.imageData = img;
        const displayScale = renderImagePreview(img, elements.previewCanvas);
        state.displayScale = { ...displayScale, displayed: false };
        elements.uploadPlaceholder.style.display = 'none';
        elements.imagePreview.style.display = 'block';
        checkReadyState(state.session, img);
        if (onFileSelect) onFileSelect(img);
      });
    }
  });

  // Drag and drop
  setupDragDrop({
    onDrop: (e) => {
      const file = e.dataTransfer.files[0];
      if (file) {
        handleImageUpload(file, (img) => {
          state.imageData = img;
          const displayScale = renderImagePreview(img, elements.previewCanvas);
          state.displayScale = { ...displayScale, displayed: false };
          elements.uploadPlaceholder.style.display = 'none';
          elements.imagePreview.style.display = 'block';
          checkReadyState(state.session, img);
          if (onFileSelect) onFileSelect(img);
        });
      }
    },
    onClear: () => {
      state.imageData = null;
      state.displayScale = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, displayed: false };
      clearImagePreview();
      checkReadyState(state.session, null);
      if (onClearImage) onClearImage();
    }
  });

  // Local model upload
  elements.localModelBtn.addEventListener('click', () => elements.onnxFileInput.click());
  elements.onnxFileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      if (onLocalModelLoad) {
        onLocalModelLoad(e.target.files[0]);
      }
    }
  });

  // Run inference button
  elements.runBtn.addEventListener('click', () => {
    if (onRunInference) onRunInference();
  });

  // Export results button
  elements.exportBtn.addEventListener('click', () => {
    if (onExportResults) onExportResults();
  });

  // Backend select change
  elements.backendSelect.addEventListener('change', () => {
    if (onBackendSwitch) onBackendSwitch();
  });

  // Example images click handler
  elements.examplesGrid?.addEventListener('click', (e) => {
    const exampleItem = e.target.closest('.example-item');
    if (!exampleItem || !state.session) {
      if (!state.session) showToast('Please load a model first', 'error');
      return;
    }

    const idx = parseInt(exampleItem.dataset.index, 10);
    const imgData = EXAMPLE_IMAGES[idx];
    const img = new Image();
    img.onload = () => {
      state.imageData = img;
      const displayScale = renderImagePreview(img, elements.previewCanvas);
      state.displayScale = { ...displayScale, displayed: false };
      elements.uploadPlaceholder.style.display = 'none';
      elements.imagePreview.style.display = 'block';
      checkReadyState(state.session, img);
      if (onFileSelect) onFileSelect(img);
      showToast('Example image loaded', 'success');
    };
    img.onerror = () => showToast('Failed to load example image', 'error');
    img.src = imgData.src;
  });

  // Initialize example images
  renderExampleImages(EXAMPLE_IMAGES);
}

// Helper to update button state during inference
export function setRunningState(running) {
  updateRunButton(!running, running);
}