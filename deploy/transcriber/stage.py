"""One GPU step of a job, run as its own process by pipeline.run_stage.

Usage: stage.py transcribe|diarize <wav> <out.json> <params-json>
Progress goes to stdout as JSON lines; the result is written to <out.json>.
"""
import json
import os
import sys
from pathlib import Path

from pipeline import diarize_file, transcribe_file


def main():
    kind, wav, out, params = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), json.loads(sys.argv[4])

    def progress(fraction: float):
        print(json.dumps({"progress": round(fraction, 4)}), flush=True)

    if kind == "transcribe":
        result = transcribe_file(wav, params["language"], params["prompt"], progress)
    elif kind == "diarize":
        result = diarize_file(wav, Path(os.environ["HF_TOKEN_FILE"]).read_text().strip(), progress)
    else:
        raise SystemExit(f"unknown stage {kind}")
    out.write_text(json.dumps(result))


if __name__ == "__main__":
    main()
