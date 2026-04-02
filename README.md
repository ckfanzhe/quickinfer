# ONNX YOLO Benchmark

Browser-based YOLOv8 inference benchmark using ONNX Runtime Web.

![ONNX YOLO Benchmark](screenshot.png)

## Features

- Run YOLOv8 object detection directly in the browser
- Support for multiple backends: Auto, WASM (CPU), WebGPU, WebGL
- Multiple model sizes: YOLOv8s, YOLOv8m, YOLOv8l, YOLOv8x
- Real-time performance metrics: preprocessing, inference, postprocessing
- Download progress bar for model loading
- Export detection results as JSON

## Usage

### Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Build for GitHub Pages

```bash
npm run build:github
```

The built files will be in the `dist` directory.

## Models

Models are hosted on [ModelScope](https://www.modelscope.cn) to ensure proper CORS support for browser downloads.

Default models:
- YOLOv8s (~43MB)
- YOLOv8m (~99MB)
- YOLOv8l (~167MB)
- YOLOv8x (~260MB)

## Deploy Your Own Models

Edit `.env` or `.env.github`:

```
VITE_MODELSCOPE_REPO=your-username/your-model-repo
VITE_MODELS=[{"name":"your-model.onnx","size":"~50MB"}]
```

Upload ONNX models to your ModelScope repository.

## Browser Compatibility

| Backend | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| WASM    | ✓      | ✓    | ✓       | ✓      |
| WebGL   | ✓      | ✓    | ✓       | ✓      |
| WebGPU  | ✓      | ✓    | Partial | ✗      |

WebGPU provides the best performance but requires browser support.
