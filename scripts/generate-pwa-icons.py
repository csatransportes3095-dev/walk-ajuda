from PIL import Image
import os

src = "/home/ubuntu/walk-ajuda/client/public/pwa-icon-base.png"
out_dir = "/home/ubuntu/walk-ajuda/client/public"

img = Image.open(src).convert("RGBA")

sizes = [72, 96, 128, 144, 152, 192, 384, 512]
for s in sizes:
    resized = img.resize((s, s), Image.LANCZOS)
    resized.save(f"{out_dir}/icon-{s}x{s}.png")
    print(f"icon-{s}x{s}.png")

# maskable 512x512 (com padding 10% para safe zone)
maskable = Image.new("RGBA", (512, 512), (26, 10, 46, 255))
inner = img.resize((410, 410), Image.LANCZOS)
maskable.paste(inner, (51, 51), inner)
maskable.save(f"{out_dir}/icon-maskable-512x512.png")
print("icon-maskable-512x512.png")

# apple-touch-icon 180x180
apple = img.resize((180, 180), Image.LANCZOS)
apple.save(f"{out_dir}/apple-touch-icon.png")
print("apple-touch-icon.png")

# favicon 32x32 e 16x16
fav32 = img.resize((32, 32), Image.LANCZOS)
fav32.save(f"{out_dir}/favicon-32x32.png")
fav16 = img.resize((16, 16), Image.LANCZOS)
fav16.save(f"{out_dir}/favicon-16x16.png")
print("favicons")

# mstile 150x150
mstile = img.resize((150, 150), Image.LANCZOS)
mstile.save(f"{out_dir}/mstile-150x150.png")
print("mstile-150x150.png")

print("Todos os ícones gerados!")
