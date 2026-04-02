import { loadModelFromCache, saveModelToCache } from './model-cache.js';
import busImg from './test_img/bus.jpg';
import zidaneImg from './test_img/zidane.jpg';

// Use ONNX Runtime from global window (loaded via script tag in index.html)

// Model URLs - built at compile time via vite define
// Format: ModelScope URL for CORS support
const MODEL_URLS = import.meta.env.VITE_MODEL_URLS || '[]';

// Example images
const EXAMPLE_IMAGES = [
  { name: 'Bus', src: busImg },
  { name: 'Zidane', src: zidaneImg }
];

// App State
const state = {
  session: null,
  modelInfo: null,
  modelBuffer: null,  // Store buffer to recreate session with different backend
  imageData: null,
  results: [],
  runStats: { count: 0, times: [] },
  serverModels: [],
  // Image display info for coordinate mapping
  displayScale: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, displayed: false }
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
  backendCurrent: $('backendCurrent'),
  backendBadge: $('backendBadge'),
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
  toastContainer: $('toastContainer'),
  examplesGrid: $('examplesGrid')
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

async function switchBackend() {
  if (!state.modelBuffer) {
    showToast('Please load a model first', 'error');
    return;
  }

  const backend = elements.backendSelect.value;
  updateModelStatus('loading', 'Switching backend...');

  try {
    const executionProviders = backend === 'auto' ? [] : [backend];
    state.session = await window.ort.InferenceSession.create(state.modelBuffer, { executionProviders });
    state.modelInfo.provider = backend;

    updateModelStatus('ready', 'Ready');
    updateBackendDisplay(backend);
    showToast(`Switched to ${backend === 'wasm' ? 'WASM' : (backend === 'webgpu' ? 'WebGPU' : (backend === 'webgl' ? 'WebGL' : 'Auto'))}`, 'success');
  } catch (error) {
    console.error('Backend switch error:', error);
    updateModelStatus('error', 'Error');
    if (error.message && error.message.includes('resize') && error.message.includes('nearest')) {
      showToast(`${backend} does not support this model. Try another backend.`, 'error');
    } else {
      showToast(`Failed to switch backend: ${error.message}`, 'error');
    }
  }
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

// Server Models - fully static, no server API needed
function fetchServerModels() {
  // Build GitHub Release URLs for models
  // MODEL_URLS is replaced at build time to the actual array via vite define
  // In dev mode fallback, it may be a JSON string that needs parsing
  try {
    state.serverModels = Array.isArray(MODEL_URLS) ? MODEL_URLS : JSON.parse(MODEL_URLS || '[]');
  } catch {
    state.serverModels = [];
  }
  renderModelList();
}

function renderModelList() {
  if (state.serverModels.length === 0) {
    elements.modelList.innerHTML = '<div class="model-empty">No models available</div>';
    return;
  }

  elements.modelList.innerHTML = state.serverModels.map(model => `
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
    item.addEventListener('click', () => selectServerModel(item));
  });
}

async function selectServerModel(item) {
  // Highlight selected
  elements.modelList.querySelectorAll('.model-item').forEach(i => i.classList.remove('selected'));
  item.classList.add('selected', 'loading');

  const name = item.dataset.name;
  const url = item.dataset.url;
  const downloadBar = item.querySelector('.model-download-bar');
  const downloadProgress = item.querySelector('.model-download-progress');

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
    const backend = elements.backendSelect.value;
    const executionProviders = backend === 'auto' ? [] : [backend];
    state.session = await window.ort.InferenceSession.create(modelBuffer, { executionProviders });

    state.modelInfo = { name, size: modelBuffer.byteLength, provider: backend };
    state.modelBuffer = modelBuffer;  // Save for backend switch

    // Update UI
    elements.modelInfo.style.display = 'block';
    elements.infoName.textContent = name;
    elements.infoSize.textContent = formatBytes(modelBuffer.byteLength);

    updateModelStatus('ready', 'Ready');
    checkReadyState();

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

// Local Model Loading
async function loadLocalModel(file) {
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
    const backend = elements.backendSelect.value;
    const executionProviders = backend === 'auto' ? [] : [backend];
    state.session = await window.ort.InferenceSession.create(arrayBuffer, { executionProviders });

    state.modelInfo = { name: file.name, size: arrayBuffer.byteLength, provider: backend };
    state.modelBuffer = arrayBuffer;  // Save for backend switch

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
  } finally {
    elements.localModelBtn.classList.remove('loading');
    elements.localModelBtn.disabled = false;
    btnText.textContent = originalText;
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
  let offsetX = 0, offsetY = 0;
  let scaleX = 1, scaleY = 1;

  if (width > maxWidth) {
    height = (maxWidth / width) * height;
    width = maxWidth;
  }
  if (height > maxHeight) {
    width = (maxHeight / height) * width;
    height = maxHeight;
  }

  // Calculate scaling and offset for coordinate mapping
  // The image is scaled to fit within maxWidth x maxHeight while preserving aspect ratio
  // and centered with letterboxing
  scaleX = width / img.width;
  scaleY = height / img.height;
  offsetX = (maxWidth - width) / 2;
  offsetY = (maxHeight - height) / 2;

  // Store display info for coordinate mapping
  state.displayScale = { scaleX, scaleY, offsetX, offsetY, displayed: false };

  elements.previewCanvas.width = maxWidth;
  elements.previewCanvas.height = maxHeight;

  // Clear canvas with dark background for letterbox
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, maxWidth, maxHeight);

  // Draw image centered
  ctx.drawImage(img, offsetX, offsetY, width, height);
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
    scale,
    pad: {
      left: 0,
      top: 0,
      right: targetSize - newW,
      bottom: targetSize - newH
    },
    originalSize: { width: w, height: h },
    resizedSize: { width: newW, height: newH },
    canvas
  };
}

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function xywh2xyxy(x, y, w, h) {
  return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
}

function applyNMS(boxes, scores, iouThreshold = 0.5) {
  // Sort by score descending
  const indices = scores
    .map((score, i) => ({ score, index: i }))
    .sort((a, b) => b.score - a.score);

  const keep = [];
  const suppressed = new Array(boxes.length).fill(false);

  for (const item of indices) {
    if (suppressed[item.index]) continue;

    keep.push(item);

    // Suppress boxes with high IoU
    for (let i = 0; i < indices.length; i++) {
      const other = indices[i];
      if (suppressed[other.index] || other.index === item.index) continue;

      const boxA = boxes[item.index];
      const boxB = boxes[other.index];

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
        suppressed[other.index] = true;
      }
    }
  }

  return keep;
}

async function postprocess(output, preprocessData, confThreshold = 0.65) {
  const iouThreshold = 0.5;
  const { scale, originalSize, pad } = preprocessData;
  const outputData = output.data;
  const numClasses = 80;
  const numBoxes = 8400;

  // YOLOv8 ONNX output format is [1, 84, 8400] features-first
  // Indexing: data[featureIdx * numBoxes + boxIdx]
  // Python and Node.js both confirm this format
  const isFeaturesFirst = output.dims[1] === 84 && output.dims[2] === 8400;

  // Helper to access bbox and class scores based on detected format
  const getBbox = (boxIdx) => {
    if (isFeaturesFirst) {
      return [
        outputData[0 * numBoxes + boxIdx],  // cx
        outputData[1 * numBoxes + boxIdx],  // cy
        outputData[2 * numBoxes + boxIdx],  // w
        outputData[3 * numBoxes + boxIdx]   // h
      ];
    } else {
      // [1, 8400, 84] format: boxIdx * 84 + featureIdx
      return [
        outputData[boxIdx * 84 + 0],  // cx
        outputData[boxIdx * 84 + 1],  // cy
        outputData[boxIdx * 84 + 2],  // w
        outputData[boxIdx * 84 + 3]   // h
      ];
    }
  };

  const getClassScore = (boxIdx, classIdx) => {
    if (isFeaturesFirst) {
      return sigmoid(outputData[(4 + classIdx) * numBoxes + boxIdx]);
    } else {
      return sigmoid(outputData[boxIdx * 84 + 4 + classIdx]);
    }
  };

  console.log('Detected output format:', isFeaturesFirst ? '[1,84,8400] (features first)' : '[1,8400,84] (boxes first)');

  const boxes = [], scores = [], classIds = [];

  for (let i = 0; i < numBoxes; i++) {
    let maxScore = 0, classId = 0;

    // Find max class score
    for (let c = 0; c < numClasses; c++) {
      const score = getClassScore(i, c);
      if (score > maxScore) { maxScore = score; classId = c; }
    }

    if (maxScore > confThreshold) {
      const [cx, cy, w, h] = getBbox(i);
      const [x1, y1, x2, y2] = xywh2xyxy(cx, cy, w, h);

      // Scale coordinates back to original image size
      // Model outputs in letterbox space (0 to 640)
      // Need to account for padding and scaling
      const scaleX = originalSize.width / (640 - pad.left - pad.right);
      const scaleY = originalSize.height / (640 - pad.top - pad.bottom);

      boxes.push([
        Math.max(0, (x1 - pad.left) * scaleX),
        Math.max(0, (y1 - pad.top) * scaleY),
        Math.min(originalSize.width, (x2 - pad.left) * scaleX),
        Math.min(originalSize.height, (y2 - pad.top) * scaleY)
      ]);
      scores.push(maxScore);
      classIds.push(classId);
    }
  }

  console.log('Boxes after confidence filtering:', boxes.length);
  const nmsIndices = applyNMS(boxes, scores, iouThreshold);
  console.log('Boxes after NMS:', nmsIndices.length);
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

    // Debug: check output shape
    const outputKey = Object.keys(output)[0];
    const outputTensor = output[outputKey];
    console.log('Output shape:', outputTensor.dims);
    console.log('Output data sample (first 10):', outputTensor.data.slice(0, 10));

    const postprocessStart = performance.now();
    const { detections, canvas } = await postprocess(output[outputKey], preprocessData);
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

    // Check if WebGL error with resize
    if (error.message && error.message.includes('resize') && error.message.includes('nearest')) {
      showToast('WebGL does not support this model. Try WebGPU or WASM backend.', 'error');
    } else {
      showToast(`Inference failed: ${error.message}`, 'error');
    }
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

  // Update backend display
  updateBackendDisplay(elements.backendSelect.value);
}

function updateStats(times) {
  const total = times.reduce((a, b) => a + b, 0);
  elements.runCount.textContent = state.runStats.count;
  elements.avgTime.textContent = (total / times.length).toFixed(1) + ' ms';
  elements.minTime.textContent = Math.min(...times).toFixed(1) + ' ms';
  elements.maxTime.textContent = Math.max(...times).toFixed(1) + ' ms';
}

function displayResults(canvas, detections) {
  // Draw detection boxes directly on the preview canvas (uploaded image)
  const ctx = elements.previewCanvas.getContext('2d');
  const { scaleX, scaleY, offsetX, offsetY } = state.displayScale;

  // Redraw the original image with letterbox
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, elements.previewCanvas.width, elements.previewCanvas.height);

  // Calculate display dimensions
  const displayWidth = canvas.width * scaleX;
  const displayHeight = canvas.height * scaleY;

  // Draw image centered with letterbox
  ctx.drawImage(
    state.imageData,
    offsetX, offsetY, displayWidth, displayHeight
  );

  // Draw detection boxes on preview canvas
  const colors = ['#00ff88', '#ff3366', '#00ccff', '#ffaa00', '#ff00ff', '#88ff00'];

  for (const d of detections) {
    const [x1, y1, x2, y2] = d.bbox;
    const color = colors[d.classId % colors.length];

    // Scale and offset coordinates to displayed image position
    const sx1 = offsetX + x1 * scaleX;
    const sy1 = offsetY + y1 * scaleY;
    const sx2 = offsetX + x2 * scaleX;
    const sy2 = offsetY + y2 * scaleY;
    const boxWidth = sx2 - sx1;
    const boxHeight = sy2 - sy1;

    // Draw box
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx1, sy1, boxWidth, boxHeight);

    // Draw label background
    const label = `${d.className} ${(d.confidence * 100).toFixed(1)}%`;
    ctx.font = 'bold 14px JetBrains Mono';
    const textMetrics = ctx.measureText(label);
    const padding = 4;

    ctx.fillStyle = color;
    ctx.fillRect(sx1, sy1 - 22, textMetrics.width + padding * 2, 20);

    // Draw label text
    ctx.fillStyle = '#000';
    ctx.fillText(label, sx1 + padding, sy1 - 7);
  }

  // Mark as displayed
  state.displayScale.displayed = true;
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
  state.displayScale = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, displayed: false };
  // Clear the preview canvas
  const ctx = elements.previewCanvas.getContext('2d');
  ctx.clearRect(0, 0, elements.previewCanvas.width, elements.previewCanvas.height);
  elements.imagePreview.style.display = 'none';
  elements.uploadPlaceholder.style.display = 'flex';
  checkReadyState();
});

// Render example images
function renderExampleImages() {
  if (!elements.examplesGrid) return;
  elements.examplesGrid.innerHTML = EXAMPLE_IMAGES.map((img, idx) => `
    <div class="example-item" data-index="${idx}">
      <img src="${img.src}" alt="${img.name}">
      <span class="example-label">${img.name}</span>
    </div>
  `).join('');
}

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
    renderImagePreview(img);
    elements.uploadPlaceholder.style.display = 'none';
    elements.imagePreview.style.display = 'block';
    checkReadyState();
    showToast('Example image loaded', 'success');
  };
  img.onerror = () => showToast('Failed to load example image', 'error');
  img.src = imgData.src;
});

elements.localModelBtn.addEventListener('click', () => elements.onnxFileInput.click());
elements.onnxFileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) loadLocalModel(e.target.files[0]);
});

elements.runBtn.addEventListener('click', runInference);
elements.exportBtn.addEventListener('click', exportResults);
elements.backendSelect.addEventListener('change', () => {
  switchBackend();
});

function updateBackendDisplay(backend) {
  const text = backend === 'auto' ? 'Auto' : (backend === 'wasm' ? 'WASM' : (backend === 'webgpu' ? 'WebGPU' : 'WebGL'));
  const color = backend === 'wasm' ? 'var(--secondary)' : (backend === 'webgl' ? 'var(--warning)' : (backend === 'webgpu' ? 'var(--success)' : 'var(--primary)'));
  elements.backendCurrent.textContent = text;
  elements.backendCurrent.style.color = color;
  elements.backendBadge.textContent = text;
  elements.backendBadge.style.background = color === 'var(--success)' ? 'rgba(0, 255, 136, 0.15)' : (color === 'var(--secondary)' ? 'rgba(0, 204, 255, 0.15)' : (color === 'var(--warning)' ? 'rgba(255, 170, 0, 0.15)' : 'rgba(0, 255, 136, 0.15)'));
  elements.backendBadge.style.borderColor = color === 'var(--success)' ? 'var(--success)' : (color === 'var(--secondary)' ? 'var(--secondary)' : (color === 'var(--warning)' ? 'var(--warning)' : 'var(--primary)'));
  elements.backendBadge.style.color = color === 'var(--success)' ? 'var(--success)' : (color === 'var(--secondary)' ? 'var(--secondary)' : (color === 'var(--warning)' ? 'var(--warning)' : 'var(--primary)'));
}

// Init
updateModelStatus('', 'Not Loaded');
updateRunButton(false);
updateBackendDisplay(elements.backendSelect.value);
fetchServerModels();
renderExampleImages();
