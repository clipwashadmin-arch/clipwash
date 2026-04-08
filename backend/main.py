from pathlib import Path
import shutil
import subprocess
import re
import json
from datetime import datetime
from difflib import SequenceMatcher

from fastapi import FastAPI, File, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import whisper

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
OUTPUTS_DIR = BASE_DIR / "outputs"
DATA_DIR = BASE_DIR / "data"
USAGE_FILE = DATA_DIR / "usage.json"

UPLOADS_DIR.mkdir(exist_ok=True)
OUTPUTS_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

if not USAGE_FILE.exists():
    USAGE_FILE.write_text("{}", encoding="utf-8")

model = whisper.load_model("base")

FREE_DAILY_LIMIT = 3
FREE_MAX_DURATION_SECONDS = 60

EXACT_BAD_WORDS = {
    "fuck",
    "fucking",
    "fucker",
    "fuckers",
    "shit",
    "shits",
    "bitch",
    "bitches",
    "ass",
    "asshole",
    "assholes",
    "motherfucker",
    "motherfuckers",
    "damn",
    "hell",
    "bastard",
    "bastards",
    "dick",
    "dicks",
    "pussy",
    "pussies",
    "slut",
    "sluts",
    "whore",
    "whores",
}

PREFIX_BAD_ROOTS = [
    "fuck",
    "shit",
    "bitch",
    "motherfuck",
]

FUZZY_BAD_WORDS = [
    "fuck",
    "shit",
    "bitch",
    "asshole",
    "motherfucker",
    "bastard",
    "dick",
    "pussy",
    "slut",
    "whore",
]

def load_usage():
    try:
        return json.loads(USAGE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}

def save_usage(data):
    USAGE_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")

def today_key():
    return datetime.utcnow().strftime("%Y-%m-%d")

def get_user_usage(client_id: str):
    usage = load_usage()
    return usage.get(client_id, {})

def increment_user_usage(client_id: str):
    usage = load_usage()
    today = today_key()

    if client_id not in usage:
        usage[client_id] = {}

    if usage[client_id].get("date") != today:
        usage[client_id] = {
            "date": today,
            "count": 0
        }

    usage[client_id]["count"] += 1
    save_usage(usage)

    return usage[client_id]["count"]

def get_today_count(client_id: str):
    usage = load_usage()
    today = today_key()

    if client_id not in usage:
        return 0

    if usage[client_id].get("date") != today:
        return 0

    return usage[client_id].get("count", 0)

def normalize_word(word: str) -> str:
    return re.sub(r"[^a-z]", "", word.lower())

def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()

def is_bad_word(word: str) -> bool:
    if not word:
        return False

    if word in EXACT_BAD_WORDS:
        return True

    for root in PREFIX_BAD_ROOTS:
        if word.startswith(root):
            return True

    if word in {"ass", "asses", "asshole", "assholes"}:
        return True

    if len(word) >= 4:
        for bad in FUZZY_BAD_WORDS:
            if similarity(word, bad) >= 0.84:
                return True

    return False

def get_video_duration_seconds(video_path: Path):
    command = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(video_path)
    ]

    try:
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    except Exception:
        return None

@app.get("/")
def home():
    return {"message": "ClipWash running"}

@app.get("/plan-status")
def plan_status(
    client_id: str = Query(...),
    paid: bool = Query(False)
):
    count = get_today_count(client_id)

    return {
        "success": True,
        "paid": paid,
        "daily_count": count,
        "daily_limit": None if paid else FREE_DAILY_LIMIT,
        "max_duration_seconds": None if paid else FREE_MAX_DURATION_SECONDS
    }

@app.post("/upload")
def upload_video(
    file: UploadFile = File(...),
    client_id: str = Query(...),
    paid: bool = Query(False)
):
    if not paid:
        count = get_today_count(client_id)
        if count >= FREE_DAILY_LIMIT:
            return {
                "success": False,
                "error": "Free plan daily limit reached",
                "limit_type": "daily_limit",
                "daily_limit": FREE_DAILY_LIMIT
            }

    save_path = UPLOADS_DIR / file.filename

    with save_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    duration = get_video_duration_seconds(save_path)

    if duration is None:
        return {
            "success": False,
            "error": "Could not read video duration"
        }

    if not paid and duration > FREE_MAX_DURATION_SECONDS:
        try:
            save_path.unlink(missing_ok=True)
        except Exception:
            pass

        return {
            "success": False,
            "error": "Free plan supports videos up to 60 seconds",
            "limit_type": "duration_limit",
            "max_duration_seconds": FREE_MAX_DURATION_SECONDS,
            "video_duration_seconds": round(duration, 2)
        }

    return {
        "success": True,
        "filename": file.filename,
        "duration_seconds": round(duration, 2)
    }

