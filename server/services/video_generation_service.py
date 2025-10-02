"""
视频生成服务
负责批量生成图片并拼接成视频
"""

import uuid
import base64
import subprocess
import aiofiles
import httpx
from pathlib import Path
from typing import Optional, Dict, Any
from PIL import Image
from io import BytesIO
from log import get_logger
from services.new_chat.tuzi_llm_service import TuziLLMService
from utils.cos_image_service import get_cos_image_service

logger = get_logger(__name__)


class VideoGenerationService:
    """视频生成服务类"""

    def __init__(self):
        """初始化服务"""
        self.tuzi_service = TuziLLMService()
        self.cos_service = get_cos_image_service()

        # 设置基础存储目录：server/img2video/
        import os
        server_dir = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.base_storage_dir = server_dir / "img2video"
        self.base_storage_dir.mkdir(exist_ok=True)
        logger.info(f"📁 视频生成基础目录: {self.base_storage_dir}")

    def get_user_storage_dir(self, user_email: Optional[str]) -> Path:
        """
        获取用户专属存储目录

        Args:
            user_email: 用户邮箱，None表示匿名用户

        Returns:
            用户存储目录路径
        """
        user_dir_name = user_email if user_email else "anonymous"
        user_dir = self.base_storage_dir / user_dir_name
        user_dir.mkdir(exist_ok=True)
        return user_dir

    def create_session_dir(self, user_email: Optional[str]) -> Path:
        """
        为本次生成创建唯一的会话目录

        Args:
            user_email: 用户邮箱

        Returns:
            会话目录路径: server/img2video/{user_email}/{session_id}/
        """
        user_dir = self.get_user_storage_dir(user_email)
        session_id = uuid.uuid4().hex[:12]  # 使用12位短ID
        session_dir = user_dir / session_id

        # 创建子目录
        frames_dir = session_dir / "frames"
        frames_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"📁 创建会话目录: {session_dir}")
        return session_dir

    async def fetch_image_from_url(self, url: str) -> bytes:
        """
        从URL获取图片数据

        Args:
            url: 图片URL

        Returns:
            图片字节数据
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                logger.info(f"✅ 下载图片成功: {url[:80]}... ({len(response.content) // 1024}KB)")
                return response.content
        except Exception as e:
            logger.error(f"❌ 下载图片失败: {url}, 错误: {e}")
            raise

    def data_uri_to_url(self, data_uri: str) -> str:
        """
        将data URI转换为可用的URL格式

        Args:
            data_uri: data URI格式的图片

        Returns:
            处理后的URL
        """
        # 如果已经是http/https URL，直接返回
        if data_uri.startswith("http://") or data_uri.startswith("https://"):
            return data_uri

        # 如果是data URI，保持原样（nano-banana API支持）
        if data_uri.startswith("data:"):
            return data_uri

        # 其他情况视为本地路径
        return data_uri

    async def save_image_from_url(self, image_url: str, output_path: Path) -> int:
        """
        从URL保存图片到本地

        Args:
            image_url: 图片URL（支持http/https/data URI）
            output_path: 输出路径

        Returns:
            文件大小（字节）
        """
        try:
            # 处理data URI
            if image_url.startswith("data:"):
                _, encoded = image_url.split(",", 1)
                image_data = base64.b64decode(encoded)
            else:
                # HTTP/HTTPS URL
                image_data = await self.fetch_image_from_url(image_url)

            # 保存图片
            image = Image.open(BytesIO(image_data))
            image.save(output_path, format="PNG", optimize=False)

            logger.info(f"💾 保存图片: {output_path.name} ({len(image_data) // 1024}KB)")
            return len(image_data)

        except Exception as e:
            logger.error(f"❌ 保存图片失败: {e}")
            raise

    async def generate_frames(
        self,
        initial_image_url: str,
        prompt: str,
        num_frames: int,
        frames_dir: Path
    ) -> int:
        """
        串行生成视频帧

        Args:
            initial_image_url: 初始图片URL
            prompt: 图片编辑提示词
            num_frames: 要生成的帧数
            frames_dir: 帧存储目录

        Returns:
            成功生成的帧数（包括第0帧）
        """
        logger.info(f"🎬 开始生成 {num_frames} 帧图片")
        logger.info(f"📝 使用提示词: {prompt[:100]}...")

        # 保存第0帧（原始图片）
        current_image_url = self.data_uri_to_url(initial_image_url)
        frame_0_path = frames_dir / "frame_000.png"
        await self.save_image_from_url(current_image_url, frame_0_path)
        logger.info(f"✅ 保存初始帧: frame_000.png")

        successful_frames = 1  # 已经有第0帧了

        # 串行生成后续帧
        for i in range(num_frames):
            try:
                logger.info(f"🔄 正在生成第 {i + 1}/{num_frames} 帧...")

                # 调用nano-banana API
                result = await self.tuzi_service.gemini_edit_image_by_yunwu(
                    file_path=[current_image_url],
                    prompt=prompt,
                    model_name="nano-banana"
                )

                if not result or 'result_url' not in result:
                    logger.error(f"❌ 第 {i + 1} 帧生成失败，API返回: {result}")
                    break

                new_image_url = result['result_url']
                logger.info(f"✅ 第 {i + 1} 帧生成成功: {new_image_url[:80]}...")

                # 保存当前帧
                frame_path = frames_dir / f"frame_{i + 1:03d}.png"
                await self.save_image_from_url(new_image_url, frame_path)

                # 重要：将当前帧作为下一帧的输入（串行处理）
                current_image_url = new_image_url
                successful_frames += 1

            except Exception as e:
                logger.error(f"❌ 生成第 {i + 1} 帧时出错: {e}", exc_info=True)
                break

        logger.info(f"✅ 成功生成 {successful_frames} 帧（含初始帧）")
        return successful_frames

    def generate_video_from_frames(
        self,
        frames_dir: Path,
        output_video_path: Path,
        frame_rate: int = 5
    ) -> bool:
        """
        使用ffmpeg将图片序列拼接成视频（不使用转场效果）

        Args:
            frames_dir: 图片帧目录
            output_video_path: 输出视频路径
            frame_rate: 帧率（默认5fps，表示5张图片=1秒）

        Returns:
            是否成功
        """
        try:
            logger.info(f"🎥 开始生成视频，帧率: {frame_rate}fps")
            logger.info(f"📁 图片目录: {frames_dir}")
            logger.info(f"📹 输出路径: {output_video_path}")

            # 检查帧文件是否存在
            frame_files = sorted(frames_dir.glob("frame_*.png"))
            if not frame_files:
                logger.error(f"❌ 未找到图片帧文件: {frames_dir}")
                return False

            logger.info(f"📸 找到 {len(frame_files)} 个图片帧")
            for frame_file in frame_files[:3]:  # 显示前3个文件
                logger.info(f"  - {frame_file.name}")

            # 使用简单可靠的ffmpeg命令（不使用转场效果）
            # -framerate: 输入帧率
            # -i: 输入文件模式（使用%03d表示3位数字）
            # -c:v libx264: 使用H.264编码
            # -pix_fmt yuv420p: 设置像素格式（兼容性好）
            # -vf: 视频滤镜（确保宽高是偶数，H.264要求）
            # -y: 覆盖输出文件
            cmd = [
                "ffmpeg",
                "-framerate", str(frame_rate),
                "-i", str(frames_dir / "frame_%03d.png"),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
                "-y",
                str(output_video_path)
            ]

            logger.info(f"🔧 执行ffmpeg命令:")
            logger.info(f"   {' '.join(cmd)}")

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True
            )

            # 检查命令执行结果
            if result.returncode != 0:
                logger.error(f"❌ ffmpeg执行失败，返回码: {result.returncode}")
                logger.error(f"stderr: {result.stderr}")
                return False

            # 检查视频文件是否生成
            if output_video_path.exists():
                file_size_mb = output_video_path.stat().st_size / (1024 * 1024)
                logger.info(f"✅ 视频生成成功: {output_video_path.name} ({file_size_mb:.2f}MB)")

                # 使用ffprobe检查视频时长
                try:
                    probe_cmd = [
                        "ffprobe",
                        "-v", "error",
                        "-show_entries", "format=duration",
                        "-of", "default=noprint_wrappers=1:nokey=1",
                        str(output_video_path)
                    ]
                    probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
                    if probe_result.returncode == 0:
                        duration = float(probe_result.stdout.strip())
                        logger.info(f"📊 视频时长: {duration:.2f}秒")
                except Exception as e:
                    logger.warning(f"⚠️ 无法检查视频时长: {e}")

                return True
            else:
                logger.error("❌ 视频文件未生成")
                return False

        except Exception as e:
            logger.error(f"❌ 生成视频失败: {e}", exc_info=True)
            return False

    async def upload_video_to_cloud(
        self,
        video_path: Path
    ) -> Optional[str]:
        """
        上传视频到腾讯云

        Args:
            video_path: 视频文件路径

        Returns:
            腾讯云URL，失败返回None
        """
        try:
            logger.info(f"☁️ 开始上传视频到腾讯云...")

            # 生成唯一的云端文件名
            video_key = f"videos/{uuid.uuid4().hex}.mp4"

            # 读取视频文件
            async with aiofiles.open(video_path, 'rb') as f:
                video_bytes = await f.read()

            logger.info(f"📦 视频大小: {len(video_bytes) // 1024}KB")

            # 上传到腾讯云
            cos_url = await self.cos_service.upload_image_from_bytes(
                image_bytes=video_bytes,
                image_key=video_key,
                content_type='video/mp4'
            )

            if cos_url:
                logger.info(f"✅ 视频上传成功: {cos_url}")
                return cos_url
            else:
                logger.error("❌ 视频上传失败")
                return None

        except Exception as e:
            logger.error(f"❌ 上传视频到腾讯云失败: {e}", exc_info=True)
            return None

    async def generate_video(
        self,
        initial_image_url: str,
        mode: str,
        prompt: str,
        num_frames: int,
        frame_rate: int = 5,
        user_email: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        完整的视频生成流程

        Args:
            initial_image_url: 初始图片URL
            mode: 生成模式
            prompt: 提示词
            num_frames: 帧数
            frame_rate: 帧率（默认5fps，即5张图片=1秒）
            user_email: 用户邮箱

        Returns:
            包含video_url等信息的字典，失败返回None
        """
        # 创建会话目录
        session_dir = self.create_session_dir(user_email)
        frames_dir = session_dir / "frames"

        logger.info(f"📁 会话目录: {session_dir}")
        logger.info(f"📸 帧目录: {frames_dir}")

        try:
            # 1. 生成图片帧
            total_frames = await self.generate_frames(
                initial_image_url=initial_image_url,
                prompt=prompt,
                num_frames=num_frames,
                frames_dir=frames_dir
            )

            if total_frames == 0:
                logger.error("❌ 没有成功生成任何帧")
                return None

            logger.info(f"✅ 共生成 {total_frames} 帧")

            # 2. 拼接成视频
            video_path = session_dir / "output.mp4"
            video_success = self.generate_video_from_frames(
                frames_dir=frames_dir,
                output_video_path=video_path,
                frame_rate=frame_rate
            )

            if not video_success:
                logger.error("❌ 视频拼接失败")
                return None

            # 3. 上传到腾讯云
            video_url = await self.upload_video_to_cloud(video_path)

            if not video_url:
                logger.error("❌ 视频上传失败")
                # 即使上传失败，也返回本地路径
                from common import BASE_URL
                local_video_url = f"{BASE_URL}/img2video/{user_email or 'anonymous'}/{session_dir.name}/output.mp4"
                logger.info(f"⚠️ 使用本地路径: {local_video_url}")
                video_url = local_video_url

            # 计算视频时长
            duration_seconds = total_frames / frame_rate

            logger.info(f"🎉 视频生成完成！")
            logger.info(f"   - 总帧数: {total_frames}")
            logger.info(f"   - 帧率: {frame_rate}fps")
            logger.info(f"   - 时长: {duration_seconds:.2f}秒")
            logger.info(f"   - URL: {video_url}")
            logger.info(f"   - 本地路径: {session_dir}")

            return {
                "video_url": video_url,
                "num_frames": total_frames,
                "duration_seconds": duration_seconds,
                "frame_rate": frame_rate,
                "local_path": str(session_dir)
            }

        except Exception as e:
            logger.error(f"❌ 视频生成流程失败: {e}", exc_info=True)
            return None


# 全局实例
_video_generation_service: Optional[VideoGenerationService] = None


def get_video_generation_service() -> VideoGenerationService:
    """获取视频生成服务实例"""
    global _video_generation_service
    if _video_generation_service is None:
        _video_generation_service = VideoGenerationService()
    return _video_generation_service
