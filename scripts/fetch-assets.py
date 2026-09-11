"""Restore source assets; retain the bundled optimized meshes."""
import concurrent.futures
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
jobs = {
    **{f"public/assets/{name}": url for name, url in json.loads(
        (ROOT / "public/assets/sources.json").read_text()).items()},
    **json.loads((ROOT / "scripts/model-sources.json").read_text()),
}

def fetch(item):
    name, url = item
    path = ROOT / name
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["curl", "-fsSL", "--retry", "2", url, "-o", str(path)], check=True)
    return f"{name}: {path.stat().st_size:,} bytes"

if __name__ == "__main__":
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for result in pool.map(fetch, jobs.items()):
            print(result, flush=True)
