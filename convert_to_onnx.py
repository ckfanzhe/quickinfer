"""
YOLOv8 PT to ONNX Conversion Script
Requires: pip install ultralytics opencv-python

Usage:
    python convert_to_onnx.py                    # Convert all models
    python convert_to_onnx.py yolov8s           # Convert specific model
"""

import sys
import os

try:
    from ultralytics import YOLO
except ImportError:
    print("Error: ultralytics not installed")
    print("Run: pip install ultralytics opencv-python")
    sys.exit(1)

# Source and output directories
PT_DIR = os.path.join(os.path.dirname(__file__), 'pt_models')
ONNX_DIR = os.path.join(os.path.dirname(__file__), 'onnx_models')

# Model list
MODELS = ['yolov8n', 'yolov8s', 'yolov8m', 'yolov8l', 'yolov8x']

def convert_model(model_name):
    """Convert a single YOLOv8 model from PT to ONNX"""
    pt_path = os.path.join(PT_DIR, f'{model_name}.pt')
    onnx_path = os.path.join(ONNX_DIR, f'{model_name}.onnx')

    if not os.path.exists(pt_path):
        print(f"[SKIP] {pt_path} not found")
        return False

    os.makedirs(ONNX_DIR, exist_ok=True)

    print(f"[CONVERT] {model_name}.pt -> {model_name}.onnx")

    try:
        # Load model
        model = YOLO(pt_path)

        # Export to ONNX
        # opset=12 with simplify=True for correct model output
        # Use dynamic=False for consistent output shape
        success = model.export(
            format='onnx',
            imgsz=640,
            opset=12,
            dynamic=False,
            simplify=True
        )

        # Move to output directory
        exported_path = os.path.join(PT_DIR, f'{model_name}.onnx')
        if os.path.exists(exported_path):
            os.rename(exported_path, onnx_path)
            print(f"[OK] Saved: {onnx_path}")
            return True
        elif os.path.exists(success):
            os.rename(success, onnx_path)
            print(f"[OK] Saved: {onnx_path}")
            return True
        else:
            print(f"[ERROR] Export output not found")
            return False

    except Exception as e:
        print(f"[ERROR] {model_name}: {e}")
        return False

def main():
    # Create output directory
    os.makedirs(ONNX_DIR, exist_ok=True)

    # Check for ultralytics
    print(f"PT models directory: {PT_DIR}")
    print(f"ONNX output directory: {ONNX_DIR}")
    print("-" * 50)

    # Determine which models to convert
    if len(sys.argv) > 1:
        # Specific model(s) passed as argument
        targets = [sys.argv[1]]
    else:
        # Convert all available models
        targets = MODELS

    # Convert each model
    results = []
    for model_name in targets:
        if model_name.endswith('.pt'):
            model_name = model_name[:-3]
        if model_name.endswith('.onnx'):
            model_name = model_name[:-5]

        result = convert_model(model_name)
        results.append((model_name, result))

    # Summary
    print("-" * 50)
    print("Conversion Summary:")
    for name, success in results:
        status = "OK" if success else "FAILED"
        print(f"  {name}: {status}")

    # List output files
    print("-" * 50)
    print(f"Output files in {ONNX_DIR}:")
    for f in os.listdir(ONNX_DIR):
        size = os.path.getsize(os.path.join(ONNX_DIR, f))
        size_mb = size / (1024 * 1024)
        print(f"  {f} ({size_mb:.1f} MB)")

if __name__ == '__main__':
    main()
