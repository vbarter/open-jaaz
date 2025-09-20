# services/OpenAIAgents_service/jaaz_agent.py

from typing import Dict, Any, List, Optional
import asyncio
import os
from nanoid import generate
from tools.utils.image_canvas_utils import save_image_to_canvas
from tools.utils.image_utils import get_image_info_and_save
from services.config_service import get_user_files_dir
from utils.cos_image_service import get_cos_image_service
from common import DEFAULT_PORT, BASE_URL
from ..magic_draw_service import MagicDrawService
from services.new_chat.tuzi_llm_service import TuziLLMService
from routers.templates_router import TEMPLATES
from services.i18n_service import i18n_service
from log import get_logger

logger = get_logger(__name__)


async def create_local_magic_response(messages: List[Dict[str, Any]],
                                      session_id: str = "",
                                      canvas_id: str = "",
                                      system_prompt: str = "",
                                      template_id: str = "",
                                      user_info: Optional[Dict[str, Any]] = None,
                                      aspect_ratio: str = "auto",
                                      quantity: int = 1,
                                      model_name: str = "",
                                      provider: str = "") -> Dict[str, Any]:
    """
    本地的魔法生成功能
    实现和 magic_agent 相同的功能
    """
    try:
        # 获取图片内容
        user_message: Dict[str, Any] = messages[-1]
        image_content: str = ""
        
        # 创建服务实例
        try:
            if template_id == "1":
                magic_draw_service = TuziLLMService(provider=provider)
            else:
                if isinstance(user_message.get('content'), list):
                    for content_item in user_message['content']:
                        if content_item.get('type') == 'image_url':
                            image_content = content_item.get(
                                'image_url', {}).get('url', "")
                            break

                if not image_content:
                    return {
                        'role': 'assistant',
                        'content': '✨ not found input image'
                    }
                magic_draw_service = MagicDrawService()
        except ValueError as e:
            logger.error(f"❌ magic service configuration error: {e}")
            return {
                'role': 'assistant',
                'content': '✨ Cloud API Key not configured'
            }

        # 获取用户提示词
        user_prompt = ""
        if isinstance(user_message.get('content'), list):
            for content_item in user_message['content']:
                if content_item.get('type') == 'text':
                    user_prompt = content_item.get('text', '')
                    break
        elif isinstance(user_message.get('content'), str):
            user_prompt = user_message.get('content', '')

        # 调用tuzi服务生成魔法图像
        if not template_id:
            result = await magic_draw_service.generate_magic_image(system_prompt, 
                                                                   image_content, 
                                                                   user_info, 
                                                                   aspect_ratio, 
                                                                   quantity)
        elif template_id == "1":
            result = await magic_draw_service.generate(model_name,
                                            user_prompt,
                                            None,
                                            user_info,
                                            aspect_ratio=aspect_ratio or "9:16",
                                            quantity=quantity,
                                            user_has_drawing_intent="url",
                                            user_language="en")
        else:
            # 如果有template_id，从TEMPLATES获取对应的prompt
            template_prompt = ""
            template_image = ""
            use_mask = 0
            is_image = 0
            try:
                template_id_int = int(template_id)
                template = next((t for t in TEMPLATES if t["id"] == template_id_int), None)
                if template:
                    template_prompt = template.get("prompt", "")
                    template_image = str(template.get("image", ""))
                    use_mask = int(template.get("use_mask", 0) or 0)
                    is_image = int(template.get("is_image", 0) or 0)
                    logger.info(f"✅ 找到模板prompt: {template_prompt}")
                else:
                    logger.error(f"❌ 未找到模板ID: {template_id}")
                    template_prompt = user_prompt  # 如果没找到模板，使用用户输入
            except ValueError:
                logger.error(f"❌ 无效的模板ID: {template_id}")
                template_prompt = user_prompt  # 如果模板ID无效，使用用户输入

            
            if user_prompt and user_prompt.strip() != "":
                final_prompt = str(user_prompt.strip())
                logger.info(f"✅ 使用用户提示词: {final_prompt}")
            else:
                final_prompt = str(template_prompt if template_prompt else "")
                logger.info(f"✅ 使用模版提示词: {final_prompt}")
            result = await magic_draw_service.generate_template_image(final_prompt, 
                                                                      image_content, 
                                                                      template_image, 
                                                                      user_info, 
                                                                      use_mask, 
                                                                      is_image, 
                                                                      session_id, 
                                                                      aspect_ratio, 
                                                                      quantity)
        
        ######################
        if not result:
            return {
                'role': 'assistant',
                'content': '✨ Magic generation failed'
            }

        # 检查是否有错误
        if result.get('error'):
            error_msg = result['error']
            logger.error(f"❌ Magic generation error: {error_msg}")
            from utils.error_messages import get_user_friendly_error
            return {
                'role': 'assistant',
                'content': get_user_friendly_error(error_msg)
            }

        # 检查是否有结果 URL
        if not result.get('result_url'):
            return {
                'role': 'assistant',
                'content': '✨ Magic generation failed: No result URL'
            }

        # 初始化变量
        filename = ""
        cos_url = None
        result_url = result['result_url']
        image_url = result_url

        # 保存图片到画布
        if session_id and canvas_id:
            try:
                # 生成唯一文件名
                file_id = generate(size=10)
                
                # 获取用户文件目录
                user_email = user_info.get('email') if user_info else None
                user_id = user_info.get('uuid') if user_info else None
                user_files_dir = get_user_files_dir(user_email=user_email, user_id=user_id)
                file_path_without_extension = os.path.join(user_files_dir, file_id)

                # 下载并保存图片到本地临时文件
                mime_type, width, height, extension = await get_image_info_and_save(
                    image_url, file_path_without_extension, is_b64=False
                )

                width = max(1, int(width / 2))
                height = max(1, int(height / 2))

                # 生成文件名（用作腾讯云key）
                filename = f'{file_id}.{extension}'
                local_file_path = f"{file_path_without_extension}.{extension}"
                
                # 尝试上传到腾讯云
                cos_service = get_cos_image_service()
                cos_url = await cos_service.upload_image_from_file(
                    local_file_path=local_file_path,
                    image_key=filename,
                    content_type=mime_type,
                    delete_local=cos_service.available  # 只有在腾讯云可用时才删除本地文件
                )
                
                if cos_url:
                    logger.info(f"✅ 图片已上传到腾讯云: {filename} -> {cos_url}")
                else:
                    logger.info(f"📁 腾讯云不可用，图片保存在本地: {filename}")
                    cos_url = None  # 确保cos_url为None，后续逻辑会使用本地URL

                # 保存图片到画布，传递已有的腾讯云URL避免重复上传
                image_url = await save_image_to_canvas(session_id, canvas_id, filename, mime_type, width, height, cos_url)
                print(f"✨ 图片已保存到画布: {filename}")
            except Exception as e:
                print(f"❌ 保存图片到画布失败: {e}")

        # 🔧 [CHAT_FIX] 使用腾讯云URL或者画布返回的URL，但不在聊天中显示图片
        final_image_url = cos_url if cos_url else f"{BASE_URL}{image_url}"
        
        # 📝 [CHAT_DEBUG] 记录图片URL信息
        logger.info(f"🖼️ [CHAT_DEBUG] Magic图片处理完成: filename={filename}")
        logger.info(f"🖼️ [CHAT_DEBUG] 最终图片URL: {final_image_url}")
        logger.info(f"🖼️ [CHAT_DEBUG] 使用腾讯云: {cos_url is not None}")
        
        # 🆕 [CHAT_DUAL_DISPLAY] 实现聊天+画布双重显示
        # 聊天中显示腾讯云图片，画布中显示完整图片元素
        
        # 🎯 Magic Generation专用：使用本地代理URL避免Canvas跨域污染
        # Magic Generation主要用于Canvas，不是纯聊天，所以优先避免跨域问题
        from utils.url_converter import get_canvas_image_url
        display_image_url = get_canvas_image_url(filename)
        
        logger.info(f"🖼️ [MAGIC_GENERATION] Magic图片生成完成:")
        logger.info(f"   🎨 显示URL: {display_image_url}")
        logger.info(f"   🖼️ Canvas已通过save_image_to_canvas显示")
        logger.info(f"   ☁️ 腾讯云备份: {cos_url is not None}")
        logger.info(f"   🛡️ 使用代理URL避免Canvas跨域污染")
        
        # Magic Generation响应：使用代理URL避免Canvas跨域问题
        generated_message = i18n_service.get_image_generated_message('en')
        return {
            'role': 'assistant',
            'content': f'{generated_message}\n\n![{filename}]({display_image_url})'
        }
        

    except (asyncio.TimeoutError, Exception) as e:
        # 检查是否是超时相关的错误
        error_msg = str(e).lower()
        if 'timeout' in error_msg or 'timed out' in error_msg:
            return {
                'role': 'assistant',
                'content': '✨ time out'
            }
        else:
            print(f"❌ 创建魔法回复时出错: {e}")
            from utils.error_messages import get_user_friendly_error
            return {
                'role': 'assistant',
                'content': get_user_friendly_error(str(e))
            }

if __name__ == "__main__":
    asyncio.run(create_local_magic_response([]))
