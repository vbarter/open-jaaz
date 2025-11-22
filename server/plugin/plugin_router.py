#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Plugin Router
定义插件相关的API路由
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
import logging
import httpx
import json

# 导入plugin_service
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from plugin.plugin_service import plugin_service

# 配置日志
logger = logging.getLogger('plugin_router')

router = APIRouter()


class AddPromptRequest(BaseModel):
    """添加提示词请求模型"""
    creator: str = Field(..., description="提示词创建人")
    source: str = Field(..., description="来源")
    origin_text: str = Field(..., description="原文内容")
    image_url: str = Field(..., description="图片URL")
    video_url: str = Field(..., description="视频URL")
    title: str = Field(..., description="标题")
    prompt: str = Field(..., description="模版提示词")
    owner: str = Field(..., description="发布人")


class AddPromptResponse(BaseModel):
    """添加提示词响应模型"""
    code: int
    message: str
    data: list


@router.post("/api/plugin/add_prompt", response_model=AddPromptResponse)
async def add_prompt(prompt_data: AddPromptRequest):
    """
    添加提示词接口

    接收提示词数据并将其保存到Supabase数据库中

    Args:
        prompt_data: 提示词数据

    Returns:
        AddPromptResponse: 标准响应格式
            - code: 0表示成功，非0表示失败
            - message: 操作消息
            - data: 空列表（按照用户要求的格式）
    """
    try:
        logger.info(f"收到添加提示词请求: title={prompt_data.title}, creator={prompt_data.creator}")

        # 调用service层处理业务逻辑（异步调用）
        result = await plugin_service.add_prompt(
            creator=prompt_data.creator,
            source=prompt_data.source,
            origin_text=prompt_data.origin_text,
            image_url=prompt_data.image_url,
            video_url=prompt_data.video_url,
            title=prompt_data.title,
            prompt=prompt_data.prompt,
            owner=prompt_data.owner
        )

        # 根据service返回的结果构造响应
        if result['success']:
            logger.info(f"提示词添加成功: {prompt_data.title}")
            return AddPromptResponse(
                code=0,
                message="add successfully",
                data=[]
            )
        else:
            logger.error(f"提示词添加失败: {result['message']}")
            return AddPromptResponse(
                code=1,
                message=result['message'],
                data=[]
            )

    except Exception as e:
        logger.error(f"添加提示词时发生异常: {str(e)}", exc_info=True)
        return AddPromptResponse(
            code=1,
            message=f"Internal server error: {str(e)}",
            data=[]
        )


class LLMRequest(BaseModel):
    """LLM请求模型"""
    system_prompt: str = Field(..., description="系统提示词")
    user_prompt: str = Field(..., description="用户提示词")


class LLMResponse(BaseModel):
    """LLM响应模型"""
    code: int
    message: str
    data: dict


class ListPromptRequest(BaseModel):
    """获取提示词列表请求模型"""
    start: int = Field(default=0, ge=0, description="从第几个记录开始获取，从0开始")


class ListPromptResponse(BaseModel):
    """获取提示词列表响应模型"""
    code: int
    message: str
    data: dict  # 包含 items, next, has_more, total


@router.post("/api/plugin/list_prompt", response_model=ListPromptResponse)
async def list_prompt(request: ListPromptRequest):
    """
    分页获取提示词列表接口

    Args:
        request: 包含分页参数的请求
            - start: 从第几个记录开始获取（从0开始），默认为0

    Returns:
        ListPromptResponse: 标准响应格式
            - code: 0表示成功，非0表示失败
            - message: 操作消息
            - data: 包含以下字段
                - items: 提示词记录列表（最多5条）
                - next: 下一页的起始位置，如果没有更多数据则为null
                - has_more: 是否还有更多数据
                - total: 当前返回的记录数

    说明：
        - 按创建时间倒序排列（最新的记录在最前面）
        - 每页固定返回5条记录
        - start=0 获取第0-4条记录（最新的5条）
        - start=5 获取第5-9条记录（接下来的5条）
        - 根据 start 和每页5条的规则自动计算查询位置
    """
    try:
        logger.info(f"收到获取提示词列表请求: start={request.start}")

        # 每页固定5条记录
        page_size = 5

        # 根据 start 参数计算查询位置
        # start 就是 offset，表示跳过前面多少条记录
        offset = request.start

        # 调用service层处理业务逻辑
        result = plugin_service.list_prompts_paginated(
            next_offset=offset,
            page_size=page_size
        )

        # 根据service返回的结果构造响应
        if result['success']:
            logger.info(
                f"提示词列表获取成功: 返回{result['data']['total']}条记录, "
                f"has_more={result['data']['has_more']}"
            )
            return ListPromptResponse(
                code=0,
                message=result['message'],
                data=result['data']
            )
        else:
            logger.error(f"提示词列表获取失败: {result['message']}")
            return ListPromptResponse(
                code=1,
                message=result['message'],
                data=result['data']
            )

    except Exception as e:
        logger.error(f"获取提示词列表时发生异常: {str(e)}", exc_info=True)
        return ListPromptResponse(
            code=1,
            message=f"Internal server error: {str(e)}",
            data={
                'items': [],
                'next': None,
                'has_more': False,
                'total': 0
            }
        )


