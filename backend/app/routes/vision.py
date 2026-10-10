"""/api/vision endpoints (transport owner: Arnav; engine owner: Bhavya)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Request, UploadFile
from starlette.concurrency import run_in_threadpool

from app.contracts import MAX_FRAME_BYTES, EnrollmentSampleResponse, FrameResultResponse
from app.db.gallery_cache import GalleryCache
from app.http.deps import get_face_engine, get_gallery_cache
from app.http.envelope import request_id
from app.http.uploads import read_bounded_upload
from app.routes._errors import ERROR_RESPONSES
from app.vision.engine import FaceEngine
from app.vision.image import decode_jpeg

router = APIRouter(prefix="/vision", tags=["vision"], responses=ERROR_RESPONSES)


@router.post("/recognize", response_model=FrameResultResponse, operation_id="recognizeFrame")
async def recognize(
    request: Request,
    frame: UploadFile = File(description="Unmirrored JPEG, <= 1 MB, longest edge <= 1280 px"),
    engine: FaceEngine = Depends(get_face_engine),
    cache: GalleryCache = Depends(get_gallery_cache),
) -> FrameResultResponse:
    data = await read_bounded_upload(frame, MAX_FRAME_BYTES, field="frame")
    image = await run_in_threadpool(decode_jpeg, data)
    gallery = await run_in_threadpool(cache.get, engine.model)
    result = await run_in_threadpool(engine.recognize, image, gallery)
    return FrameResultResponse(data=result, request_id=request_id(request))


@router.post(
    "/enrollment-sample",
    response_model=EnrollmentSampleResponse,
    operation_id="captureEnrollmentSample",
)
async def enrollment_sample(
    request: Request,
    frame: UploadFile = File(description="Unmirrored JPEG, <= 1 MB, longest edge <= 1280 px"),
    engine: FaceEngine = Depends(get_face_engine),
) -> EnrollmentSampleResponse:
    data = await read_bounded_upload(frame, MAX_FRAME_BYTES, field="frame")
    image = await run_in_threadpool(decode_jpeg, data)
    sample = await run_in_threadpool(engine.enrollment_sample, image)
    return EnrollmentSampleResponse(data=sample, request_id=request_id(request))
