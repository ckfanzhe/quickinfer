import { loadModelFromCache, saveModelToCache } from './model-cache.js';

// Use ONNX Runtime from global window (loaded via script tag in index.html)

// App State
const state = {
  session: null,
  modelInfo: null,
  imageData: null,
  results: [],
  runStats: { count: 0, times: [] },
  serverModels: []
};

// DOM Elements
const $ = (id) => document.getElementById(id);
const elements = {
  uploadZone: $('uploadZone'),
  uploadPlaceholder: $('uploadPlaceholder'),
  imagePreview: $('imagePreview'),
  previewCanvas: $('previewCanvas'),
  fileInput: $('fileInput'),
  clearImageBtn: $('clearImageBtn'),
  modelStatus: $('modelStatus'),
  modelList: $('modelList'),
  localModelBtn: $('localModelBtn'),
  onnxFileInput: $('onnxFileInput'),
  modelInfo: $('modelInfo'),
  infoName: $('infoName'),
  infoSize: $('infoSize'),
  backendSelect: $('backendSelect'),
  runBtn: $('runBtn'),
  runHint: $('runHint'),
  preprocessTime: $('preprocessTime'),
  preprocessBar: $('preprocessBar'),
  preprocessPercent: $('preprocessPercent'),
  inferenceTime: $('inferenceTime'),
  inferenceBar: $('inferenceBar'),
  inferencePercent: $('inferencePercent'),
  postprocessTime: $('postprocessTime'),
  postprocessBar: $('postprocessBar'),
  postprocessPercent: $('postprocessPercent'),
  totalTime: $('totalTime'),
  runCount: $('runCount'),
  avgTime: $('avgTime'),
  minTime: $('minTime'),
  maxTime: $('maxTime'),
  exportBtn: $('exportBtn'),
  resultsSection: $('resultsSection'),
  resultsCanvas: $('resultsCanvas'),
  detectionCount: $('detectionCount'),
  detectionsList: $('detectionsList'),
  toastContainer: $('toastContainer')
};

// YOLO Class Names (COCO)
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

