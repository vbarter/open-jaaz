#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Plugin Router
定义插件相关的API路由
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional, Literal, List, Dict, Any
import logging
import httpx
import json

# 导入plugin_service
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from plugin.plugin_service import plugin_service
from plugin.image_task_manager import task_manager
from plugin.poster_service import poster_service

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
    publish_time: Optional[str] = Field(None, description="推文发布时间")


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
            owner=prompt_data.owner,
            publish_time=prompt_data.publish_time
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


class GenerateImageRequest(BaseModel):
    """生成图片请求模型"""
    prompt: str = Field(..., description="生成图片的提示词")
    quality: Literal["normal", "hd", "2k", "4k"] = Field(default="normal", description="图片质量")
    aspect_ratio: Optional[str] = Field(default="1:1", description="图片宽高比(如1:1, 16:9, 9:16等)")
    response_format: Optional[str] = Field(default="url", description="响应格式(url或b64_json)")


class EditImageRequest(BaseModel):
    """编辑图片请求模型"""
    image_url: Optional[str] = Field(None, description="要编辑的图片URL")
    image_base64: Optional[str] = Field(None, description="要编辑的图片Base64数据")
    prompt: str = Field(..., description="编辑图片的提示词")
    quality: Literal["normal", "hd", "2k", "4k"] = Field(default="normal", description="图片质量")
    aspect_ratio: Optional[str] = Field(default="1:1", description="图片宽高比(如1:1, 16:9, 9:16等)")
    response_format: Optional[str] = Field(default="url", description="响应格式(url或b64_json)")


