// YOLO Class Names (COCO dataset)
export const CLASS_NAMES = [
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

// Example images (imported via Vite for proper asset handling)
import busImg from '../test_img/bus.jpg';
import zidaneImg from '../test_img/zidane.jpg';

export const EXAMPLE_IMAGES = [
  { name: 'Bus', src: busImg },
  { name: 'Zidane', src: zidaneImg }
];

// Detection box colors
export const DETECTION_COLORS = [
  '#00ff88', '#ff3366', '#00ccff', '#ffaa00', '#ff00ff', '#88ff00'
];

// Default model configuration
export const DEFAULT_TARGET_SIZE = 640;
export const DEFAULT_CONF_THRESHOLD = 0.65;
export const DEFAULT_IOU_THRESHOLD = 0.5;
export const DEFAULT_NUM_CLASSES = 80;
export const DEFAULT_NUM_BOXES = 8400;

// Webcam configuration
export const WEBCAM_FPS_UPDATE_INTERVAL = 1000;  // ms
export const WEBCAM_TARGET_FPS = 30;            // target FPS