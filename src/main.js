import * as ort from 'onnxruntime-web';
import { loadModelFromCache, saveModelToCache } from './model-cache.js';

// Configure ONNX Runtime
ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
ort.env.webgl.pack = true;

// Server configuration - use relative URL for same-origin
const API_BASE = '';

// Model presets (fetched from server dynamically)
let SERVER_MODELS = [];

// App State
const state = {
  session: null,
  modelInfo: null,
  imageData: null,
  results: [],
  runStats: {
    count: 0,
    times: []
  }
};

// DOM Elements
const elements = {
  uploadZone: document.getElementById('uploadZone'),
  uploadPlaceholder: document.getElementById('uploadPlaceholder'),
  imagePreview: document.getElementById('imagePreview'),
  previewCanvas: document.getElementById('previewCanvas'),
  fileInput: document.getElementById('fileInput'),
  clearImageBtn: document.getElementById('clearImageBtn'),
  modelStatus: document.getElementById('modelStatus'),
  modelUrlInput: document.getElementById('modelUrlInput'),
  loadModelBtn: document.getElementById('loadModelBtn'),
  localModelBtn: document.getElementById('localModelBtn'),
  onnxFileInput: document.getElementById('onnxFileInput'),
  modelInfo: document.getElementById('modelInfo'),
  infoName: document.getElementById('infoName'),
  infoSize: document.getElementById('infoSize'),
  infoShape: document.getElementById('infoShape'),
  infoProvider: document.getElementById('infoProvider'),
  runBtn: document.getElementById('runBtn'),
  runHint: document.getElementById('runHint'),
  preprocessTime: document.getElementById('preprocessTime'),
  preprocessBar: document.getElementById('preprocessBar'),
  preprocessPercent: document.getElementById('preprocessPercent'),
  inferenceTime: document.getElementById('inferenceTime'),
  inferenceBar: document.getElementById('inferenceBar'),
  inferencePercent: document.getElementById('inferencePercent'),
  postprocessTime: document.getElementById('postprocessTime'),
  postprocessBar: document.getElementById('postprocessBar'),
  postprocessPercent: document.getElementById('postprocessPercent'),
  totalTime: document.getElementById('totalTime'),
  runCount: document.getElementById('runCount'),
  avgTime: document.getElementById('avgTime'),
  minTime: document.getElementById('minTime'),
  maxTime: document.getElementById('maxTime'),
  exportBtn: document.getElementById('exportBtn'),
  resultsSection: document.getElementById('resultsSection'),
  resultsCanvas: document.getElementById('resultsCanvas'),
  detectionCount: document.getElementById('detectionCount'),
  detectionsList: document.getElementById('detectionsList'),
  toastContainer: document.getElementById('toastContainer')
};

// YOLO Class Names (COCO dataset)
const CLASS_NAMES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
  'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote',
  'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book',
  'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
];

// Utility Functions
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function updateModelStatus(status, text) {
  elements.modelStatus.className = `model-status ${status}`;
  elements.modelStatus.querySelector('.status-text').textContent = `Model: ${text}`;
}