class ImageResponse(BaseModel):
    """图片生成/编辑响应模型"""
    code: int
    message: str
    data: dict


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
                - items: 提示词记录列表（最多10条）
                - next: 下一页的起始位置，如果没有更多数据则为null
                - has_more: 是否还有更多数据
                - total: 当前返回的记录数

    说明：
        - 按创建时间倒序排列（最新的记录在最前面）
        - 每页固定返回10条记录
        - start=0 获取第0-9条记录（最新的10条）
        - start=10 获取第10-19条记录（接下来的10条）
        - 根据 start 和每页10条的规则自动计算查询位置
    """
    try:
        logger.info(f"收到获取提示词列表请求: start={request.start}")

        # 每页固定10条记录
        page_size = 10

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


class SearchPromptRequest(BaseModel):
    """搜索提示词请求模型"""
    query: str = Field(..., description="搜索关键词")
    start: int = Field(default=0, ge=0, description="从第几个记录开始获取，从0开始")


class SearchPromptResponse(BaseModel):
    """搜索提示词响应模型"""
    code: int
    message: str
    data: dict  # 包含 items, next, has_more, total


class SearchCountPromptRequest(BaseModel):
    """搜索统计提示词请求模型"""
    query: str = Field(..., description="搜索关键词")


class SearchCountPromptResponse(BaseModel):
    """搜索统计提示词响应模型"""
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


@router.post("/api/plugin/search_count_prompt", response_model=SearchCountPromptResponse)
async def search_count_prompt(request: SearchCountPromptRequest):
    """
    统计搜索结果的记录数接口

    Args:
        request: 包含搜索参数的请求
            - query: 搜索关键词

    Returns:
        SearchCountPromptResponse: 标准响应格式
            - code: 0表示成功，非0表示失败
            - message: 操作消息
            - data: 包含以下字段
                - count: 符合搜索条件的记录总数

    说明：
        - 在 prompt 字段中进行模糊搜索（不区分大小写）
        - 返回符合搜索条件的记录总数
        - 如果查询为空，返回 0
        - 用于分页时显示总页数等信息
    """
    try:
        logger.info(f"收到搜索统计提示词数量请求: query={request.query}")

        # 调用service层处理业务逻辑
        result = plugin_service.count_search_prompts(query=request.query)

        # 根据service返回的结果构造响应
        if result['success']:
            count = result['data']['count']
            logger.info(f"搜索统计成功: 查询'{request.query}'共找到 {count} 条记录")
            return SearchCountPromptResponse(
                code=0,
                message=result['message'],
                data=result['data']
            )
        else:
            logger.error(f"搜索统计失败: {result['message']}")
            return SearchCountPromptResponse(
                code=1,
                message=result['message'],
                data=result['data']
            )

    except Exception as e:
        logger.error(f"统计搜索结果数量时发生异常: {str(e)}", exc_info=True)
        return SearchCountPromptResponse(
            code=1,
            message=f"Internal server error: {str(e)}",
            data={'count': 0}
        )


@router.post("/api/plugin/search_prompt", response_model=SearchPromptResponse)
async def search_prompt(request: SearchPromptRequest):
    """
    分页搜索提示词接口

    Args:
        request: 包含搜索参数的请求
            - query: 搜索关键词
            - start: 从第几个记录开始获取（从0开始），默认为0

    Returns:
        SearchPromptResponse: 标准响应格式
            - code: 0表示成功，非0表示失败
            - message: 操作消息
            - data: 包含以下字段
                - items: 提示词记录列表（最多10条）
                - next: 下一页的起始位置，如果没有更多数据则为null
                - has_more: 是否还有更多数据
                - total: 当前返回的记录数

    说明：
        - 在 prompt 字段中进行模糊搜索（不区分大小写）
        - 按创建时间倒序排列（最新的记录在最前面）
        - 每页固定返回10条记录
        - start=0 获取第0-9条记录（最新的10条）
        - start=10 获取第10-19条记录（接下来的10条）
        - 如果查询为空，返回空结果
    """
    try:
        logger.info(f"收到搜索提示词请求: query={request.query}, start={request.start}")

        # 每页固定10条记录
        page_size = 10

        # 根据 start 参数计算查询位置
        offset = request.start

        # 调用service层处理业务逻辑
        result = plugin_service.search_prompts(
            query=request.query,
            next_offset=offset,
            page_size=page_size
        )

        # 根据service返回的结果构造响应
        if result['success']:
            logger.info(
                f"提示词搜索成功: 返回{result['data']['total']}条记录, "
                f"has_more={result['data']['has_more']}"
            )
            return SearchPromptResponse(
                code=0,
                message=result['message'],
                data=result['data']
            )
        else:
            logger.error(f"提示词搜索失败: {result['message']}")
            return SearchPromptResponse(
                code=1,
                message=result['message'],
                data=result['data']
            )

    except Exception as e:
        logger.error(f"搜索提示词时发生异常: {str(e)}", exc_info=True)
        return SearchPromptResponse(
            code=1,
            message=f"Internal server error: {str(e)}",
            data={
                'items': [],
                'next': None,
                'has_more': False,
                'total': 0
            }
        )


@router.post("/api/plugin/generate_image", response_model=ImageResponse)
async def generate_image(request: GenerateImageRequest):
    """
    生成图片接口（异步任务模式）

    使用TuZi API生成图片并上传到腾讯云COS

    **重要**: 此接口立即返回task_id，不等待图片生成完成。
    使用 /api/plugin/check_task 接口轮询检查任务状态和获取结果。

    Args:
        request: 图片生成请求
            - prompt: 生成图片的提示词
            - quality: 图片质量 ("normal", "hd", "2k", "4k")
            - aspect_ratio: 图片宽高比 (如 "1:1", "16:9", "9:16" 等)
            - response_format: 响应格式 ("url" 或 "b64_json")

    Returns:
        ImageResponse: 标准响应格式
            - code: 0表示成功，非0表示失败
            - message: 操作消息
            - data: 包含任务信息
                - task_id: 任务ID（用于后续查询任务状态）
                - status: 初始状态 "pending"

    使用流程:
        1. 调用此接口获取task_id
        2. 使用task_id调用 /api/plugin/check_task 检查状态
        3. 当status为"completed"时，result字段包含image_url
        4. 当status为"failed"时，error字段包含错误信息
    """
    try:
        logger.info(f"收到生成图片请求: quality={request.quality}, prompt={request.prompt[:100]}...")

        # 调用service层处理业务逻辑
        result = await plugin_service.generate_image(
            prompt=request.prompt,
            quality=request.quality,
            aspect_ratio=request.aspect_ratio,
            response_format=request.response_format
        )

        # 根据service返回的结果构造响应
        if result['success']:
            logger.info(f"图片生成成功: {result['data'].get('image_url', '')}")
            return ImageResponse(
                code=0,
                message=result['message'],
                data=result['data']
            )
        else:
            logger.error(f"图片生成失败: {result['message']}")
            return ImageResponse(
                code=1,
                message=result['message'],
                data=result.get('data', {})
            )

    except Exception as e:
        logger.error(f"生成图片时发生异常: {str(e)}", exc_info=True)
        return ImageResponse(
            code=1,
            message=f"Internal server error: {str(e)}",
            data={}
        )


@router.post("/api/plugin/edit_image", response_model=ImageResponse)
async def edit_image(request: EditImageRequest):
    """
    编辑图片接口（异步任务模式）

    使用TuZi API编辑图片并上传到腾讯云COS

    **重要**: 此接口立即返回task_id，不等待图片编辑完成。
    使用 /api/plugin/check_task 接口轮询检查任务状态和获取结果。

    Args:
        request: 图片编辑请求
            - image_url: 要编辑的图片URL（可选）
            - image_base64: 要编辑的图片Base64数据（可选）
            - prompt: 编辑图片的提示词
            - quality: 图片质量 ("normal", "hd", "2k", "4k")
            - aspect_ratio: 图片宽高比 (如 "1:1", "16:9", "9:16" 等)
            - response_format: 响应格式 ("url" 或 "b64_json")

    Returns:
        ImageResponse: 标准响应格式
            - code: 0表示成功，非0表示失败
            - message: 操作消息
            - data: 包含任务信息
                - task_id: 任务ID（用于后续查询任务状态）
                - status: 初始状态 "pending"

    Note:
        - 必须提供 image_url 或 image_base64 其中之一
        - 使用流程同 generate_image 接口
    """
    try:
        # 验证输入
        if not request.image_url and not request.image_base64:
            return ImageResponse(
                code=1,
                message="Either image_url or image_base64 must be provided",
                data={}
            )

        logger.info(f"收到编辑图片请求: quality={request.quality}, prompt={request.prompt[:100]}...")

        # 调用service层处理业务逻辑
        result = await plugin_service.edit_image(
            image_url=request.image_url,
            image_base64=request.image_base64,
            prompt=request.prompt,
            quality=request.quality,
            aspect_ratio=request.aspect_ratio,
            response_format=request.response_format
        )

        # 根据service返回的结果构造响应
        if result['success']:
            logger.info(f"图片编辑成功: {result['data'].get('image_url', '')}")
            return ImageResponse(
                code=0,
                message=result['message'],
                data=result['data']
            )
        else:
            logger.error(f"图片编辑失败: {result['message']}")
            return ImageResponse(
                code=1,
                message=result['message'],
                data=result.get('data', {})
            )

    except Exception as e:
        logger.error(f"编辑图片时发生异常: {str(e)}", exc_info=True)
        return ImageResponse(
            code=1,
            message=f"Internal server error: {str(e)}",
            data={}
        )


class CheckTaskRequest(BaseModel):
    """检查任务状态请求模型"""
    task_id: str = Field(..., description="任务ID")


class CheckTaskResponse(BaseModel):
    """检查任务状态响应模型"""
    code: int
    message: str
    data: dict


@router.post("/api/plugin/check_task", response_model=CheckTaskResponse)
async def check_task(request: CheckTaskRequest):
    """
    检查图片生成/编辑任务状态

    Args:
        request: 包含task_id的请求

    Returns:
        CheckTaskResponse: 标准响应格式
            - code: 0表示成功，非0表示失败
            - message: 操作消息
            - data: 包含任务信息
                - task_id: 任务ID
                - status: 任务状态 ("pending", "processing", "completed", "failed")
                - result: 任务结果（如果已完成）
                - error: 错误信息（如果失败）
                - created_at: 创建时间
                - updated_at: 更新时间
    """
    try:
        logger.info(f"收到检查任务状态请求: task_id={request.task_id}")

        # 从任务管理器获取任务状态
        task_info = await task_manager.get_task(request.task_id)

        if not task_info:
            logger.warning(f"任务不存在: task_id={request.task_id}")
            return CheckTaskResponse(
                code=1,
                message="Task not found",
                data={}
            )

        logger.info(f"任务状态查询成功: task_id={request.task_id}, status={task_info['status']}")
        return CheckTaskResponse(
            code=0,
            message="success",
            data=task_info
        )

    except Exception as e:
        logger.error(f"检查任务状态时发生异常: {str(e)}", exc_info=True)
        return CheckTaskResponse(
            code=1,
            message=f"Internal server error: {str(e)}",
            data={}
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
            "model": "gpt-5.2-chat-latest",
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


# ==================== 小红书海报相关接口 ====================

class PosterOutlineRequest(BaseModel):
    """海报大纲生成请求"""
    topic: str = Field(..., description="用户主题")


class PosterGenerateRequest(BaseModel):
    """海报图片生成请求"""
    pages: List[Dict[str, Any]] = Field(..., description="页面列表")
    full_outline: str = Field(..., description="完整大纲")
    user_topic: str = Field(..., description="用户主题")
    style: Optional[str] = Field("default", description="风格")
    session_id: str = Field(..., description="会话ID")
    canvas_id: Optional[str] = Field(None, description="画布ID")


@router.post("/api/plugin/poster/outline")
async def generate_poster_outline(request: PosterOutlineRequest):
    """生成海报大纲"""
    try:
        result = await poster_service.generate_outline(request.topic)
        if result['success']:
            return {
                "code": 0,
                "message": "success",
                "data": result
            }
        else:
            return {
                "code": 1,
                "message": result['message'],
                "data": {}
            }
    except Exception as e:
        logger.error(f"生成大纲接口异常: {str(e)}")
        return {
            "code": 1,
            "message": str(e),
            "data": {}
        }


@router.post("/api/plugin/poster/generate")
async def generate_poster_images(request: PosterGenerateRequest):
    """批量生成海报图片"""
    try:
        result = await poster_service.generate_poster_images(
            pages=request.pages,
            full_outline=request.full_outline,
            user_topic=request.user_topic,
            style=request.style,
            session_id=request.session_id,
            canvas_id=request.canvas_id
        )
        if result['success']:
            return {
                "code": 0,
                "message": "success",
                "data": result
            }
        else:
            return {
                "code": 1,
                "message": result['message'],
                "data": {}
            }
    except Exception as e:
        logger.error(f"生成海报图片接口异常: {str(e)}")
        return {
            "code": 1,
            "message": str(e),
            "data": {}
        }
