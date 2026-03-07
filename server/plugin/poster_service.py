#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Poster Service
处理小红书海报生成的业务逻辑
"""

import logging
import os
import json
import re
import asyncio
from typing import List, Dict, Any, Optional
from openai import OpenAI
from plugin.plugin_service import plugin_service
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from services.config_service import DEFAULT_PROVIDERS_CONFIG

# 配置日志
logger = logging.getLogger('poster_service')

# 提示词模板
OUTLINE_PROMPT_TEMPLATE = """你是一个小红书内容创作专家。用户会给你一个要求以及说明，你需要生成一个适合小红书的图文内容大纲。

用户的要求以及说明：
{topic}

要求：
1. 第一页必须是吸引人的封面/标题页，包含标题和副标题
2. 内容控制在 6-12 页（包括封面）（如果用户特别要求页数，以用户的要求为准，页数可以适当放宽到2-18页的范围）
特别的. 如果用户在要求了某种特定语言风格的喜好，或者是否使用emoji等，则以客户的要求为准
3. 每页内容简洁有力，适合配图展示
4. 使用小红书风格的语言（亲切、有趣、实用）
5. 可以适当使用 emoji 增加趣味性
6. 内容要有实用价值，能解决用户问题或提供有用信息
7. 最后一页可以是总结或行动呼吁