function updateRunButton(ready, running = false) {
  elements.runBtn.disabled = !ready;
  elements.runBtn.className = running ? 'run-btn running' : 'run-btn';
  elements.runBtn.innerHTML = running
    ? '<span class="spinner"></span> Running...'
    : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <polygon points="4,2 16,10 4,18" fill="currentColor"/>
       </svg> Run Inference`;

  if (ready && !running) {
    elements.runHint.textContent = 'Ready to run inference';
  } else if (!ready && !running) {
    elements.runHint.textContent = 'Load a model and upload an image first';
  }
}

function updateStats(times) {
  const total = times.reduce((a, b) => a + b, 0);
  const avg = total / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  elements.runCount.textContent = state.runStats.count;
  elements.avgTime.textContent = avg.toFixed(1) + ' ms';
  elements.minTime.textContent = min.toFixed(1) + ' ms';
  elements.maxTime.textContent = max.toFixed(1) + ' ms';
}

function displayMetrics(timings) {
  const { preprocess, inference, postprocess } = timings;
  const total = preprocess + inference + postprocess;

  elements.preprocessTime.textContent = preprocess.toFixed(1) + ' ms';
  elements.inferenceTime.textContent = inference.toFixed(1) + ' ms';
  elements.postprocessTime.textContent = postprocess.toFixed(1) + ' ms';
  elements.totalTime.textContent = total.toFixed(1) + ' ms';

  const preprocessPct = (preprocess / total * 100).toFixed(0);
  const inferencePct = (inference / total * 100).toFixed(0);
  const postprocessPct = (postprocess / total * 100).toFixed(0);

  elements.preprocessBar.style.width = preprocessPct + '%';
  elements.inferenceBar.style.width = inferencePct + '%';
  elements.postprocessBar.style.width = postprocessPct + '%';

  elements.preprocessPercent.textContent = preprocessPct + '%';
  elements.inferencePercent.textContent = inferencePct + '%';
  elements.postprocessPercent.textContent = postprocessPct + '%';
}

// Image Handling
function handleImageUpload(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please upload a valid image file', 'error');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showToast('Image size must be under 10MB', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      state.imageData = img;
      renderImagePreview(img);
      elements.uploadPlaceholder.style.display = 'none';
      elements.imagePreview.style.display = 'block';
      checkReadyState();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderImagePreview(img) {
  const ctx = elements.previewCanvas.getContext('2d');
  const maxWidth = elements.uploadZone.clientWidth;
  const maxHeight = elements.uploadZone.clientHeight;

  let width = img.width;
  let height = img.height;

  if (width > maxWidth) {
    height = (maxWidth / width) * height;
    width = maxWidth;
  }
  if (height > maxHeight) {
    width = (maxHeight / height) * width;
    height = maxHeight;
  }

  elements.previewCanvas.width = width;
  elements.previewCanvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);
}

function clearImage() {
  state.imageData = null;
  elements.imagePreview.style.display = 'none';
  elements.uploadPlaceholder.style.display = 'flex';
  checkReadyState();
}

// YOLO Processing
async function preprocessImage(img, targetSize = 640) {
  const [h, w] = [img.height, img.width];
  const scale = Math.min(targetSize / h, targetSize / w);
  const [newH, newW] = [Math.round(h * scale), Math.round(w * scale)];

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');

  // Fill with gray (128) for letterbox
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, targetSize, targetSize);

  // Draw resized image
  ctx.drawImage(img, 0, 0, newW, newH);

  const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
  const { data } = imageData;

  // Convert to CHW format, normalize to [0, 1]
  const float32Data = new Float32Array(3 * targetSize * targetSize);

  for (let i = 0; i < targetSize * targetSize; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;

    float32Data[i] = r;
    float32Data[targetSize * targetSize + i] = g;
    float32Data[2 * targetSize * targetSize + i] = b;
  }

  return {
    tensor: new ort.Tensor('float32', float32Data, [1, 3, targetSize, targetSize]),
    scale,
    pad: {
      left: 0,
      top: 0,
      right: targetSize - newW,
      bottom: targetSize - newH
    },
    originalSize: { width: w, height: h },
    canvas
  };
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function xywh2xyxy(x, y, w, h) {
  const x1 = x - w / 2;
  const y1 = y - h / 2;
  const x2 = x + w / 2;
  const y2 = y + h / 2;
  return [x1, y1, x2, y2];
}

function applyNMS(boxes, scores, iouThreshold = 0.45) {
  const indices = scores
    .map((score, i) => ({ score, index: i }))
    .sort((a, b) => b.score - a.score);

  const keep = [];

  while (indices.length > 0) {
    const current = indices.shift();
    keep.push(current);

    indices.forEach((item, i) => {
      if (item.index === current.index) return;

      const boxA = boxes[current.index];
      const boxB = boxes[item.index];

      const interX1 = Math.max(boxA[0], boxB[0]);
      const interY1 = Math.max(boxA[1], boxB[1]);
      const interX2 = Math.min(boxA[2], boxB[2]);
      const interY2 = Math.min(boxA[3], boxB[3]);

      const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
      const areaA = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
      const areaB = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);
      const unionArea = areaA + areaB - interArea;

      const iou = interArea / unionArea;

      if (iou > iouThreshold) {
        indices.splice(i, 1);
      }
    });
  }

  return keep;
}

async function postprocess(output, preprocessData, confThreshold = 0.25) {
  const { scale, pad, originalSize, canvas } = preprocessData;

  // YOLOv8 output shape: [1, 84, 8400]
  const outputData = output.data;
  const numClasses = 80;
  const numBoxes = 8400;

  // Transpose and parse
  const boxes = [];
  const scores = [];
  const classIds = [];

  for (let i = 0; i < numBoxes; i++) {
    let maxScore = 0;
    let classId = 0;

    // Find max class score
    for (let c = 0; c < numClasses; c++) {
      const score = sigmoid(outputData[c * numBoxes + i]);
      if (score > maxScore) {
        maxScore = score;
        classId = c;
      }
    }

    if (maxScore > confThreshold) {
      const cx = outputData[(numClasses) * numBoxes + i];
      const cy = outputData[(numClasses + 1) * numBoxes + i];
      const w = outputData[(numClasses + 2) * numBoxes + i];
      const h = outputData[(numClasses + 3) * numBoxes + i];

      const [x1, y1, x2, y2] = xywh2xyxy(cx, cy, w, h);

      // Scale back to original image coordinates
      const origW = originalSize.width;
      const origH = originalSize.height;
      const scaleToOrig = 1 / scale;

      boxes.push([
        Math.max(0, (x1 - pad.left) * scaleToOrig),
        Math.max(0, (y1 - pad.top) * scaleToOrig),
        Math.min(origW, (x2 - pad.left) * scaleToOrig),
        Math.min(origH, (y2 - pad.top) * scaleToOrig)
      ]);
      scores.push(maxScore);
      classIds.push(classId);
    }
  }

  // Apply NMS
  const nmsIndices = applyNMS(boxes, scores);

  // Draw results
  const resultsCanvas = document.createElement('canvas');
  resultsCanvas.width = originalSize.width;
  resultsCanvas.height = originalSize.height;
  const ctx = resultsCanvas.getContext('2d');

  // Draw original image
  ctx.drawImage(state.imageData, 0, 0);

  const detections = [];

  // Color palette for classes
  const colors = [
    '#00ff88', '#ff3366', '#00ccff', '#ffaa00', '#ff00ff',
    '#88ff00', '#ff0088', '#00ffcc', '#ff8800', '#8800ff'
  ];

  for (const { index } of nmsIndices) {
    const [x1, y1, x2, y2] = boxes[index];
    const score = scores[index];
    const classId = classIds[index];
    const className = CLASS_NAMES[classId] || `class_${classId}`;
    const color = colors[classId % colors.length];

    // Draw box
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    // Draw label background
    const label = `${className} ${(score * 100).toFixed(1)}%`;
    ctx.font = '14px JetBrains Mono';
    const textMetrics = ctx.measureText(label);
    const padding = 4;

    ctx.fillStyle = color;
    ctx.fillRect(x1, y1 - 20, textMetrics.width + padding * 2, 20);

    // Draw label text
    ctx.fillStyle = '#000';
    ctx.fillText(label, x1 + padding, y1 - 6);

    detections.push({
      classId,
      className,
      confidence: score,
      bbox: [x1, y1, x2, y2]
    });
  }

  return {
    detections,
    canvas: resultsCanvas
  };
}

// Model Loading
async function loadModel(url) {
  updateModelStatus('loading', 'Loading...');
  elements.loadModelBtn.disabled = true;

  try {
    let modelBuffer;

    // Try to load from cache first
    const cached = await loadModelFromCache(url);
    if (cached) {
      console.log('Model loaded from cache');
      modelBuffer = cached;
    } else {
      console.log('Downloading model from:', url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch model: ${response.status}`);
      modelBuffer = await response.arrayBuffer();

      // Save to cache
      await saveModelToCache(url, modelBuffer);
      console.log('Model saved to cache');
    }

    // Get provider info - check what's available
    const providers = ort.env.webgl && ort.env.webgl.available ? ['WebGL'] :
                       ort.env.wasm && ort.env.wasm.available ? ['WASM'] : ['CPU'];
    const provider = providers[0];

    // Create inference session
    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: [provider]
    });

    state.session = session;
    state.modelInfo = {
      name: url.split('/').pop(),
      size: modelBuffer.byteLength,
      provider
    };

    // Update UI
    elements.modelInfo.style.display = 'block';
    elements.infoName.textContent = state.modelInfo.name;
    elements.infoSize.textContent = formatBytes(state.modelInfo.size);
    elements.infoShape.textContent = '1x3x640x640';
    elements.infoProvider.textContent = provider;

    updateModelStatus('ready', 'Ready');
    showToast('Model loaded successfully', 'success');
    checkReadyState();

  } catch (error) {
    console.error('Model load error:', error);
    updateModelStatus('error', 'Error');
    showToast(`Failed to load model: ${error.message}`, 'error');
  } finally {
    elements.loadModelBtn.disabled = false;
  }
}

