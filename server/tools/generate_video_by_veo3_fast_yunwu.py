from typing import Annotated
from xmlrpc.client import boolean
from pydantic import BaseModel, Field
from langchain_core.tools import tool, InjectedToolCallId  # type: ignore
from langchain_core.runnables import RunnableConfig
from services.new_chat.tuzi_llm_service import TuziLLMService
from tools.video_generation.video_canvas_utils import send_video_start_notification, process_video_result
from services.tool_confirmation_manager import tool_confirmation_manager
from services.websocket_service import send_to_websocket
import json

class GenerateVideoByVeo3FastInputSchema(BaseModel):
    prompt: str = Field(
        description="Required. The prompt for video generation. Describe what you want to see in the video."
    )
    aspect_ratio: str = Field(
        default="9:16",
        description="Optional. The aspect ratio of the video. Allowed values: 1:1, 16:9, 4:3, 21:9"
    )
    enhance_prompt: boolean = Field(
        default=True,
        description="由于 veo 只支持英文提示词，所以如果需要中文自动转成英文提示词，可以开启此开关"
    )
    enable_upsample: boolean = Field(
        default=True,
        description="超分"
    )
    images: list[str] = Field(
        description="当模型是带 veo2-fast-frames 最多支持两个，分别是首尾帧，当模型是 veo3-pro-frames 最多支持一个首帧，当模型是 veo2-fast-components 最多支持 3 个，此时图片为视频中的元素"
    )
    tool_call_id: Annotated[str, InjectedToolCallId]


@tool("generate_video_by_veo3_fast_yunwu",
      description="Generate high-quality videos using Veo3 Fast model. Fast text-to-video generation with optimized performance.",
      args_schema=GenerateVideoByVeo3FastInputSchema)
async def generate_video_by_veo3_fast_yunwu(
    prompt: str,
    config: RunnableConfig,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> str:
    """
    Generate a video using Veo3 Fast model via yunwu service
    """
    print(f'🛠️ Veo3 Fast Video Generation tool_call_id: {tool_call_id}')
    ctx = config.get('configurable', {})
    canvas_id = ctx.get('canvas_id', '')
    session_id = ctx.get('session_id', '')
    print(f'🛠️ canvas_id {canvas_id} session_id {session_id}')

        # 检查是否需要确认
    arguments = {
        'prompt': prompt,
    }

    # 发送确认请求
    await send_to_websocket(session_id, {
        'type': 'tool_call_pending_confirmation',
        'id': tool_call_id,
        'name': 'generate_video_by_veo3_fast_yunwu',
        'arguments': json.dumps(arguments)
    })

    # 等待确认
    confirmed = await tool_confirmation_manager.request_confirmation(
        tool_call_id, session_id, 'generate_video_by_veo3_fast_yunwu', arguments
    )

    if not confirmed:
        return "Video generation cancelled by user."

    # Inject the tool call id into the context
    ctx['tool_call_id'] = tool_call_id

    try:
        # Send start notification
        await send_video_start_notification(
            session_id,
            f"Starting Veo3 Fast video generation..."
        )

        # Create Jaaz service and generate video
        tuzi_service = TuziLLMService()
        result = await tuzi_service.generate_video(
            prompt=prompt,
            model="veo3-fast",
        )

        video_url = result.get('result_url')
        if not video_url:
            raise Exception("No video URL returned from generation")

        # Process video result (save, update canvas, notify)
        return await process_video_result(
            video_url=video_url,
            session_id=session_id,
            canvas_id=canvas_id,
            provider_name="google",
        )

    except Exception as e:
        print(f"Error in Veo3 Fast video generation: {e}")
        raise e


# Export the tool for easy import
__all__ = ["generate_video_by_veo3_fast_yunwu"]
