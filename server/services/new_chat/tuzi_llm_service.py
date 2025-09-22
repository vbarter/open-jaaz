# services/OpenAIAgents_service/jaaz_service.py
import base64
import os
import uuid
import json
import asyncio
import aiohttp
import re
from typing import Dict, Any, Optional, List, Literal, AsyncGenerator, Union
from utils.http_client import HttpClient
from services.config_service import config_service
from utils.image_analyser import ImageAnalyser
from log import get_logger
from openai import AsyncOpenAI

logger = get_logger(__name__)

class TuziLLMService:
    """基于兔子API的LLM服务
    """

    def __init__(self, provider: str = 'openai'):
        """初始化Tuzi LLM服务"""
        config = config_service.app_config.get(provider, {})
        self.api_url = str(config.get("url", "")).rstrip("/")
        self.api_token = str(config.get("api_key", ""))

        if not self.api_url:
            raise ValueError("Tu-zi API URL is not configured")
        if not self.api_token:
            raise ValueError("Tu-zi API token is not configured")

        # API URL 已包含完整路径，无需额外添加后缀

        logger.info(f"✅ Tu-zi service initialized with API URL: {self.api_url}")

    def _is_configured(self) -> bool:
        """检查 Tu-zi API 是否已配置"""
        return bool(self.api_url and self.api_token)

    def _build_headers(self) -> Dict[str, str]:
        """构建请求头"""
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }

    async def create_magic_task(self, image_content: str) -> str:
        """
        创建云端魔法图像生成任务

        Args:
            image_content: 图片内容（base64 或 URL）

        Returns:
            str: 任务 ID，失败时返回空字符串
        """
        logger.info(f"👇create_magic_task image_content {image_content}")
        try:
            if not image_content or not image_content.startswith('data:image/'):
                logger.error("❌ Invalid image content format")
                return ""
            
            
            async with HttpClient.create_aiohttp() as session:
                async with session.post(
                    f"{self.api_url}/image/magic",
                    headers=self._build_headers(),
                    json={
                        "image": image_content
                    },
                    timeout=aiohttp.ClientTimeout(total=60.0)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        task_id = data.get('task_id', '')
                        if task_id:
                            logger.info(f"✅ Magic task created: {task_id}")
                            return task_id
                        else:
                            logger.error("❌ No task_id in response")
                            return ""
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Failed to create magic task: {response.status} - {error_text}")
                        return ""

        except Exception as e:
            print(f"❌ Error creating magic task: {e}")
            return ""

    async def create_video_task(
        self,
        prompt: str,
        model: str,
        resolution: str = "480p",
        duration: int = 5,
        aspect_ratio: str = "9:16",
        input_images: List[str] = [],
        **kwargs: Any
    ) -> str:
        """
        这是一个定制的视频生成接口，主要使用了yunwu veo3视频接口

        Args:
            prompt: 视频生成提示词
            model: 视频生成模型
            resolution: 视频分辨率
            duration: 视频时长（秒）
            aspect_ratio: 宽高比
            input_images: 输入图片列表（可选）
            **kwargs: 其他参数

        Returns:
            str: 任务 ID

        Raises:
            Exception: 当任务创建失败时抛出异常
        """
        logger.info(f"👇create_video_task prompt: {prompt}, model: {model}, resolution: {resolution}, duration: {duration}, aspect_ratio: {aspect_ratio}, input_images: {input_images}")
        
        async with HttpClient.create_aiohttp() as session:
            payload = {
                "prompt": prompt,
                "model": model,
                "enable_upsample": True,
                "enhance_prompt": True,
            }

            # 添加可选参数
            if aspect_ratio:
                payload["aspect_ratio"] = aspect_ratio
            if input_images:
                payload["images"] = input_images
            if resolution:
                payload["resolution"] = resolution
            if duration:
                payload["duration"] = duration
            
            # 添加其他参数
            payload.update(kwargs)

            headers = {
                "Authorization": f"Bearer sk-3id68TiP9AKUFzIhSnz8KrTTDXDXKyR05xuOW7kyCIubMlDq",
                "Content-Type": "application/json"
            }

            async with session.post(
                f"{self.api_url}/video/create",
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120.0)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    task_id = data.get('id', '')
                    if task_id:
                        logger.info(f"✅ Video task created: {task_id}")
                        return task_id
                    else:
                        raise Exception("No id in response")
                else:
                    error_text = await response.text()
                    raise Exception(f"Failed to create video task: HTTP {response.status} - {error_text}")

    async def poll_for_task_completion(
        self,
        task_id: str,
        max_attempts: Optional[int] = None,
        interval: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        等待任务完成并返回结果

        Args:
            task_id: 任务 ID
            max_attempts: 最大轮询次数
            interval: 轮询间隔（秒）

        Returns:
            Dict[str, Any]: 任务结果

        Raises:
            Exception: 当任务失败或超时时抛出异常
        """
        max_attempts = max_attempts or 100  # 默认最多轮询 150 次
        interval = interval or 2.0  # 默认轮询间隔 2 秒

        headers = {
            "Authorization": f"Bearer sk-3id68TiP9AKUFzIhSnz8KrTTDXDXKyR05xuOW7kyCIubMlDq",
            "Content-Type": "application/json"
        }

        async with HttpClient.create_aiohttp() as session:
            for _ in range(max_attempts):
                async with session.get(
                    f"{self.api_url}/video/query?id={task_id}",
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=20.0)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        status = data.get('status')
                        
                        if status == 'completed':
                            logger.info(f"✅ Task {task_id} completed successfully")
                            video_url = data.get('video_url')
                            if video_url:
                                return {'result_url': video_url, 'status': status}
                            else:
                                raise Exception("No video_url in completed response")
                        elif status in ['failed', 'error', 'video_generation_failed', 'video_upsampling_failed']:
                            error_msg = data.get('detail', {}).get('error', 'Unknown error')
                            raise Exception(f"Task failed with status {status}: {error_msg}")
                        else:
                            # 继续轮询
                            logger.info(f"🔄 Task {task_id} status: {status}, continuing to poll...")
                            await asyncio.sleep(interval)
                            continue
                    else:
                        error_text = await response.text()
                        raise Exception(f"Failed to get task status: HTTP {response.status} - {error_text}")

            raise Exception(f"Task polling timeout after {max_attempts} attempts")

    async def generate_magic_image(self, system_prompt: str, image_content: str, user_info: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """
        生成魔法图像的完整流程

        Args:
            system_prompt: 系统提示词
            image_content: 图片内容（base64 或 URL）
            user_info: 用户信息，包含email和uuid等

        Returns:
            Dict[str, Any]: 包含 result_url 的任务结果，失败时返回包含 error 信息的字典
        """
        try:
            # 1. 图片意图识别, 创建图片分析器实例
            analyser = ImageAnalyser()
            logger.info(f"👇generate_magic_image system_prompt: {system_prompt}")
            if image_content.startswith('data:image/'): 
                try:
                    # 分析图片意图
                    analysis_result = await analyser.analyze_image_base64(system_prompt, image_content)
                    if analysis_result:
                        try:
                            result_json = json.loads(analysis_result)
                            magic_prompt = result_json.get('prompt', 'enhance the image with magical effects')
                        except json.JSONDecodeError:
                            magic_prompt = analysis_result
                    else:
                        magic_prompt = "enhance the image with magical effects"
                    
                    logger.info(f"✅ 图片意图分析完成: {magic_prompt}")
                except Exception as e:
                    logger.error(f"❌ 图片意图分析失败: {e}")
                    return {"error": "Failed to analyze image intent"}
            else:
                magic_prompt = "enhance the image with magical effects"
                logger.error("⚠️ 无法解析图片格式，使用默认提示词")
            
            # 将图片内容写入用户目录
            from services.config_service import get_user_files_dir
            
            # 生成唯一文件名
            file_id = str(uuid.uuid4())
            
            # 获取用户文件目录（使用和chat接口相同的逻辑）
            user_email = user_info.get('email') if user_info else None
            user_id = user_info.get('uuid') if user_info else None
            user_files_dir = get_user_files_dir(user_email=user_email, user_id=user_id)
            
            if image_content.startswith('data:image/'):
                # 从data URL中提取格式和数据
                header, encoded = image_content.split(',', 1)
                image_format = header.split(';')[0].split('/')[1]  # 获取图片格式(jpeg, png等)
                image_data = base64.b64decode(encoded)
                file_path = os.path.join(user_files_dir, f"{file_id}.{image_format}")
            else:
                # 假设是其他格式，默认保存为jpg
                image_data = image_content.encode() if isinstance(image_content, str) else image_content
                file_path = os.path.join(user_files_dir, f"{file_id}.jpg")
            
            # 写入文件
            with open(file_path, 'wb') as f:
                f.write(image_data)
            
            logger.info(f"✅ 图片已保存到: {file_path}")

            images = {
                "image": file_path,
                "mask": ""
            }

            # 2. nano-banana模型，创建魔法任务
            result = await analyser.generate_magic_image(images, magic_prompt)
            if result:
                logger.info(f"✅ Magic image generated successfully: {result.get('result_url')}")
            else:
                logger.error("❌ Failed to generate magic image")
                return {"error": "Failed to generate magic image"}
            return result
        except Exception as e:
            error_msg = f"Error in magic image generation: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return {"error": error_msg}

    async def generate(self,
                       model_name:str,
                       user_prompt: str,
                       image_content: List[str],
                       user_info: Optional[Dict[str, Any]] = None,
                       stream: bool = False,
                       aspect_ratio: str = 'auto',
                       quantity: int = 1,
                       user_has_drawing_intent: str = "text",
                       user_language: str = 'en') -> Union[Optional[Dict[str, Any]], AsyncGenerator[str, None], str]:
        """
        生成魔法图像的完整流程

        Args:
            model_name: 用户选择的模型名称
            user_prompt: 用户输入的文本
            image_content: 图片内容（base64 或 URL），可能为空
            user_info: 用户信息
            stream: 是否启用流式输出（仅对文本对话有效）

        Returns:
            如果是图片生成: 返回包含 result_url 的字典
            如果是文本对话且stream=False: 返回包含文本内容的字典
            如果是文本对话且stream=True: 返回异步生成器
            失败时: 返回包含 error 信息的字典
        """
        try:
            # 步骤1: 判断用户是否有图片上传，如果有肯定是画图 
            if user_has_drawing_intent == "text":
                logger.info("💬 检测到文本对话意图，执行文本对话流程")
                # 步骤3: 不是画图，直接走用户设定的大模型调用
                return await self._handle_text_conversation(model_name, user_prompt, user_info, stream=stream)
            elif user_has_drawing_intent == "image":
                ##image_model = self._get_image_generation_model(model_name)
                if len(image_content) > 0:
                    logger.info("🖼️ 检测到图片上传，执行图片编辑流程")
                    return await self._handle_image_editing(model_name, user_prompt, image_content, user_info, aspect_ratio, quantity)
                else:
                    logger.info("📝 无图片上传，执行文生图流程...")
                    return await self._handle_image_generation(model_name, user_prompt, user_info, aspect_ratio, quantity)
            elif user_has_drawing_intent == "video":
                #video_model = self._get_video_generation_model(model_name)
                logger.info("🎥 检测到视频意图，执行视频生成流程")
                logger.info(f"🔍 [DEBUG] 输入图片: {image_content}")
                return await self.generate_video(user_prompt, model_name, input_images=image_content)
            elif user_has_drawing_intent == "url":
                logger.info("🔗 检测到链接处理意图，执行链接处理流程")
                # user_prompt = f"{user_prompt} \n 请你仔细阅读这个网页，根据内容生成详细的绘图prompt, 输出语言采用{user_language}"
                # logger.info(f"🔍 [DEBUG] 生成提示词: {user_prompt}")
                prompt = await self._generate_prompt_by_url(user_prompt, user_language=user_language)
                if prompt.strip() == "":
                    raise Exception("相关url，生成提示词为空")
                logger.info(f"🔍 [DEBUG] 生成提示词: {prompt}")
                return await self._handle_image_generation(model_name, prompt, user_info, aspect_ratio, quantity)
        except Exception as e:
            error_msg = f"Error in generate: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return {"error": error_msg}

    async def _handle_image_editing(self,
                                    model_name: str,
                                    user_prompt: str,
                                    image_content: List[str],
                                    user_info: Optional[Dict[str, Any]],
                                    aspect_ratio: str = 'auto',
                                    quantity: int = 1) -> Dict[str, Any]:
        """处理图片编辑流程"""
        try:
            logger.info(f"🔍 [DEBUG] _handle_image_editing 开始")
            
            from services.config_service import get_user_files_dir

            # 注释掉错误的模型映射，直接使用用户选择的模型
            # original_model = model_name
            if model_name == "seedream-4.0":
                model_name = "doubao-seedream-4-0-250828"
            logger.info(f"🔍 [DEBUG] 使用模型: '{model_name}' (无映射)")
                
            
            
            # 获取用户文件目录
            # user_email = user_info.get('email') if user_info else None
            # user_id = user_info.get('uuid') if user_info else None
            # user_files_dir = get_user_files_dir(user_email=user_email, user_id=user_id)
    

            # 处理多个图片文件，生成file_path列表
            # file_paths: List[str] = []

            logger.info(f"🔍 [DEBUG] 接收到的图片内容: {image_content}")
            
            # for i, image_item in enumerate(image_content):
            #     # 为每个图片生成唯一文件名
            #     file_id = str(uuid.uuid4())
                
            #     if image_item.startswith('data:image/'):
            #         # 从data URL中提取格式和数据
            #         header, encoded = image_item.split(',', 1)
            #         image_format = header.split(';')[0].split('/')[1]  # 获取图片格式(jpeg, png等)
            #         image_data = base64.b64decode(encoded)
            #         file_path = os.path.join(user_files_dir, f"{file_id}.{image_format}")
            #     else:
            #         # 假设是其他格式，默认保存为jpg
            #         image_data = image_item.encode() if isinstance(image_item, str) else image_item
            #         file_path = os.path.join(user_files_dir, f"{file_id}.jpg")
        
            #     # 写入文件
            #     with open(file_path, 'wb') as f:
            #         f.write(image_data)
        
            #     file_paths.append(file_path)
            #     logger.info(f"✅ 图片 {i+1} 已保存到: {file_path}")
            
            # logger.info(f"✅ 总共保存了 {len(file_paths)} 个图片文件")
            
            # 使用gemini进行图片编辑，传递aspect_ratio和quantity
            # result = await self.gemini_edit_image_by_tuzi(file_paths, user_prompt, model=model_name,
            #                                               aspect_ratio=aspect_ratio, quantity=quantity)
            result = await self.gemini_edit_image_by_yunwu(image_content, user_prompt)
            
            if result:
                logger.info(f"✅ 图片编辑成功: {result.get('result_url')}")
                return result
            else:
                logger.error("❌ 图片编辑失败")
                return {"error": "Failed to edit image"}
                
        except Exception as e:
            error_msg = f"Error in image editing: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return {"error": error_msg}

    async def _detect_image_generation_intent(self, user_prompt: str) -> bool:
        """使用大模型检测用户是否有画图意图"""
        try:
            intent_prompt = f"""
请判断以下用户输入是否是想要生成图片/画图的意图。
只需要回答 YES 或 NO。

用户输入: {user_prompt}

判断标准:
- 如果用户明确要求画图、生成图片、制作图像等，回答 YES
- 如果用户只是普通对话、提问、文本交流等，回答 NO
- 如果用户描述场景但没有明确要求生成图片，回答 NO

回答:"""

            logger.info(f"🤖 使用大模型进行意图理解...")
            intent_client = AsyncOpenAI(
                api_key="sk-T5GzBCTpRm92Po9G9WU9B19w1p1pxHJ8qwfcAcZ47MdZCzEM",
                base_url="https://api.apiplus.org/v1",
                timeout=30.0,
                max_retries=0
            )
            
            intent_completion = await intent_client.chat.completions.create(
                model="gpt-5-2025-08-07",
                messages=[{"role": "user", "content": intent_prompt}],
                max_tokens=3000,
                temperature=0.1
            )
            
            intent_result = intent_completion.choices[0].message.content.strip().upper()
            logger.info(f"🤖 意图理解结果: {intent_result}")
            
            return intent_result == "YES"
            
        except Exception as e:
            logger.error(f"❌ 意图理解失败: {e}")
            # 默认返回False，走文本对话流程
            return False

    def _get_image_generation_model(self, user_model: str) -> str:
        """获取图片生成模型，如果用户选择的不是画图模型则使用默认模型"""
        # 已验证可用的图像编辑模型
        supported_image_edit_models = ["gemini-2.5-flash-image", "gpt-4o", "seedream-4.0"]

        # 不支持的模型（已知会报错）
        unsupported_models = ["gemini-2.5-pro-all"]

        logger.info(f"🔍 [DEBUG] _get_image_generation_model 输入参数: user_model='{user_model}'")
        logger.info(f"🔍 [DEBUG] 支持图像编辑的模型: {supported_image_edit_models}")
        logger.info(f"🔍 [DEBUG] 不支持的模型: {unsupported_models}")

        if user_model in supported_image_edit_models:
            logger.info(f"✅ 用户选择的模型 '{user_model}' 支持图片编辑")
            return user_model
        else:
            logger.info(f"⚠️ 用户选择的模型 '{user_model}' 不支持图片编辑，使用默认模型 'gemini-2.5-flash-image'")
            return "gemini-2.5-flash-image"
        
    def _get_video_generation_model(self, user_model: str) -> str:
        """获取视频生成模型，如果用户选择的不是视频生成模型则使用默认模型"""
        # 已验证可用的图像编辑模型
        supported_video_generation_models = ["veo3-fast"]

        if user_model in supported_video_generation_models:
            logger.info(f"✅ 用户选择的模型 '{user_model}' 支持图片编辑")
            return "veo3-fast-frames"
        else:
            logger.info(f"⚠️ 用户选择的模型 '{user_model}' 不支持视频编辑，使用默认模型 'veo3-fast-frames'")
            return "veo3-fast-frames"

    async def _handle_image_generation(self, model_name: str, user_prompt: str, user_info: Optional[Dict[str, Any]],
                                       aspect_ratio: str = 'auto', quantity: int = 1) -> Dict[str, Any]:
        """处理图片生成流程（带重试和状态反馈）"""
        try:
            logger.info(f"🎨 开始图片生成流程: model={model_name}")
            
            # 调用带重试机制的图片生成
            # 注释掉错误的模型映射，直接使用用户选择的模型
            if model_name == "seedream-4.0":
                model_name = "doubao-seedream-4-0-250828"
            logger.info(f"🔍 [DEBUG] _handle_image_generation 使用模型: '{model_name}' (无映射)")
            result = await self.gemini_generate_by_tuzi(user_prompt, model_name, aspect_ratio=aspect_ratio, quantity=quantity)
            
            if result:
                logger.info(f"🎉 图片生成成功: {result.get('result_url', 'base64_data')}")
                return result
            else:
                logger.error("💥 图片生成失败: 所有重试尝试都失败")
                # 返回更友好的错误信息
                from utils.error_messages import ErrorMessages
                error_message = ErrorMessages.get_generation_failed_message()
                return {"error": "Failed to generate image", "user_message": error_message}
                
        except asyncio.TimeoutError:
            logger.error("⏰ 图片生成超时")
            from utils.error_messages import ErrorMessages
            timeout_message = ErrorMessages.get_timeout_message()
            return {"error": "Image generation timeout", "user_message": timeout_message}
            
        except Exception as e:
            error_msg = f"Error in image generation: {str(e)}"
            logger.error(f"💀 图片生成异常: {error_msg}")
            
            # 根据错误类型返回不同的用户友好消息
            if "timeout" in str(e).lower():
                from utils.error_messages import ErrorMessages
                user_message = ErrorMessages.get_timeout_message()
            elif "401" in str(e) or "403" in str(e):
                user_message = "🔑 API认证失败，请检查配置"
            elif "network" in str(e).lower() or "connection" in str(e).lower():
                user_message = "🌐 网络连接异常，请稍后重试"
            else:
                from utils.error_messages import ErrorMessages
                user_message = ErrorMessages.get_generation_failed_message()
                
            return {"error": error_msg, "user_message": user_message}

    async def _handle_text_conversation(self, model_name: str, user_prompt: str, user_info: Optional[Dict[str, Any]], stream: bool = False) -> Union[Optional[Dict[str, Any]], AsyncGenerator[str, None], str]:
        """处理文本对话流程"""
        try:
            text_response = await self._chat_with_tuzi(user_prompt, model_name, stream=stream) 
            if stream:
                # 流式输出，直接返回异步生成器
                return text_response
            else:
                # 非流式输出，保持原有逻辑
                if text_response:
                    logger.info(f"✅ 文本对话成功")
                    return text_response
                else:
                    logger.error("❌ 文本对话失败")
                    return {"error": "Text conversation failed"}
        except Exception as e:
            error_msg = f"Error in text conversation: {str(e)}"
            logger.error(f"❌ {error_msg}")
            if stream:
                # 流式输出时，返回错误生成器
                async def error_generator():
                    yield f"[错误] {error_msg}"
                return error_generator()
            else:
                return {"error": error_msg}

    async def _chat_with_tuzi(self, prompt: str, model: str, stream: bool = False) -> Union[Optional[Dict[str, Any]], AsyncGenerator[str, None]]:
        """GPT 文本对话
        
        Args:
            prompt: 用户输入的提示词
            model: 使用的模型名称
            stream: 是否启用流式输出
            
        Returns:
            如果 stream=False: 返回包含完整响应的字典
            如果 stream=True: 返回异步生成器，逐步yield文本片段
        """
        logger.info(f"🔍 [DEBUG] gpt_by_tuzi 参数:")
        logger.info(f"   prompt: {prompt}")
        logger.info(f"   model: {model}")
        logger.info(f"   stream: {stream}")
        logger.info(f"   base_url: {self.api_url}")     
        logger.info(f"💬 [DEBUG] 使用文本对话模式")
        logger.info(f"🚀 [DEBUG] 调用 client.chat.completions.create...")

        client = AsyncOpenAI(
                api_key=self.api_token,
                base_url=self.api_url,
                timeout=60.0,  # 设置60秒超时
                max_retries=0   # 禁用重试，避免重复调用
            )
        
        if stream:
            # 流式输出
            return self._stream_chat_response(client, model, prompt)
        else:
            # 非流式输出，保持原有逻辑
            completion = await client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )
            
            if completion.choices and len(completion.choices) > 0:
                response_content = completion.choices[0].message.content
                if response_content:
                    logger.info(f"✅ [DEBUG] GPT 响应: {response_content[:100]}...")
                    return {
                        'text_content': response_content,
                        'type': 'text'
                    }
                else:
                    logger.error("❌ GPT 响应内容为空")
                    return None
            else:
                logger.error("❌ GPT 响应没有choices")
                return None

    async def _stream_chat_response(self, client: AsyncOpenAI, model: str, prompt: str) -> AsyncGenerator[str, None]:
        """处理流式聊天响应
        
        Args:
            client: OpenAI客户端
            model: 模型名称
            prompt: 用户提示词
            
        Yields:
            str: 文本片段
        """
        try:
            logger.info(f"🌊 [DEBUG] 开始流式响应...")
            
            # 创建流式completions
            stream = await client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                stream=True
            )
            
            # 逐步处理流式响应
            async for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta and delta.content:
                        logger.info(f"🌊 [DEBUG] 收到流式片段: {delta.content[:50]}...")
                        yield delta.content
                        
            logger.info(f"✅ [DEBUG] 流式响应完成")
            
        except Exception as e:
            logger.error(f"❌ 流式响应失败: {e}")
            yield f"[错误] 流式响应失败: {str(e)}"

    async def _generate_prompt_by_url(self, 
                                      user_prompt: str,
                                      user_language: str = "en") -> str:
        """
        根据URL内容生成优化的绘图提示词
        
        Args:
            user_prompt: 用户输入的提示词（包含URL和语言要求）
            
        Returns:
            str: 优化后的提示词
        """
        try:   
            # 构建新的提示词模板
            enhanced_prompt = f"""
**角色 (Role):**
你是一位顶级的AI艺术提示词工程师，专门为AI图像生成器创建富有想象力和表现力的提示词。你的任务是分析网页内容，并将其核心概念、美学和情感转化为一个结构精良、细节丰富的绘图指令。

**任务流程 (Workflow):**

1.  **接收输入 (Receive Input):** 我会提供一个网页URL。帮我读取全部内容
2.  **根据网页内容，生成详细的英文prompt
3.  **格式化输出 (Format the Output):**
    *   将你生成的最终结果封装在一个**严格的JSON格式**中。
    *   **不要在JSON代码块的之前或之后添加任何解释、说明或额外文字。**
    *   输出语言 `{user_language}` 指的是，如果我用中文提问，你输出的JSON中的`prompt`字段里的描述性文字可以是中文，但核心关键词和风格词汇建议保留英文或附上英文。为了达到最佳绘图效果，我们统一要求`prompt`字段的**全部内容为英文**。

**JSON输出格式 (JSON Output Schema):**
```json
{{
    "prompt": "一个完全由英文构成、细节丰富、逗号分隔的绘图提示词。",
    "aspect_ratio": "根据内容判断最合适的比例，默认为 '1:1'。如果是风景则用 '16:9'，如果是人物肖像或海报则用 '2:3'。",
    "quantity": 1
}}
```

**示例 (Example):**

*   **如果我输入的URL是:** `https://www.nationalgeographic.com/animals/mammals/facts/red-panda`
*   **你应输出的最终结果是:**
```json
{{
    "prompt": "...",
    "aspect_ratio": "1:1",
    "quantity": 1
}}
```

用户输入: {user_prompt}
返回: 
"""
            
            # 构建请求数据
            request_data = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {"text": enhanced_prompt}
                        ]
                    }
                ],
                "tools": [
                    {
                        "urlContext": {}
                    }
                ]
            }
            
            # 构建请求头
            headers = {
                'Accept': 'application/json',
                'Authorization': f'Bearer sk-64la3SBXs3A8cznd5Is0Ed1ZerLl9TmzjhN4V3L9c7jodEa6',
                'Content-Type': 'application/json'
            }
            
            # 发送请求
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"https://yunwu.ai/v1beta/models/gemini-2.5-flash:generateContent",
                    headers=headers,
                    json=request_data,
                    timeout=aiohttp.ClientTimeout(total=60.0)
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        logger.info(f"🔍 [DEBUG] URL内容分析结果: {result}")
                        
                        # 解析响应
                        if result.get('candidates') and len(result['candidates']) > 0:
                            candidate = result['candidates'][0]
                            if candidate.get('content') and candidate['content'].get('parts'):
                                parts = candidate['content']['parts']
                                if len(parts) > 0 and parts[0].get('text'):
                                    response_text = parts[0]['text']
                                    logger.info(f"✅ [DEBUG] 原始响应: {response_text[:200]}...")
                                                      # 尝试解析JSON响应
                                    try:
                                        # 查找JSON代码块
                                        json_match = re.search(r'```json\s*(\{.*?\})\s*```', response_text, re.DOTALL)
                                        if json_match:
                                            json_str = json_match.group(1)
                                        else:
                                            # 如果没有代码块，尝试直接解析整个响应
                                            json_str = response_text.strip()
                                        
                                        # 解析JSON
                                        prompt_data = json.loads(json_str)
                                        if isinstance(prompt_data, dict) and 'prompt' in prompt_data:
                                            optimized_prompt = prompt_data['prompt']
                                            logger.info(f"✅ [DEBUG] 成功提取JSON prompt: {optimized_prompt[:100]}...")
                                            return optimized_prompt
                                        else:
                                            logger.warning("⚠️ JSON响应格式不正确，使用原始文本")
                                            return response_text
                                            
                                    except json.JSONDecodeError as je:
                                        logger.warning(f"⚠️ JSON解析失败: {je}，使用原始响应")
                                        return response_text
                        
                        logger.warning("⚠️ URL内容分析失败，使用原始提示词")
                        return user_prompt
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ API请求失败，状态码: {response.status}, 错误: {error_text}")
                        return user_prompt
                        
        except Exception as e:
            logger.error(f"❌ URL内容分析失败: {e}")
            return user_prompt
        
    async def gemini_edit_image_by_yunwu(
        self,
        file_path: list[str],
        prompt: str
    ) -> Optional[Dict[str, str]]:
        """
        使用云雾AI编辑图片 - 异步任务模式

        Args:
            file_path: 图片文件路径列表
                      - file_path[0]: 用户上传的目标图片（对应API的image参数）
                      - file_path[1]: 模板图片（对应API的mask参数，可选）
            prompt: 图片编辑提示词
            model: 使用的模型
            response_format: 响应格式，支持 "url" 或 "b64_json"
            aspect_ratio: 图片比例
            quantity: 生成数量

        Returns:
            Optional[Dict[str, str]]: 包含 result_url 的字典，失败时返回None
        """
        logger.info(f"🎯 [DEBUG] gemini_edit_image_by_yunwu 函数开始")
        logger.info(f"🎯 [DEBUG] 接收到的参数: prompt='{prompt[:100]}...'")

        try:
            # 参数验证
            # if not file_path or len(file_path) == 0:
            #     logger.error("❌ file_path 不能为空")
            #     return None
                
            # if not os.path.exists(file_path[0]):
            #     logger.error(f"❌ 目标图片文件不存在: {file_path[0]}")
            #     return None
                
            # if len(file_path) > 1 and not os.path.exists(file_path[1]):
            #     logger.error(f"❌ 模板图片文件不存在: {file_path[1]}")
            #     return None

            

            # 步骤2: 提交编辑任务
            edit_url = "https://yunwu.ai/fal-ai/nano-banana/edit"
            headers = {
                'Authorization': f'Bearer {self.api_token}',
                'content-type': 'application/json'
            }
            
            request_data = {
                "prompt": prompt,
                "image_urls": file_path,
                "num_images": 1
            }
            
            logger.info(f"🚀 [DEBUG] 提交编辑任务到: {edit_url}")
            logger.info(f"📝 [DEBUG] 请求数据: {request_data}")
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    edit_url,
                    headers=headers,
                    json=request_data,
                    timeout=aiohttp.ClientTimeout(total=30.0)
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"❌ 提交任务失败，状态码: {response.status}, 错误: {error_text}")
                        return None
                    
                    task_result = await response.json()
                    logger.info(f"✅ [DEBUG] 任务提交成功: {task_result}")
                    
                    request_id = task_result.get('request_id')
                    if not request_id:
                        logger.error("❌ 未获取到任务ID")
                        return None
                    
                    # 步骤3: 轮询查询任务状态
                    query_url = f"https://yunwu.ai/fal-ai/nano-banana/requests/{request_id}"
                    max_attempts = 60  # 最多查询60次
                    attempt = 0
                    
                    logger.info(f"🔄 [DEBUG] 开始查询任务状态: {query_url}")
                    
                    while attempt < max_attempts:
                        attempt += 1
                        await asyncio.sleep(3)  # 等待3秒
                        
                        try:
                            async with session.get(
                                query_url,
                                headers=headers,
                                timeout=aiohttp.ClientTimeout(total=10.0)
                            ) as query_response:
                                if query_response.status == 200:
                                    result = await query_response.json()
                                    logger.info(f"🔍 [DEBUG] 第{attempt}次查询结果: {result}")
                                    
                                    # 检查是否有图片结果
                                    if result.get('images') and len(result['images']) > 0:
                                        image_info = result['images'][0]
                                        image_url = image_info.get('url')
                                        if image_url:
                                            logger.info(f"✅ [DEBUG] 任务完成，获取到图片URL: {image_url}")
                                            return {'result_url': image_url}
                                    
                                    # 如果还在处理中，继续等待
                                    logger.info(f"⏳ [DEBUG] 任务仍在处理中，继续等待...")
                                    
                                else:
                                    logger.warning(f"⚠️ [DEBUG] 查询状态失败，状态码: {query_response.status}")
                                    
                        except Exception as query_error:
                            logger.warning(f"⚠️ [DEBUG] 查询异常: {query_error}")
                    
                    logger.error(f"❌ 任务超时，已查询{max_attempts}次仍未完成")
                    return None
                    
        except Exception as e:
            error_msg = str(e)
            logger.error(f"❌ 图片编辑失败: {type(e).__name__}: {error_msg}")
            return None

    async def gemini_edit_image_by_tuzi(
        self,
        file_path: list[str],
        prompt: str,
        model: str = "gemini-2.5-flash-image",
        response_format: Literal["url", "b64_json"] = "url",
        aspect_ratio: str = "auto",
        quantity: int = 1
    ) -> Optional[Dict[str, str]]:
        """
        使用模板编辑图片

        Args:
            file_path: 图片文件路径列表
                      - file_path[0]: 用户上传的目标图片（对应API的image参数）
                      - file_path[1]: 模板图片（对应API的mask参数，可选）
            prompt: 图片编辑提示词
            model: 使用的模型
            response_format: 响应格式，支持 "url" 或 "b64_json"

        Returns:
            Optional[Dict[str, str]]: 包含 result_url 或 image_base64 的字典，失败时返回None
        """
        logger.info(f"🎯 [DEBUG] gemini_edit_image_by_tuzi 函数开始")
        logger.info(f"🎯 [DEBUG] 接收到的模型参数: model='{model}'")
        logger.info(f"🎯 [DEBUG] 接收到的其他参数: file_path={file_path}, prompt='{prompt[:100]}...', response_format='{response_format}'")
        logger.info(f"🎯 [DEBUG] self.api_url={self.api_url}")
        logger.info(f"🎯 [DEBUG] self.api_token={self.api_token}")

        try:
            # 参数验证
            if not file_path or len(file_path) == 0:
                logger.error("❌ file_path 不能为空")
                return None
                
            if not os.path.exists(file_path[0]):
                logger.error(f"❌ 目标图片文件不存在: {file_path[0]}")
                return None
                
            if len(file_path) > 1 and not os.path.exists(file_path[1]):
                logger.error(f"❌ 模板图片文件不存在: {file_path[1]}")
                return None

            # 创建 OpenAI 客户端
            client = AsyncOpenAI(
                base_url=self.api_url,
                api_key=self.api_token,
                timeout=180.0,  # 增加到3分钟，确保足够的时间
                max_retries=0   # 禁用重试，保持一致性
            )
            
            # 打印详细的调试信息
            logger.info(f"🔍 [DEBUG] edit_image_by_tuzi 参数:")
            logger.info(f"   prompt: {prompt}")
            logger.info(f"   model: {model}")
            logger.info(f"   file_path: {file_path}")
            logger.info(f"   response_format: {response_format}")
            logger.info(f"   base_url: {self.api_url}")
            logger.info(f"   api_key: {self.api_token[:10]}***") 
            logger.info(f"🚀 [DEBUG] 调用 client.images.edit...")

#             prompt = f"""
# According to user needs, read the image content and complete the new image output
# User needs: {prompt}
# """
           
            # 根据文件数量决定调用方式
            if len(file_path) == 1:
                # 只有目标图片，不使用模板
                logger.info(f"📝 [DEBUG] 使用单图片模式（无模板）")
                # 检查文件大小
                try:
                    file_size = os.path.getsize(file_path[0])
                    logger.info(f"🎯 [DEBUG]   file_size: {file_size} bytes")
                except Exception as e:
                    logger.error(f"🎯 [DEBUG]   file_size_error: {e}")

                prompt = f"""
基于用户输入的图片，结合用户需求，重新生成一张完整的图片，不要引用任何原文图片
user input: {prompt}
"""
                # 将aspect_ratio转换为size参数（用于图片编辑）
                size_map = {
                    "1:1": "1024x1024",
                    "4:3": "1024x1024",  # 近似
                    "3:4": "1024x1024",  # 近似
                    "16:9": "1792x1024",
                    "9:16": "1024x1792",
                    "auto": "1024x1024"  # 默认
                }
                size = size_map.get(aspect_ratio, "1024x1024")
                logger.info(f"📐 [Image Edit] aspect_ratio: {aspect_ratio} -> size: {size}, quantity: {quantity}")

                with open(file_path[0], 'rb') as image_file:
                    # 检查是否需要其他参数
                    edit_params = {
                        'model': model,
                        'image': image_file,
                        'prompt': prompt,
                        'response_format': response_format,
                        'size': size,
                        'n': min(quantity, 10),
                        'base_url': self.api_url,
                        'api_key': self.api_token
                    }
                    logger.info(f"🎯 [DEBUG] 完整调用参数: {edit_params}")

                    result = await client.images.edit(
                        model=model,
                        image=image_file,
                        prompt=prompt,
                        response_format=response_format,
                        size=size,  # type: ignore
                        n=min(quantity, 10)
                    )
            else:
                # 同时使用目标图片和模板
                logger.info(f"📝 [DEBUG] 使用模板模式")

                # 检查两个文件的大小
                try:
                    image_size = os.path.getsize(file_path[0])
                    mask_size = os.path.getsize(file_path[1])
                    logger.info(f"🎯 [DEBUG]   image_size: {image_size} bytes")
                    logger.info(f"🎯 [DEBUG]   mask_size: {mask_size} bytes")
                except Exception as e:
                    logger.error(f"🎯 [DEBUG]   file_size_error: {e}")

                prompt = f"""
Generate images based on user input
user input: {prompt}
"""
                # 使用与单图片模式相同的size映射
                size_map = {
                    "1:1": "1024x1024",
                    "4:3": "1024x1024",  # 近似
                    "3:4": "1024x1024",  # 近似
                    "16:9": "1792x1024",
                    "9:16": "1024x1792",
                    "auto": "1024x1024"  # 默认
                }
                size = size_map.get(aspect_ratio, "1024x1024")
                logger.info(f"📐 [Image Edit with Mask] aspect_ratio: {aspect_ratio} -> size: {size}, quantity: {quantity}")

                with open(file_path[0], 'rb') as image_file, open(file_path[1], 'rb') as mask_file:

                    # 检查是否需要其他参数
                    edit_params = {
                        'model': model,
                        'image': image_file,
                        'mask': mask_file,
                        'prompt': prompt,
                        'response_format': response_format,
                        'size': size,
                        'n': min(quantity, 10),
                        'base_url': self.api_url,
                        'api_key': self.api_token
                    }
                    logger.info(f"🎯 [DEBUG] 完整调用参数 (带mask): {list(edit_params.keys())}")

                    result = await client.images.edit(
                        model=model,
                        image=image_file,
                        mask=mask_file,
                        prompt=prompt,
                        response_format=response_format,
                        size=size,  # type: ignore
                        n=min(quantity, 10)
                    )
            
            logger.info(f"📥 [DEBUG] API 响应成功，处理结果...")
            
            # 处理响应数据
            if not result.data or len(result.data) == 0:
                logger.error("❌ API 响应中没有图片数据")
                return None
                
            image_data = result.data[0]
            response_data: Dict[str, str] = {}
            
            logger.info(f"🔍 [DEBUG] 处理响应数据，格式: {response_format}")
            
            # 根据响应格式处理数据
            if response_format == "b64_json" and hasattr(image_data, 'b64_json') and image_data.b64_json:
                response_data['image_base64'] = image_data.b64_json
                logger.info("✅ 获取到 base64 格式图片数据")
            elif response_format == "url" and hasattr(image_data, 'url') and image_data.url:
                response_data['result_url'] = image_data.url
                logger.info(f"✅ 获取到 URL 格式图片: {image_data.url}")
            else:
                # 尝试获取任何可用的图片数据
                if hasattr(image_data, 'url') and image_data.url:
                    response_data['result_url'] = image_data.url
                    logger.info(f"✅ 备用方案：获取到 URL: {image_data.url}")
                elif hasattr(image_data, 'b64_json') and image_data.b64_json:
                    response_data['image_base64'] = image_data.b64_json
                    logger.info("✅ 备用方案：获取到 base64 数据")
                elif hasattr(image_data, 'revised_prompt') and image_data.revised_prompt:
                    # 如果没有图片数据，可能是文本响应
                    response_data['text_content'] = image_data.revised_prompt
                    response_data['type'] = 'text'
                    logger.info(f"✅ 获取到文本响应: {image_data.revised_prompt}")
                else:
                    logger.error("❌ 未能获取到任何图片数据或文本响应")
                    return None
            
            logger.info(f"🎯 [DEBUG] 最终响应数据: {response_data}")
            return response_data
        except FileNotFoundError as e:
            logger.error(f"❌ 文件不存在: {e}")
            return None
        except PermissionError as e:
            logger.error(f"❌ 文件权限不足: {e}")
            return None
        except Exception as e:
            error_msg = str(e)
            logger.error(f"❌ 图片编辑失败: {type(e).__name__}: {error_msg}")

            # 如果是模型不支持的错误，尝试使用备用模型
            if "not supported model" in error_msg.lower() and model != "gemini-2.5-flash-image":
                logger.warning(f"⚠️ 模型 '{model}' 不支持图片编辑，尝试使用备用模型 'gemini-2.5-flash-image'")
                try:
                    # 递归调用，使用备用模型
                    return await self.gemini_edit_image_by_tuzi(
                        file_path=file_path,
                        prompt=prompt,
                        model="gemini-2.5-flash-image",
                        response_format=response_format
                    )
                except Exception as fallback_error:
                    logger.error(f"❌ 备用模型也失败: {fallback_error}")
                    return None

            return None

    async def gemini_generate_by_tuzi(
        self,
        prompt: str,
        model: str = "gemini-2.5-flash-image",
        aspect_ratio: str = "auto",
        quantity: int = 1
    ) -> Optional[Dict[str, str]]:
        """
        生成魔法图片（带重试机制）

        Args:
            prompt: 图片生成提示词
            model: 使用的模型

        Returns:
            Optional[Dict[str, str]]: 包含 base64 或 url 的字典，失败时返回None
        """
        max_retries = 3
        timeout_seconds = 120  # 缩短到2分钟
        
        for attempt in range(max_retries):
            try:
                logger.info(f"🔄 [重试 {attempt + 1}/{max_retries}] 开始图片生成...")
                
                # 创建 OpenAI 客户端，每次重试都创建新的客户端
                client = AsyncOpenAI(
                    base_url=self.api_url,
                    api_key=self.api_token,
                    timeout=timeout_seconds,
                    max_retries=0   # 禁用SDK内置重试，使用我们自己的重试逻辑
                )
                
                # 打印详细的调试信息
                logger.info(f"🔍 [DEBUG] generate_by_tuzi 参数:")
                logger.info(f"   prompt: {prompt}")
                logger.info(f"   model: {model}")
                logger.info(f"   base_url: {self.api_url}")
                logger.info(f"   api_key: {self.api_token[:10]}***")
                logger.info(f"   timeout: {timeout_seconds}秒")
                
                # 生成图片
                logger.info(f"🚀 [DEBUG] 调用 client.images.generate...")
                logger.info(f"🔍 [DEBUG] 传递给API的模型名称: '{model}'")
                logger.info(f"🔍 [DEBUG] 传递给API的提示词: '{prompt}'")
                logger.info(f"🔍 [DEBUG] API调用URL: {self.api_url}/images/generations")
                image_model = model
                logger.info(f"🎯 [DEBUG] 最终使用的图像生成模型: {image_model}")
                
                # 将aspect_ratio转换为size参数
                size_map = {
                    "1:1": "1024x1024",
                    "4:3": "1024x1024",  # 近似，OpenAI不支持精确的4:3
                    "3:4": "1024x1024",  # 近似，OpenAI不支持精确的3:4
                    "16:9": "1536x1024",
                    "9:16": "1024x1536",
                    "auto": "1024x1024"  # 默认
                }
                size = size_map.get(aspect_ratio, "1024x1024")
                logger.info(f"📐 [Image Generation] aspect_ratio: {aspect_ratio} -> size: {size}, quantity: {quantity}")

                # 使用 asyncio.wait_for 添加额外的超时保护
                result = await asyncio.wait_for(
                    client.images.generate(
                        model=image_model,
                        prompt=prompt,
                        size=size,  # type: ignore  # OpenAI SDK接受字符串形式的size
                        n=min(quantity, 10)  # OpenAI最多支持10张
                    ),
                    timeout=timeout_seconds
                )
                
                # 成功获得结果，处理响应
                logger.info(f"✅ [重试 {attempt + 1}/{max_retries}] API调用成功")
                
                # 打印完整的响应数据
                logger.info(f"📥 [DEBUG] API 响应原始数据:")
                logger.info(f"   result.data 长度: {len(result.data) if result.data else 0}")
                if result.data:
                    for i, data in enumerate(result.data):
                        logger.info(f"   data[{i}] 属性: {dir(data)}")
                        logger.info(f"   data[{i}] 内容: {data}")
                        if hasattr(data, '__dict__'):
                            logger.info(f"   data[{i}] __dict__: {data.__dict__}")
                        if hasattr(data, 'url'):
                            logger.info(f"   data[{i}].url: {data.url}")
                        if hasattr(data, 'b64_json'):
                            logger.info(f"   data[{i}].b64_json: {'存在' if data.b64_json else '不存在'}")
                        if hasattr(data, 'revised_prompt'):
                            logger.info(f"   data[{i}].revised_prompt: {data.revised_prompt}")
                if result.data and len(result.data) > 0:
                    image_data = result.data[0]
                    # 返回结果字典
                    response_data: Dict[str, str] = {}
                    
                    logger.info(f"🔍 [DEBUG] 处理第一个图片数据:")
                    logger.info(f"   type(image_data): {type(image_data)}")
                    
                    # 检查是否有 base64 数据
                    if hasattr(image_data, 'b64_json'):
                        logger.info(f"   b64_json 属性存在: {image_data.b64_json is not None}")
                        if image_data.b64_json:
                            response_data['image_base64'] = image_data.b64_json
                            logger.info(f"✅ Image generated with base64 data")
                    else:
                        logger.info(f"   无 b64_json 属性")
                    
                    # 检查是否有 URL
                    if hasattr(image_data, 'url'):
                        logger.info(f"   url 属性存在: {image_data.url}")
                        if image_data.url:
                            response_data['result_url'] = image_data.url
                            logger.info(f"✅ Image generated with URL: {image_data.url}")
                    else:
                        logger.info(f"   无 url 属性")
                    
                    # 检查是否有文本回复（当没有图片生成时）
                    if "image_base64" not in response_data \
                        and "result_url" not in response_data \
                        and hasattr(image_data, 'revised_prompt'):
                        logger.info(f"   revised_prompt 属性存在: {image_data.revised_prompt}")
                        if image_data.revised_prompt and not response_data:
                            # 如果没有图片数据但有文本回复，说明这是一个文本对话
                            response_data['text_content'] = image_data.revised_prompt
                            response_data['type'] = 'text'
                            logger.info(f"✅ Gemini text response: {image_data.revised_prompt}")
                    else:
                        logger.info(f"   无 revised_prompt 属性")
                    
                    # 尝试其他可能的属性
                    for attr in ['image', 'data', 'content', 'image_url', 'image_data']:
                        if hasattr(image_data, attr):
                            value = getattr(image_data, attr)
                            logger.info(f"   发现额外属性 {attr}: {value}")
                            if value and attr not in ['image', 'data']:  # 避免处理文件对象
                                response_data[f'found_{attr}'] = str(value)
                    
                    logger.info(f"🎯 [DEBUG] 最终 response_data: {response_data}")
                    
                    if response_data:
                        logger.info(f"🎉 [成功] 第 {attempt + 1} 次尝试成功生成图片")
                        return response_data
                    else:
                        logger.error(f"❌ [重试 {attempt + 1}/{max_retries}] No image data returned")
                        if attempt == max_retries - 1:  # 最后一次尝试
                            return None
                        continue
                else:
                    logger.error(f"❌ [重试 {attempt + 1}/{max_retries}] No image data in response")
                    if attempt == max_retries - 1:  # 最后一次尝试
                        return None
                    continue
                    
            except asyncio.TimeoutError:
                logger.error(f"⏰ [重试 {attempt + 1}/{max_retries}] 请求超时 ({timeout_seconds}秒)")
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # 指数退避: 1s, 2s, 4s
                    logger.info(f"⏳ 等待 {wait_time} 秒后重试...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    logger.error(f"💥 所有重试尝试都已超时，放弃生成")
                    return None
                    
            except Exception as e:
                error_type = type(e).__name__
                error_msg = str(e)
                logger.error(f"💀 [重试 {attempt + 1}/{max_retries}] 生成图片时出错: {error_type}: {error_msg}")
                
                # 判断是否应该重试
                if attempt < max_retries - 1:
                    # 对于某些错误类型，不进行重试
                    if "401" in error_msg or "403" in error_msg or "invalid" in error_msg.lower():
                        logger.error(f"🚫 认证或配置错误，不再重试: {error_msg}")
                        return None

                    # 如果是模型不支持的错误，尝试使用备用模型
                    if "not supported model" in error_msg.lower() and model != "gemini-2.5-flash-image":
                        logger.warning(f"⚠️ 模型 '{model}' 不支持图片生成，尝试使用备用模型 'gemini-2.5-flash-image'")
                        try:
                            # 递归调用，使用备用模型
                            return await self.gemini_generate_by_tuzi(prompt, "gemini-2.5-flash-image")
                        except Exception as fallback_error:
                            logger.error(f"❌ 备用模型也失败: {fallback_error}")
                            return None

                    wait_time = 2 ** attempt  # 指数退避
                    logger.info(f"⏳ 等待 {wait_time} 秒后重试...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    # 最后一次尝试失败，检查是否可以使用备用模型
                    if "not supported model" in error_msg.lower() and model != "gemini-2.5-flash-image":
                        logger.warning(f"⚠️ 所有重试都失败，模型 '{model}' 不支持图片生成，最后尝试备用模型 'gemini-2.5-flash-image'")
                        try:
                            return await self.gemini_generate_by_tuzi(prompt, "gemini-2.5-flash-image")
                        except Exception as fallback_error:
                            logger.error(f"❌ 备用模型也失败: {fallback_error}")
                            return None

                    logger.error(f"💥 所有重试尝试都失败了，放弃生成")
                    return None
        
        # 如果所有重试都失败了
        logger.error(f"💥 所有 {max_retries} 次重试都失败了")
        return None


    async def generate_video(
        self,
        prompt: str,
        model: str,
        resolution: str = "480p",
        duration: int = 5,
        aspect_ratio: str = "9:16",
        input_images: List[str] = [],
        **kwargs: Any
    ) -> Dict[str, Any]:
        """
        生成视频的完整流程

        Args:
            prompt: 视频生成提示词
            model: 视频生成模型
            resolution: 视频分辨率
            duration: 视频时长（秒）
            aspect_ratio: 宽高比
            input_images: 输入图片列表（可选）
            **kwargs: 其他参数

        Returns:
            Dict[str, Any]: 包含 result_url 的任务结果

        Raises:
            Exception: 当视频生成失败时抛出异常
        """
        # 1. 创建视频生成任务
        task_id = await self.create_video_task(
            prompt=prompt,
            model=model,
            resolution=resolution,
            duration=duration,
            aspect_ratio=aspect_ratio,
            input_images=input_images,
            **kwargs
        )

        if not task_id:
            raise Exception("Failed to create video task")

        # 2. 等待任务完成
        result = await self.poll_for_task_completion(task_id)
        if not result:
            raise Exception("Video generation failed")

        if result.get('error'):
            raise Exception(f"Video generation failed: {result['error']}")

        if not result.get('result_url'):
            raise Exception("No result URL found in video generation response")

        logger.info(f"✅ Video generated successfully: {result.get('result_url')}")
        return result

    async def generate_video_by_seedance(
        self,
        prompt: str,
        model: str,
        resolution: str = "480p",
        duration: int = 5,
        aspect_ratio: str = "16:9",
        input_images: Optional[List[str]] = None,
        **kwargs: Any
    ) -> Dict[str, Any]:
        """
        使用 Seedance 模型生成视频的完整流程

        Args:
            prompt: 视频生成提示词
            model: 视频生成模型
            resolution: 视频分辨率
            duration: 视频时长（秒）
            aspect_ratio: 宽高比
            input_images: 输入图片列表（可选）
            **kwargs: 其他参数

        Returns:
            Dict[str, Any]: 包含 result_url 的任务结果

        Raises:
            Exception: 当视频生成失败时抛出异常
        """
        # 1. 创建 Seedance 视频生成任务
        async with HttpClient.create_aiohttp() as session:
            payload = {
                "prompt": prompt,
                "model": model,
                "resolution": resolution,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
                **kwargs
            }

            if input_images:
                payload["input_images"] = input_images

            async with session.post(
                f"{self.api_url}/video/seedance/generation",
                headers=self._build_headers(),
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120.0)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    task_id = data.get('task_id', '')
                    if not task_id:
                        raise Exception("No task_id in response")
                else:
                    error_text = await response.text()
                    raise Exception(f"Failed to create Seedance video task: HTTP {response.status} - {error_text}")

        logger.info(f"✅ Seedance video task created: {task_id}")

        # 2. 等待任务完成
        result = await self.poll_for_task_completion(task_id)
        if not result:
            raise Exception("Seedance video generation failed")

        if result.get('error'):
            raise Exception(f"Seedance video generation failed: {result['error']}")

        if not result.get('result_url'):
            raise Exception("No result URL found in Seedance video generation response")

        logger.info(f"✅ Seedance video generated successfully: {result.get('result_url')}")
        return result

    async def create_midjourney_task(
        self,
        prompt: str,
        model: str = "midjourney",
        **kwargs: Any
    ) -> str:
        """
        创建云端 Midjourney 图像生成任务

        Args:
            prompt: 图像生成提示词
            model: 图像生成模型（默认为 midjourney）
            **kwargs: 其他参数（如 mode 等）

        Returns:
            str: 任务 ID

        Raises:
            Exception: 当任务创建失败时抛出异常
        """
        async with HttpClient.create_aiohttp() as session:
            payload = {
                "prompt": prompt,
                "model": model,
                **kwargs
            }

            async with session.post(
                f"{self.api_url}/image/midjourney/generation",
                headers=self._build_headers(),
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60.0)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    task_id = data.get('task_id', '')
                    if task_id:
                        logger.info(f"✅ Midjourney task created: {task_id}")
                        return task_id
                    else:
                        raise Exception("No task_id in response")
                else:
                    error_text = await response.text()
                    raise Exception(f"Failed to create Midjourney task: HTTP {response.status} - {error_text}")

    async def generate_image_by_midjourney(
        self,
        prompt: str,
        model: str = "midjourney",
        **kwargs: Any
    ) -> Dict[str, Any]:
        """
        使用 Midjourney 生成图像的完整流程

        Args:
            prompt: 图像生成提示词
            model: 图像生成模型（默认为 midjourney）
            **kwargs: 其他参数（如 mode 等）

        Returns:
            Dict[str, Any]: 包含 result_url 的任务结果

        Raises:
            Exception: 当图像生成失败时抛出异常
        """
        # 1. 创建 Midjourney 图像生成任务
        task_id = await self.create_midjourney_task(
            prompt=prompt,
            model=model,
            **kwargs
        )

        if not task_id:
            raise Exception("Failed to create Midjourney task")

        # 2. 等待任务完成
        task_result = await self.poll_for_task_completion(task_id, max_attempts=150, interval=2.0)
        logger.info(f"🎨 Midjourney task result: {task_result}")
        if not task_result:
            raise Exception("Midjourney image generation failed")

        if task_result.get('error'):
            raise Exception(f"Midjourney image generation failed: {task_result['error']}")

        if not task_result.get('result'):
            raise Exception("No result found in Midjourney image generation response")

        result = task_result.get('result')
        logger.info(f"✅ Midjourney image generated successfully: {result}")
        return result or {}

    def is_configured(self) -> bool:
        """
        检查服务是否已正确配置

        Returns:
            bool: 配置是否有效
        """
        return self._is_configured()