@app.post("/extract-audio")
def extract_audio(filename: str):
    video_path = UPLOADS_DIR / filename

    if not video_path.exists():
        return {"success": False, "error": f"File not found: {filename}"}

    audio_filename = f"{video_path.stem}.wav"
    audio_path = OUTPUTS_DIR / audio_filename

    command = [
        "ffmpeg",
        "-y",
        "-i", str(video_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        str(audio_path)
    ]

    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        return {"success": False, "error": "FFmpeg failed", "details": e.stderr}

    return {
        "success": True,
        "audio_filename": audio_filename
    }

@app.post("/censor-audio")
def censor_audio(filename: str):
    audio_path = OUTPUTS_DIR / filename

    if not audio_path.exists():
        return {"success": False, "error": f"Audio file not found: {filename}"}

    result = model.transcribe(str(audio_path), word_timestamps=True)

    bad_word_windows = []

    for segment in result["segments"]:
        for word_data in segment.get("words", []):
            word = normalize_word(word_data.get("word", ""))

            if is_bad_word(word):
                start = round(max(0, word_data["start"] + ((word_data["end"] - word_data["start"]) * 0.3)), 2)
                end = round(word_data["end"], 2)

                bad_word_windows.append({
                    "start": start,
                    "end": end
                })

    if not bad_word_windows:
        return {"success": True, "censored": False}

    censored_filename = f"{audio_path.stem}_bleeped.wav"
    censored_path = OUTPUTS_DIR / censored_filename

    mute_filters = []
    filter_parts = []
    mix_inputs = []

    for w in bad_word_windows:
        mute_filters.append(
            f"volume=enable='between(t,{w['start']},{w['end']})':volume=0"
        )

    filter_parts.append(f"[0:a]{','.join(mute_filters)}[muted]")
    mix_inputs.append("[muted]")

    for i, w in enumerate(bad_word_windows):
        duration = max(0.05, round(w["end"] - w["start"], 2))
        delay = int(w["start"] * 1000)

        filter_parts.append(
            f"sine=f=750:d={duration},volume=2.8,adelay={delay}|{delay}[beep{i}]"
        )
        mix_inputs.append(f"[beep{i}]")

    filter_parts.append(
        f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:duration=first:dropout_transition=0:normalize=0,volume=2.2,alimiter=limit=0.95[outa]"
    )

    command = [
        "ffmpeg",
        "-y",
        "-i", str(audio_path),
        "-filter_complex", ";".join(filter_parts),
        "-map", "[outa]",
        str(censored_path)
    ]

    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        return {"success": False, "error": "Bleep failed", "details": e.stderr}

    return {
        "success": True,
        "censored_audio": censored_filename
    }

@app.post("/merge-video-audio")
def merge(
    video_filename: str,
    censored_audio_filename: str,
    client_id: str = Query(...),
    paid: bool = Query(False)
):
    video_path = UPLOADS_DIR / video_filename
    audio_path = OUTPUTS_DIR / censored_audio_filename

    if not video_path.exists():
        return {"success": False, "error": f"Video file not found: {video_filename}"}

    if not audio_path.exists():
        return {"success": False, "error": f"Censored audio file not found: {censored_audio_filename}"}

    output_filename = f"{video_path.stem}_cleaned.mp4"
    output_path = OUTPUTS_DIR / output_filename

    if paid:
        command = [
            "ffmpeg",
            "-y",
            "-i", str(video_path),
            "-i", str(audio_path),
            "-c:v", "copy",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-shortest",
            str(output_path)
        ]
    else:
        font_path = "C\\:/Windows/Fonts/arial.ttf"

        watermark_filter = (
            f"drawtext=fontfile='{font_path}':"
            f"text='CLIPWASH FREE':"
            f"fontcolor=white@0.28:"
            f"fontsize=h/8:"
            f"x=(w-text_w)/2:"
            f"y=(h-text_h)/2:"
            f"shadowcolor=black@0.45:"
            f"shadowx=3:"
            f"shadowy=3:"
            f"box=1:"
            f"boxcolor=black@0.08:"
            f"boxborderw=18"
        )

        command = [
            "ffmpeg",
            "-y",
            "-i", str(video_path),
            "-i", str(audio_path),
            "-filter:v", watermark_filter,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            str(output_path)
        ]

    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        return {"success": False, "error": "Merge failed", "details": e.stderr}

    if not paid:
        increment_user_usage(client_id)

    return {
        "success": True,
        "output": output_filename,
        "daily_count": None if paid else get_today_count(client_id),
        "daily_limit": None if paid else FREE_DAILY_LIMIT
    }

@app.get("/download/{filename}")
def download_file(filename: str):
    file_path = OUTPUTS_DIR / filename

    if not file_path.exists():
        return {"success": False, "error": "File not found"}

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream"
    )