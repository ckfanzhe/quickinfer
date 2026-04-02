import elements from './elements.js';
import { updateBackendDisplay } from './utils.js';
import { drawDetectionsOnPreview } from './yolo.js';

// Display performance metrics
export function displayMetrics(timings) {
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

// Update run statistics
export function updateStats(times, count) {
  const total = times.reduce((a, b) => a + b, 0);
  elements.runCount.textContent = count;
  elements.avgTime.textContent = (total / times.length).toFixed(1) + ' ms';
  elements.minTime.textContent = Math.min(...times).toFixed(1) + ' ms';
  elements.maxTime.textContent = Math.max(...times).toFixed(1) + ' ms';
}

// Display detection results on preview canvas
export function displayResults(imageData, displayScale, detections) {
  drawDetectionsOnPreview(elements.previewCanvas, imageData, displayScale, detections);
  displayScale.displayed = true;
}

// Enable export button
export function enableExport() {
  elements.exportBtn.disabled = false;
}

// Render example images grid
export function renderExampleImages(examples) {
  if (!elements.examplesGrid) return;

  elements.examplesGrid.innerHTML = examples.map((img, idx) => `
    <div class="example-item" data-index="${idx}">
      <img src="${img.src}" alt="${img.name}">
      <span class="example-label">${img.name}</span>
    </div>
  `).join('');
}

// Export results to JSON
export function exportResults(modelInfo, imageData, runStats, results) {
  const data = {
    model: modelInfo,
    imageSize: imageData ? { width: imageData.width, height: imageData.height } : null,
    stats: {
      runCount: runStats.count,
      avg: (runStats.times.reduce((a, b) => a + b, 0) / runStats.times.length).toFixed(2),
      min: Math.min(...runStats.times).toFixed(2),
      max: Math.max(...runStats.times).toFixed(2)
    },
    detections: results
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yolo-benchmark-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  return data;
}