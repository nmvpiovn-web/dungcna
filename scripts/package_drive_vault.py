"""Package the imported vault for download; keep full-resolution local images."""
from pathlib import Path
from io import BytesIO
from zipfile import ZipFile, ZIP_DEFLATED
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
web_media = ROOT / 'static/drive-media'
for source in sorted((ROOT / 'second_brain/drive-media').iterdir()):
    data = source.read_bytes()
    with Image.open(BytesIO(data)) as im:
        if source.suffix.lower() in ('.jpg', '.jpeg'):
            im = ImageOps.exif_transpose(im)
            im.thumbnail((2000, 2000))
            out = BytesIO()
            im.convert('RGB').save(out, format='JPEG', quality=85, optimize=True)
            if len(out.getvalue()) < len(data):
                data = out.getvalue()
        elif source.suffix.lower() == '.png':
            im.thumbnail((1800, 1800))
            out = BytesIO()
            im.convert('RGBA').quantize(colors=128).save(out, format='PNG', optimize=True)
            if len(out.getvalue()) < len(data):
                data = out.getvalue()
    (web_media / source.name).write_bytes(data)

output = ROOT / 'static/downloads/obsidian_second_brain_vault.zip'
with ZipFile(output, 'w', ZIP_DEFLATED) as z:
    for f in sorted((ROOT / 'second_brain').rglob('*')):
        if not f.is_file():
            continue
        rel = f.relative_to(ROOT / 'second_brain')
        if rel.parts[0] == 'drive-media':
            f = web_media / f.name
        z.write(f, rel.as_posix())
print(f'Vault archive: {output.stat().st_size:,} bytes')
if output.stat().st_size > 25 * 1024 * 1024:
    raise RuntimeError('Vault ZIP exceeds Cloudflare Pages file limit')
