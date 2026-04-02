import elements from './elements.js';
import { showToast } from './utils.js';

// Check if webcam is supported
export function isWebcamSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// Start webcam stream
export async function startWebcam() {
  // Check browser support
  if (!isWebcamSupported()) {
    showToast('Camera not supported in this browser. Try Chrome or Safari.', 'error');
    return null;
  }

  // Try rear camera first (mobile), then front camera, then any camera
  const constraintsList = [
    { video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } } },
    { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } } },
    { video: { facingMode: 'environment' } },
    { video: true }
  ];

  let lastError = null;

  for (const constraints of constraintsList) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        ...constraints,
        audio: false
      });

      elements.webcamVideo.srcObject = stream;
      await elements.webcamVideo.play();

      return stream;
    } catch (error) {
      lastError = error;
      // Try next constraint
    }
  }

  // All attempts failed
  console.error('Webcam error:', lastError);
  if (lastError.name === 'NotAllowedError' || lastError.name === 'PermissionDeniedError') {
    showToast('Camera access denied. Please allow camera permission in browser settings.', 'error');
  } else if (lastError.name === 'NotFoundError' || lastError.name === 'DevicesNotFoundError') {
    showToast('No camera found on this device.', 'error');
  } else if (lastError.name === 'NotReadableError' || lastError.name === 'TrackStartError') {
    showToast('Camera is in use by another app.', 'error');
  } else if (lastError.name === 'OverconstrainedError') {
    showToast('Camera does not support required settings.', 'error');
  } else {
    showToast(`Camera error: ${lastError.message}`, 'error');
  }
  return null;
}

// Stop webcam stream
export function stopWebcam(stream) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  if (elements.webcamVideo.srcObject) {
    elements.webcamVideo.srcObject = null;
  }
}

// Capture current video frame as Image
export function captureVideoFrame(video) {
  const canvas = document.createElement('canvas');
  // Use video dimensions or fallback to canvas display size
  canvas.width = video.videoWidth || video.clientWidth;
  canvas.height = video.videoHeight || video.clientHeight;

  // Skip if dimensions are still invalid
  if (canvas.width === 0 || canvas.height === 0) {
    return canvas;
  }

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  return canvas;
}

// Draw video frame to target canvas with letterbox
export function drawVideoFrame(video, targetCanvas, displayScale) {
  const ctx = targetCanvas.getContext('2d');
  const maxWidth = targetCanvas.width;
  const maxHeight = targetCanvas.height;

  const { offsetX, offsetY, displayWidth, displayHeight } = displayScale;

  // Clear with dark background for letterbox
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, maxWidth, maxHeight);

  // Draw video frame centered
  ctx.drawImage(video, offsetX, offsetY, displayWidth, displayHeight);
}

// Calculate display scale for video frame to fit canvas with letterbox
export function calculateVideoDisplayScale(video, maxWidth, maxHeight) {
  let width = video.videoWidth || video.clientWidth || maxWidth;
  let height = video.videoHeight || video.clientHeight || maxHeight;

  // Fallback if dimensions are still invalid
  if (width === 0 || height === 0) {
    width = maxWidth;
    height = maxHeight;
  }

  if (width > maxWidth) {
    height = (maxWidth / width) * height;
    width = maxWidth;
  }
  if (height > maxHeight) {
    width = (maxHeight / height) * width;
    height = maxHeight;
  }

  const origWidth = video.videoWidth || width;
  const origHeight = video.videoHeight || height;
  const scaleX = width / origWidth;
  const scaleY = height / origHeight;
  const offsetX = (maxWidth - width) / 2;
  const offsetY = (maxHeight - height) / 2;

  return {
    scaleX,
    scaleY,
    offsetX,
    offsetY,
    displayWidth: width,
    displayHeight: height
  };
}
