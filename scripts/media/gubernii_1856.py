#!/usr/bin/env python3
"""
Downloads the «Набор географических карточек Российской империи» (К. М. Грибанов, 1856; РНБ, общественное
достояние) from Wikimedia Commons into content/gubernii/1856/ as WebP for the «Губернии 1856» screen.

Commons keeps the set as numbered files «1856. Card from set of geographical cards of the Russian Empire NNN.jpg»
cut from the library's PDF: odd numbers are the «Особенности» side (cities, trades, distances), even numbers the
main side (coat of arms, map, peoples, costume) of the same governorate. Existing files are skipped, so the
script can be re-run. Runs in CI (workflow «Media», input task=gubernii): Commons throttles the agent sandbox.

    python3 scripts/media/gubernii_1856.py [--max N]
"""
import hashlib
import io
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'content' / 'gubernii' / '1856'
NAME = '1856._Card_from_set_of_geographical_cards_of_the_Russian_Empire_{:03d}.jpg'
UA = 'StolypinApp/1.0 (https://github.com/username777228555/stolypin; media bot)'
WIDTH, QUALITY = 720, 70


def thumb_url(name: str) -> str:
    h = hashlib.md5(name.encode()).hexdigest()
    return f'https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{name}/1280px-{name}'


def fetch(url: str) -> bytes | None:
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            return urllib.request.urlopen(req, timeout=90).read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            wait = 15 * (attempt + 1)
            print(f'  HTTP {e.code}, retry in {wait}s', flush=True)
            time.sleep(wait)
        except OSError as e:
            print(f'  {e}, retry', flush=True)
            time.sleep(10)
    raise SystemExit(f'giving up on {url}')


def main() -> None:
    last = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 200
    OUT.mkdir(parents=True, exist_ok=True)
    misses = 0
    for i in range(1, last + 1):
        dest = OUT / f'c{i:03d}.webp'
        if dest.exists():
            continue
        data = fetch(thumb_url(NAME.format(i)))
        if data is None:
            print(f'{i:03d}: not on Commons', flush=True)
            misses += 1
            if misses >= 4:
                break
            continue
        im = Image.open(io.BytesIO(data)).convert('RGB')
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=QUALITY, method=6)
        dest.write_bytes(buf.getvalue())
        print(f'{i:03d}: {len(buf.getvalue()) // 1024} KB', flush=True)
        time.sleep(1)


if __name__ == '__main__':
    main()
