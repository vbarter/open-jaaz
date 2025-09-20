# services/magic_service.py

# Import necessary modules
import asyncio
import json
import time
import uuid
from typing import Dict, Any, List, Optional

# Import service modules
from models.tool_model import ToolInfoJson
from services.db_service import db_service
from services.config_service import USER_DATA_DIR, DEFAULT_PROVIDERS_CONFIG
# from services.OpenAIAgents_service import create_jaaz_response
from services.new_chat import create_local_response
from services.new_chat.message_media_manager import MessageMediaManager
from services.websocket_service import (
    send_to_websocket,
    send_ai_thinking_status,
    send_image_generation_status,
    send_image_upload_status,
    send_generation_complete,
    process_and_send_images_to_canvas
)  # type: ignore
from services.stream_service import add_stream_task, remove_stream_task
from services.points_service import points_service, InsufficientPointsError
from services.i18n_service import i18n_service
from log import get_logger
from models.config_model import ModelInfo


logger = get_logger(__name__)


def find_model_config(provider: str, model_name: str) -> ModelInfo:
    """
    根据 provider 和 model 名称从 DEFAULT_PROVIDERS_CONFIG 中查找完整的模型配置
    
    Args:
        provider: 模型提供商 (如 'google', 'openai')
        model_name: 模型名称 (如 'gemini-2.5-flash-image')
        
    Returns:
        完整的 ModelInfo 配置
    """
    
    # 首先尝试精确匹配
    if provider in DEFAULT_PROVIDERS_CONFIG:
        provider_config = DEFAULT_PROVIDERS_CONFIG[provider]
        models = provider_config.get('models', {})
        if model_name in models:
            return {
                'provider': provider,
                'model': model_name,
                'url': provider_config.get('url', ''),
                'type': 'text'  # 强制设置为文本类型
            }
            
    # 如果精确匹配失败，尝试模糊匹配
    for config_provider, provider_config in DEFAULT_PROVIDERS_CONFIG.items():
        models = provider_config.get('models', {})
        for config_model in models.keys():
            # 检查模型名称是否包含关键词
            if (provider.lower() in config_provider.lower() or 
                config_provider.lower() in provider.lower() or
                model_name.lower() in config_model.lower() or
                config_model.lower() in model_name.lower()):
                
                logger.info(f"[debug] 模糊匹配成功: {provider}/{model_name} -> {config_provider}/{config_model}")
                return {
                    'provider': config_provider,
                    'model': config_model,
                    'url': provider_config.get('url', ''),
                    'type': 'text'
                }
    
    # 如果都没找到，使用默认配置
    logger.warning(f"[warning] 未找到匹配的模型配置: {provider}/{model_name}，使用默认配置")
    
    # 如果提供商存在，使用该提供商的第一个文本模型
    if provider in DEFAULT_PROVIDERS_CONFIG:
        provider_config = DEFAULT_PROVIDERS_CONFIG[provider]
        models = provider_config.get('models', {})
        text_models = {k: v for k, v in models.items() if v.get('type') == 'text'}
        if text_models:
            first_model = next(iter(text_models.keys()))
            return {
                'provider': provider,
                'model': first_model,
                'url': provider_config.get('url', ''),
                'type': 'text'
            }
    
    # 最后的备选方案：使用 OpenAI
    openai_config = DEFAULT_PROVIDERS_CONFIG.get('openai', {})
    openai_models = openai_config.get('models', {})
    first_openai_model = next(iter(openai_models.keys())) if openai_models else 'gpt-4o-mini'
    
    return {
        'provider': 'openai',
        'model': first_openai_model,
        'url': openai_config.get('url', 'https://api.openai.com/v1'),
        'type': 'text'
    }

