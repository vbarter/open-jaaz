import base64
import aiohttp
import sys
import os
from typing import Any, Optional, Dict
from openai import AsyncOpenAI   

from log import get_logger

logger = get_logger(__name__)

# 添加父目录到路径以便导入 services 模块
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import log
from services.config_service import config_service


class ImageAnalyser:
    """图片意图理解分析器"""

    def __init__(self):
        """初始化图片分析器"""
        config = config_service.app_config.get('openai', {})
        self.api_url = str(config.get("url", "")).rstrip("/")
        self.api_token = str(config.get("api_key", ""))

        if not self.api_url:
            raise ValueError("openai API URL is not configured")
        if not self.api_token:
            raise ValueError("openai API token is not configured")

        # 确保 API 地址正确
        if not self.api_url.endswith('/v1'):
            self.api_url = f"{self.api_url}/v1"

    def _build_headers(self) -> Dict[str, str]:
        """构建请求头"""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_token}"
        }

    def _encode_image(self, image_path: str) -> str:
        """将图片文件编码为base64字符串"""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')

    async def analyze_image_intent(
        self, 
        image_path: str, 
        prompt: str = """
分析图片，提取里面的文字部分,如果没有文字，请分析下箭头，标记的含义，并输出

# 输出约定
返回json格式，比如:
{
  "prompt": "this is ...."
}        
""",
        model: str = "gemini-2.5-pro-all",
        max_tokens: int = 3000
    ) -> Optional[str]:
        """
        分析图片意图

        Args:
            image_path: 图片文件路径
            prompt: 分析提示词
            model: 使用的模型
            max_tokens: 最大token数

        Returns:
            Optional[str]: 分析结果文本，失败时返回None
        """
        try:
            # 编码图片
            base64_image = self._encode_image(image_path)
            
            # 构建请求payload
            payload = {
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image_url", 
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                "max_tokens": max_tokens
            }

            # 发送请求
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.api_url}/chat/completions",
                    headers=self._build_headers(),
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=60.0)
                ) as response:
                    if response.status == 200:
                        response_data = await response.json()
                        
                        # 提取文本内容
                        choices = response_data.get('choices', [])
                        if choices and len(choices) > 0:
                            content = choices[0].get('message', {}).get('content', '')
                            logger.info(f"✅ Image analysis response data: {content}")
                            return content
                        else:
                            logger.error("❌ No choices in response")
                            return None
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Failed to analyze image: {response.status} - {error_text}")
                        return None

        except Exception as e:
            logger.error(f"❌ Error analyzing image: {e}")
            return None

    async def analyze_image_base64(
        self,
        system_prompt: str,
        base64_image: str,
        prompt: str = """
你是一个专业的图像处理专家，擅长分析图片，解析图片内容，并根据用户在图片中的标注进行意图理解，最终生成一段nana-banana模型使用的图片处理提示词

# 图片处理约定
1. 分析图片中的主体, 比如角色1，角色2，角色3等
2. 分析图片中的文字部分，提取文字内容,并输出
3. 用户需求的提示词，后面要加一段补充说明，最终只生成一张结果图，不要引用任何原文图片

# 输出约定
返回json格式，比如:
{
  "prompt": "this is ...."
}    
""",
        model: str = "gemini-2.5-pro-all", 
        max_tokens: int = 3000
    ) -> Optional[str]:
        """
        分析base64编码的图片

        Args:
            base64_image: base64编码的图片数据
            prompt: 分析提示词
            model: 使用的模型
            max_tokens: 最大token数

        Returns:
            Optional[str]: 分析结果文本，失败时返回None
        """
        try:
            # 分析base64图片数据格式
            logger.info(f"[Image Analyser] 开始分析base64图片: 长度={len(base64_image)}")
            
            if base64_image.startswith('data:image/'):
                # 提取MIME类型
                mime_part = base64_image.split(',')[0]
                logger.info(f"[Image Analyser] 检测到完整data URL: {mime_part}")
                image_url = base64_image
            else:
                logger.info(f"[Image Analyser] 检测到纯base64数据，添加JPEG头")
                image_url = f"data:image/jpeg;base64,{base64_image}"
            
            # 构建请求payload
            payload = {
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "system",
                                "text": system_prompt
                            },
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": image_url
                                }
                            }
                        ]
                    }
                ],
                "max_tokens": max_tokens
            }
            
            logger.info(f"[Image Analyser] 准备发送请求: model={model}, max_tokens={max_tokens}")

            # 发送请求
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.api_url}/chat/completions",
                    headers=self._build_headers(),
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=60.0)
                ) as response:
                    if response.status == 200:
                        response_data = await response.json()  
                        # 提取文本内容
                        choices = response_data.get('choices', [])
                        if choices and len(choices) > 0:
                            content = choices[0].get('message', {}).get('content', '')
                            logger.info(f"✅ Image analysis response data: {content}")
                            return content
                        else:
                            logger.error("❌ No choices in response")
                            return None
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Failed to analyze image: {response.status} - {error_text}")
                        return None
        except Exception as e:
            logger.error(f"❌ Error analyzing image: {e}")
            return None
        
    async def generate_magic_image(
        self,
        images: Dict[str, str],
        prompt: str,
        model: str = "gemini-3-pro-image-preview",
        session_id: Optional[str] = None,
        aspect_ratio: str = "auto",
        quantity: int = 1
    ) -> Optional[Dict[str, str]]:
        """
        生成魔法图片

        Args:
            prompt: 图片生成提示词
            model: 使用的模型
            session_id: 会话 ID，用于 WebSocket 进度通知

        Returns:
            Optional[Dict[str, str]]: 包含 base64 或 url 的字典，失败时返回None
        """
        try:
            # 发送开始生成通知
            if session_id:
                try:
                    from services.websocket_service import send_to_websocket
                    await send_to_websocket(session_id, {
                        'type': 'generation_progress',
                        'status': 'ai_processing',
                        'message': '🤖 AI 正在生成图像...'
                    })
                except Exception as e:
                    logger.warning(f"⚠️ WebSocket 通知失败: {e}")
            
            # 创建异步 OpenAI 客户端
            client = AsyncOpenAI(
                base_url=self.api_url,
                api_key=self.api_token
            )

            # 将aspect_ratio转换为OpenAI的size参数
            # OpenAI支持的尺寸: 256x256, 512x512, 1024x1024, 1024x1792, 1792x1024
            size_map = {
                "1:1": "1024x1024",
                "4:3": "1024x1024",  # 近似
                "3:4": "1024x1024",  # 近似
                "16:9": "1792x1024",
                "9:16": "1024x1792",
                "auto": "1024x1024"  # 默认
            }
            size = size_map.get(aspect_ratio, "1024x1024")

            logger.info(f"📐 [Image Generation] aspect_ratio: {aspect_ratio} -> size: {size}")

            # 根据文件数量决定调用方式
            if images["mask"] == "" and images["image"] != "":
                # 只有目标图片，不使用模板
                logger.info(f"📝 [DEBUG] 使用单图片模式（无模板）")
                logger.info(f"   - 提示词 (prompt): {prompt}")
                logger.info(f"   - {self.api_url}")
                logger.info(f"   - {self.api_token}")
                logger.info(f"   - {model}")
                # 异步读取文件
                with open(images["image"], 'rb') as image_file:
                    result = await client.images.edit(
                        model=model,
                        image=image_file,
                        prompt=prompt,
                        response_format="url",
                        size=size,
                        n=min(quantity, 10)  # OpenAI最多支持10张
                    )
            else:
                # 同时使用目标图片和模板
                logger.info(f"📝 [DEBUG] 使用模板模式")
                logger.info(f"   - 目标图片 (image): {images['image']}")
                logger.info(f"   - 模板图片 (mask): {images['mask']}")
                logger.info(f"   - 提示词 (prompt): {prompt}")
                # 异步读取文件
                with open(images["image"], 'rb') as image_file, open(images["mask"], 'rb') as mask_file:
                    result = await client.images.edit(
                        model=model,
                        image=image_file,
                        mask=mask_file,
                        prompt=prompt,
                        response_format="url",
                        size=size,
                        n=min(quantity, 10)  # OpenAI最多支持10张
                    )

            if result.data and len(result.data) > 0:
                # 如果生成了多张图片，目前先返回第一张
                # TODO: 后续可以优化为返回所有图片
                image_data = result.data[0]
                logger.info(f"✅ Generated {len(result.data)} image(s), returning first one")

                # 返回结果字典
                response_data: Dict[str, str] = {}
                if hasattr(image_data, 'url') and image_data.url:
                    response_data['result_url'] = image_data.url
                    logger.info(f"✅ Image generated with URL: {image_data.url}")

                    # 如果生成了多张，记录其他图片URL
                    if len(result.data) > 1:
                        additional_urls = [img.url for img in result.data[1:] if hasattr(img, 'url') and img.url]
                        logger.info(f"📸 Additional {len(additional_urls)} image(s) generated but not returned")

                if response_data:
                    return response_data
                else:
                    logger.error("❌ No image data returned")
                    return None
            else:
                logger.error("❌ No image data in response")
                return None
        except Exception as e:
            logger.error(f"❌ Error generating image: {e}")
            return None

if __name__ == "__main__":
    import asyncio
    analyser = ImageAnalyser()
    result = asyncio.run(analyser.analyze_image_intent("/Users/caijunjie/Downloads/下载.png"))
    print(result)
