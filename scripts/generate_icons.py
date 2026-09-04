"""
Generate PNG icon files for the AlumniSync Chrome extension.
Requires Pillow: pip install Pillow
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path):
    """Create a simple navy + graduation cap icon at the given size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Navy background with rounded corners
    margin = int(size * 0.05)
    radius = int(size * 0.18)

    # Draw rounded rectangle background
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=(26, 39, 68, 255)   # --navy: #1a2744
    )

    # Draw a simple graduation cap using basic shapes
    cx = size // 2
    cap_y = int(size * 0.28)
    cap_w = int(size * 0.55)
    cap_h = int(size * 0.15)

    # Cap brim (trapezoid → diamond shape top)
    diamond_pts = [
        (cx, cap_y),
        (cx + cap_w // 2, cap_y + cap_h // 2),
        (cx, cap_y + cap_h),
        (cx - cap_w // 2, cap_y + cap_h // 2),
    ]
    draw.polygon(diamond_pts, fill=(255, 255, 255, 255))

    # Cap body (rectangle below diamond)
    body_top = cap_y + cap_h // 2
    body_h = int(size * 0.18)
    body_w = int(size * 0.32)
    draw.rectangle(
        [cx - body_w // 2, body_top, cx + body_w // 2, body_top + body_h],
        fill=(255, 255, 255, 230)
    )

    # Two sync dots at the bottom
    dot_y = int(size * 0.74)
    dot_r = int(size * 0.055)
    spacing = int(size * 0.22)
    line_y = dot_y + dot_r // 2

    # Connecting line
    draw.rectangle(
        [cx - spacing + dot_r, line_y - 1, cx + spacing - dot_r, line_y + 1],
        fill=(255, 255, 255, 180)
    )

    # Left dot
    draw.ellipse(
        [cx - spacing - dot_r, dot_y - dot_r, cx - spacing + dot_r, dot_y + dot_r],
        fill=(255, 255, 255, 255)
    )

    # Right dot
    draw.ellipse(
        [cx + spacing - dot_r, dot_y - dot_r, cx + spacing + dot_r, dot_y + dot_r],
        fill=(255, 255, 255, 255)
    )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, "PNG")
    print(f"Created {output_path} ({size}x{size})")


if __name__ == "__main__":
    base = os.path.join(os.path.dirname(__file__), "..", "extension", "icons")
    for size in [16, 48, 128]:
        create_icon(size, os.path.join(base, f"icon{size}.png"))
    print("All icons generated successfully.")
