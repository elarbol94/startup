"""Whisper transcription and pyannote speaker separation on one small GPU.

Tuned for the homeserver's Quadro P620 (Pascal, 2 GB): Whisper large-v3-turbo
in int8 (int8_float32 crashes on Pascal, large-v3 does not fit), then pyannote
with small batches. Each runs in its own process (stage.py), one after the
other, so they never share the GPU and a CUDA crash fails only that step.
"""
from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path
from typing import Callable

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")
DIARIZATION_MODEL = "pyannote/speaker-diarization-3.1"
MODELS_DIR = os.environ.get("MODELS_DIR", "/models")
# Share of the progress bar for transcription when speakers are separated too
# (measured on the P620: 5.3 min transcription, 4.0 min speaker separation).
TRANSCRIBE_SHARE = 0.55
# Whisper runs in parts of this length; a GPU fault repeats one part only.
CHUNK_SECONDS = float(os.environ.get("CHUNK_SECONDS", "600"))
CHUNK_ATTEMPTS = 3
# Whisper reads at most ~224 prompt tokens; the end of the prompt matters most.
PROMPT_CHARS = 600

Progress = Callable[[str, float], None]
log = logging.getLogger("transcriber")


def speaker_turns_to_lookup(turns: list[tuple[float, float, str]]):
    """Returns a function giving the speaker of a time range, for ranges asked in time order."""
    turns = sorted(turns)
    state = {"first": 0}

    def lookup(start: float, end: float) -> str | None:
        if not turns:
            return None
        # Turns ending well before this word cannot match it or any later word.
        while state["first"] < len(turns) - 1 and turns[state["first"]][1] < start - 30:
            state["first"] += 1
        best, best_overlap, nearest, nearest_gap = None, 0.0, None, float("inf")
        for turn_start, turn_end, label in turns[state["first"]:]:
            if turn_start > end + 30:
                break
            overlap = min(end, turn_end) - max(start, turn_start)
            if overlap > best_overlap:
                best, best_overlap = label, overlap
            gap = max(turn_start - end, start - turn_end, 0)
            if gap < nearest_gap:
                nearest, nearest_gap = label, gap
        return best or nearest

    return lookup


def assign_speakers(segments: list[dict], turns: list[tuple[float, float, str]]) -> list[dict]:
    """Splits Whisper segments where the speaker changes, word by word.

    `segments` carry `words` ({start, end, word}); a word belongs to the
    speaker turn it overlaps most, or the nearest one in a pause.
    """
    lookup = speaker_turns_to_lookup(turns)
    out: list[dict] = []
    for segment in segments:
        words = segment.get("words") or [{"start": segment["start"], "end": segment["end"], "word": segment["text"]}]
        current: dict | None = None
        for word in words:
            speaker = lookup(word["start"], word["end"]) or "A"
            if current and current["speaker"] == speaker:
                current["end"] = word["end"]
                current["text"] += word["word"]
                continue
            if current:
                out.append(current)
            current = {"start": word["start"], "end": word["end"], "speaker": speaker, "text": word["word"]}
        if current:
            out.append(current)
    for item in out:
        item["text"] = item["text"].strip()
    return [item for item in out if item["text"]]


HERE = Path(__file__).resolve().parent


def run_stage(kind: str, wav: Path, params: dict, progress: Callable[[float], None], attempts: int = 2):
    """Runs one GPU step in its own process (stage.py).

    A CUDA fault on this old GPU aborts the whole process; isolated, it only
    fails this step, which is tried again up to `attempts` times, and the
    server and its queue survive. The exit also frees all of its GPU memory.
    """
    code = None
    for attempt in range(1, attempts + 1):
        out = wav.with_suffix(f".{kind}.json")
        out.unlink(missing_ok=True)
        process = subprocess.Popen(
            [sys.executable, str(HERE / "stage.py"), kind, str(wav), str(out), json.dumps(params)],
            stdout=subprocess.PIPE, text=True,
        )
        assert process.stdout is not None
        for line in process.stdout:
            try:
                progress(float(json.loads(line)["progress"]))
            except (ValueError, KeyError, TypeError):
                pass
        code = process.wait()
        if code == 0 and out.exists():
            return json.loads(out.read_text())
        log.warning(json.dumps({"event": "transcriber_stage_failed", "stage": kind, "attempt": attempt, "exit": code}))
    raise RuntimeError(f"{kind} failed {attempts} times (exit code {code})")


def plan_chunks(duration: float, silences: list[float], max_seconds: float = CHUNK_SECONDS) -> list[tuple[float, float]]:
    """Splits `duration` into (start, end) parts of at most `max_seconds`.

    Each cut lies at the last silence in the second half of its window, so
    no word is cut in two; without one it falls back to a hard cut.
    """
    points = sorted(silences)
    chunks, start = [], 0.0
    while duration - start > max_seconds:
        limit = start + max_seconds
        cut = next((p for p in reversed(points) if start + max_seconds / 2 < p < limit), limit)
        chunks.append((start, cut))
        start = cut
    chunks.append((start, duration))
    return chunks


def silence_midpoints(wav: Path) -> list[float]:
    """Middles of pauses of at least half a second (ffmpeg silencedetect)."""
    stderr = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-i", str(wav), "-af", "silencedetect=noise=-35dB:d=0.5", "-f", "null", "-"],
        capture_output=True, text=True, check=True,
    ).stderr
    starts = [float(m) for m in re.findall(r"silence_start: ([\d.]+)", stderr)]
    ends = [float(m) for m in re.findall(r"silence_end: ([\d.]+)", stderr)]
    return [(s + e) / 2 for s, e in zip(starts, ends)]


