#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Plugin Service
处理插件相关的业务逻辑，包括与Supabase数据库的交互
"""

import logging
from typing import Optional, Dict, Any
from datetime import datetime

# 导入Supabase服务
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from superbase import SupabaseService

# 配置日志
logger = logging.getLogger('plugin_service')


class PluginService:
    """插件服务类，处理插件相关的数据库操作"""

    @classmethod
    def add_prompt(cls,
                   creator: str,
                   source: str,
                   origin_text: str,
                   image_url: str,
                   video_url: str,
                   title: str,
                   prompt: str,
                   owner: str) -> Dict[str, Any]:
        """
        添加提示词到Supabase数据库

        Args:
            creator: 提示词创建人
            source: 来源
            origin_text: 原文内容
            image_url: 图片URL
            video_url: 视频URL
            title: 标题
            prompt: 模版提示词
            owner: 发布人

        Returns:
            Dict: 包含操作结果的字典
                - success (bool): 操作是否成功
                - message (str): 操作消息
                - data (dict): 插入的数据（如果成功）
        """
        try:
            # 准备插入数据
            prompt_data = {
                'creator': creator,
                'source': source,
                'origin_text': origin_text,
                'image_url': image_url,
                'video_url': video_url,
                'title': title,
                'prompt': prompt,
                'owner': owner
            }

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


# 创建全局实例
plugin_service = PluginService()
