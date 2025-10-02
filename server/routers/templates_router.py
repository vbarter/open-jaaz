from fastapi import APIRouter, Query, HTTPException, Request
from typing import Optional
import math

from services.template_service import template_service
from utils.language_utils import language_detector

router = APIRouter(prefix="/api/templates")

@router.get("")
async def get_templates(
    request: Request,
    search: Optional[str] = Query(None, description="搜索关键词"),
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(12, ge=1, le=50, description="每页数量"),
    category: Optional[str] = Query(None, description="分类筛选"),
    sort_by: str = Query("downloads", description="排序字段: downloads, rating, created_at"),
    sort_order: str = Query("desc", description="排序方向: asc, desc"),
    lang: Optional[str] = Query(None, description="语言: zh, en")
):
    """获取模板列表"""

    # 检测请求语言
    detected_language = language_detector.detect_language(request, lang)
    print(f"检测到语言: {detected_language}")

    # 获取本地化模板数据
    all_templates = template_service.get_templates(detected_language)

    # 筛选数据
    filtered_templates = template_service.filter_templates(
        all_templates, search, category, detected_language
    )

    # 排序
    sorted_templates = template_service.sort_templates(
        filtered_templates, sort_by, sort_order
    )

    # 分页
    total = len(sorted_templates)
    start_index = (page - 1) * limit
    end_index = start_index + limit
    templates_page = sorted_templates[start_index:end_index]

    return {
        "templates": templates_page,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": math.ceil(total / limit) if limit > 0 else 0,
        "language": detected_language
    }

@router.get("/{template_id}")
async def get_template(
    request: Request,
    template_id: int,
    lang: Optional[str] = Query(None, description="语言: zh, en")
):
    """获取单个模板详情"""

    # 检测请求语言
    detected_language = language_detector.detect_language(request, lang)

    # 获取本地化模板
    template = template_service.get_template_by_id(template_id, detected_language)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")

    return {
        **template,
        "language": detected_language
    }

@router.post("/{template_id}/download")
async def download_template(
    request: Request,
    template_id: int,
    lang: Optional[str] = Query(None, description="语言: zh, en")
):
    """下载/使用模板"""

    # 检测请求语言
    detected_language = language_detector.detect_language(request, lang)

    # 获取本地化模板
    template = template_service.get_template_by_id(template_id, detected_language)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")

    # 这里可以实现实际的下载逻辑
    # 比如增加下载计数、记录用户使用等

    success_messages = {
        "zh": f"模板 '{template['title']}' 使用成功",
        "en": f"Template '{template['title']}' used successfully"
    }

    return {
        "success": True,
        "message": success_messages.get(detected_language, success_messages["zh"]),
        "template_id": template_id,
        "language": detected_language
    }