// Fetch available models from server
async function fetchServerModels() {
  try {
    const response = await fetch(`${API_BASE}/api/models`);
    if (!response.ok) throw new Error('Failed to fetch models');
    const data = await response.json();
    SERVER_MODELS = data.models || [];
    updateServerModelButtons();
    return SERVER_MODELS;
  } catch (error) {
    console.warn('Could not fetch server models:', error);
    return [];
  }
}

// Update preset buttons with server models
function updateServerModelButtons() {
  const container = document.querySelector('.preset-buttons');
  if (!container) return;

  // Clear existing buttons
  container.innerHTML = '';

  if (SERVER_MODELS.length === 0) {
    container.innerHTML = '<span class="no-models">No models on server</span>';
    return;
  }

  // Create button for each model
  SERVER_MODELS.slice(0, 4).forEach((model, index) => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = model.name.replace('.onnx', '');
    btn.dataset.modelUrl = model.url;
    btn.title = `${model.name} (${model.sizeFormatted})`;
    btn.addEventListener('click', () => {
      loadModel(model.url);
    });
    container.appendChild(btn);
  });
}

// Inference
async function runInference() {
  if (!state.session || !state.imageData) {
    showToast('Please load a model and upload an image first', 'error');
    return;
  }

  updateRunButton(false, true);

  const timings = {};
  let preprocessData;

  try {
    // Preprocess
    const preprocessStart = performance.now();
    preprocessData = await preprocessImage(state.imageData);
    timings.preprocess = performance.now() - preprocessStart;

    // Inference
    const inferenceStart = performance.now();
    const feeds = { images: preprocessData.tensor };
    const output = await state.session.run(feeds);
    timings.inference = performance.now() - inferenceStart;

    // Postprocess
    const postprocessStart = performance.now();
    const { detections, canvas } = await postprocess(
      output[Object.keys(output)[0]],
      preprocessData
    );
    timings.postprocess = performance.now() - postprocessStart;

    state.results = detections;

    // Display results
    displayMetrics(timings);
    displayResults(canvas, detections);

    // Update stats
    const total = timings.preprocess + timings.inference + timings.postprocess;
    state.runStats.count++;
    state.runStats.times.push(total);
    updateStats(state.runStats.times);

    elements.exportBtn.disabled = false;

  } catch (error) {
    console.error('Inference error:', error);
    showToast(`Inference failed: ${error.message}`, 'error');
  } finally {
    updateRunButton(true, false);
  }
}

