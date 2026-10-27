#!/usr/bin/env python3
"""Deterministic, local-only texture encoding for Sunroom's offline bundle.

The original CC0 sources are never modified. Base colour is encoded as sRGB JPEG;
normal maps stay linear data and are renormalized after their resize operation.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'assets'
DEST = HERE / 'assets-web'
PROFILE = {'version': 1, 'maxDimension': 512, 'baseQuality': 80, 'normalQuality': 85,
           'normalChromaSubsampling': 0, 'renormalizeNormals': True}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def optimize(source: Path, target: Path, normal: bool) -> dict:
    source_hash = sha(source)
    sidecar = target.with_suffix('.json')
    if target.exists() and sidecar.exists():
        old = json.loads(sidecar.read_text())
        if old.get('sourceSha256') == source_hash and old.get('profile') == PROFILE:
            return old
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as original:
        image = original.convert('RGB')
        original_size = list(image.size)
        image.thumbnail((PROFILE['maxDimension'], PROFILE['maxDimension']), Image.Resampling.LANCZOS)
        if normal:
            pixels = []
            for r, g, b in image.getdata():
                x, y, z = r / 127.5 - 1, g / 127.5 - 1, b / 127.5 - 1
                length = math.sqrt(x*x + y*y + z*z)
                if length < 0.000001:
                    x, y, z, length = 0, 0, 1, 1
                pixels.append(tuple(round(max(0, min(255, (v / length + 1) * 127.5))) for v in (x, y, z)))
            image.putdata(pixels)
        image.save(target, format='JPEG', quality=PROFILE['normalQuality' if normal else 'baseQuality'],
                   subsampling=0 if normal else 2, optimize=True, progressive=False)
    result = {'sourceSha256': source_hash, 'sha256': sha(target), 'sourceBytes': source.stat().st_size,
              'bytes': target.stat().st_size, 'sourceResolution': original_size,
              'resolution': list(image.size), 'mime': 'image/jpeg', 'profile': PROFILE}
    sidecar.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    return result


def main() -> None:
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    result = {'profile': PROFILE, 'sourceManifestSha256': sha(SOURCE / 'manifest.json'), 'materials': []}
    for source in manifest['materials']:
        material = {'id': source['id'], 'physicalSize': source.get('physicalSize'), 'maps': {}}
        for field, name, normal in [('baseColorPath', 'basecolor.jpg', False), ('normalPath', 'normal-gl.jpg', True)]:
            if not source.get(field):
                continue
            path = SOURCE / source[field]
            if not path.is_file():
                raise FileNotFoundError(f'Missing source map: {path}')
            relative = Path('materials') / source['id'] / name
            info = optimize(path, DEST / relative, normal)
            material['maps']['normal' if normal else 'baseColor'] = {'path': str(relative), **info}
        result['materials'].append(material)
    result['totalBytes'] = sum(v['bytes'] for material in result['materials'] for v in material['maps'].values())
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / 'manifest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'materials': len(result['materials']), 'optimizedMaps': sum(len(v['maps']) for v in result['materials']),
                      'optimizedBytes': result['totalBytes'], 'maxDimension': PROFILE['maxDimension']}))


if __name__ == '__main__':
    main()
