# Meeting transcriber (homeserver GPU)

Self-hosted speech-to-text with speaker separation for the meetings module:
Whisper `large-v3-turbo` (faster-whisper, int8) followed by pyannote
`speaker-diarization-3.1`. It runs on the **homeserver** (Quadro P620, 2 GB),
not in the platform's stack on banond. The platform's meeting worker uses it
first when `MEETINGS_TRANSCRIBER_URL` is set and falls back to OpenAI when it
is unreachable, fails or takes too long (see `docs/meetings.md`).

## API

All calls except `/health` need `Authorization: Bearer <token>`.

| Call | Purpose |
| --- | --- |
| `POST /jobs` (multipart: `file`, `key`, `language`, `prompt`, `diarize`) | Queue a recording. The same `key` returns the existing job instead of starting the work again (unless it failed). |
| `GET /jobs/{id}` | `status` (`queued`/`running`/`done`/`failed`), `phase`, `progress` 0–1, queue `position`, and `result` once done. |
| `DELETE /jobs/{id}` | Forget a finished job. |
| `GET /health` | Liveness and queue length. |

One job runs at a time. Audio is deleted when its job ends; results are kept
for a day; jobs live in memory, so after a restart the platform hands its job
in again.

## Settings for the P620 (measured, see the benchmark notes in the PR)

- Whisper `large-v3-turbo` with `int8`: `int8_float32` crashes on Pascal and
  `large-v3` runs out of memory at 1.9 GB. ~5.6× real time, 1.4 GB VRAM.
- The Whisper model is released before pyannote moves to the GPU. pyannote
  uses batches of 8 (32 runs out of memory); `expandable_segments` crashes on
  this GPU, so it is not set. ~7.6× real time, 0.8 GB VRAM.
- CUDA 12 base image and PyTorch 2.5.1+cu121: CUDA 13 and newer PyTorch builds
  dropped Pascal.
- A punctuated prompt (meeting title and participants, sent by the platform)
  keeps Whisper writing sentence case and punctuation and helps with names.

A 1.5-hour meeting takes about half an hour.

## GPU faults and how the service lives with them

The P620 faults now and then during Whisper (`Xid 13` in `journalctl -k`,
"illegal instruction/address" in the log): in tests about one fault per hour
of GPU time, with CTranslate2 4.8.3 and 4.4.0 alike and at normal
temperatures, so it is most likely the card or its last Pascal driver (580),
not one library. The service therefore:

- runs every GPU step in its own process (`stage.py`): a fault ends that
  process, not the server and its queue;
- transcribes in parts of about 10 minutes (`CHUNK_SECONDS`), cut at pauses,
  and repeats a faulting part up to three times; each part's prompt ends with
  the previous part's last words, so style and spelling carry over;
- runs pyannote once over the whole recording (two attempts), so speaker
  labels stay consistent across parts.

A job that still fails is reported as `failed`, and the platform falls back
to OpenAI. Log events: `transcriber_chunk_done`, `transcriber_stage_failed`.

## Setup on the homeserver

```bash
mkdir -p ~/meeting-transcriber/secrets && chmod 700 ~/meeting-transcriber/secrets
# copy Dockerfile, docker-compose.yml, app.py, pipeline.py into ~/meeting-transcriber
cd ~/meeting-transcriber
(umask 077; openssl rand -hex 32 > secrets/transcriber_token)
# Hugging Face read token of an account that accepted the terms of
# pyannote/speaker-diarization-3.1 and pyannote/segmentation-3.0:
(umask 077; cat > secrets/hf_token)
printf "TRANSCRIBER_BIND=%s\n" "$(tailscale ip -4)" > .env
docker compose up --build -d
curl http://$(tailscale ip -4):8790/health
```

The port is bound to the Tailscale address only. Docker reaches the GPU
through CDI (`nvidia.com/gpu=all`); `--gpus all` does not work on this host.
If Tailscale is not up yet when Docker starts the container after a reboot,
start it again with `docker compose up -d`.

On banond, add to the production `.env` and restart the app:

```bash
MEETINGS_TRANSCRIBER_URL=http://<homeserver tailscale ip>:8790
MEETINGS_TRANSCRIBER_TOKEN=<content of secrets/transcriber_token>
```

Speaker-assignment tests (no GPU): `python3 -m unittest test_pipeline`.
