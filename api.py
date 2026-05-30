from fastapi import FastAPI, UploadFile, File
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
import io
import numpy as np
import cv2
from PIL import Image, ImageEnhance

# ==== 調整パラメータ（数字を上げると効果UP）====
SMOOTH_STRENGTH = 0.92
SKIN_BRIGHTEN = 1.18
BRIGHTNESS = 1.10
CONTRAST = 1.03
COLOR = 1.08
SHARPNESS = 1.25
# ==============================================

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

def skin_mask(img_bgr):
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
    if len(faces) == 0:
        return None
    mask = np.zeros((h, w), dtype=np.uint8)
    ycrcb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2YCrCb)
    for (x, y, fw, fh) in faces:
        x0 = max(0, x - int(fw * 0.1)); y0 = max(0, y - int(fh * 0.1))
        x1 = min(w, x + fw + int(fw * 0.1)); y1 = min(h, y + fh + int(fh * 0.2))
        roi = ycrcb[y0:y1, x0:x1]
        skin = cv2.inRange(roi, (0, 133, 77), (255, 173, 127))
        mask[y0:y1, x0:x1] = skin
    return mask

def beautify(img_bgr):
    smooth = cv2.bilateralFilter(img_bgr, 15, 80, 80)
    m = skin_mask(img_bgr)
    if m is None:
        return cv2.addWeighted(img_bgr, 0.4, cv2.bilateralFilter(img_bgr, 12, 70, 70), 0.6, 0)
    m = cv2.GaussianBlur(m, (15, 15), 0)
    a = (m.astype(np.float32) / 255.0 * SMOOTH_STRENGTH)[..., None]
    out = img_bgr.astype(np.float32) * (1 - a) + smooth.astype(np.float32) * a
    bright = out * SKIN_BRIGHTEN
    out = out * (1 - a) + bright * a
    return np.clip(out, 0, 255).astype(np.uint8)

@app.post("/process")
async def process_image(file: UploadFile = File(...)):
    data = await file.read()
    pil = Image.open(io.BytesIO(data)).convert("RGB")
    pil.thumbnail((1080, 1080), Image.Resampling.LANCZOS)
    bgr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    bgr = beautify(bgr)
    out = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    out = ImageEnhance.Brightness(out).enhance(BRIGHTNESS)
    out = ImageEnhance.Contrast(out).enhance(CONTRAST)
    out = ImageEnhance.Color(out).enhance(COLOR)
    out = ImageEnhance.Sharpness(out).enhance(SHARPNESS)
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=92)
    return Response(content=buf.getvalue(), media_type="image/jpeg")
