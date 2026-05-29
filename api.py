from fastapi import FastAPI, UploadFile, File
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
import io
import numpy as np
import cv2
from PIL import Image, ImageEnhance
import mediapipe as mp

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

mp_face_mesh = mp.solutions.face_mesh

def skin_mask(img_bgr):
    h, w = img_bgr.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    with mp_face_mesh.FaceMesh(static_image_mode=True, max_num_faces=5) as fm:
        res = fm.process(rgb)
    if not res.multi_face_landmarks:
        return None
    for face in res.multi_face_landmarks:
        pts = [(int(lm.x * w), int(lm.y * h)) for lm in face.landmark]
        oval = sorted(set(i for pair in mp_face_mesh.FACEMESH_FACE_OVAL for i in pair))
        hull = cv2.convexHull(np.array([pts[i] for i in oval], dtype=np.int32))
        cv2.fillConvexPoly(mask, hull, 255)
        for region in (mp_face_mesh.FACEMESH_LEFT_EYE, mp_face_mesh.FACEMESH_RIGHT_EYE, mp_face_mesh.FACEMESH_LIPS):
            ridx = sorted(set(i for pair in region for i in pair))
            rhull = cv2.convexHull(np.array([pts[i] for i in ridx], dtype=np.int32))
            cv2.fillConvexPoly(mask, rhull, 0)
    return mask

def beautify(img_bgr):
    smooth = cv2.bilateralFilter(img_bgr, 12, 60, 60)
    m = skin_mask(img_bgr)
    if m is None:
        return cv2.addWeighted(img_bgr, 0.6, cv2.bilateralFilter(img_bgr, 9, 50, 50), 0.4, 0)
    m = cv2.GaussianBlur(m, (21, 21), 0)
    a = (m.astype(np.float32) / 255.0 * 0.7)[..., None]
    out = img_bgr.astype(np.float32) * (1 - a) + smooth.astype(np.float32) * a
    return out.astype(np.uint8)

@app.post("/process")
async def process_image(file: UploadFile = File(...)):
    data = await file.read()
    pil = Image.open(io.BytesIO(data)).convert("RGB")
    pil.thumbnail((1080, 1080), Image.Resampling.LANCZOS)
    bgr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    bgr = beautify(bgr)
    out = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    out = ImageEnhance.Brightness(out).enhance(1.08)
    out = ImageEnhance.Contrast(out).enhance(1.04)
    out = ImageEnhance.Color(out).enhance(1.10)
    out = ImageEnhance.Sharpness(out).enhance(1.15)
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=92)
    return Response(content=buf.getvalue(), media_type="image/jpeg")