输出格式：
请直接返回一个 JSON 对象，不要包含 markdown 代码块标记（如 ```json）。
JSON 结构如下：
{{
    "outline": "这里放一段简短的整体大纲描述，用于展示给用户看",
    "pages": [
        {{
            "index": 0,
            "type": "cover",
            "title": "封面标题",
            "content": "封面副标题及画面描述"
        }},
        {{
            "index": 1,
            "type": "content",
            "title": "页面标题",
            "content": "具体的页面内容，包含步骤、清单或说明"
        }},
        ...
        {{
            "index": N,
            "type": "summary",
            "title": "总结标题",
            "content": "总结内容"
        }}
    ]
}}

注意：
- type 只能是 "cover", "content", "summary" 中的一个
- content 字段的内容要详细，适合作为生成图片的提示词
- 确保 JSON 格式合法
"""

IMAGE_PROMPT_TEMPLATE = """请生成一张小红书风格的图文内容图片。
【合规特别注意的】注意不要带有任何小红书的logo，不要有右下角的用户id以及logo
【合规特别注意的】用户给到的参考图片里如果有水印和logo（尤其是注意右下角，左上角），请一定要去掉

页面内容：
{page_content}

页面类型：{page_type}

如果当前页面类型不是封面页的话，你要参考最后一张图片作为封面的样式

后续生成风格要严格参考封面的风格，要保持风格统一。

设计要求：

1. 整体风格
- 小红书爆款图文风格
- 清新、精致、有设计感
- 适合年轻人审美
- 配色和谐，视觉吸引力强

2. 文字排版
- 文字清晰可读，字号适中
- 重要信息突出显示
- 排版美观，留白合理
- 支持 emoji 和符号
- 如果是封面，标题要大而醒目

3. 视觉元素
- 背景简洁但不单调
- 可以有装饰性元素（如图标、插画）
- 配色温暖或清新
- 保持专业感

4. 页面类型特殊要求

[封面] 类型：
- 标题占据主要位置，字号最大
- 副标题居中或在标题下方
- 整体设计要有吸引力和冲击力
- 背景可以更丰富，有视觉焦点

[内容] 类型：
- 信息层次分明
- 列表项清晰展示
- 重点内容用颜色或粗体强调
- 可以有小图标辅助说明

[总结] 类型：
- 总结性文字突出
- 可以有勾选框或完成标志
- 给人完成感和满足感
- 鼓励性的视觉元素

5. 技术规格
- 竖版 3:4 比例（小红书标准）
- 高清画质
- 适合手机屏幕查看
- 所有文字内容必须完整呈现
- 【特别注意】无论是给到的图片还是参考文字，请仔细思考，让其符合正确的竖屏观看的排版，不能左右旋转或者是倒置。

6. 整体风格一致性
为确保所有页面风格统一，请参考完整的内容大纲和用户原始需求来确定：
- 整体色调和配色方案
- 设计风格（清新/科技/温暖/专业等）
- 视觉元素的一致性
- 排版布局的统一风格

用户原始需求：
{user_topic}

完整内容大纲参考：
---
{full_outline}
---

请根据以上要求，生成一张精美的小红书风格图片。请直接给出图片，不要有任何手机边框，或者是白色留边。
"""

class PosterService:
    """小红书海报服务类"""

    def __init__(self):
        pass

    def _get_llm_client(self):
        """获取LLM客户端"""
        # 使用 Yunwu 配置
        yunwu_config = DEFAULT_PROVIDERS_CONFIG.get('yunwu', {})
        api_key = yunwu_config.get('api_key')
        base_url = yunwu_config.get('url')
        
        if not api_key:
            logger.warning("Yunwu API key not found in config")
            
        return OpenAI(api_key=api_key, base_url=base_url)

    async def generate_outline(self, topic: str) -> Dict[str, Any]:
        """生成大纲"""
        try:
            logger.info(f"开始生成海报大纲: topic={topic[:50]}...")
            
            client = self._get_llm_client()
            prompt = OUTLINE_PROMPT_TEMPLATE.format(topic=topic)
            
            # 在线程池中执行同步调用
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model="gpt-5.2-chat-latest", # 使用较强的模型生成大纲
                messages=[
                    {"role": "system", "content": "You are a helpful assistant. Output valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                response_format={"type": "json_object"} # 强制 JSON 模式
            )
            
            outline_text = response.choices[0].message.content
            
            try:
                data = json.loads(outline_text)
                pages = data.get("pages", [])
                outline_summary = data.get("outline", "")
                
                # 确保每个页面都有必要的字段
                for i, page in enumerate(pages):
                    if "index" not in page:
                        page["index"] = i
                    if "type" not in page:
                        page["type"] = "content"
            except json.JSONDecodeError:
                logger.error(f"JSON解析失败: {outline_text}")
                # 降级处理：尝试修复或返回错误
                return {
                    "success": False,
                    "message": "Failed to parse outline JSON",
                    "data": None
                }
            
            logger.info(f"大纲生成完成，共 {len(pages)} 页")
            
            return {
                "success": True,
                "outline": outline_summary,
                "pages": pages
            }
            
        except Exception as e:
            logger.error(f"生成大纲失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "message": f"Failed to generate outline: {str(e)}",
                "data": None
            }

    def _parse_outline(self, outline_text: str) -> List[Dict[str, Any]]:
        """(Deprecated) 解析大纲文本 - 已废弃，直接使用 JSON 解析"""
        return []

    async def generate_poster_images(
        self,
        pages: List[Dict],
        full_outline: str,
        user_topic: str,
        style: str = "default",
        session_id: str = None,
        canvas_id: str = None
    ) -> Dict[str, Any]:
        """批量生成海报图片（异步推送模式）"""
        try:
            total_pages = len(pages)
            logger.info(f"开始批量生成图片: {total_pages} 页")

            # 创建所有生成任务（间隔1秒提交，避免并发压力）
            tasks = []
            for idx, page in enumerate(pages):
                # 构建提示词
                prompt = IMAGE_PROMPT_TEMPLATE.format(
                    page_content=page['content'],
                    page_type=page.get('type', 'content'),
                    user_topic=user_topic,
                    full_outline=full_outline
                )

                # 调用 plugin_service 生成图片任务
                # 注意：plugin_service.generate_image 立即返回 task_id
                result = await plugin_service.generate_image(
                    prompt=prompt,
                    quality="normal",
                    aspect_ratio="3:4",
                    response_format="url"
                )

                if result['success']:
                    tasks.append({
                        "index": page['index'],
                        "task_id": result['data']['task_id']
                    })
                    logger.info(f"✅ 任务 {idx + 1}/{total_pages} 已提交")
                else:
                    logger.error(f"创建图片生成任务失败 (index={page['index']}): {result['message']}")

                # 间隔2秒提交下一个任务，避免并发压力（最后一个不需要等待）
                if idx < total_pages - 1:
                    await asyncio.sleep(2)

            # 启动后台监控任务
            if tasks and session_id:
                asyncio.create_task(self._monitor_and_push_poster_images(
                    tasks=tasks,
                    session_id=session_id,
                    canvas_id=canvas_id,
                    total_count=total_pages
                ))

            # 立即返回成功，前端不需要等待图片
            return {
                "success": True,
                "message": "Poster generation started",
                "task_count": len(tasks)
            }
            
        except Exception as e:
            logger.error(f"批量生成图片失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "message": f"Failed to generate images: {str(e)}"
            }

    async def _monitor_and_push_poster_images(
        self,
        tasks: List[Dict],
        session_id: str,
        canvas_id: str,
        total_count: int = 0
    ):
        """监控图片生成任务并实时推送结果（每张图片完成立即推送）"""
        from services.websocket_service import send_poster_image_generated, send_poster_completed
        from plugin.image_task_manager import task_manager

        try:
            total = total_count or len(tasks)
            logger.info(f"开始监控海报生成任务: {len(tasks)} 个任务，总计 {total} 张")

            # 跟踪已完成和已推送的任务
            completed_images = []
            pushed_task_ids = set()  # 已推送的任务ID
            completed_count = 0  # 已完成计数
            pending_tasks = list(tasks)
            start_time = asyncio.get_event_loop().time()
            timeout = 300  # 5分钟超时

            while pending_tasks:
                if asyncio.get_event_loop().time() - start_time > timeout:
                    logger.error("海报生成任务超时")
                    break

                # 检查未完成的任务
                remaining_tasks = []
                for task in pending_tasks:
                    task_id = task['task_id']
                    task_info = await task_manager.get_task(task_id)

                    if task_info['status'] == 'completed':
                        completed_count += 1
                        image_data = {
                            "index": task['index'],
                            "success": True,
                            "image_url": task_info['result'].get('image_url'),
                            "completed_count": completed_count,
                            "total_count": total
                        }
                        completed_images.append(image_data)

                        # 立即推送这张图片（如果还未推送）
                        if task_id not in pushed_task_ids:
                            pushed_task_ids.add(task_id)
                            logger.info(f"🖼️ 图片 {task['index']} 生成完成 ({completed_count}/{total})，立即推送")
                            await send_poster_image_generated(
                                session_id=session_id,
                                canvas_id=canvas_id,
                                image_data=image_data
                            )

                    elif task_info['status'] == 'failed':
                        completed_count += 1
                        image_data = {
                            "index": task['index'],
                            "success": False,
                            "error": task_info.get('error'),
                            "completed_count": completed_count,
                            "total_count": total
                        }
                        completed_images.append(image_data)

                        # 推送失败信息
                        if task_id not in pushed_task_ids:
                            pushed_task_ids.add(task_id)
                            logger.warning(f"❌ 图片 {task['index']} 生成失败 ({completed_count}/{total}): {task_info.get('error')}")
                            await send_poster_image_generated(
                                session_id=session_id,
                                canvas_id=canvas_id,
                                image_data=image_data
                            )
                    else:
                        remaining_tasks.append(task)

                pending_tasks = remaining_tasks
                if pending_tasks:
                    await asyncio.sleep(1)  # 缩短检查间隔到1秒，提高实时性

            # 按索引排序
            completed_images.sort(key=lambda x: x['index'])

            # 推送完成事件（所有图片都处理完毕）
            success_count = len([img for img in completed_images if img.get('success')])
            logger.info(f"海报生成全部完成，推送完成事件: {success_count}/{len(completed_images)} 张图片成功")
            await send_poster_completed(
                session_id=session_id,
                canvas_id=canvas_id,
                images=completed_images
            )

        except Exception as e:
            logger.error(f"监控海报生成任务失败: {str(e)}", exc_info=True)

    async def _generate_single_image_task(self, index: int, prompt: str) -> Dict[str, Any]:
        """(Deprecated) 生成单张图片的任务包装"""
        pass

poster_service = PosterService()
