// ONNX YOLO Benchmark - Main Application Entry
import { createAppState } from './modules/state.js';
import { elements } from './modules/elements.js';
import { showToast, updateModelStatus, updateRunButton, checkReadyState, updateBackendDisplay } from './modules/utils.js';
import { fetchServerModels, renderModelList, loadServerModel, loadLocalModel, switchBackend } from './modules/model.js';
import { preprocessImage, postprocess, drawWebcamFrame } from './modules/yolo.js';
import { displayMetrics, updateStats, displayResults, exportResults as exportResultsUI, updateFpsDisplay, setFpsDisplayVisible, setWebcamButtonState, setWebcamButtonEnabled } from './modules/ui.js';
import { setupEventHandlers, setRunningState } from './modules/events.js';
import { startWebcam, stopWebcam, captureVideoFrame, calculateVideoDisplayScale, isWebcamSupported } from './modules/webcam.js';
import { DEFAULT_TARGET_SIZE } from './modules/constants.js';

// Create app state
const state = createAppState();

// Webcam inference state
let webcamAnimationId = null;
let lastFrameTime = 0;
const TARGET_FRAME_INTERVAL = 1000 / 15; // ~15 FPS for webcam to leave room for inference

// Webcam inference loop
function webcamInferenceLoop(timestamp) {
  if (!state.webcam.isRunning) return;

  // FPS calculation
  state.webcam.frameCount++;
  if (timestamp - state.webcam.lastFpsUpdate >= 1000) {
    state.webcam.fps = state.webcam.frameCount;
    state.webcam.frameCount = 0;
    state.webcam.lastFpsUpdate = timestamp;
    updateFpsDisplay(state.webcam.fps);
  }

  // Throttle frames
  if (timestamp - lastFrameTime >= TARGET_FRAME_INTERVAL) {
    lastFrameTime = timestamp;
    runWebcamInference();
  }

  webcamAnimationId = requestAnimationFrame(webcamInferenceLoop);
}

// Run single webcam inference
async function runWebcamInference() {
  if (!state.session) return;

  const video = elements.webcamVideo;
  if (!video || video.readyState < 2) return;

  // Wait for video dimensions to be available (mobile Safari fix)
  if (!video.videoWidth || !video.videoHeight) return;

  try {
    // Capture frame
    const frameCanvas = captureVideoFrame(video);

    // Preprocess
    const preprocessData = await preprocessImageFromCanvas(frameCanvas);

    // Inference
    const feeds = { images: preprocessData.tensor };
    const output = await state.session.run(feeds);
    const outputKey = Object.keys(output)[0];

    // Postprocess
    const { detections } = await postprocess(output[outputKey], preprocessData);

    // Draw results
    state.webcam.displayScale = calculateVideoDisplayScale(video, elements.previewCanvas.width, elements.previewCanvas.height);
    drawWebcamFrame(elements.previewCanvas, video, state.webcam.displayScale, detections);

    state.results = detections;

  } catch (error) {
    console.error('Webcam inference error:', error);
  }
}

// Preprocess from canvas (for webcam frames)
async function preprocessImageFromCanvas(source) {
  const targetSize = DEFAULT_TARGET_SIZE;
  let width = source.width;
  let height = source.height;

  const scale = Math.min(targetSize / height, targetSize / width);
  const [newH, newW] = [Math.round(height * scale), Math.round(width * scale)];

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.drawImage(source, 0, 0, newW, newH);

  const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
  const { data } = imageData;

  const float32Data = new Float32Array(3 * targetSize * targetSize);
  for (let i = 0; i < targetSize * targetSize; i++) {
    float32Data[i] = data[i * 4] / 255;
    float32Data[targetSize * targetSize + i] = data[i * 4 + 1] / 255;
    float32Data[2 * targetSize * targetSize + i] = data[i * 4 + 2] / 255;
  }

  return {
    tensor: new window.ort.Tensor('float32', float32Data, [1, 3, targetSize, targetSize]),
    scale,
    pad: { left: 0, top: 0, right: targetSize - newW, bottom: targetSize - newH },
    originalSize: { width, height },
    resizedSize: { width: newW, height: newH },
    canvas
  };
}

// Start webcam
async function startWebcamInference() {
  const stream = await startWebcam();
  if (!stream) return;

  state.webcam.stream = stream;
  state.webcam.isRunning = true;
  state.webcam.frameCount = 0;
  state.webcam.fps = 0;
  state.webcam.lastFpsUpdate = performance.now();

  // Initialize canvas size to match upload zone
  const maxWidth = elements.uploadZone.clientWidth;
  const maxHeight = elements.uploadZone.clientHeight;
  elements.previewCanvas.width = maxWidth;
  elements.previewCanvas.height = maxHeight;

  // Show preview canvas (hide upload placeholder)
  elements.uploadPlaceholder.style.display = 'none';
  elements.imagePreview.style.display = 'block';

  // Show FPS display
  setFpsDisplayVisible(true);
  setWebcamButtonState(true);

  // Disable run button during webcam
  updateRunButton(false);
  elements.runBtn.disabled = true;

  // Start inference loop
  lastFrameTime = performance.now();
  webcamAnimationId = requestAnimationFrame(webcamInferenceLoop);

  showToast('Camera started', 'success');
}

// Stop webcam
function stopWebcamInference() {
  state.webcam.isRunning = false;

  if (webcamAnimationId) {
    cancelAnimationFrame(webcamAnimationId);
    webcamAnimationId = null;
  }

  if (state.webcam.stream) {
    stopWebcam(state.webcam.stream);
    state.webcam.stream = null;
  }

  // Restore upload zone visibility based on whether image exists
  if (state.imageData) {
    // Keep image preview visible
    elements.uploadPlaceholder.style.display = 'none';
    elements.imagePreview.style.display = 'block';
  } else {
    // Restore to upload placeholder
    elements.uploadPlaceholder.style.display = 'flex';
    elements.imagePreview.style.display = 'none';
  }

  // Hide FPS display
  setFpsDisplayVisible(false);
  setWebcamButtonState(false);

  // Re-enable run button
  checkReadyState(state.session, state.imageData);

  showToast('Camera stopped', 'info');
}

// Toggle webcam
function toggleWebcam() {
  if (state.webcam.isRunning) {
    stopWebcamInference();
  } else {
    if (!state.session) {
      showToast('Please load a model first', 'error');
      return;
    }
    if (!isWebcamSupported()) {
      showToast('Camera not supported in this browser. Try Chrome or Safari.', 'error');
      return;
    }
    startWebcamInference();
  }
}

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
        setWebcamButtonEnabled(true);
      });
    },
    onLocalModelLoad: (file) => {
      const backend = elements.backendSelect.value;
      loadLocalModel(file, backend, (session, modelBuffer, modelInfo) => {
        state.session = session;
        state.modelBuffer = modelBuffer;
        state.modelInfo = modelInfo;
        checkReadyState(state.session, state.imageData);
        setWebcamButtonEnabled(true);
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
    },
    onWebcamToggle: () => {
      toggleWebcam();
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
      setWebcamButtonEnabled(true);
    });
  });

  // Initial UI state
  updateModelStatus('', 'Not Loaded');
  updateRunButton(false);
  updateBackendDisplay(elements.backendSelect.value);
  setWebcamButtonState(false);
  setWebcamButtonEnabled(false);
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}