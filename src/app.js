// ONNX YOLO Benchmark - Main Application Entry
import { createAppState } from './modules/state.js';
import { elements } from './modules/elements.js';
import { showToast, updateModelStatus, updateRunButton, checkReadyState, updateBackendDisplay } from './modules/utils.js';
import { fetchServerModels, renderModelList, loadServerModel, loadLocalModel, switchBackend } from './modules/model.js';
import { preprocessImage, postprocess } from './modules/yolo.js';
import { displayMetrics, updateStats, displayResults, exportResults as exportResultsUI } from './modules/ui.js';
import { setupEventHandlers, setRunningState } from './modules/events.js';

// Create app state
const state = createAppState();

// Initialize the application
function init() {
  // Setup event handlers
  setupEventHandlers(state, {
    onFileSelect: () => {
      // File selected callback
    },
    onModelSelect: (name, url, item) => {
      const backend = elements.backendSelect.value;
      loadServerModel(name, url, item, backend, (session, modelBuffer, modelInfo) => {
        state.session = session;
        state.modelBuffer = modelBuffer;
        state.modelInfo = modelInfo;
        checkReadyState(state.session, state.imageData);
      });
    },
    onLocalModelLoad: (file) => {
      const backend = elements.backendSelect.value;
      loadLocalModel(file, backend, (session, modelBuffer, modelInfo) => {
        state.session = session;
        state.modelBuffer = modelBuffer;
        state.modelInfo = modelInfo;
        checkReadyState(state.session, state.imageData);
      });
    },
    onRunInference: async () => {
      if (!state.session || !state.imageData) {
        showToast('Please load a model and upload an image', 'error');
        return;
      }

      setRunningState(true);
      const timings = {};

      try {
        // Preprocess
        const preprocessStart = performance.now();
        const preprocessData = await preprocessImage(state.imageData);
        timings.preprocess = performance.now() - preprocessStart;

        // Inference
        const inferenceStart = performance.now();
        const feeds = { images: preprocessData.tensor };
        const output = await state.session.run(feeds);
        timings.inference = performance.now() - inferenceStart;

        // Debug: check output shape
        const outputKey = Object.keys(output)[0];
        const outputTensor = output[outputKey];
        console.log('Output shape:', outputTensor.dims);
        console.log('Output data sample (first 10):', outputTensor.data.slice(0, 10));

        // Postprocess
        const postprocessStart = performance.now();
        const { detections } = await postprocess(output[outputKey], preprocessData);
        timings.postprocess = performance.now() - postprocessStart;

        state.results = detections;
        displayMetrics(timings);
        displayResults(state.imageData, state.displayScale, detections);

        const total = timings.preprocess + timings.inference + timings.postprocess;
        state.runStats.count++;
        state.runStats.times.push(total);
        updateStats(state.runStats.times, state.runStats.count);

        elements.exportBtn.disabled = false;

      } catch (error) {
        console.error('Inference error:', error);

        if (error.message && error.message.includes('resize') && error.message.includes('nearest')) {
          showToast('WebGL does not support this model. Try WebGPU or WASM backend.', 'error');
        } else {
          showToast(`Inference failed: ${error.message}`, 'error');
        }
      } finally {
        setRunningState(false);
      }
    },
    onExportResults: () => {
      exportResultsUI(state.modelInfo, state.imageData, state.runStats, state.results);
      showToast('Results exported', 'success');
    },
    onBackendSwitch: () => {
      const backend = elements.backendSelect.value;
      switchBackend(state.modelBuffer, state.modelInfo?.provider, backend, (session, newBackend) => {
        state.session = session;
        state.modelInfo.provider = newBackend;
      });
    },
    onClearImage: () => {
      // Image cleared callback
    }
  });

  // Load server models
  const serverModels = fetchServerModels();
  state.serverModels = serverModels;
  renderModelList(serverModels, (name, url, item) => {
    const backend = elements.backendSelect.value;
    loadServerModel(name, url, item, backend, (session, modelBuffer, modelInfo) => {
      state.session = session;
      state.modelBuffer = modelBuffer;
      state.modelInfo = modelInfo;
      checkReadyState(state.session, state.imageData);
    });
  });

  // Initial UI state
  updateModelStatus('', 'Not Loaded');
  updateRunButton(false);
  updateBackendDisplay(elements.backendSelect.value);
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}