function displayResults(canvas, detections) {
  elements.resultsSection.style.display = 'block';

  // Draw on results canvas
  const ctx = elements.resultsCanvas.getContext('2d');
  elements.resultsCanvas.width = canvas.width;
  elements.resultsCanvas.height = canvas.height;
  ctx.drawImage(canvas, 0, 0);

  // Update detection count
  elements.detectionCount.textContent = `${detections.length} object${detections.length !== 1 ? 's' : ''} detected`;

  // Update detections list
  elements.detectionsList.innerHTML = detections.map(d => `
    <div class="detection-item">
      <span class="class-name">${d.className}</span>
      <span class="confidence">${(d.confidence * 100).toFixed(1)}%</span>
    </div>
  `).join('');
}

// Export Results
function exportResults() {
  const data = {
    model: state.modelInfo,
    imageSize: state.imageData ? {
      width: state.imageData.width,
      height: state.imageData.height
    } : null,
    stats: {
      runCount: state.runStats.count,
      times: state.runStats.times,
      avg: (state.runStats.times.reduce((a, b) => a + b, 0) / state.runStats.times.length).toFixed(2),
      min: Math.min(...state.runStats.times).toFixed(2),
      max: Math.max(...state.runStats.times).toFixed(2)
    },
    detections: state.results
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yolo-benchmark-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Results exported', 'success');
}

// Check Ready State
function checkReadyState() {
  const ready = state.session !== null && state.imageData !== null;
  updateRunButton(ready);
}

// Event Listeners
elements.uploadZone.addEventListener('click', () => elements.fileInput.click());
elements.fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) handleImageUpload(e.target.files[0]);
});

