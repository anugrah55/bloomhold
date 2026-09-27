#!/usr/bin/env python3
"""Bundle Bloomhold into a single self-contained HTML file.

  python3 build.py            -> index.html (open directly or deploy anywhere static)
  python3 build.py --artifact -> also writes dist/bloomhold.artifact.html (no <html>/<head>/<body> wrapper)
"""
import os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
ORDER = ['00_core.js', 'audio.js', 'models.js', '10_world.js', '20_fx.js', '30_entities.js', '40_game.js']

def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read()

def bundle():
    js = '\n'.join(f'// ---- {n} ----\n' + read(n) for n in ORDER)
    shell = read('shell.html')
    return shell.replace('/*__GAME__*/', js)

def strip_wrapper(html):
    html = re.sub(r'<!doctype html>\s*', '', html, flags=re.I)
    html = re.sub(r'<html[^>]*>\s*', '', html, count=1, flags=re.I)
    html = re.sub(r'</?head>\s*', '', html, flags=re.I)
    html = re.sub(r'<body>\s*', '', html, count=1, flags=re.I)
    html = re.sub(r'\s*</body>\s*</html>\s*$', '\n', html, flags=re.I)
    html = re.sub(r'<meta charset="utf-8">\s*', '', html, flags=re.I)
    html = re.sub(r'<meta name="viewport"[^>]*>\s*', '', html, flags=re.I)
    return html

if __name__ == '__main__':
    out = bundle()
    with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(out)
    print('wrote index.html', len(out) // 1024, 'KB')
    if '--artifact' in sys.argv:
        os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
        art = strip_wrapper(out)
        with open(os.path.join(ROOT, 'dist', 'bloomhold.html'), 'w', encoding='utf-8') as f:
            f.write(art)
        print('wrote dist/bloomhold.html', len(art) // 1024, 'KB')
