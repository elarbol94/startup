"""Meeting transcription service for the homeserver GPU.

The platform's meeting worker uploads a recording, polls the job for
progress and fetches the result, then deletes the job. One job runs at a
time (one small GPU); the rest wait in order. A job is identified by the
caller's key, so a worker that restarts gets its job back instead of
starting the same work again. Audio is deleted as soon as a job ends;
results are kept for a day in case the caller missed them.
"""
from __future__ import annotations

import hmac
import json
import logging
import os
import queue
import threading
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

from pipeline import Transcriber

TOKEN = Path(os.environ["TRANSCRIBER_TOKEN_FILE"]).read_text().strip()
DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(1024 ** 3)))
RESULT_TTL_S = 24 * 3600

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("transcriber")

jobs: dict[str, dict] = {}
by_key: dict[str, str] = {}
lock = threading.Lock()
work: queue.Queue[str] = queue.Queue()
transcriber = Transcriber()


def event(name: str, **fields):
    log.info(json.dumps({"event": name, **fields}))


def authorize(header: str | None):
    if not header or not hmac.compare_digest(header.encode(), f"Bearer {TOKEN}".encode()):
        raise HTTPException(status_code=401, detail="unauthorized")


def view(job: dict) -> dict:
    out = {key: job[key] for key in ("id", "key", "status", "phase", "progress", "error")}
    if job["status"] == "queued":
        out["position"] = sum(1 for other in jobs.values() if other["status"] == "queued" and other["created"] < job["created"])
    if job["status"] == "done":
        out["result"] = job["result"]
    return out


def prune(now: float):
    for job_id, job in list(jobs.items()):
        if job["status"] in ("done", "failed") and now - job["finished"] > RESULT_TTL_S:
            forget(job_id)


def forget(job_id: str):
    job = jobs.pop(job_id, None)
    if job and by_key.get(job["key"]) == job_id:
        del by_key[job["key"]]
    if job:
        Path(job["path"]).unlink(missing_ok=True)


def run_queue():
    while True:
        job_id = work.get()
        with lock:
            job = jobs.get(job_id)
            if not job or job["status"] != "queued":
                continue
            job.update(status="running", phase="transcribing", started=time.time())

        def progress(phase: str, fraction: float):
            job.update(phase=phase, progress=round(max(job["progress"], fraction), 4))

        event("transcriber_job_started", id=job_id, key=job["key"], diarize=job["diarize"])
        try:
            result = transcriber.run(Path(job["path"]), job["language"], job["prompt"], job["diarize"], progress)
            with lock:
                job.update(status="done", phase="done", progress=1.0, result=result, finished=time.time())
            event("transcriber_job_done", id=job_id, seconds=round(time.time() - job["started"]), segments=len(result["segments"]))
        except Exception as error:  # noqa: BLE001 - any failure is reported to the caller, who falls back
            with lock:
                job.update(status="failed", error=f"{type(error).__name__}: {error}"[:500], finished=time.time())
            event("transcriber_job_failed", id=job_id, error=job["error"])
        finally:
            Path(job["path"]).unlink(missing_ok=True)
            with lock:
                prune(time.time())


@asynccontextmanager
async def lifespan(_app: FastAPI):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Uploads of a previous run belong to jobs that no longer exist.
    for leftover in DATA_DIR.glob("*.audio"):
        leftover.unlink(missing_ok=True)
    threading.Thread(target=run_queue, daemon=True, name="gpu-queue").start()
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health():
    with lock:
        return {"ok": True, "queued": sum(1 for j in jobs.values() if j["status"] == "queued"),
                "running": sum(1 for j in jobs.values() if j["status"] == "running")}


@app.post("/jobs")
async def create_job(
    file: UploadFile = File(...),
    key: str = Form(..., max_length=200),
    language: str = Form("de", max_length=10),
    prompt: str = Form("", max_length=2000),
    diarize: bool = Form(True),
    authorization: str | None = Header(None),
):
    authorize(authorization)
    with lock:
        existing = jobs.get(by_key.get(key, ""))
        if existing and existing["status"] in ("queued", "running", "done"):
            return view(existing)
    job_id = uuid.uuid4().hex
    path = DATA_DIR / f"{job_id}.audio"
    size = 0
    with path.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="file too large")
            out.write(chunk)
    job = {"id": job_id, "key": key, "status": "queued", "phase": "queued", "progress": 0.0, "error": None,
           "created": time.time(), "language": language, "prompt": prompt, "diarize": diarize,
           "path": str(path), "result": None}
    with lock:
        previous = by_key.get(key)
        if previous:
            forget(previous)
        jobs[job_id] = job
        by_key[key] = job_id
    work.put(job_id)
    event("transcriber_job_queued", id=job_id, key=key, bytes=size)
    return view(job)


@app.get("/jobs/{job_id}")
def get_job(job_id: str, authorization: str | None = Header(None)):
    authorize(authorization)
    with lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="unknown job")
        return view(job)


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str, authorization: str | None = Header(None)):
    authorize(authorization)
    with lock:
        job = jobs.get(job_id)
        # A running job keeps its GPU slot; it is cleaned up when it ends.
        if job and job["status"] != "running":
            forget(job_id)
    return {"ok": True}
