// DOM element references
const $ = (id) => document.getElementById(id);

export const elements = {
  // Upload zone
  uploadZone: $('uploadZone'),
  uploadPlaceholder: $('uploadPlaceholder'),
  imagePreview: $('imagePreview'),
  previewCanvas: $('previewCanvas'),
  fileInput: $('fileInput'),
  clearImageBtn: $('clearImageBtn'),

  // Model selection
  modelStatus: $('modelStatus'),
  modelList: $('modelList'),
  localModelBtn: $('localModelBtn'),
  onnxFileInput: $('onnxFileInput'),
  modelInfo: $('modelInfo'),
  infoName: $('infoName'),
  infoSize: $('infoSize'),

  // Backend
  backendSelect: $('backendSelect'),
  backendCurrent: $('backendCurrent'),
  backendBadge: $('backendBadge'),

  // Inference
  runBtn: $('runBtn'),
  runHint: $('runHint'),

  // Metrics
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

  // Stats
  runCount: $('runCount'),
  avgTime: $('avgTime'),
  minTime: $('minTime'),
  maxTime: $('maxTime'),

  // Export
  exportBtn: $('exportBtn'),

  // Results (for overlay drawing)
  resultsSection: $('resultsSection'),
  resultsCanvas: $('resultsCanvas'),

  // Toast
  toastContainer: $('toastContainer'),

  // Examples
  examplesGrid: $('examplesGrid')
};

export default elements;