import elements from './elements.js';

// Handle image upload from file
export function handleImageUpload(file, onLoadComplete) {
  if (!file || !file.type.startsWith('image/')) {
    return { error: 'Please upload a valid image' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: 'Image must be under 10MB' };
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      elements.uploadPlaceholder.style.display = 'none';
      elements.imagePreview.style.display = 'block';

      if (onLoadComplete) {
        onLoadComplete(img);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);

  return { success: true };
}

// Render image preview with letterboxing
export function renderImagePreview(img, canvas) {
  const ctx = canvas.getContext('2d');
  const maxWidth = elements.uploadZone.clientWidth;
  const maxHeight = elements.uploadZone.clientHeight;

  let { width, height } = img;
  let offsetX = 0, offsetY = 0;
  let scaleX = 1, scaleY = 1;

  // Scale to fit within bounds while preserving aspect ratio
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

  canvas.width = maxWidth;
  canvas.height = maxHeight;

  // Clear canvas with dark background for letterbox
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, maxWidth, maxHeight);

  // Draw image centered
  ctx.drawImage(img, offsetX, offsetY, width, height);

  return { scaleX, scaleY, offsetX, offsetY };
}

// Clear image preview
export function clearImagePreview() {
  const ctx = elements.previewCanvas.getContext('2d');
  ctx.clearRect(0, 0, elements.previewCanvas.width, elements.previewCanvas.height);
  elements.imagePreview.style.display = 'none';
  elements.uploadPlaceholder.style.display = 'flex';
}

// Setup upload zone drag and drop handlers
export function setupDragDrop(handlers) {
  const { onDragOver, onDragLeave, onDrop, onClear } = handlers;

  elements.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadZone.classList.add('dragover');
    if (onDragOver) onDragOver(e);
  });

  elements.uploadZone.addEventListener('dragleave', () => {
    elements.uploadZone.classList.remove('dragover');
    if (onDragLeave) onDragLeave();
  });

  elements.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadZone.classList.remove('dragover');
    if (onDrop) onDrop(e);
  });

  elements.clearImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onClear) onClear();
  });
}