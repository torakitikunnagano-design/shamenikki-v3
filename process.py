import sys
from PIL import Image, ImageEnhance
import cv2
import numpy as np

def process_image(input_path, output_path, max_size=1080):
    img = Image.open(input_path).convert("RGB")
    img = ImageEnhance.Brightness(img).enhance(1.08)
    img = ImageEnhance.Contrast(img).enhance(1.05)
    img = ImageEnhance.Color(img).enhance(1.12)
    img = ImageEnhance.Sharpness(img).enhance(1.1)
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    smooth = cv2.bilateralFilter(cv_img, 9, 75, 75)
    blended = cv2.addWeighted(cv_img, 0.4, smooth, 0.6, 0)
    result = Image.fromarray(cv2.cvtColor(blended, cv2.COLOR_BGR2RGB))
    result.save(output_path, quality=92)
    print("完成! ->", output_path)

if __name__ == "__main__":
    inp = sys.argv[1] if len(sys.argv) > 1 else "input.jpg"
    out = sys.argv[2] if len(sys.argv) > 2 else "output.jpg"
    process_image(inp, out)