async def handle_chat(data: Dict[str, Any]) -> None:
    """
    Handle an incoming magic generation request.

    Workflow:
    - Parse incoming magic generation data.
    - Run Agents.
    - Save magic session and messages to the database.
    - Notify frontend via WebSocket.

    Args:
        data (dict): Magic generation request data containing:
            - messages: list of message dicts
            - session_id: unique session identifier
            - canvas_id: canvas identifier (contextual use)
            - text_model: text model configuration
            - tool_list: list of tool model configurations (images/videos)
    """
    # Extract fields from incoming data
    messages: List[Dict[str, Any]] = data.get('messages', [])
    session_id: str = data.get('session_id', '')
    canvas_id: str = data.get('canvas_id', '')
    template_id: str = data.get('template_id', '')
    user_info: Dict[str, Any] = data.get('user_info', {})
    model_name: str = data.get('model_name', '')
    text_model_data = data.get('text_model')
    aspect_ratio: str = data.get('aspect_ratio', 'auto')
    quantity: int = data.get('quantity', 1)
    
    # 🌐 [I18N] 检测用户语言偏好
    user_language = 'en'  # 默认英文
    try:
        # 方法1: 从用户消息内容检测语言
        if messages:
            latest_message = messages[-1]
            if isinstance(latest_message, dict) and 'content' in latest_message:
                content = latest_message['content']
                if isinstance(content, list) and content:
                    for item in content:
                        if isinstance(item, dict) and item.get('type') == 'text':
                            text_content = item.get('text', '')
                            if text_content:
                                detected_lang = i18n_service.detect_language_from_content(text_content)
                                user_language = detected_lang
                                logger.info(f"🌐 [I18N] 从用户消息检测语言: {user_language} (内容: {text_content[:50]}...)")
                                break
        
        # 方法2: 从请求头检测语言（如果有的话）
        accept_language = data.get('accept_language')
        if accept_language:
            header_lang = i18n_service.detect_language_from_accept_header(accept_language)
            user_language = header_lang
            logger.info(f"🌐 [I18N] 从Accept-Language头检测语言: {user_language}")
        
    except Exception as e:
        logger.warning(f"⚠️ [I18N] 语言检测失败，使用默认英文: {e}")
        user_language = 'en'
    
    logger.info(f"🌐 [I18N] 最终确定用户语言: {user_language}")
    
    # 添加详细的调试信息
    logger.info(f"🔍 [DEBUG] 前端传入的完整请求数据 keys: {list(data.keys())}")
    logger.info(f"🔍 [DEBUG] 前端传入的 model_name: '{model_name}'")
    logger.info(f"🔍 [DEBUG] 前端传入的 text_model: {text_model_data}")


    # 1 最先做意图理解，确认用户想干嘛
    # user_has_drawing_intent: 'text', 'video', 'image'
    user_has_drawing_intent = await _check_video_or_image(messages)

    # 2 根据意图自动选择合适的模型
    model_name, provider = await _auto_select_model_by_intent(user_has_drawing_intent, data)

    logger.info(f"🎯 [DEBUG] 最终选择的模型 - model_name: '{model_name}', provider: '{provider}', intent: '{user_has_drawing_intent}'")
        
    # Validate required fields
    if not session_id or session_id.strip() == '':
        logger.error("[error] session_id is required but missing or empty")
        raise ValueError("session_id is required")
    
    # Extract user information
    user_uuid = user_info.get('uuid') if user_info else None

    # If there is only one message, create a new magic session
    if len(messages) == 1:
        # create new session (只有在session不存在时才创建)
        prompt = messages[0].get('content', '')
        try:
            title = prompt[:200] if isinstance(prompt, str) else ''
            await db_service.create_chat_session(session_id, 'gpt', 'jaaz', canvas_id, user_uuid, title)
        except Exception as e:
            # 如果session已存在，忽略错误
            if "UNIQUE constraint failed" in str(e):
                logger.warn(f"Session {session_id} already exists, skipping creation")
            else:
                raise e

    # 🔥 关键修复：获取历史消息，确保不清空历史对话
    # 先获取当前会话的历史消息（get_chat_history返回已解析的消息列表）
    parsed_history = []
    try:
        chat_history = await db_service.get_chat_history(session_id, user_uuid)
        logger.info(f"[DEBUG] 获取到历史消息数量: {len(chat_history)}")
        
        # get_chat_history已经返回解析后的消息列表，直接使用
        for i, history_message in enumerate(chat_history):
            try:
                # 确保消息格式正确
                if not isinstance(history_message, dict):
                    logger.warning(f"[WARNING] 历史消息 {i} 不是字典格式: {type(history_message)}")
                    continue
                
                # 确保消息有基本字段，如果没有就添加
                if 'timestamp' not in history_message:
                    history_message['timestamp'] = int(time.time() * 1000) - len(chat_history) + i
                
                if 'message_id' not in history_message:
                    history_message['message_id'] = f"{session_id}_{history_message.get('timestamp', i)}_{str(uuid.uuid4())[:8]}"
                
                parsed_history.append(history_message)
                logger.info(f"[DEBUG] 历史消息 {i}: {history_message.get('role', 'unknown')} - {str(history_message.get('content', ''))[:50]}...")
                
            except Exception as e:
                logger.error(f"[ERROR] 处理历史消息 {i} 时出错: {e}, 数据: {history_message}")
                continue
    except Exception as e:
        logger.error(f"[ERROR] 获取历史消息失败: {e}")
        # 如果获取历史失败，使用空历史
    
    # Save user message to database and immediately send to frontend
    enhanced_user_message = None
    if len(messages) > 0:
        # 为用户消息添加唯一时间戳，确保相同内容的消息也能被正确区分
        user_message = messages[-1].copy()  # 创建副本避免修改原消息
        user_message['timestamp'] = int(time.time() * 1000)  # 添加毫秒级时间戳
        user_message['message_id'] = f"{session_id}_{user_message['timestamp']}_{str(uuid.uuid4())[:8]}"  # 添加唯一消息ID
        enhanced_user_message = user_message
        
        await db_service.create_message(
            session_id, user_message.get('role', 'user'), json.dumps(user_message), user_uuid
        )
        
        # 🔥 关键修复：发送包含完整历史的消息列表，保留历史对话
        # 将新用户消息添加到历史消息列表中
        complete_messages = parsed_history + [user_message]
        logger.info(f"[DEBUG] 立即发送用户消息到前端，总消息数: {len(complete_messages)}")
        
        try:
            await send_to_websocket(session_id, {
                'type': 'all_messages',
                'messages': complete_messages,  # 发送完整历史 + 新用户消息
                'canvas_id': canvas_id  # 添加canvas_id支持跨session消息
            }, canvas_id)
            logger.info(f"[DEBUG] ✅ 用户消息发送成功")
            
            # 发送用户消息确认和开始处理状态 - 已删除，不再显示"AI正在思考中"提示
            # await send_user_message_confirmation(
            #     session_id=session_id,
            #     canvas_id=canvas_id,
            #     message=user_message
            # )
        except Exception as e:
            logger.error(f"[ERROR] ❌ 用户消息发送失败: {e}")
            # 即使 WebSocket 发送失败，也要继续处理

    
    logger.info(f"🔍 预检查用户意图: {user_has_drawing_intent}")
    
    # 如果检测到画图意图，立即进行积分检查
    if user_has_drawing_intent in ('video', 'image') and user_info and user_info.get('id') and user_info.get('uuid'):
        try:
            
            if user_has_drawing_intent == 'video':
                logger.info(f"🎯 [DEBUG] 检测到视频意图，进行预积分检查")
                await points_service.check_and_reserve_image_generation_points(user_info.get('id'), user_info.get('uuid'), required_points=5)
            else:
                logger.info(f"🎯 [DEBUG] 检测到画图意图，进行预积分检查")
                await points_service.check_and_reserve_image_generation_points(user_info.get('id'), user_info.get('uuid'), required_points=2)
        except InsufficientPointsError as e:
            logger.warning(f"❌ 积分预检查失败，用户 {user_info.get('id')}: {e.message}")
            
            # 获取用户语言偏好
            user_language = user_info.get('language', 'en') if user_info else 'en'
            
            # 生成多语言的积分不足消息
            insufficient_points_message = i18n_service.get_insufficient_points_message(
                language=user_language,
                current_points=e.current_points,
                required_points=e.required_points,
                show_details=True
            )
            
            logger.info(f"🌍 [DEBUG] 发送积分不足消息 (语言: {user_language}): {insufficient_points_message}")
            
            # 创建AI助手回复消息，而不是错误消息
            assistant_response = {
                'role': 'assistant',
                'content': insufficient_points_message,
                'timestamp': int(time.time() * 1000),
                'message_id': f"{session_id}_{int(time.time() * 1000)}_{str(uuid.uuid4())[:8]}"
            }
            
            # 保存消息到数据库
            user_uuid = user_info.get('uuid') if user_info else None
            if user_uuid:
                await db_service.create_message(session_id, 'assistant', json.dumps(assistant_response), user_uuid)
            
            logger.warning(f"🚨 [CHAT_DEBUG] 积分不足，准备发送错误消息。当前历史消息数: {len(parsed_history)}")
            
            # 🔥 修复：发送完整的消息历史（包括用户消息和错误消息）而不是只发送错误消息
            # 重新获取完整的历史消息（包括刚保存的错误消息）
            try:
                updated_history = await db_service.get_chat_history(session_id, user_uuid or '')
                logger.info(f"✅ [CHAT_DEBUG] 获取到完整历史消息数: {len(updated_history)}")
                
                # 发送完整历史消息到前端，保持聊天连续性
                await send_to_websocket(session_id, {
                    'type': 'all_messages',
                    'messages': updated_history,  # 发送完整历史消息，不会替换聊天
                    'canvas_id': canvas_id
                }, canvas_id)
                
                logger.info(f"✅ [CHAT_DEBUG] 已发送完整历史消息（{len(updated_history)}条），保持聊天连续性")
                
            except Exception as e:
                logger.error(f"❌ [CHAT_DEBUG] 获取完整历史失败，回退到追加模式: {e}")
                
                # 如果获取历史失败，尝试用已有历史 + 错误消息
                complete_messages = parsed_history[:]  # 复制历史消息
                if enhanced_user_message:
                    complete_messages.append(enhanced_user_message)
                complete_messages.append(assistant_response)
                
                await send_to_websocket(session_id, {
                    'type': 'all_messages',
                    'messages': complete_messages,
                    'canvas_id': canvas_id
                }, canvas_id)
                logger.info(f"⚠️ [CHAT_DEBUG] 使用回退方案发送消息（{len(complete_messages)}条）")
            
            # 发送done信号结束处理
            await send_to_websocket(session_id, {'type': 'done', 'canvas_id': canvas_id}, canvas_id)
            return  # 直接返回，不继续处理
        except Exception as e:
            logger.error(f"❌ 画图积分预检查时发生错误: {e}")
            await send_to_websocket(session_id, {
                'type': 'error',
                'error': '系统错误，暂时无法处理画图请求',
                'error_code': 'system_error',
                'canvas_id': canvas_id
            }, canvas_id)
            await send_to_websocket(session_id, {'type': 'done', 'canvas_id': canvas_id}, canvas_id)
            return

    # 如果是模版生成，先发送一张图片到前端
    if template_id:
        # 先推送用户上传的图片到前端显示
        await _push_user_images_to_frontend(messages, session_id, template_id, canvas_id)

    # Create and start magic generation task
    task = asyncio.create_task(_process_generation(messages,
                                                   session_id,
                                                   canvas_id,
                                                   model_name,
                                                   user_uuid,
                                                   user_info,
                                                   enhanced_user_message,
                                                   user_has_drawing_intent,
                                                   user_language,
                                                   provider,
                                                   aspect_ratio,
                                                   quantity))

    # Register the task in stream_tasks (for possible cancellation)
    add_stream_task(session_id, task)
    try:
        # Await completion of the magic generation task
        await task
    except asyncio.exceptions.CancelledError:
        logger.warn(f"🛑Magic generation session {session_id} cancelled")
    finally:
        # Always remove the task from stream_tasks after completion/cancellation
        remove_stream_task(session_id)
        # Notify frontend WebSocket that magic generation is done
        await send_to_websocket(session_id, {'type': 'done', 'canvas_id': canvas_id}, canvas_id)
        


