/**
 * YOLOv8 ONNX Minimal Test Script (Node.js)
 * Usage: node test_inference.mjs
 */

import { Jimp } from 'jimp';
import { InferenceSession } from 'onnxruntime-node';
import { Tensor } from 'onnxruntime-common';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const sigmoid = x => 1 / (1 + Math.exp(-x));

const xywh2xyxy = (x, y, w, h) => [x - w/2, y - h/2, x + w/2, y + h/2];

function applyNMS(boxes, scores, iouThreshold = 0.5) {
  const indices = scores.map((s, i) => ({ score: s, index: i }))
    .sort((a, b) => b.score - a.score);
  const keep = [];
  const suppressed = new Array(boxes.length).fill(false);

  for (const item of indices) {
    if (suppressed[item.index]) continue;
    keep.push(item);
    for (let i = 0; i < indices.length; i++) {
      const other = indices[i];
      if (suppressed[other.index] || other.index === item.index) continue;
      const [a, b, c, d] = boxes[item.index];
      const [e, f, g, h] = boxes[other.index];
      const x1 = Math.max(a, e), y1 = Math.max(b, f);
      const x2 = Math.min(c, g), y2 = Math.min(d, h);
      const inter = Math.max(0, x2-x1) * Math.max(0, y2-y1);
      const area = (c-a)*(d-b) + (g-e)*(h-f) - inter;
      if (area > 0 && inter / area > iouThreshold) suppressed[other.index] = true;
    }
  }
  return keep;
}

async function preprocessImage(img, targetSize = 640) {
  const { width: w, height: h } = img;
  const scale = Math.min(targetSize / h, targetSize / w);
  const newH = Math.round(h * scale), newW = Math.round(w * scale);

  const resized = img.resize({ w: newW, h: newH });

  // Create 640x640 letterbox
  const canvas = new Jimp({ width: targetSize, height: targetSize, color: 0x808080ff });

  // Paste resized image at top-left
  canvas.composite(resized, 0, 0);

  // Get RGBA data
  const { data } = canvas.bitmap;
  const float32 = new Float32Array(3 * targetSize * targetSize);

  for (let i = 0; i < targetSize * targetSize; i++) {
    float32[i]                     = data[i*4] / 255;           // R
    float32[targetSize*targetSize + i] = data[i*4+1] / 255;     // G
    float32[2*targetSize*targetSize + i] = data[i*4+2] / 255;   // B
  }

  return {
    tensor: new Float32Array(float32.buffer),
    pad: { left: 0, top: 0, right: targetSize - newW, bottom: targetSize - newH },
    scale, newW, newH,
    originalSize: { width: w, height: h }
  };
}

async function postprocess(output, prep, confThreshold = 0.65) {
  const { data } = output;
  const numClasses = 80;
  const numBoxes = 8400;

  // Format: [1, 84, 8400] features-first
  // Indexing: data[featureIdx * numBoxes + boxIdx]
  const getVal = (featureIdx, boxIdx) => data[featureIdx * numBoxes + boxIdx];

  const boxes = [], scores = [], classIds = [];

  for (let i = 0; i < numBoxes; i++) {
    const cx = getVal(0, i), cy = getVal(1, i), w = getVal(2, i), h = getVal(3, i);

    let maxScore = 0, classId = 0;
    for (let c = 0; c < numClasses; c++) {
      const s = sigmoid(getVal(4 + c, i));
      if (s > maxScore) { maxScore = s; classId = c; }
    }

    if (maxScore > confThreshold) {
      const [x1, y1, x2, y2] = xywh2xyxy(cx, cy, w, h);
      const sx = prep.originalSize.width / (640 - prep.pad.left - prep.pad.right);
      const sy = prep.originalSize.height / (640 - prep.pad.top - prep.pad.bottom);
      boxes.push([
        Math.max(0, (x1 - prep.pad.left) * sx),
        Math.max(0, (y1 - prep.pad.top) * sy),
        Math.min(prep.originalSize.width, (x2 - prep.pad.left) * sx),
        Math.min(prep.originalSize.height, (y2 - prep.pad.top) * sy)
      ]);
      scores.push(maxScore);
      classIds.push(classId);
    }
  }

  console.log(`  Boxes after conf filter: ${boxes.length}`);
  const keep = applyNMS(boxes, scores);
  console.log(`  Boxes after NMS: ${keep.length}`);

  return keep.map(({ index }) => ({
    classId: classIds[index],
    className: CLASS_NAMES[classIds[index]],
    confidence: scores[index],
    bbox: boxes[index]
  }));
}

async function main() {
  const modelPath = join(__dirname, 'models', 'yolov8s.onnx');
  const imagePath = join(__dirname, 'test_img', 'bus.jpg');

  console.log('='.repeat(50));
  console.log('YOLOv8 ONNX Minimal Test (Node.js)');
  console.log('='.repeat(50));

  // 1. Load model
  console.log('\n[1] Loading model...');
  let session;
  try {
    const t0 = Date.now();
    session = await InferenceSession.create(modelPath);
    console.log(`    Model loaded in ${Date.now()-t0}ms`);
  } catch (e) {
    console.error('Failed to load model:', e.message);
    process.exit(1);
  }

  // 2. Load image
  console.log('\n[2] Loading image...');
  let img;
  try {
    const t0 = Date.now();
    img = await Jimp.read(imagePath);
    console.log(`    Image loaded: ${img.width}x${img.height} in ${Date.now()-t0}ms`);
  } catch (e) {
    console.error('Failed to load image:', e.message);
    process.exit(1);
  }

  // 3. Preprocess
  console.log('\n[3] Preprocessing...');
  const prep = await preprocessImage(img);
  console.log(`    Letterbox: ${prep.newW}x${prep.newH}`);
  console.log(`    Padding: L=${prep.pad.left} T=${prep.pad.top} R=${prep.pad.right} B=${prep.pad.bottom}`);
  console.log(`    Scale: ${prep.scale.toFixed(3)}`);

  // 4. Run inference
  console.log('\n[4] Running inference...');
  const inputTensor = new Tensor(new Float32Array(prep.tensor), [1, 3, 640, 640]);
  const t0 = Date.now();
  const output = await session.run({ images: inputTensor });
  const elapsed = Date.now() - t0;
  console.log(`    Done in ${elapsed}ms`);

  const key = Object.keys(output)[0];
  console.log(`    Output shape: [${output[key].dims.join(', ')}]`);

  // 5. Postprocess
  console.log('\n[5] Postprocessing...');
  const detections = await postprocess(output[key], prep);

  // 6. Results
  console.log('\n' + '='.repeat(50));
  console.log(`DETECTIONS (${detections.length}):`);
  console.log('='.repeat(50));
  for (const d of detections) {
    const [x1, y1, x2, y2] = d.bbox.map(v => v.toFixed(0));
    console.log(`  ${d.className.padEnd(12)} ${(d.confidence*100).toFixed(1)}%  [${x1},${y1},${x2},${y2}]`);
  }
  console.log('='.repeat(50));

  // Expected: 1 bus + 3-4 persons for bus.jpg
  const busCount = detections.filter(d => d.className === 'bus').length;
  const personCount = detections.filter(d => d.className === 'person').length;
  console.log(`\nSummary: ${busCount} bus(es), ${personCount} person(s)`);

  if (busCount === 1 && personCount >= 3) {
    console.log('\n✓ TEST PASSED');
  } else {
    console.log('\n✗ TEST FAILED - expected ~1 bus and ~3-4 persons');
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
