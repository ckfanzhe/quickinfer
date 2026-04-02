import {
  DEFAULT_TARGET_SIZE,
  DEFAULT_CONF_THRESHOLD,
  DEFAULT_IOU_THRESHOLD,
  DEFAULT_NUM_CLASSES,
  DEFAULT_NUM_BOXES,
  CLASS_NAMES,
  DETECTION_COLORS
} from './constants.js';

// Image preprocessing for YOLO
export async function preprocessImage(img, targetSize = DEFAULT_TARGET_SIZE) {
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

// Math utilities
export function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

export function xywh2xyxy(x, y, w, h) {
  return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
}

// Non-Maximum Suppression
export function applyNMS(boxes, scores, iouThreshold = DEFAULT_IOU_THRESHOLD) {
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

// Postprocess YOLO output
export async function postprocess(output, preprocessData, confThreshold = DEFAULT_CONF_THRESHOLD) {
  const iouThreshold = DEFAULT_IOU_THRESHOLD;
  const { scale, originalSize, pad } = preprocessData;
  const outputData = output.data;
  const numClasses = DEFAULT_NUM_CLASSES;
  const numBoxes = DEFAULT_NUM_BOXES;

  // YOLOv8 ONNX output format is [1, 84, 8400] features-first
  // Indexing: data[featureIdx * numBoxes + boxIdx]
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

  // Create results canvas
  const resultsCanvas = document.createElement('canvas');
  resultsCanvas.width = originalSize.width;
  resultsCanvas.height = originalSize.height;
  const ctx = resultsCanvas.getContext('2d');
  ctx.drawImage(preprocessData.canvas, 0, 0, originalSize.width, originalSize.height);

  const detections = [];

  for (const { index } of nmsIndices) {
    const [x1, y1, x2, y2] = boxes[index];
    const color = DETECTION_COLORS[classIds[index] % DETECTION_COLORS.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    const label = `${CLASS_NAMES[classIds[index]]} ${(scores[index] * 100).toFixed(1)}%`;
    ctx.font = '14px JetBrains Mono';
    ctx.fillStyle = color;
    ctx.fillRect(x1, y1 - 20, ctx.measureText(label).width + 8, 20);
    ctx.fillStyle = '#000';
    ctx.fillText(label, x1 + 4, y1 - 6);

    detections.push({
      classId: classIds[index],
      className: CLASS_NAMES[classIds[index]],
      confidence: scores[index],
      bbox: [x1, y1, x2, y2]
    });
  }

  return { detections, canvas: resultsCanvas };
}

// Draw detections on preview canvas with letterbox coordinates
export function drawDetectionsOnPreview(previewCanvas, imageData, displayScale, detections) {
  const ctx = previewCanvas.getContext('2d');
  const { scaleX, scaleY, offsetX, offsetY } = displayScale;

  // Redraw the original image with letterbox
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

  // Calculate display dimensions
  const displayWidth = imageData.width * scaleX;
  const displayHeight = imageData.height * scaleY;

  // Draw image centered with letterbox
  ctx.drawImage(
    imageData,
    offsetX, offsetY, displayWidth, displayHeight
  );

  // Draw detection boxes on preview canvas
  _drawDetectionBoxes(ctx, detections, scaleX, scaleY, offsetX, offsetY);

  return previewCanvas;
}

// Draw webcam video frame with detections
export function drawWebcamFrame(previewCanvas, video, displayScale, detections) {
  const ctx = previewCanvas.getContext('2d');
  const { offsetX, offsetY, displayWidth, displayHeight, scaleX, scaleY } = displayScale;

  // Clear with dark background for letterbox
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

  // Draw video frame centered
  ctx.drawImage(video, offsetX, offsetY, displayWidth, displayHeight);

  // Draw detection boxes
  _drawDetectionBoxes(ctx, detections, scaleX, scaleY, offsetX, offsetY);

  return previewCanvas;
}

// Internal helper to draw detection boxes
function _drawDetectionBoxes(ctx, detections, scaleX, scaleY, offsetX, offsetY) {
  for (const d of detections) {
    const [x1, y1, x2, y2] = d.bbox;
    const color = DETECTION_COLORS[d.classId % DETECTION_COLORS.length];

    // Scale and offset coordinates to displayed image position
    const sx1 = offsetX + x1 * scaleX;
    const sy1 = offsetY + y1 * scaleY;
    const sx2 = offsetX + x2 * scaleX;
    const sy2 = offsetY + y2 * scaleY;
    const boxWidth = sx2 - sx1;
    const boxHeight = sy2 - sy1;

    // Skip invalid boxes
    if (boxWidth <= 0 || boxHeight <= 0) continue;

    // Draw box
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx1, sy1, boxWidth, boxHeight);

    // Draw label background
    const label = `${d.className} ${(d.confidence * 100).toFixed(0)}%`;
    ctx.font = 'bold 12px JetBrains Mono';
    const textMetrics = ctx.measureText(label);
    const padding = 3;

    ctx.fillStyle = color;
    ctx.fillRect(sx1, sy1 - 18, textMetrics.width + padding * 2, 16);

    // Draw label text
    ctx.fillStyle = '#000';
    ctx.fillText(label, sx1 + padding, sy1 - 5);
  }
}