class CountPromptResponse(BaseModel):
    """统计提示词数量响应模型"""
    code: int
    message: str
    data: dict  # 包含 count


@router.post("/api/plugin/count_prompt", response_model=CountPromptResponse)
async def count_prompt():
    """
    统计提示词总记录数接口

    Returns:
        CountPromptResponse: 标准响应格式
            - code: 0表示成功，非0表示失败
            - message: 操作消息
            - data: 包含以下字段
                - count: 总记录数

    说明：
        - 返回数据库中所有提示词的总数量
        - 不需要任何请求参数
        - 用于分页时显示总页数等信息
    """
    try:
        logger.info("收到统计提示词数量请求")

        # 调用service层处理业务逻辑
        result = plugin_service.count_prompts()

        # 根据service返回的结果构造响应
        if result['success']:
            count = result['data']['count']
            logger.info(f"提示词统计成功: 总共 {count} 条记录")
            return CountPromptResponse(
                code=0,
                message=result['message'],
                data=result['data']
            )
        else:
            logger.error(f"提示词统计失败: {result['message']}")
            return CountPromptResponse(
                code=1,
                message=result['message'],
                data=result['data']
            )

    except Exception as e:
        logger.error(f"统计提示词数量时发生异常: {str(e)}", exc_info=True)
        return CountPromptResponse(
            code=1,
            message=f"Internal server error: {str(e)}",
            data={'count': 0}
        )


@router.post("/api/plugin/llm", response_model=LLMResponse)
async def llm_chat(llm_data: LLMRequest):
    """
    LLM聊天接口

    调用云雾AI接口进行对话

    Args:
        llm_data: 包含系统提示词和用户提示词的数据

    Returns:
        LLMResponse: 标准响应格式
            - code: 0表示成功，非0表示失败
            - message: 操作消息
            - data: 包含AI返回的文本内容
    """
    try:
        logger.info(f"收到LLM请求: system_prompt={llm_data.system_prompt[:50]}..., user_prompt={llm_data.user_prompt[:50]}...")

        # 准备调用云雾AI的请求数据
        yunwu_request = {
            "model": "gpt-5.1",
            "stream": False,
            "max_tokens": 2000,
            "messages": [
                {
                    "role": "system",
                    "content": llm_data.system_prompt
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": llm_data.user_prompt}
                    ]
                }
            ]
        }

        # 调用云雾AI接口
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://yunwu.ai/v1/chat/completions",
                headers={
                    "Accept": "application/json",
                    "Authorization": "Bearer sk-N97K28KljYvBVVspUiIgsJZPC9FqLffq0Pl4seTPEV2Dx3Qa",
                    "Content-Type": "application/json"
                },
                json=yunwu_request
            )

        # 检查响应状态
        if response.status_code != 200:
            logger.error(f"云雾AI接口返回错误: {response.status_code} - {response.text}")
            return LLMResponse(
                code=1,
                message=f"API error: {response.status_code}",
                data={}
            )

        # 解析响应
        response_data = response.json()

        # 提取content文本内容
        # 云雾AI返回格式通常是: {"choices": [{"message": {"content": "..."}}]}
        content_text = ""
        if "choices" in response_data and len(response_data["choices"]) > 0:
            message = response_data["choices"][0].get("message", {})
            content_text = message.get("content", "")

        logger.info(f"LLM响应成功，内容长度: {len(content_text)}")

        # 尝试解析content为JSON对象
        result_data = {}
        try:
            # 尝试将content解析为JSON
            parsed_content = json.loads(content_text)
            if isinstance(parsed_content, dict):
                result_data = parsed_content
            else:
                # 如果不是字典，放入content字段
                result_data = {"content": content_text}
        except (json.JSONDecodeError, TypeError):
            # 如果解析失败，将原始文本放入content字段
            logger.warning(f"无法解析AI返回内容为JSON，使用原始文本")
            result_data = {"content": content_text}

        return LLMResponse(
            code=0,
            message="success",
            data=result_data
        )

    except httpx.TimeoutException:
        logger.error("调用云雾AI接口超时")
        return LLMResponse(
            code=1,
            message="Request timeout",
            data={}
        )
    except Exception as e:
        logger.error(f"LLM接口发生异常: {str(e)}", exc_info=True)
        return LLMResponse(
            code=1,
            message=f"Internal server error: {str(e)}",
            data={}
        )