async def _push_user_images_to_frontend(messages: List[Dict[str, Any]], session_id: str, template_id: str, canvas_id: str) -> None:
    """
    推送用户上传的图片到前端canvas页面显示

    Args:
        messages: 用户消息列表
        session_id: 会话ID
        template_id: 模板ID
        canvas_id: 画布ID
    """
    try:
        # 获取最后一条用户消息
        if not messages:
            return
            
        user_message = messages[-1]
        if user_message.get('role') != 'user':
            return
            
        content = user_message.get('content', [])
        if not isinstance(content, list):
            return
            
        # 提取所有图片内容
        user_images = []
        text_content = ""

        # 根据template_id获取template_name
        template_name = "未知模板"
        if template_id:
            try:
                from routers.templates_router import TEMPLATES
                template_id_int = int(template_id)
                template = next((t for t in TEMPLATES if t["id"] == template_id_int), None)
                if template:
                    template_name = template.get("title", "未知模板")
            except (ValueError, ImportError):
                logger.error("出错了...")
        
        for content_item in content:
            if content_item.get('type') == 'image_url':
                image_url = content_item.get('image_url', {}).get('url', '')
                if image_url:
                    user_images.append({
                        'type': 'image_url',
                        'image_url': {'url': image_url}
                    })
            elif content_item.get('type') == 'text':
                text_content = content_item.get('text', '')
        
        if user_images:
            # 构造包含用户图片的消息
            user_image_message = {
                'role': 'user',
                'content': [
                    {
                        'type': 'text',
                        'text': f'📸 使用模版: {template_name} 画图'
                    }
                ] + user_images
            }
            
            # 通过websocket推送到前端
            await send_to_websocket(session_id, {
                'type': 'user_images',
                'message': user_image_message,
                'canvas_id': canvas_id
            }, canvas_id)
            
            logger.info(f"✅ 已推送 {len(user_images)} 张用户图片到前端")
            
    except Exception as e:
        logger.error(f"❌ 推送用户图片失败: {e}")


