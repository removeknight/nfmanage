from io import BytesIO
from pathlib import Path
import re
import uuid
import warnings

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select

from ..models import Product
from ..settings import settings
from .audit import write_log

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MEDIA_PREFIX = "/api/media/products/"
IMAGE_NAME = re.compile(r"^[a-f0-9]{32}\.jpg$")


def product_image_dir():
    return Path(settings.upload_dir).expanduser().resolve() / "products"


def compressed_image(content):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as original:
                if original.format not in {"JPEG", "PNG", "WEBP"}:
                    raise HTTPException(400, "请选择 JPG、PNG 或 WebP 图片")
                if original.width * original.height > 20_000_000:
                    raise HTTPException(400, "图片分辨率过大，请使用 2000 万像素以内的图片")
                original.seek(0)
                image = ImageOps.exif_transpose(original)
                image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                rgba = image.convert("RGBA")
                result = Image.new("RGB", rgba.size, "white")
                result.paste(rgba, mask=rgba.getchannel("A"))
                output = BytesIO()
                result.save(output, format="JPEG", quality=85, optimize=True)
                return output.getvalue()
    except HTTPException:
        raise
    except (Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise HTTPException(400, "图片分辨率过大，请先缩小图片")
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise HTTPException(400, "图片无法读取，请重新选择完整的 JPG、PNG 或 WebP 图片")


def remove_stored_image(url):
    if not url or not url.startswith(MEDIA_PREFIX):
        return
    name = url[len(MEDIA_PREFIX):]
    if IMAGE_NAME.fullmatch(name):
        try:
            (product_image_dir() / name).unlink(missing_ok=True)
        except OSError:
            # A committed product update must not fail because an old file is busy.
            pass


def save_product_image(db, product_id, content, actor):
    processed = compressed_image(content)
    row = db.scalar(select(Product).where(Product.id == product_id).with_for_update())
    if not row:
        raise HTTPException(404, "商品不存在")
    directory = product_image_dir()
    name = uuid.uuid4().hex + ".jpg"
    path = directory / name
    previous = row.image_url
    try:
        directory.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as target:
            target.write(processed)
        row.image_url = MEDIA_PREFIX + name
        write_log(db, "product_image", row, actor.name[:80], previous or "未设置图片", row.image_url, "上传或更换商品图片")
        db.commit()
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    remove_stored_image(previous)
    return {"id": row.id, "image_url": row.image_url}


def clear_product_image(db, product_id, actor):
    row = db.scalar(select(Product).where(Product.id == product_id).with_for_update())
    if not row:
        raise HTTPException(404, "商品不存在")
    previous = row.image_url
    if previous:
        row.image_url = None
        write_log(db, "product_image", row, actor.name[:80], previous, "未设置图片", "移除商品图片")
        db.commit()
        remove_stored_image(previous)
    return {"id": row.id, "image_url": None}