def cut_wav(source: Path, target: Path, start: float, end: float):
    """Copies a time range of a PCM WAV without re-encoding."""
    with wave.open(str(source)) as reader:
        rate = reader.getframerate()
        reader.setpos(int(start * rate))
        frames = reader.readframes(int((end - start) * rate))
        with wave.open(str(target), "wb") as writer:
            writer.setparams(reader.getparams())
            writer.writeframes(frames)


def shift(segment: dict, offset: float) -> dict:
    return {
        **segment,
        "start": segment["start"] + offset,
        "end": segment["end"] + offset,
        "words": [{**w, "start": w["start"] + offset, "end": w["end"] + offset} for w in segment.get("words", [])],
    }


def transcribe_in_chunks(wav: Path, language: str, prompt: str, progress: Callable[[float], None]) -> dict:
    """Whisper part by part, each in its own process with a few attempts.

    The P620 faults now and then (about once per hour of GPU time, across
    CTranslate2 versions); a fault then costs one part, not the recording.
    Each part's prompt ends with the previous part's last words, so style
    and spelling carry over the cut.
    """
    with wave.open(str(wav)) as reader:
        duration = reader.getnframes() / reader.getframerate()
    chunks = plan_chunks(duration, silence_midpoints(wav))
    segments, language_found, tail = [], None, ""
    for index, (start, end) in enumerate(chunks):
        part = wav.with_name(f"part-{index}.wav")
        cut_wav(wav, part, start, end)
        part_prompt = f"{prompt} {tail}".strip()[-PROMPT_CHARS:]
        result = run_stage(
            "transcribe", part, {"language": language, "prompt": part_prompt},
            lambda f, start=start, end=end: progress((start + f * (end - start)) / max(duration, 1)),
            attempts=CHUNK_ATTEMPTS,
        )
        part.unlink(missing_ok=True)
        segments += [shift(segment, start) for segment in result["segments"]]
        language_found = language_found or result["language"]
        tail = " ".join(segment["text"].strip() for segment in result["segments"])[-200:]
        log.info(json.dumps({"event": "transcriber_chunk_done", "part": index + 1, "parts": len(chunks), "seconds": round(end - start)}))
    return {"segments": segments, "language": language_found}


class Transcriber:
    def run(self, audio: Path, language: str, prompt: str, diarize: bool, progress: Progress) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "audio.wav"
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(audio), "-ac", "1", "-ar", "16000", str(wav)], check=True)
            share = TRANSCRIBE_SHARE if diarize else 1.0
            whisper = transcribe_in_chunks(wav, language, prompt, lambda f: progress("transcribing", f * share))
            segments = whisper["segments"]
            if diarize:
                turns = run_stage("diarize", wav, {}, lambda f: progress("diarizing", share + f * (1 - share)))
                result = assign_speakers(segments, [tuple(turn) for turn in turns])
            else:
                result = [{"start": s["start"], "end": s["end"], "speaker": "A", "text": s["text"].strip()} for s in segments if s["text"].strip()]
        model = WHISPER_MODEL + ("+pyannote-3.1" if diarize else "")
        return {"model": model, "language": whisper["language"], "segments": result}


def transcribe_file(wav: Path, language: str, prompt: str, progress: Callable[[float], None]) -> dict:
    from faster_whisper import WhisperModel

    model = WhisperModel(WHISPER_MODEL, device="cuda", compute_type=WHISPER_COMPUTE, download_root=MODELS_DIR)
    segments, info = model.transcribe(
        str(wav), language=language or None, vad_filter=True, beam_size=5,
        # A punctuated prompt keeps Whisper writing sentence case and punctuation.
        initial_prompt=prompt or None, word_timestamps=True,
    )
    out = []
    for segment in segments:
        out.append({
            "start": segment.start, "end": segment.end, "text": segment.text,
            "words": [{"start": w.start, "end": w.end, "word": w.word} for w in (segment.words or [])],
        })
        progress(min(1.0, segment.end / max(info.duration, 1)))
    return {"segments": out, "language": info.language}


def diarize_file(wav: Path, hf_token: str, progress: Callable[[float], None]) -> list[tuple[float, float, str]]:
    import torch
    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained(DIARIZATION_MODEL, use_auth_token=hf_token)
    if pipeline is None:
        raise RuntimeError("pyannote model not available (token or accepted model terms missing)")
    pipeline.to(torch.device("cuda"))
    # Batches of 32 run out of memory on 2 GB; expandable_segments crashes on Pascal.
    pipeline.embedding_batch_size = int(os.environ.get("EMB_BATCH", "8"))
    pipeline.segmentation_batch_size = int(os.environ.get("SEG_BATCH", "8"))
    steps = {"segmentation": (0.0, 0.25), "embeddings": (0.25, 0.95)}

    def hook(step_name, step_artifact, file=None, total=None, completed=None):
        if step_name in steps and total:
            low, high = steps[step_name]
            progress(low + (high - low) * min(1.0, (completed or 0) / total))

    annotation = pipeline(str(wav), hook=hook)
    progress(1.0)
    return [(turn.start, turn.end, label) for turn, _, label in annotation.itertracks(yield_label=True)]