async def _process_generation(
    messages: List[Dict[str, Any]],
    session_id: str,
    canvas_id: str,
    model_name: str,
    user_uuid: Optional[str] = None,
    user_info: Optional[Dict[str, Any]] = None,
    enhanced_user_message: Optional[Dict[str, Any]] = None,
    user_has_drawing_intent: str = "text",
    user_language: str = 'en',
    provider: str = 'openai',
    aspect_ratio: str = 'auto',
    quantity: int = 1
) -> None:
    """
    Process generation in a separate async task.

    Args:
        messages: List of messages
        session_id: Session ID
        canvas_id: Canvas ID
    """

    # 初始化变量
    has_image = False
    ai_response = {}
    
    try:
        logger.info(f"🔍 [DEBUG] 开始处理生成: {model_name}, provider: {provider}")
        # 1. 发送AI思考状态
        await send_ai_thinking_status(session_id=session_id, canvas_id=canvas_id)
        
        # 2. 发送图片生成状态
        await send_image_generation_status(session_id=session_id, canvas_id=canvas_id)
        
        # 3. 执行AI生成
        # 原来是基于云端生成
        # ai_response = await create_jaaz_response(messages, session_id, canvas_id)
        ai_response = await create_local_response(messages,
                                                  session_id,
                                                  canvas_id,
                                                  model_name,
                                                  user_info,
                                                  provider=provider,
                                                  aspect_ratio=aspect_ratio,
                                                  quantity=quantity,
                                                  user_has_drawing_intent=user_has_drawing_intent)
        
        # 4. 检查生成结果是否包含图片，或者检查用户是否有画图意图
        logger.info(f"🔍 [DEBUG] 检查AI响应内容: {str(ai_response.get('content', ''))[:200]}...")
        
        # 检查是否实际生成了图片
        has_generated_image = False
        content = ai_response.get('content', '')
        if isinstance(content, str):
            # 检查多种图片格式: ![image_id:...] 或 ![image](URL) 或 ![任何内容](URL)
            has_generated_image = ('![image_id:' in content or 
                                   '![image](' in content or 
                                   (content.count('![') > 0 and content.count('](') > 0))
        
        # 🆕 [CHAT_DUAL_DISPLAY] AI响应内容检查，现在支持markdown图片格式用于聊天显示
        ai_response_content = ai_response.get('content', '')
        logger.info(f"🖼️ [CHAT_DUAL_DISPLAY] AI响应内容预览: {str(ai_response_content)[:100]}...")
        
        # 检查：确认AI响应是否包含markdown图片格式（这在双重显示模式下是正常的）
        if isinstance(ai_response_content, str) and ('![' in ai_response_content and '](' in ai_response_content):
            logger.info(f"✅ [CHAT_DUAL_DISPLAY] AI响应包含markdown图片，用于聊天显示（正常）")
        
        # 🔧 [FIX] 移除重复保存标志，改用统一保存逻辑
        
        # 🎯 新逻辑：如果用户有画图意图且积分检查已通过，直接扣除积分
        if user_info and user_info.get('id') and user_info.get('uuid'):
            logger.info(f"🎯 [DEBUG] 用户有画图意图且积分已预检查通过，进行积分扣除")
            try:
                # 扣除积分（积分检查已在主函数中完成）
                if user_has_drawing_intent == 'video':
                    deduction_result = await points_service.deduct_image_generation_points(
                        user_id=user_info.get('id'),
                        user_uuid=user_info.get('uuid'),
                        session_id=session_id,
                        deduction_points=5
                    )
                else:
                    deduction_result = await points_service.deduct_image_generation_points(
                        user_id=user_info.get('id'),
                        user_uuid=user_info.get('uuid'),
                        session_id=session_id,
                        deduction_points=2
                    )
                
                if deduction_result['success']:
                    logger.info(f"✅ 聊天画图积分扣除成功: {deduction_result['message']}")
                    has_image = True
                    # 发送图片上传状态
                    await send_image_upload_status(session_id=session_id, canvas_id=canvas_id)
                    
                    # 🔧 [FIX] 移除第一分支的重复图片保存逻辑
                    # 图片保存将在后续的统一位置处理，避免重复保存
                    if has_generated_image and canvas_id:
                        logger.info(f"🖼️ [DEBUG] 第一分支：检测到图片生成，标记待保存")
                    
                    # 根据是否实际生成图片调整消息
                    if has_generated_image:
                        message_text = f"生成图片完成，扣除{deduction_result['points_deducted']}积分，剩余{deduction_result['balance_after']}积分"
                    else:
                        message_text = f"画图请求已处理，扣除{deduction_result['points_deducted']}积分，剩余{deduction_result['balance_after']}积分"
                    
                    # 通过WebSocket通知前端积分变化
                    notification_message = {
                        'type': 'points_deducted',
                        'points_deducted': deduction_result['points_deducted'],
                        'balance_after': deduction_result['balance_after'],
                        'message': message_text
                    }
                    logger.info(f"📡 [DEBUG] 准备发送积分扣除通知: {notification_message}")
                    
                    await send_to_websocket(session_id, notification_message, canvas_id)
                    logger.info(f"📡 [DEBUG] 积分扣除通知已发送到session: {session_id}")
                else:
                    logger.error(f"❌ 聊天画图积分扣除失败: {deduction_result['message']}")
                    
            except Exception as e:
                logger.error(f"❌ 聊天画图扣除积分时发生错误: {e}")
        
    except Exception as e:
        logger.error(f"[ERROR] 生成过程出错: {e}")
        # 发送错误状态
        from services.websocket_service import send_generation_status
        await send_generation_status(
            session_id=session_id,
            canvas_id=canvas_id,
            status='error',
            message=f'生成失败: {str(e)}',
            progress=0.0
        )
        raise

    # 🆕 使用MessageMediaManager处理媒体内容累积
    # 先获取最新的assistant消息（如果存在）
    existing_assistant_message = None
    try:
        recent_history = await db_service.get_chat_history(session_id, user_uuid or '', limit=5)
        # 查找最近的assistant消息
        for msg in reversed(recent_history):
            if msg.get('role') == 'assistant':
                # 检查是否是在同一个会话中的消息（时间差小于5分钟）
                if 'timestamp' in msg:
                    time_diff = int(time.time() * 1000) - msg.get('timestamp', 0)
                    if time_diff < 300000:  # 5分钟内
                        existing_assistant_message = msg
                        logger.info(f"🔄 Found recent assistant message to merge media: {msg.get('message_id')}")
                        break
    except Exception as e:
        logger.warning(f"Failed to get recent history for media merge: {e}")

    # 确定媒体类型
    media_type = None
    media_url = None
    media_metadata = None

    if ai_response.get('type') == 'video' and ai_response.get('video_url'):
        media_type = 'video'
        media_url = ai_response.get('video_url')
        media_metadata = ai_response.get('metadata')
    elif ai_response.get('type') == 'image' or ('![' in ai_response.get('content', '')):
        media_type = 'image'
        # 从content中提取图片URL
        content = ai_response.get('content', '')
        import re
        img_pattern = r'!\[.*?\]\((.*?)\)'
        img_matches = re.findall(img_pattern, content)
        if img_matches:
            media_url = img_matches[0]

    # 使用MessageMediaManager创建或更新消息
    if existing_assistant_message and media_type and media_url:
        # 合并到现有消息
        ai_response_with_id = MessageMediaManager.merge_media_content(
            base_message=existing_assistant_message,
            new_media_type=media_type,
            new_media_url=media_url,
            new_media_metadata=media_metadata
        )
        # 更新content（追加新内容）
        if ai_response.get('content'):
            existing_content = ai_response_with_id.get('content', '')
            new_content = ai_response.get('content', '')
            # 避免重复的内容
            if new_content not in existing_content:
                ai_response_with_id['content'] = f"{existing_content}\n\n{new_content}".strip()
        logger.info(f"✅ Merged {media_type} to existing message")
    else:
        # 创建新消息
        ai_response_with_id = MessageMediaManager.create_media_message(
            role='assistant',
            content=ai_response.get('content', ''),
            media_type=media_type,
            media_url=media_url,
            media_metadata=media_metadata
        )
        # 添加时间戳和ID
        ai_response_with_id['timestamp'] = int(time.time() * 1000)
        ai_response_with_id['message_id'] = f"{session_id}_{ai_response_with_id['timestamp']}_{str(uuid.uuid4())[:8]}"
        logger.info(f"✅ Created new message with {media_type if media_type else 'text'}")

    # Save AI response to database
    await db_service.create_message(session_id, 'assistant', json.dumps(ai_response_with_id), user_uuid)

    # 🔥 关键修复：再次获取历史消息（包括刚才保存的AI响应），发送完整对话
    # 重新获取完整历史，包括刚保存的AI响应（get_chat_history返回已解析的消息列表）
    final_parsed_history = []
    try:
        updated_chat_history = await db_service.get_chat_history(session_id, user_uuid or '')
        logger.info(f"[DEBUG] AI响应后获取到历史消息数量: {len(updated_chat_history)}")

        # get_chat_history已经返回解析后的消息列表，直接使用
        for i, history_message in enumerate(updated_chat_history):
            try:
                # 确保消息格式正确
                if not isinstance(history_message, dict):
                    logger.warning(f"[WARNING] AI响应后历史消息 {i} 不是字典格式: {type(history_message)}")
                    continue

                # 确保消息有基本字段，如果没有就添加
                if 'timestamp' not in history_message:
                    history_message['timestamp'] = int(time.time() * 1000) - len(updated_chat_history) + i

                if 'message_id' not in history_message:
                    history_message['message_id'] = f"{session_id}_{history_message.get('timestamp', i)}_{str(uuid.uuid4())[:8]}"

                # 🔥 关键修复：如果是最后一条消息且是assistant消息，用完整的AI响应替换
                # 这确保视频类型的消息保留所有字段
                if i == len(updated_chat_history) - 1 and history_message.get('role') == 'assistant':
                    # 使用完整的AI响应，确保包含type, video_url等字段
                    final_parsed_history.append(ai_response_with_id)
                    logger.info(f"[DEBUG] 使用完整AI响应替换最后一条消息，包含视频字段: type={ai_response_with_id.get('type')}, video_url={ai_response_with_id.get('video_url')}")
                else:
                    final_parsed_history.append(history_message)
                    logger.info(f"[DEBUG] AI响应后历史消息 {i}: {history_message.get('role', 'unknown')} - {str(history_message.get('content', ''))[:50]}...")

            except Exception as e:
                logger.error(f"[ERROR] 处理AI响应后历史消息 {i} 时出错: {e}, 数据: {history_message}")
                continue
    except Exception as e:
        logger.error(f"[ERROR] 获取AI响应后历史消息失败: {e}")
        # 如果获取失败，至少发送AI响应
        final_parsed_history = [ai_response_with_id]
    
    # 🆕 [CHAT_DUAL_DISPLAY] WebSocket发送日志，现在消息支持包含图片用于聊天显示
    logger.info(f"🔗 [CHAT_DUAL_DISPLAY] 发送WebSocket消息: session_id={session_id}, 消息数量={len(final_parsed_history)}")
    
    # 检查：记录发送的消息是否包含图片内容（这在双重显示模式下是正常的）
    for i, msg in enumerate(final_parsed_history):
        msg_content = str(msg.get('content', ''))
        if '![' in msg_content and '](' in msg_content:
            logger.info(f"✅ [CHAT_DUAL_DISPLAY] WebSocket消息 {i} 包含markdown图片，用于聊天显示: {msg_content[:100]}...")
    
    # 发送包含完整历史的消息列表（包括用户消息和AI响应）
    await send_to_websocket(session_id, {
        'type': 'all_messages',
        'messages': final_parsed_history,
        'canvas_id': canvas_id
    }, canvas_id)
    
    # 🆕 [CHAT_DUAL_DISPLAY] 不需要从聊天内容中提取图片，因为采用双重显示架构
    # 1. 图片生成服务已经调用save_image_to_canvas直接保存到画布
    # 2. 聊天中的markdown图片只用于用户预览，不需要额外处理
    logger.info(f"🖼️ [CHAT_DUAL_DISPLAY] 双重显示架构：画布由生成服务直接处理，聊天显示用于用户预览")
    
    # 发送生成完成状态
    await send_generation_complete(
        session_id=session_id,
        canvas_id=canvas_id,
        result_data={
            'message_count': len(final_parsed_history),
            'has_image': has_image,
            'ai_response': ai_response_with_id
        }
    )