// Utilities
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
    : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><polygon points="4,2 16,10 4,18" fill="currentColor"/></svg> Run Inference`;

  elements.runHint.textContent = ready ? 'Ready to run inference' : 'Load a model and upload an image first';
}

function checkReadyState() {
  const ready = state.session !== null && state.imageData !== null;
  updateRunButton(ready);
}

// Server Models
async function fetchServerModels() {
  try {
    const response = await fetch('/api/models');
    if (!response.ok) throw new Error('Failed to fetch');
    const data = await response.json();
    state.serverModels = data.models || [];
    renderModelList();
  } catch (error) {
    console.error('Fetch models error:', error);
    elements.modelList.innerHTML = '<div class="model-error">Failed to load models from server</div>';
  }
}

function renderModelList() {
  if (state.serverModels.length === 0) {
    elements.modelList.innerHTML = '<div class="model-empty">No models available on server</div>';
    return;
  }

  elements.modelList.innerHTML = state.serverModels.map(model => `
    <div class="model-item" data-url="${model.url}" data-name="${model.name}">
      <span class="model-item-name">${model.name.replace('.onnx', '')}</span>
      <span class="model-item-size">${model.sizeFormatted}</span>
    </div>
  `).join('');

  // Add click handlers
  elements.modelList.querySelectorAll('.model-item').forEach(item => {
    item.addEventListener('click', () => selectServerModel(item));
  });
}

async function selectServerModel(item) {
  // Highlight selected
  elements.modelList.querySelectorAll('.model-item').forEach(i => i.classList.remove('selected'));
  item.classList.add('selected', 'loading');

  const url = item.dataset.url;
  const name = item.dataset.name;

  updateModelStatus('loading', 'Loading...');

  try {
    let modelBuffer;

    // Try cache first
    const cached = await loadModelFromCache(url);
    if (cached) {
      modelBuffer = cached;
      showToast('Model loaded from cache', 'success');
    } else {
      // Download
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      modelBuffer = await response.arrayBuffer();
      await saveModelToCache(url, modelBuffer);
      showToast('Model downloaded and cached', 'success');
    }

    // Create session
    const backend = elements.backendSelect.value;
    const executionProviders = backend === 'auto' ? [] : [backend];
    state.session = await window.ort.InferenceSession.create(modelBuffer, { executionProviders });

    state.modelInfo = { name, size: modelBuffer.byteLength, provider: backend };

    // Update UI
    elements.modelInfo.style.display = 'block';
    elements.infoName.textContent = name;
    elements.infoSize.textContent = formatBytes(modelBuffer.byteLength);

    updateModelStatus('ready', 'Ready');
    checkReadyState();

  } catch (error) {
    console.error('Load error:', error);
    updateModelStatus('error', 'Error');
    showToast(`Failed to load model: ${error.message}`, 'error');
  } finally {
    item.classList.remove('loading');
  }
}

// Local Model Loading
async function loadLocalModel(file) {
  if (!file.name.endsWith('.onnx')) {
    showToast('Please select an ONNX file', 'error');
    return;
  }

  updateModelStatus('loading', 'Loading...');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const backend = elements.backendSelect.value;
    const executionProviders = backend === 'auto' ? [] : [backend];
    state.session = await window.ort.InferenceSession.create(arrayBuffer, { executionProviders });

    state.modelInfo = { name: file.name, size: arrayBuffer.byteLength, provider: backend };

    elements.modelInfo.style.display = 'block';
    elements.infoName.textContent = file.name;
    elements.infoSize.textContent = formatBytes(arrayBuffer.byteLength);

    updateModelStatus('ready', 'Ready');
    showToast('Local model loaded', 'success');
    checkReadyState();

  } catch (error) {
    console.error('Load error:', error);
    updateModelStatus('error', 'Error');
    showToast(`Failed to load model: ${error.message}`, 'error');
  }
}

// Image Handling
function handleImageUpload(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please upload a valid image', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('Image must be under 10MB', 'error');
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

  let { width, height } = img;
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

// YOLO Processing
async function preprocessImage(img, targetSize = 640) {
  const [h, w] = [img.height, img.width];
  const scale = Math.min(targetSize / h, targetSize / w);
  const [newH, newW] = [Math.round(h * scale), Math.round(w * scale)];

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.drawImage(img, 0, 0, newW, newH);

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
    scale, pad: { left: 0, top: 0 }, originalSize: { width: w, height: h }, canvas
  };
}

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function xywh2xyxy(x, y, w, h) {
  return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
}

function applyNMS(boxes, scores, iouThreshold = 0.45) {
  const indices = scores.map((score, i) => ({ score, index: i }))
    .sort((a, b) => b.score - a.score);
  const keep = [];

  while (indices.length > 0) {
    const current = indices.shift();
    keep.push(current);

    for (let i = indices.length - 1; i >= 0; i--) {
      const item = indices[i];
      const [ax1, ay1, ax2, ay2] = boxes[current.index];
      const [bx1, by1, bx2, by2] = boxes[item.index];

      const interX1 = Math.max(ax1, bx1);
      const interY1 = Math.max(ay1, by1);
      const interX2 = Math.min(ax2, bx2);
      const interY2 = Math.min(ay2, by2);
      const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
      const areaA = (ax2 - ax1) * (ay2 - ay1);
      const areaB = (bx2 - bx1) * (by2 - by1);
      const iou = interArea / (areaA + areaB - interArea);

      if (iou > iouThreshold) indices.splice(i, 1);
    }
  }
  return keep;
}

async function postprocess(output, preprocessData, confThreshold = 0.25) {
  const { scale, originalSize } = preprocessData;
  const outputData = output.data;
  const numClasses = 80;
  const numBoxes = 8400;

  const boxes = [], scores = [], classIds = [];

  for (let i = 0; i < numBoxes; i++) {
    let maxScore = 0, classId = 0;
    for (let c = 0; c < numClasses; c++) {
      const score = sigmoid(outputData[c * numBoxes + i]);
      if (score > maxScore) { maxScore = score; classId = c; }
    }
    if (maxScore > confThreshold) {
      const cx = outputData[numClasses * numBoxes + i];
      const cy = outputData[(numClasses + 1) * numBoxes + i];
      const w = outputData[(numClasses + 2) * numBoxes + i];
      const h = outputData[(numClasses + 3) * numBoxes + i];
      const [x1, y1, x2, y2] = xywh2xyxy(cx, cy, w, h);
      const s = 1 / scale;
      boxes.push([Math.max(0, (x1) * s), Math.max(0, (y1) * s),
                  Math.min(originalSize.width, (x2) * s), Math.min(originalSize.height, (y2) * s)]);
      scores.push(maxScore);
      classIds.push(classId);
    }
  }

  const nmsIndices = applyNMS(boxes, scores);
  const resultsCanvas = document.createElement('canvas');
  resultsCanvas.width = originalSize.width;
  resultsCanvas.height = originalSize.height;
  const ctx = resultsCanvas.getContext('2d');
  ctx.drawImage(state.imageData, 0, 0);

  const colors = ['#00ff88', '#ff3366', '#00ccff', '#ffaa00', '#ff00ff', '#88ff00'];
  const detections = [];

  for (const { index } of nmsIndices) {
    const [x1, y1, x2, y2] = boxes[index];
    const color = colors[classIds[index] % colors.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    const label = `${CLASS_NAMES[classIds[index]]} ${(scores[index] * 100).toFixed(1)}%`;
    ctx.font = '14px JetBrains Mono';
    ctx.fillStyle = color;
    ctx.fillRect(x1, y1 - 20, ctx.measureText(label).width + 8, 20);
    ctx.fillStyle = '#000';
    ctx.fillText(label, x1 + 4, y1 - 6);

    detections.push({ classId: classIds[index], className: CLASS_NAMES[classIds[index]], confidence: scores[index], bbox: [x1, y1, x2, y2] });
  }

  return { detections, canvas: resultsCanvas };
}

// Inference
async function runInference() {
  if (!state.session || !state.imageData) {
    showToast('Please load a model and upload an image', 'error');
    return;
  }

  updateRunButton(false, true);
  const timings = {};

  try {
    const preprocessStart = performance.now();
    const preprocessData = await preprocessImage(state.imageData);
    timings.preprocess = performance.now() - preprocessStart;

    const inferenceStart = performance.now();
    const feeds = { images: preprocessData.tensor };
    const output = await state.session.run(feeds);
    timings.inference = performance.now() - inferenceStart;

    const postprocessStart = performance.now();
    const { detections, canvas } = await postprocess(output[Object.keys(output)[0]], preprocessData);
    timings.postprocess = performance.now() - postprocessStart;

    state.results = detections;
    displayMetrics(timings);
    displayResults(canvas, detections);

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

function displayMetrics(timings) {
  const { preprocess, inference, postprocess } = timings;
  const total = preprocess + inference + postprocess;

  elements.preprocessTime.textContent = preprocess.toFixed(1) + ' ms';
  elements.inferenceTime.textContent = inference.toFixed(1) + ' ms';
  elements.postprocessTime.textContent = postprocess.toFixed(1) + ' ms';
  elements.totalTime.textContent = total.toFixed(1) + ' ms';

  const p = (v) => (v / total * 100).toFixed(0);
  elements.preprocessBar.style.width = p(preprocess) + '%';
  elements.inferenceBar.style.width = p(inference) + '%';
  elements.postprocessBar.style.width = p(postprocess) + '%';
  elements.preprocessPercent.textContent = p(preprocess) + '%';
  elements.inferencePercent.textContent = p(inference) + '%';
  elements.postprocessPercent.textContent = p(postprocess) + '%';
}

function updateStats(times) {
  const total = times.reduce((a, b) => a + b, 0);
  elements.runCount.textContent = state.runStats.count;
  elements.avgTime.textContent = (total / times.length).toFixed(1) + ' ms';
  elements.minTime.textContent = Math.min(...times).toFixed(1) + ' ms';
  elements.maxTime.textContent = Math.max(...times).toFixed(1) + ' ms';
}

function displayResults(canvas, detections) {
  elements.resultsSection.style.display = 'block';
  const ctx = elements.resultsCanvas.getContext('2d');
  elements.resultsCanvas.width = canvas.width;
  elements.resultsCanvas.height = canvas.height;
  ctx.drawImage(canvas, 0, 0);

  elements.detectionCount.textContent = `${detections.length} object${detections.length !== 1 ? 's' : ''} detected`;
  elements.detectionsList.innerHTML = detections.map(d => `
    <div class="detection-item">
      <span class="class-name">${d.className}</span>
      <span class="confidence">${(d.confidence * 100).toFixed(1)}%</span>
    </div>
  `).join('');
}

function exportResults() {
  const data = {
    model: state.modelInfo,
    imageSize: state.imageData ? { width: state.imageData.width, height: state.imageData.height } : null,
    stats: {
      runCount: state.runStats.count,
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

// Event Listeners
elements.uploadZone.addEventListener('click', () => elements.fileInput.click());
elements.fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) handleImageUpload(e.target.files[0]);
});
elements.uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); elements.uploadZone.classList.add('dragover'); });
elements.uploadZone.addEventListener('dragleave', () => elements.uploadZone.classList.remove('dragover'));
elements.uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  elements.uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleImageUpload(e.dataTransfer.files[0]);
});
elements.clearImageBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  state.imageData = null;
  elements.imagePreview.style.display = 'none';
  elements.uploadPlaceholder.style.display = 'flex';
  checkReadyState();
});

elements.localModelBtn.addEventListener('click', () => elements.onnxFileInput.click());
elements.onnxFileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) loadLocalModel(e.target.files[0]);
});

elements.runBtn.addEventListener('click', runInference);
elements.exportBtn.addEventListener('click', exportResults);

// Init
updateModelStatus('', 'Not Loaded');
updateRunButton(false);
fetchServerModels();
