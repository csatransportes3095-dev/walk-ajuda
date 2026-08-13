from pathlib import Path
from PIL import Image, ImageOps

SOURCE = Path('/home/ubuntu/upload/pasted_file_0jkEmN_image.png')
OUT = Path('/home/ubuntu/walk-ajuda-audio-audit/client/public/locadora/assets')
OUT.mkdir(parents=True, exist_ok=True)

source = Image.open(SOURCE).convert('RGBA')
# Logo completo: preserva toda a marca para portal e abertura.
source.convert('RGB').resize((720, 720), Image.Resampling.LANCZOS).save(OUT / 'locacar-logo-full-v1.webp', 'WEBP', quality=92, method=6)
source.convert('RGB').resize((320, 320), Image.Resampling.LANCZOS).save(OUT / 'locacar-logo-header-v1.webp', 'WEBP', quality=90, method=6)

# Ícone simplificado: recorte focado no carro e arco superior; evita texto ilegível nos ícones pequenos.
crop = source.crop((90, 30, 1164, 790))
canvas = Image.new('RGBA', (1024, 1024), (10, 12, 15, 255))
contained = ImageOps.contain(crop, (900, 720), Image.Resampling.LANCZOS)
x = (1024 - contained.width) // 2
y = 125
canvas.alpha_composite(contained, (x, y))

for name, size in [
    ('locacar-icon-192-v1.png', 192),
    ('locacar-icon-512-v1.png', 512),
    ('locacar-icon-maskable-512-v1.png', 512),
    ('locacar-apple-touch-icon-v1.png', 180),
    ('locacar-favicon-32-v1.png', 32),
]:
    img = canvas.resize((size, size), Image.Resampling.LANCZOS)
    img.save(OUT / name, 'PNG', optimize=True)

print(f'Assets gerados em {OUT}')