elements.uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  elements.uploadZone.classList.add('dragover');
});

elements.uploadZone.addEventListener('dragleave', () => {
  elements.uploadZone.classList.remove('dragover');
});

elements.uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  elements.uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleImageUpload(file);
});

elements.clearImageBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  clearImage();
});

// Model preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const modelKey = btn.dataset.model;
    const model = MODEL_PRESETS[modelKey];
    if (model) {
      elements.modelUrlInput.value = model.url;
      loadModel(model.url);
    }
  });
});

elements.loadModelBtn.addEventListener('click', () => {
  const url = elements.modelUrlInput.value.trim();
  if (url) loadModel(url);
  else showToast('Please enter a model URL', 'error');
});

// Local ONNX file loading
elements.localModelBtn.addEventListener('click', () => elements.onnxFileInput.click());
elements.onnxFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.name.endsWith('.onnx')) {
    showToast('Please select an ONNX model file', 'error');
    return;
  }

  updateModelStatus('loading', 'Loading...');

  try {
    const arrayBuffer = await file.arrayBuffer();

    const providers = ort.env.webgl && ort.env.webgl.available ? ['WebGL'] :
                      ort.env.wasm && ort.env.wasm.available ? ['WASM'] : ['CPU'];

    const session = await ort.InferenceSession.create(arrayBuffer, {
      executionProviders: [providers[0]]
    });

    state.session = session;
    state.modelInfo = {
      name: file.name,
      size: arrayBuffer.byteLength,
      provider: providers[0]
    };

    elements.modelInfo.style.display = 'block';
    elements.infoName.textContent = state.modelInfo.name;
    elements.infoSize.textContent = formatBytes(state.modelInfo.size);
    elements.infoShape.textContent = '1x3x640x640';
    elements.infoProvider.textContent = state.modelInfo.provider;

    updateModelStatus('ready', 'Ready');
    showToast('Model loaded successfully', 'success');
    checkReadyState();

  } catch (error) {
    console.error('Model load error:', error);
    updateModelStatus('error', 'Error');
    showToast(`Failed to load model: ${error.message}`, 'error');
  }
});

elements.runBtn.addEventListener('click', runInference);
elements.exportBtn.addEventListener('click', exportResults);

// Initialize
updateModelStatus('', 'Not Loaded');
updateRunButton(false);
fetchServerModels();