async def _auto_select_model_by_intent(intent: str, data: Dict[str, Any]) -> tuple[str, str]:
    """
    根据意图自动选择合适的模型

    Args:
        intent: 用户意图 ('text' | 'image' | 'video')
        data: 请求数据，包含前端传入的模型选择和用户信息

    Returns:
        tuple[str, str]: (model_name, provider)
    """
    from services.config_service import config_service
    from services.tool_service import tool_service
    from services.db_service import db_service

    config = config_service.get_config()

    # 获取用户信息
    user_info = data.get('user_info', {})
    user_uuid = user_info.get('uuid') if user_info else None

    # 获取前端传入的模型选择（兼容性处理）
    text_model_data = data.get('text_model', {})
    selected_tools = data.get('selected_tools', [])
    selected_image_tool = data.get('selected_image_tool', {})
    selected_video_tool = data.get('selected_video_tool', {})

    # 从数据库获取用户保存的模型配置
    user_saved_models = None
    if user_uuid:
        try:
            user_saved_models = await db_service.get_user_models(user_uuid)
            if user_saved_models:
                logger.info(f"📥 [Model Selection] 从数据库加载用户保存的模型配置: {user_saved_models}")
        except Exception as e:
            logger.warning(f"⚠️ [Model Selection] 获取用户模型配置失败: {e}")

    logger.info(f"🎯 [Model Selection] 开始根据意图选择模型 - 意图: {intent}")
    logger.info(f"🎯 [Model Selection] 前端传入数据 - text_model: {text_model_data}, selected_tools: {selected_tools}")
    logger.info(f"🎯 [Model Selection] 前端传入数据 - image_tool: {selected_image_tool}, video_tool: {selected_video_tool}")

    if intent == 'text':
        if user_saved_models and isinstance(user_saved_models, dict):
            saved_text_model = user_saved_models.get('text_model', {})
            if saved_text_model and saved_text_model.get('type') == 'text':
                provider = saved_text_model.get('provider', '')
                model_name = saved_text_model.get('model') or saved_text_model.get('display_name', '')
                if model_name and provider:
                    logger.info(f"💾 [Model Selection] 使用用户保存的文本模型: {model_name} ({provider})")
                    return model_name, provider
        # 3. 使用默认文本模型
        default_model = 'gpt-4o'
        default_provider = 'openai'
        logger.info(f"⚠️ [Model Selection] 使用默认文本模型: {default_model} ({default_provider})")
        return default_model, default_provider

    elif intent == 'image':
        # 3. 尝试使用用户保存的图像工具配置
        if user_saved_models and isinstance(user_saved_models, dict):
            saved_image_tool = user_saved_models.get('selected_image_tool', {})
            if saved_image_tool and saved_image_tool.get('type') == 'image':
                provider = saved_image_tool.get('provider', '')
                model_name = saved_image_tool.get('display_name', '')
                if model_name and provider:
                    logger.info(f"💾 [Model Selection] 使用用户保存的图像工具: {tool_id} ({provider})")
                    return model_name, provider

        default_model = 'gemini-2.5-flash-image'
        default_provider = 'google'
        logger.info(f"⚠️ [Model Selection] 使用默认文本模型: {default_model} ({default_provider})")
        return default_model, default_provider

    elif intent == 'video':
        # 3. 尝试使用用户保存的视频工具配置
        if user_saved_models and isinstance(user_saved_models, dict):
            saved_video_tool = user_saved_models.get('selected_video_tool', {})
            if saved_video_tool and saved_video_tool.get('type') == 'video':
                provider = saved_video_tool.get('provider', '')
                model_name = saved_video_tool.get('display_name', '')
                if model_name and provider:
                    if model_name == 'veo3-fast':
                        provider = 'yunwu'
                        model_name = 'veo3-fast-frames'
                    logger.info(f"💾 [Model Selection] 使用用户保存的视频工具: {model_name} ({provider})")
                    return model_name, provider

        default_model = 'veo3-fast-frames'
        default_provider = 'yunwu'
        logger.warning(f"💾 [Model Selection] 没有找到可用的视频工具，使用默认: {default_model} ({default_provider})")
        return default_model, default_provider
    elif intent == 'url':
        return 'gemini-2.5-flash', 'google'

    # 默认返回文本模型
    logger.warning(f"⚠️ [Model Selection] 意图无法识别: {intent}，使用默认文本模型")
    return 'gpt-4o', 'openai'


