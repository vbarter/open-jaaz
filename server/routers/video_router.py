"""
视频生成路由
处理批量图片生成和视频拼接功能
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, Literal
from utils.auth_utils import get_current_user_optional, CurrentUser
from services.video_generation_service import get_video_generation_service
from log import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api")


# 请求模型
class ImgVideo1Request(BaseModel):
    """图片转视频请求参数"""
    image: str = Field(..., description="输入图片（URL或base64）")
    mode: Literal[
        "up", "down", "left", "right",
        "rotate-left", "rotate-right",
        "zoom-in", "zoom-out",
        "future", "past",
        "funny", "serious",
        "dramatic", "peaceful",
        "futuristic", "nature",
        "urban", "minimalist",
        "crowded", "empty"
    ] = Field(default="funny", description="图片变换模式")
    num_frames: int = Field(default=10, ge=1, le=60, description="生成帧数（1-60）")


# 响应模型
class ImgVideo1Response(BaseModel):
    """图片转视频响应"""
    video_url: str = Field(..., description="生成的视频URL（腾讯云地址）")
    num_frames: int = Field(..., description="实际生成的帧数")
    duration_seconds: float = Field(..., description="视频时长（秒）")
    status: str = Field(default="success", description="处理状态")


# Mode到Prompt的映射
PROMPTS = {
    "up": "Gently pan the camera up, extending the image.",
    "down": "Gently pan the camera down, extending the image.",
    "left": "Gently pan the camera left, extending the image.",
    "right": "Gently pan the camera right, extending the image.",
    "rotate-left": "Gently rotate the camera counter-clockwise, extending the borders to fit the new perspective.",
    "rotate-right": "Gently rotate the camera clockwise, extending the borders to fit the new perspective.",
    "zoom-in": "Gently zoom in on the center of the image, maintaining focus and detail.",
    "zoom-out": "Gently zoom out from the image, revealing more of the surrounding scene.",
    "future": "Show this scene one second in the future",
    "past": "Show this scene one second in the past",
    "funny": "Subtly alter this image by replacing one or two details with something unexpected and funny.",
    "serious": "Subtly alter this image by replacing one or two details with something more serious, meaningful, or thought-provoking.",
    "dramatic": "Subtly enhance the drama and intensity of this scene. Adjust lighting to be more cinematic, deepen shadows, or add atmospheric elements like mist or dramatic sky. Keep changes photorealistic and well-integrated.",
    "peaceful": "Transform this scene to be more peaceful and serene. Soften harsh elements, add calming details like gentle lighting or natural elements. Keep changes subtle and photorealistic.",
    "futuristic": "Subtly modernize or add futuristic elements to this scene. Replace one or two objects with sleek, high-tech alternatives. Keep changes minimal, well-integrated, and photorealistic.",
    "nature": "Subtly introduce natural elements into this scene. Add plants, natural lighting, or organic textures. Keep changes small and seamlessly integrated with photorealistic quality.",
    "urban": "Subtly add urban elements to this scene. Introduce architectural details, city textures, or modern infrastructure. Keep changes minimal and photorealistic.",
    "minimalist": "Simplify this scene with minimalist aesthetics. Remove or tone down one or two distracting elements, create cleaner compositions, and emphasize negative space. Keep it photorealistic.",
    "crowded": "Subtly add more people or objects to make this scene feel more populated or busy. Keep additions natural, well-integrated, and photorealistic.",
    "empty": "Subtly remove one or two people or objects to make this scene feel more spacious or isolated. Keep the result natural and photorealistic.",
}


def get_prompt_for_mode(mode: str) -> str:
    """
    根据mode获取对应的提示词

    Args:
        mode: 图片变换模式

    Returns:
        对应的提示词

    Raises:
        ValueError: 如果mode不存在
    """
    prompt = PROMPTS.get(mode)
    if not prompt:
        raise ValueError(f"Unknown mode: {mode}")
    return prompt


@router.post("/img_video_1", response_model=ImgVideo1Response)
async def generate_img_video(
    request: ImgVideo1Request,
    current_user: Optional[CurrentUser] = Depends(get_current_user_optional)
):
    """
    批量生成nano-banana图片并拼接成视频

    工作流程：
    1. 获取输入图片和模式对应的prompt
    2. 串行生成num_frames帧图片（每帧基于前一帧）
    3. 使用ffmpeg将图片序列拼接成视频
    4. 上传到腾讯云并返回URL
    """
    try:
        logger.info(f"🎬 开始生成视频 - mode: {request.mode}, num_frames: {request.num_frames}")

        # 获取用户信息
        user_email = current_user.email if current_user else None
        user_id = str(current_user.id) if current_user else None
        logger.info(f"👤 用户信息 - email: {user_email}, id: {user_id}")

        # 获取mode对应的prompt
        prompt = get_prompt_for_mode(request.mode)
        logger.info(f"📝 使用提示词: {prompt[:100]}...")

        # 获取视频生成服务
        video_service = get_video_generation_service()

        # 执行视频生成
        # 默认配置：5fps（5张图片=1秒）
        result = await video_service.generate_video(
            initial_image_url=request.image,
            mode=request.mode,
            prompt=prompt,
            num_frames=request.num_frames,
            frame_rate=5,  # 5fps：5张图片=1秒
            user_email=user_email
        )

        if not result:
            raise HTTPException(status_code=500, detail="视频生成失败，请查看日志")

        logger.info(f"✅ 视频生成成功: {result['video_url']}")

        return ImgVideo1Response(
            video_url=result['video_url'],
            num_frames=result['num_frames'],
            duration_seconds=result['duration_seconds'],
            status="success"
        )

    except ValueError as e:
        logger.error(f"❌ 参数错误: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 生成视频失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"生成视频失败: {str(e)}")
