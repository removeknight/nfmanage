from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..services.product_images import IMAGE_NAME, product_image_dir

router = APIRouter(prefix="/api/media", tags=["商品图片"])


@router.get("/products/{filename}")
def product_image(filename: str):
    if not IMAGE_NAME.fullmatch(filename):
        raise HTTPException(404, "图片不存在")
    path = product_image_dir() / filename
    if not path.is_file():
        raise HTTPException(404, "图片不存在")
    return FileResponse(path, media_type="image/jpeg", headers={
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
    })