async def _check_video_or_image(messages: List[Dict[str, Any]]) -> str:
    """
    检查用户消息是否包含视频或图片生成意图

    Args:
        messages: 用户消息列表

    Returns:
        str: 'video' | 'image' | 'text'
    """
    if not messages:
        return 'text'
    
    # 获取最后一条用户消息
    last_message = messages[-1]
    if last_message.get('role') != 'user':
        return 'text'
    
    content: str = last_message.get('content', '')
    
    # 检查是否包含图片
    has_image = False
    text_content: str = ''
    
    if isinstance(content, list):
        for item in content:
            if item.get('type') == 'image_url':
                has_image = True
            elif item.get('type') == 'text':
                text_content += item.get('text', '') + ' '
        text_content = text_content.strip()
    else:
        text_content = content

    if not text_content:
        return 'text'
    
    from openai import AsyncOpenAI

    intent_client = AsyncOpenAI(
                api_key="sk-l3f6rcO4mZ3EZBLlUr6Gw7UHAszGOTQClJInVpUa6cgGezjp",
                base_url="https://api.apiplus.org/v1",
                timeout=30.0,
                max_retries=0
    )

    # 策略1: 如果有图片，肯定是图片或视频生成
    if has_image:
        # 通过文本内容判断是视频还是图片
        prompt = f"""
你是用户意图识别专家。请分析用户输入，判断用户想要图片生成、视频生成还是文本问答。
**分析思路：**
1. **识别核心动词**：
   - 创作类动词（画、生成、制作、设计）→ 视觉生成需求
   - 询问类动词（问、解释、告诉、帮助）→ 文本问答需求
2. **判断媒体类型**：
   - 静态描述词（一张图、画面、海报、logo）→ image
   - 动态描述词（视频、动画、播放、动作序列）→ video  
   - 无媒体需求（纯信息咨询、知识问答）→ text
3. **语境确认**：
   - 有具体视觉要求 → image/video
   - 纯粹信息需求 → text
**输出规则：**
- 图片生成需求：输出 image
- 视频生成需求：输出 video  
- 文本问答需求：输出 text
- 只输出一个英文单词，无需其他解释
现在分析: {text_content}
"""
        
        response = await intent_client.chat.completions.create(
                         model="gpt-5-2025-08-07",
                         messages=[{"role": "user", "content": prompt}],
                         max_tokens=2000,
                         temperature=0.1)

        result = response.choices[0].message.content.strip().lower()
        logger.info(f"🔍 [DEBUG] 带图片上传，意图识别结果: {result}")
        # 确保返回有效的意图
        if result not in ['video', 'image']:
            return 'image'  # 默认返回文本意图
        return result
    else:
        # 通过文本内容判断是视频还是图片
        prompt = f"""
你是用户意图识别专家。请分析用户输入，判断用户想要链接处理、图片生成、视频生成还是文本问答。

**分析思路：**

1. **识别链接内容**：
   - 包含http/https协议的完整URL → url
   - 包含域名格式（如xxx.com、xxx.cn）→ url
   - 明确提到"链接"、"网址"、"网站"、"打开"等 → url

2. **识别核心动词**：
   - 创作类动词（画、生成、制作、设计）→ 视觉生成需求
   - 询问类动词（问、解释、告诉、帮助）→ 文本问答需求

3. **判断媒体类型**：
   - 静态描述词（一张图、画面、海报、logo）→ image
   - 动态描述词（视频、动画、播放、动作序列）→ video  
   - 无媒体需求（纯信息咨询、知识问答）→ text

4. **语境确认**：
   - 涉及链接处理 → url
   - 有具体视觉要求 → image/video
   - 纯粹信息需求 → text

**输出规则：**
- 链接处理需求：输出 url
- 图片生成需求：输出 image
- 视频生成需求：输出 video  
- 文本问答需求：输出 text
- 只输出一个英文单词，无需其他解释

现在分析："{text_content}"
"""
        
        response = await intent_client.chat.completions.create(
                         model="gpt-5-2025-08-07",
                         messages=[{"role": "user", "content": prompt}],
                         max_tokens=2000,
                         temperature=0.1)

        result = response.choices[0].message.content.strip().lower()
        logger.info(f"🔍 [DEBUG] 不带图片上传，意图识别结果: {result}")
        # 确保返回有效的意图
        if result not in ['video', 'image', 'text', 'url']:
            return 'text'  # 默认返回文本意图
        return result