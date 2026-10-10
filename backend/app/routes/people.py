"""/api/people endpoints (owner: Arnav)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from starlette.concurrency import run_in_threadpool

from app.contracts import (
    CreatePersonRequest,
    DeletedPerson,
    DeletedPersonResponse,
    PeopleList,
    PeopleListResponse,
    PersonDetailResponse,
    PersonPayload,
    PersonResponse,
)
from app.db import repository
from app.db.database import Database
from app.db.gallery_cache import GalleryCache
from app.http.deps import get_database, get_face_engine, get_gallery_cache
from app.http.envelope import request_id
from app.routes._errors import ERROR_RESPONSES
from app.vision.engine import FaceEngine

router = APIRouter(prefix="/people", tags=["people"], responses=ERROR_RESPONSES)


@router.get("", response_model=PeopleListResponse, operation_id="listPeople")
async def list_people(request: Request, db: Database = Depends(get_database)) -> PeopleListResponse:
    people = await run_in_threadpool(repository.list_people, db)
    return PeopleListResponse(data=PeopleList(people=people), request_id=request_id(request))


@router.post("", response_model=PersonResponse, status_code=201, operation_id="createPerson")
async def create_person(
    request: Request,
    body: CreatePersonRequest,
    db: Database = Depends(get_database),
    cache: GalleryCache = Depends(get_gallery_cache),
    engine: FaceEngine = Depends(get_face_engine),
) -> PersonResponse:
    person = await run_in_threadpool(repository.create_person, db, body, engine.model)
    cache.invalidate()
    return PersonResponse(data=PersonPayload(person=person), request_id=request_id(request))


@router.get("/{person_id}", response_model=PersonDetailResponse, operation_id="getPerson")
async def get_person(
    request: Request, person_id: UUID, db: Database = Depends(get_database)
) -> PersonDetailResponse:
    detail = await run_in_threadpool(repository.get_person_detail, db, person_id)
    return PersonDetailResponse(data=detail, request_id=request_id(request))


@router.delete("/{person_id}", response_model=DeletedPersonResponse, operation_id="deletePerson")
async def delete_person(
    request: Request,
    person_id: UUID,
    db: Database = Depends(get_database),
    cache: GalleryCache = Depends(get_gallery_cache),
) -> DeletedPersonResponse:
    await run_in_threadpool(repository.delete_person, db, person_id)
    cache.invalidate()
    return DeletedPersonResponse(
        data=DeletedPerson(deleted_person_id=person_id), request_id=request_id(request)
    )
