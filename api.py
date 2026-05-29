from fastapi import FastAPI, UploadFile, File
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
import io
from PIL import Image, ImageEnhance
import cv2
import numpy as np

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/process")
async def process_image(file: UploadFile = File(...)):
    data = await file.read()
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img = ImageEnhance.Brightness(img).enhance(1.08)
    img = ImageEnhance.Contrast(img).enhance(1.05)
    img = ImageEnhance.Color(img).enhance(1.12)
    img = ImageEnhance.Sharpness(img).enhance(1.1)
    img.thumbnail((1080, 1080), Image.Resampling.LANCZOS)
    cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    smooth = cv2.bilateralFilter(cv_img, 9, 75, 75)
    blended = cv2.addWeighted(cv_img, 0.4, smooth, 0.6, 0)
    result = Image.fromarray(cv2.cvtColor(blended, cv2.COLOR_BGR2RGB))
    buf = io.BytesIO()
    result.save(buf, format="JPEG", quality=92)
    return Response(content=buf.getvalue(), media_type="image/jpeg")
