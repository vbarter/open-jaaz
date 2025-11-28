#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Plugin Service
处理插件相关的业务逻辑，包括与Supabase数据库的交互
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import httpx
import tempfile
import uuid
import os
from pathlib import Path
import base64
import asyncio
from openai import OpenAI

# 导入Supabase服务
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from superbase import SupabaseService
from utils.cos_image_service import get_cos_image_service
from plugin.image_task_manager import task_manager

# 配置日志
logger = logging.getLogger('plugin_service')


class PluginService:
    """插件服务类，处理插件相关的数据库操作"""

    @classmethod
    async def _download_and_upload_media_urls(cls, url_string: str, media_type: str = 'image') -> str:
        """
        下载媒体URL列表并上传到腾讯云

        Args:
            url_string: 用 '\001' 分隔的URL字符串
            media_type: 媒体类型，'image' 或 'video'

        Returns:
            用 '\001' 分隔的新URL字符串（腾讯云URL）
        """
        if not url_string or url_string.strip() == '':
            logger.info(f"空的{media_type} URL字符串，跳过处理")
            return url_string

        # 分割URL列表
        separator = '\001'  # ASCII码1
        urls = url_string.split(separator)
        logger.info(f"开始处理{len(urls)}个{media_type} URL")

        # 获取腾讯云服务
        cos_service = get_cos_image_service()
        if not cos_service.available:
            logger.warning(f"腾讯云服务不可用，返回原始URL")
            return url_string

        new_urls = []

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            for idx, url in enumerate(urls):
                url = url.strip()
                if not url:
                    continue

                try:
                    logger.info(f"正在下载{media_type} [{idx + 1}/{len(urls)}]: {url}")

                    # 下载媒体文件（自动跟随重定向）
                    response = await client.get(url)
                    response.raise_for_status()
                    media_bytes = response.content

                    # 确定文件扩展名
                    content_type = response.headers.get('content-type', '')
                    file_ext = cls._get_file_extension_from_url_or_content_type(url, content_type, media_type)

                    # 生成唯一的文件名
                    unique_filename = f"{media_type}_{uuid.uuid4().hex[:12]}{file_ext}"

                    # 上传到腾讯云
                    cos_url = await cos_service.upload_image_from_bytes(
                        image_bytes=media_bytes,
                        image_key=unique_filename,
                        content_type=content_type or f'{media_type}/jpeg'
                    )

                    if cos_url:
                        logger.info(f"✅ {media_type}上传成功: {unique_filename} -> {cos_url}")
                        new_urls.append(cos_url)
                    else:
                        logger.error(f"❌ {media_type}上传失败: {url}，保留原URL")
                        new_urls.append(url)

                except httpx.HTTPError as e:
                    logger.error(f"❌ 下载{media_type}失败: {url}, 错误: {e}，保留原URL")
                    new_urls.append(url)
                except Exception as e:
                    logger.error(f"❌ 处理{media_type}失败: {url}, 错误: {e}，保留原URL")
                    new_urls.append(url)

        # 用分隔符拼接新的URL列表
        result = separator.join(new_urls)
        logger.info(f"完成{media_type} URL处理，原{len(urls)}个，新{len(new_urls)}个")
        return result

    @staticmethod
    def _get_file_extension_from_url_or_content_type(url: str, content_type: str, media_type: str) -> str:
        """
        从URL或Content-Type中获取文件扩展名

        Args:
            url: 原始URL
            content_type: HTTP响应的Content-Type头
            media_type: 媒体类型 ('image' 或 'video')

        Returns:
            文件扩展名（包含点号），如 '.jpg', '.mp4'
        """
        # 首先尝试从URL中提取扩展名
        url_path = url.split('?')[0]  # 去除查询参数
        if '.' in url_path:
            ext = '.' + url_path.rsplit('.', 1)[-1].lower()
            # 验证扩展名是否合理
            if media_type == 'image' and ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']:
                return ext
            elif media_type == 'video' and ext in ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv']:
                return ext

        # 从Content-Type推断扩展名
        content_type_map = {
            # 图片类型
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/bmp': '.bmp',
            # 视频类型
            'video/mp4': '.mp4',
            'video/quicktime': '.mov',
            'video/x-msvideo': '.avi',
            'video/webm': '.webm',
            'video/x-matroska': '.mkv',
            'video/x-flv': '.flv',
        }

        if content_type in content_type_map:
            return content_type_map[content_type]

        # 默认扩展名
        return '.jpg' if media_type == 'image' else '.mp4'

    @classmethod
    async def add_prompt(cls,
                         creator: str,
                         source: str,
                         origin_text: str,
                         image_url: str,
                         video_url: str,
                         title: str,
                         prompt: str,
                         owner: str,
                         publish_time: Optional[str] = None) -> Dict[str, Any]:
        """
        添加提示词到Supabase数据库

        Args:
            creator: 提示词创建人
            source: 来源
            origin_text: 原文内容
            image_url: 图片URL（用'\001'分隔的URL列表）
            video_url: 视频URL（用'\001'分隔的URL列表）
            title: 标题
            prompt: 模版提示词
            owner: 发布人
            publish_time: 推文发布时间（可选）

        Returns:
            Dict: 包含操作结果的字典
                - success (bool): 操作是否成功
                - message (str): 操作消息
                - data (dict): 插入的数据（如果成功）
        """
        try:
            logger.info(f"准备处理提示词: title={title}, creator={creator}, owner={owner}")

            # 处理图片URL - 下载并上传到腾讯云
            processed_image_url = await cls._download_and_upload_media_urls(
                url_string=image_url,
                media_type='image'
            )

            # 处理视频URL - 下载并上传到腾讯云
            processed_video_url = await cls._download_and_upload_media_urls(
                url_string=video_url,
                media_type='video'
            )

            # 准备插入数据（使用处理后的腾讯云URL）
            prompt_data = {
                'creator': creator,
                'source': source,
                'origin_text': origin_text,
                'image_url': processed_image_url,
                'video_url': processed_video_url,
                'title': title,
                'prompt': prompt,
                'owner': owner
            }

            # 如果提供了发布时间，添加到数据中
            if publish_time is not None:
                prompt_data['publish_time'] = publish_time

            logger.info(f"准备插入提示词数据: title={title}, creator={creator}, owner={owner}")

            # 定义插入操作
            def insert_operation(client):
                result = client.table('tb_ma_template_prompt').insert(prompt_data).execute()
                return result

            # 执行插入操作（带重试机制）
            result = SupabaseService.execute_with_retry(insert_operation)

            if result and result.data:
                inserted_record = result.data[0] if isinstance(result.data, list) else result.data
                logger.info(f"提示词插入成功: id={inserted_record.get('id')}, title={title}")

                return {
                    'success': True,
                    'message': 'add successfully',
                    'data': inserted_record
                }
            else:
                logger.error(f"提示词插入失败: 未返回数据")
                return {
                    'success': False,
                    'message': 'Failed to insert prompt',
                    'data': None
                }

        except Exception as e:
            logger.error(f"添加提示词时发生错误: {str(e)}", exc_info=True)
            return {
                'success': False,
                'message': f'Error: {str(e)}',
                'data': None
            }

    @classmethod
    def get_prompt_by_id(cls, prompt_id: int) -> Optional[Dict[str, Any]]:
        """
        根据ID获取提示词

        Args:
            prompt_id: 提示词ID

        Returns:
            Dict 或 None: 提示词数据
        """
        try:
            def query_operation(client):
                result = client.table('tb_ma_template_prompt') \
                    .select('*') \
                    .eq('id', prompt_id) \
                    .limit(1) \
                    .execute()
                return result

            result = SupabaseService.execute_with_retry(query_operation)

            if result and result.data and len(result.data) > 0:
                return result.data[0]
            return None

        except Exception as e:
            logger.error(f"查询提示词失败: {str(e)}", exc_info=True)
            return None

    @classmethod
    def list_prompts(cls, limit: int = 100, offset: int = 0) -> list:
        """
        获取提示词列表

        Args:
            limit: 返回数量限制
            offset: 偏移量

        Returns:
            List: 提示词列表
        """
        try:
            def query_operation(client):
                result = client.table('tb_ma_template_prompt') \
                    .select('*') \
                    .order('id', desc=True) \
                    .range(offset, offset + limit - 1) \
                    .execute()
                return result

            result = SupabaseService.execute_with_retry(query_operation)

            if result and result.data:
                return result.data
            return []

        except Exception as e:
            logger.error(f"查询提示词列表失败: {str(e)}", exc_info=True)
            return []

    @classmethod
    def list_prompts_paginated(cls, next_offset: int = 0, page_size: int = 10) -> Dict[str, Any]:
        """
        分页获取提示词列表

        Args:
            next_offset: 下一页的起始位置（从0开始）
            page_size: 每页返回的记录数，默认10条

        Returns:
            Dict: 包含分页信息的字典
                - success (bool): 操作是否成功
                - message (str): 操作消息
                - data (dict): 包含记录列表和分页信息
                    - items (list): 提示词记录列表
                    - next (int): 下一页的起始位置，如果没有更多数据则为None
                    - has_more (bool): 是否还有更多数据
                    - total (int): 当前返回的记录数
        """
        try:
            logger.info(f"查询提示词列表: next_offset={next_offset}, page_size={page_size}")

            # 多查询1条记录来判断是否还有下一页
            fetch_limit = page_size + 1

            def query_operation(client):
                # 按照 created_at 时间倒序排列（最新的在前面）
                result = client.table('tb_ma_template_prompt') \
                    .select('*') \
                    .order('created_at', desc=True) \
                    .range(next_offset, next_offset + fetch_limit - 1) \
                    .execute()
                return result

            result = SupabaseService.execute_with_retry(query_operation)

            if result and result.data:
                records = result.data

                # 判断是否还有更多数据
                has_more = len(records) > page_size

                # 只返回请求的页面大小的数据
                items = records[:page_size]

                # 计算下一页的起始位置
                next_page_offset = next_offset + page_size if has_more else None

                logger.info(
                    f"查询成功: 返回{len(items)}条记录, "
                    f"has_more={has_more}, next={next_page_offset}"
                )

                return {
                    'success': True,
                    'message': 'Query successful',
                    'data': {
                        'items': items,
                        'next': next_page_offset,
                        'has_more': has_more,
                        'total': len(items)
                    }
                }
            else:
                logger.info("查询结果为空")
                return {
                    'success': True,
                    'message': 'No data found',
                    'data': {
                        'items': [],
                        'next': None,
                        'has_more': False,
                        'total': 0
                    }
                }

        except Exception as e:
            logger.error(f"分页查询提示词列表失败: {str(e)}", exc_info=True)
            return {
                'success': False,
                'message': f'Error: {str(e)}',
                'data': {
                    'items': [],
                    'next': None,
                    'has_more': False,
                    'total': 0
                }
            }

    @classmethod
    def count_prompts(cls) -> Dict[str, Any]:
        """
        统计提示词总记录数

        Returns:
            Dict: 包含统计结果的字典
                - success (bool): 操作是否成功
                - message (str): 操作消息
                - data (dict): 包含统计信息
                    - count (int): 总记录数
        """
        try:
            logger.info("开始统计提示词总记录数")

            def count_operation(client):
                # 使用 Supabase 的 count 功能
                result = client.table('tb_ma_template_prompt') \
                    .select('*', count='exact') \
                    .limit(0) \
                    .execute()
                return result

            result = SupabaseService.execute_with_retry(count_operation)

            if result:
                # Supabase 的 count 在 result.count 中
                count = result.count if hasattr(result, 'count') else 0

                logger.info(f"统计完成: 总共 {count} 条记录")

                return {
                    'success': True,
                    'message': 'Count successful',
                    'data': {
                        'count': count
                    }
                }
            else:
                logger.error("统计失败: 未返回结果")
                return {
                    'success': False,
                    'message': 'Failed to count records',
                    'data': {
                        'count': 0
                    }
                }

        except Exception as e:
            logger.error(f"统计提示词记录数失败: {str(e)}", exc_info=True)
            return {
                'success': False,
                'message': f'Error: {str(e)}',
                'data': {
                    'count': 0
                }
            }

    @classmethod
    def count_search_prompts(cls, query: str) -> Dict[str, Any]:
        """
        统计搜索结果的记录数

        Args:
            query: 搜索关键词

        Returns:
            Dict: 包含统计结果的字典
                - success (bool): 操作是否成功
                - message (str): 操作消息
                - data (dict): 包含统计信息
                    - count (int): 符合搜索条件的记录总数
        """
        try:
            logger.info(f"开始统计搜索结果数量: query={query}")

            # 如果查询为空，返回0
            if not query or query.strip() == '':
                logger.info("搜索查询为空，返回0")
                return {
                    'success': True,
                    'message': 'Empty query',
                    'data': {
                        'count': 0
                    }
                }

            def count_operation(client):
                # 使用 Supabase 的 count 功能，配合 ilike 进行模糊搜索
                result = client.table('tb_ma_template_prompt') \
                    .select('*', count='exact') \
                    .ilike('prompt', f'%{query}%') \
                    .limit(0) \
                    .execute()
                return result

            result = SupabaseService.execute_with_retry(count_operation)

            if result:
                # Supabase 的 count 在 result.count 中
                count = result.count if hasattr(result, 'count') else 0

                logger.info(f"搜索统计完成: 查询'{query}'共找到 {count} 条记录")

                return {
                    'success': True,
                    'message': 'Count successful',
                    'data': {
                        'count': count
                    }
                }
            else:
                logger.error("搜索统计失败: 未返回结果")
                return {
                    'success': False,
                    'message': 'Failed to count search results',
                    'data': {
                        'count': 0
                    }
                }

        except Exception as e:
            logger.error(f"统计搜索结果数量失败: {str(e)}", exc_info=True)
            return {
                'success': False,
                'message': f'Error: {str(e)}',
                'data': {
                    'count': 0
                }
            }

    @classmethod
    def search_prompts(cls, query: str, next_offset: int = 0, page_size: int = 10) -> Dict[str, Any]:
        """
        分页搜索提示词

        Args:
            query: 搜索关键词
            next_offset: 下一页的起始位置（从0开始）
            page_size: 每页返回的记录数，默认10条

        Returns:
            Dict: 包含搜索结果的字典
                - success (bool): 操作是否成功
                - message (str): 操作消息
                - data (dict): 包含分页信息的字典
                    - items (list): 提示词记录列表（最多10条）
                    - next (int): 下一页的起始位置，如果没有更多数据则为None
                    - has_more (bool): 是否还有更多数据
                    - total (int): 当前返回的记录数
        """
        try:
            logger.info(f"搜索提示词: query={query}, next_offset={next_offset}, page_size={page_size}")

            # 如果查询为空，返回空结果
            if not query or query.strip() == '':
                logger.info("搜索查询为空，返回空结果")
                return {
                    'success': True,
                    'message': 'Empty query',
                    'data': {
                        'items': [],
                        'next': None,
                        'has_more': False,
                        'total': 0
                    }
                }

            # 多查询1条记录来判断是否还有下一页
            fetch_limit = page_size + 1
            offset = next_offset

            def search_operation(client):
                # 使用 ilike 进行模糊搜索（不区分大小写）
                result = client.table('tb_ma_template_prompt') \
                    .select('*') \
                    .ilike('prompt', f'%{query}%') \
                    .order('created_at', desc=True) \
                    .range(offset, offset + fetch_limit - 1) \
                    .execute()
                return result

            result = SupabaseService.execute_with_retry(search_operation)

            if result and result.data:
                records = result.data

                # 判断是否还有更多数据
                has_more = len(records) > page_size

                # 只返回请求的页面大小的数据
                items = records[:page_size]

                # 计算下一页的起始位置
                next_page_offset = offset + page_size if has_more else None

                logger.info(
                    f"搜索成功: 返回{len(items)}条记录, "
                    f"has_more={has_more}, next={next_page_offset}"
                )

                return {
                    'success': True,
                    'message': 'Search successful',
                    'data': {
                        'items': items,
                        'next': next_page_offset,
                        'has_more': has_more,
                        'total': len(items)
                    }
                }
            else:
                logger.info("搜索结果为空")
                return {
                    'success': True,
                    'message': 'No results found',
                    'data': {
                        'items': [],
                        'next': None,
                        'has_more': False,
                        'total': 0
                    }
                }

        except Exception as e:
            logger.error(f"搜索提示词失败: {str(e)}", exc_info=True)
            return {
                'success': False,
                'message': f'Error: {str(e)}',
                'data': {
                    'items': [],
                    'next': None,
                    'has_more': False,
                    'total': 0
                }
            }

    @classmethod
    def _sync_call_tuzi_generate(cls, client: OpenAI, model: str, prompt: str, quality: str, response_format: str) -> tuple[str, bool]:
        """
        同步调用TuZi API生成图片（在线程池中执行）

        Args:
            client: OpenAI客户端
            model: 模型名称
            prompt: 提示词
            quality: 质量等级
            response_format: 响应格式

        Returns:
            tuple: (image_url_or_b64, is_b64)
        """
        import re

        if quality == "normal":
            # 使用 images.generate 方法
            result = client.images.generate(
                model=model,
                prompt=prompt,
                n=1,
                response_format=response_format
            )

            if not result.data or len(result.data) == 0:
                raise Exception("No image data returned from TuZi API")

            image_data = result.data[0]

            # 处理响应
            if hasattr(image_data, 'url') and image_data.url:
                return image_data.url, False
            elif hasattr(image_data, 'b64_json') and image_data.b64_json:
                return image_data.b64_json, True
            else:
                raise Exception("Invalid response format from TuZi API")
        else:
            # 使用 chat.completions 方法（针对 preview 模型）
            messages = [
                {
                    "role": "system",
                    "content": [
                        {
                            "text": "根据用户提示词，直接绘图",
                            "type": "text"
                        }
                    ]
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "text": prompt,
                            "type": "text"
                        }
                    ]
                }
            ]

            completion = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=2000
            )

            if not completion.choices or len(completion.choices) == 0:
                raise Exception("No choices in completion response")

            content = completion.choices[0].message.content

            # 从Markdown中提取图片URL
            match = re.search(r'!\[.*?\]\((.*?)\)', content)
            if match:
                return match.group(1), False
            else:
                # 尝试直接将内容作为图片URL
                if content.startswith('http'):
                    return content.strip(), False
                else:
                    raise Exception("No image URL found in response")

    @classmethod
    async def _generate_image_internal(cls, prompt: str, quality: str = "normal", aspect_ratio: str = "1:1", response_format: str = "url") -> Dict[str, Any]:
        """
        内部方法：生成图片使用TuZi API（实际执行逻辑）

        Args:
            prompt: 生成图片的提示词
            quality: 图片质量 ("normal", "hd", "2k", "4k")
            aspect_ratio: 图片宽高比 (如 "1:1", "16:9", "9:16" 等)
            response_format: 响应格式 ("url" 或 "b64_json")

        Returns:
            Dict: 包含操作结果的字典
                - success (bool): 操作是否成功
                - message (str): 操作消息
                - data (dict): 包含生成的图片URL（腾讯云COS URL）
        """
        try:
            logger.info(f"开始生成图片: quality={quality}, aspect_ratio={aspect_ratio}, prompt={prompt[:100]}...")

            # 将aspect_ratio添加到提示词中
            enhanced_prompt = f"{prompt}, aspect_ratio: {aspect_ratio}"

            # 获取API密钥
            api_key = os.getenv('TUZI_API_KEY')
            if not api_key:
                logger.error("TUZI_API_KEY 环境变量未配置")
                return {
                    'success': False,
                    'message': 'TUZI_API_KEY not configured',
                    'data': {}
                }

            # 初始化OpenAI客户端（配置为TuZi API）
            client = OpenAI(
                api_key=api_key,
                base_url="https://api.tu-zi.com/v1"
            )

            # 质量到模型的映射
            quality_model_map = {
                "normal": "gemini-3-pro-image-preview",
                "hd": "gemini-3-pro-image-preview-hd",
                "2k": "gemini-3-pro-image-preview-2k",
                "4k": "gemini-3-pro-image-preview-4k"
            }

            model = quality_model_map.get(quality, "gemini-3-pro-image-preview")
            logger.info(f"使用模型: {model}")

            # 在线程池中执行同步的OpenAI调用，避免阻塞事件循环
            image_url, is_b64 = await asyncio.to_thread(
                cls._sync_call_tuzi_generate,
                client, model, enhanced_prompt, quality, response_format
            )

            # 上传到腾讯云COS
            cos_service = get_cos_image_service()
            if not cos_service.available:
                logger.warning("腾讯云服务不可用，返回原始URL")
                return {
                    'success': True,
                    'message': 'Image generated successfully (COS unavailable)',
                    'data': {'image_url': image_url if not is_b64 else f"data:image/png;base64,{image_url}"}
                }

            # 生成唯一文件名
            unique_filename = f"tuzi_generated_{uuid.uuid4().hex[:12]}.png"

            if is_b64:
                # Base64数据
                image_bytes = base64.b64decode(image_url)
                cos_url = await cos_service.upload_image_from_bytes(
                    image_bytes=image_bytes,
                    image_key=unique_filename,
                    content_type='image/png'
                )
            else:
                # URL数据，需要先下载
                async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as http_client:
                    response = await http_client.get(image_url)
                    response.raise_for_status()
                    image_bytes = response.content

                    content_type = response.headers.get('content-type', 'image/png')
                    cos_url = await cos_service.upload_image_from_bytes(
                        image_bytes=image_bytes,
                        image_key=unique_filename,
                        content_type=content_type
                    )

            if cos_url:
                logger.info(f"图片生成并上传成功: {cos_url}")
                return {
                    'success': True,
                    'message': 'Image generated successfully',
                    'data': {'image_url': cos_url}
                }
            else:
                logger.error("上传到COS失败，返回原始URL")
                return {
                    'success': True,
                    'message': 'Image generated (COS upload failed)',
                    'data': {'image_url': image_url if not is_b64 else f"data:image/png;base64,{image_url}"}
                }

        except Exception as e:
            logger.error(f"生成图片失败: {str(e)}", exc_info=True)
            return {
                'success': False,
                'message': f'Error: {str(e)}',
                'data': {}
            }

    @classmethod
    async def _execute_generate_image_task(cls, task_id: str, prompt: str, quality: str, aspect_ratio: str, response_format: str):
        """
        后台执行图片生成任务

        Args:
            task_id: 任务ID
            prompt: 提示词
            quality: 质量等级
            aspect_ratio: 宽高比
            response_format: 响应格式
        """
        try:
            # 更新状态为处理中
            await task_manager.update_task_status(task_id, "processing")

            # 执行实际的图片生成
            result = await cls._generate_image_internal(
                prompt=prompt,
                quality=quality,
                aspect_ratio=aspect_ratio,
                response_format=response_format
            )

            # 根据结果更新任务状态
            if result['success']:
                await task_manager.set_task_result(task_id, result['data'])
            else:
                await task_manager.set_task_error(task_id, result['message'])

        except Exception as e:
            logger.error(f"执行图片生成任务失败 [task_id={task_id}]: {str(e)}", exc_info=True)
            await task_manager.set_task_error(task_id, f"Internal error: {str(e)}")

    @classmethod
    async def generate_image(cls, prompt: str, quality: str = "normal", aspect_ratio: str = "1:1", response_format: str = "url") -> Dict[str, Any]:
        """
        生成图片（异步任务模式）- 立即返回task_id

        Args:
            prompt: 生成图片的提示词
            quality: 图片质量 ("normal", "hd", "2k", "4k")
            aspect_ratio: 图片宽高比 (如 "1:1", "16:9", "9:16" 等)
            response_format: 响应格式 ("url" 或 "b64_json")

        Returns:
            Dict: 包含task_id的响应
                - success (bool): 总是True
                - message (str): 消息
                - data (dict): 包含 task_id 和 status
        """
        try:
            # 创建任务
            task_id = task_manager.create_task()
            logger.info(f"创建图片生成任务: task_id={task_id}")

            # 在后台执行任务（不等待完成）
            asyncio.create_task(cls._execute_generate_image_task(
                task_id=task_id,
                prompt=prompt,
                quality=quality,
                aspect_ratio=aspect_ratio,
                response_format=response_format
            ))

            # 立即返回task_id
            return {
                'success': True,
                'message': 'Task created successfully',
                'data': {
                    'task_id': task_id,
                    'status': 'pending'
                }
            }

        except Exception as e:
            logger.error(f"创建图片生成任务失败: {str(e)}", exc_info=True)
            return {
                'success': False,
                'message': f'Error: {str(e)}',
                'data': {}
            }

    @classmethod
    def _sync_call_tuzi_edit(cls, client: OpenAI, model: str, image_file_path: str, prompt: str, response_format: str) -> tuple[str, bool]:
        """
        同步调用TuZi API编辑图片（在线程池中执行）

        Args:
            client: OpenAI客户端
            model: 模型名称
            image_file_path: 图片文件路径
            prompt: 提示词
            response_format: 响应格式

        Returns:
            tuple: (image_url_or_b64, is_b64)
        """
        with open(image_file_path, 'rb') as image_file:
            result = client.images.edit(
                model=model,
                image=image_file,
                prompt=prompt,
                n=1,
                response_format=response_format
            )

        if not result.data or len(result.data) == 0:
            raise Exception("No image data returned from TuZi API")

        image_data = result.data[0]

        # 处理响应
        if hasattr(image_data, 'url') and image_data.url:
            return image_data.url, False
        elif hasattr(image_data, 'b64_json') and image_data.b64_json:
            return image_data.b64_json, True
        else:
            raise Exception("Invalid response format from TuZi API")

    @classmethod
    async def _edit_image_internal(cls,
                         image_url: Optional[str] = None,
                         image_base64: Optional[str] = None,
                         prompt: str = "",
                         quality: str = "normal",
                         aspect_ratio: str = "1:1",
                         response_format: str = "url") -> Dict[str, Any]:
        """
        内部方法：编辑图片使用TuZi API（实际执行逻辑）

        Args:
            image_url: 要编辑的图片URL（可选）
            image_base64: 要编辑的图片Base64数据（可选）
            prompt: 编辑图片的提示词
            quality: 图片质量 ("normal", "hd", "2k", "4k")
            aspect_ratio: 图片宽高比 (如 "1:1", "16:9", "9:16" 等)
            response_format: 响应格式 ("url" 或 "b64_json")

        Returns:
            Dict: 包含操作结果的字典
                - success (bool): 操作是否成功
                - message (str): 操作消息
                - data (dict): 包含生成的图片URL（腾讯云COS URL）
        """
        temp_file_path = None
        try:
            logger.info(f"开始编辑图片: quality={quality}, aspect_ratio={aspect_ratio}, prompt={prompt[:100]}...")

            # 将aspect_ratio添加到提示词中
            enhanced_prompt = f"{prompt}, aspect_ratio: {aspect_ratio}"

            # 验证输入
            if not image_url and not image_base64:
                return {
                    'success': False,
                    'message': 'Either image_url or image_base64 must be provided',
                    'data': {}
                }

            # 获取API密钥
            api_key = os.getenv('TUZI_API_KEY')
            if not api_key:
                logger.error("TUZI_API_KEY 环境变量未配置")
                return {
                    'success': False,
                    'message': 'TUZI_API_KEY not configured',
                    'data': {}
                }

            # 初始化OpenAI客户端（配置为TuZi API）
            client = OpenAI(
                api_key=api_key,
                base_url="https://api.tu-zi.com/v1"
            )

            # 质量到模型的映射
            quality_model_map = {
                "normal": "gemini-3-pro-image-preview",
                "hd": "gemini-3-pro-image-preview-hd",
                "2k": "gemini-3-pro-image-preview-2k",
                "4k": "gemini-3-pro-image-preview-4k"
            }

            model = quality_model_map.get(quality, "gemini-3-pro-image-preview")
            logger.info(f"使用模型: {model}")

            # 准备图片数据
            if image_base64:
                # 如果提供了base64数据，保存为临时文件
                image_bytes = base64.b64decode(image_base64)
                temp_file_path = os.path.join(tempfile.gettempdir(), f"temp_image_{uuid.uuid4().hex[:8]}.png")
                with open(temp_file_path, 'wb') as f:
                    f.write(image_bytes)
            elif image_url:
                # 检查是否是base64 data URL
                if image_url.startswith('data:'):
                    # 解析data URL格式: data:image/png;base64,iVBORw0KGgoAAAANS...
                    logger.info("检测到data URL格式，从中提取base64数据")
                    try:
                        # 找到逗号的位置，之后就是base64数据
                        comma_index = image_url.index(',')
                        base64_data = image_url[comma_index + 1:]
                        image_bytes = base64.b64decode(base64_data)

                        temp_file_path = os.path.join(tempfile.gettempdir(), f"temp_image_{uuid.uuid4().hex[:8]}.png")
                        with open(temp_file_path, 'wb') as f:
                            f.write(image_bytes)
                    except (ValueError, base64.binascii.Error) as e:
                        logger.error(f"解析data URL失败: {str(e)}")
                        raise ValueError(f"Invalid data URL format: {str(e)}")
                else:
                    # 如果是普通URL，下载图片
                    logger.info(f"下载图片: {image_url}")
                    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as http_client:
                        response = await http_client.get(image_url)
                        response.raise_for_status()
                        image_bytes = response.content

                        temp_file_path = os.path.join(tempfile.gettempdir(), f"temp_image_{uuid.uuid4().hex[:8]}.png")
                        with open(temp_file_path, 'wb') as f:
                            f.write(image_bytes)

            # 在线程池中执行同步的OpenAI调用，避免阻塞事件循环
            result_image_url, is_b64 = await asyncio.to_thread(
                cls._sync_call_tuzi_edit,
                client, model, temp_file_path, enhanced_prompt, response_format
            )

            # 上传到腾讯云COS
            cos_service = get_cos_image_service()
            if not cos_service.available:
                logger.warning("腾讯云服务不可用，返回原始URL")
                return {
                    'success': True,
                    'message': 'Image edited successfully (COS unavailable)',
                    'data': {'image_url': result_image_url if not is_b64 else f"data:image/png;base64,{result_image_url}"}
                }

            # 生成唯一文件名
            unique_filename = f"tuzi_edited_{uuid.uuid4().hex[:12]}.png"

            if is_b64:
                # Base64数据
                result_image_bytes = base64.b64decode(result_image_url)
                cos_url = await cos_service.upload_image_from_bytes(
                    image_bytes=result_image_bytes,
                    image_key=unique_filename,
                    content_type='image/png'
                )
            else:
                # URL数据，需要先下载
                async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as http_client:
                    response = await http_client.get(result_image_url)
                    response.raise_for_status()
                    result_image_bytes = response.content

                    content_type = response.headers.get('content-type', 'image/png')
                    cos_url = await cos_service.upload_image_from_bytes(
                        image_bytes=result_image_bytes,
                        image_key=unique_filename,
                        content_type=content_type
                    )

            if cos_url:
                logger.info(f"图片编辑并上传成功: {cos_url}")
                return {
                    'success': True,
                    'message': 'Image edited successfully',
                    'data': {'image_url': cos_url}
                }
            else:
                logger.error("上传到COS失败，返回原始URL")
                return {
                    'success': True,
                    'message': 'Image edited (COS upload failed)',
                    'data': {'image_url': result_image_url if not is_b64 else f"data:image/png;base64,{result_image_url}"}
                }

        except Exception as e:
            logger.error(f"编辑图片失败: {str(e)}", exc_info=True)
            return {
                'success': False,
                'message': f'Error: {str(e)}',
                'data': {}
            }
        finally:
            # 清理临时文件
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                    logger.debug(f"临时文件已删除: {temp_file_path}")
                except Exception as e:
                    logger.warning(f"删除临时文件失败: {temp_file_path}, error: {e}")

    @classmethod
    async def _execute_edit_image_task(cls, task_id: str, image_url: Optional[str], image_base64: Optional[str],
                                      prompt: str, quality: str, aspect_ratio: str, response_format: str):
        """
        后台执行图片编辑任务

        Args:
            task_id: 任务ID
            image_url: 图片URL
            image_base64: 图片Base64数据
            prompt: 提示词
            quality: 质量等级
            aspect_ratio: 宽高比
            response_format: 响应格式
        """
        try:
            # 更新状态为处理中
            await task_manager.update_task_status(task_id, "processing")

            # 执行实际的图片编辑
            result = await cls._edit_image_internal(
                image_url=image_url,
                image_base64=image_base64,
                prompt=prompt,
                quality=quality,
                aspect_ratio=aspect_ratio,
                response_format=response_format
            )

            # 根据结果更新任务状态
            if result['success']:
                await task_manager.set_task_result(task_id, result['data'])
            else:
                await task_manager.set_task_error(task_id, result['message'])

        except Exception as e:
            logger.error(f"执行图片编辑任务失败 [task_id={task_id}]: {str(e)}", exc_info=True)
            await task_manager.set_task_error(task_id, f"Internal error: {str(e)}")

    @classmethod
    async def edit_image(cls,
                         image_url: Optional[str] = None,
                         image_base64: Optional[str] = None,
                         prompt: str = "",
                         quality: str = "normal",
                         aspect_ratio: str = "1:1",
                         response_format: str = "url") -> Dict[str, Any]:
        """
        编辑图片（异步任务模式）- 立即返回task_id

        Args:
            image_url: 要编辑的图片URL（可选）
            image_base64: 要编辑的图片Base64数据（可选）
            prompt: 编辑图片的提示词
            quality: 图片质量 ("normal", "hd", "2k", "4k")
            aspect_ratio: 图片宽高比 (如 "1:1", "16:9", "9:16" 等)
            response_format: 响应格式 ("url" 或 "b64_json")

        Returns:
            Dict: 包含task_id的响应
                - success (bool): 总是True（除非参数验证失败）
                - message (str): 消息
                - data (dict): 包含 task_id 和 status
        """
        try:
            # 验证输入
            if not image_url and not image_base64:
                return {
                    'success': False,
                    'message': 'Either image_url or image_base64 must be provided',
                    'data': {}
                }

            # 创建任务
            task_id = task_manager.create_task()
            logger.info(f"创建图片编辑任务: task_id={task_id}")

            # 在后台执行任务（不等待完成）
            asyncio.create_task(cls._execute_edit_image_task(
                task_id=task_id,
                image_url=image_url,
                image_base64=image_base64,
                prompt=prompt,
                quality=quality,
                aspect_ratio=aspect_ratio,
                response_format=response_format
            ))

            # 立即返回task_id
            return {
                'success': True,
                'message': 'Task created successfully',
                'data': {
                    'task_id': task_id,
                    'status': 'pending'
                }
            }

        except Exception as e:
            logger.error(f"创建图片编辑任务失败: {str(e)}", exc_info=True)
            return {
                'success': False,
                'message': f'Error: {str(e)}',
                'data': {}
            }


# 创建全局实例
plugin_service = PluginService()
