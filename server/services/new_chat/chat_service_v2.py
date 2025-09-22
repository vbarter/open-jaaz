"""
Enhanced Chat Service using Incremental Message System
Implements clean architecture with dependency injection
"""
import asyncio
import json
from typing import Dict, Any, List, Optional
from datetime import datetime

from .incremental_message_service import get_incremental_message_service
from .message_event_publisher import get_message_event_publisher
from .models import MessageFactory, MessageRole, MessageStatus, MediaType
from .logic_agent import create_local_response
from services.db_service import db_service
from services.points_service import points_service, InsufficientPointsError
from services.i18n_service import i18n_service
from services.stream_service import add_stream_task, remove_stream_task
from log import get_logger

logger = get_logger(__name__)


class ChatServiceV2:
    """
    Enhanced chat service with incremental message updates
    Uses dependency injection pattern for better testability
    """

    def __init__(self,
                 message_service=None,
                 event_publisher=None,
                 db_service=None,
                 points_service=None):
        """
        Initialize with dependencies
        Allows for easy mocking in tests
        """
        self.message_service = message_service or get_incremental_message_service()
        self.event_publisher = event_publisher or get_message_event_publisher()
        self.db_service = db_service or globals()['db_service']
        self.points_service = points_service or globals()['points_service']

    async def handle_chat(self, data: Dict[str, Any]) -> None:
        """
        Main entry point for handling chat requests
        Uses incremental message updates instead of full replacement
        """
        # Extract request data
        messages = data.get('messages', [])
        session_id = data.get('session_id', '')
        canvas_id = data.get('canvas_id', '')
        user_info = data.get('user_info', {})
        model_name = data.get('model_name', '')
        aspect_ratio = data.get('aspect_ratio', 'auto')
        quantity = data.get('quantity', 1)
        user_language = data.get('language', 'en')
        provider = data.get('provider', 'openai')

        # Validate session_id
        if not session_id or session_id.strip() == '':
            logger.error("session_id is required but missing or empty")
            raise ValueError("session_id is required")

        user_uuid = user_info.get('uuid') if user_info else None

        try:
            # 1. Initialize session if needed
            is_new_session = await self._initialize_session_if_needed(
                session_id, canvas_id, user_uuid, messages
            )

            # 2. Send initialization event for new sessions
            if is_new_session:
                existing_messages = await self.message_service.get_all_messages(session_id)
                if not existing_messages:
                    # Send empty init for truly new sessions
                    await self.event_publisher.publish_init([], session_id, canvas_id)

            # 3. Process user message (incremental)
            user_message = None
            if messages:
                user_message = await self._process_user_message(
                    messages[-1], session_id, canvas_id, user_uuid
                )

            # 4. Check user intent
            user_has_drawing_intent = await self._detect_intent(messages, data)

            # 5. Check points if needed
            if await self._should_check_points(user_has_drawing_intent, user_info):
                points_ok = await self._check_and_reserve_points(
                    user_has_drawing_intent, user_info, session_id, canvas_id
                )
                if not points_ok:
                    return  # Points check failed, error already sent

            # 6. Create generation task
            task = asyncio.create_task(
                self._process_generation(
                    messages=messages,
                    session_id=session_id,
                    canvas_id=canvas_id,
                    model_name=model_name,
                    user_info=user_info,
                    user_has_drawing_intent=user_has_drawing_intent,
                    user_language=user_language,
                    provider=provider,
                    aspect_ratio=aspect_ratio,
                    quantity=quantity
                )
            )

            # 7. Register and await task
            add_stream_task(session_id, task)
            try:
                await task
            except asyncio.CancelledError:
                logger.info(f"Generation cancelled for session {session_id}")
            except Exception as e:
                logger.error(f"Generation error: {e}")
                await self._send_error_message(
                    session_id, canvas_id, str(e), user_uuid
                )
            finally:
                remove_stream_task(session_id)
                # Send done event
                await self.event_publisher._websocket_func(
                    session_id,
                    {'type': 'done', 'canvas_id': canvas_id},
                    canvas_id
                )

        except Exception as e:
            logger.error(f"Chat handling error: {e}")
            await self._send_error_message(
                session_id, canvas_id, str(e), user_uuid
            )

    async def _initialize_session_if_needed(self,
                                           session_id: str,
                                           canvas_id: str,
                                           user_uuid: Optional[str],
                                           messages: List[Dict]) -> bool:
        """Initialize session if it's new"""
        # Check if session exists in database
        try:
            existing_history = await self.db_service.get_chat_history(session_id, user_uuid or '')
            if not existing_history and messages:
                # Create new session
                prompt = messages[0].get('content', '')
                title = prompt[:200] if isinstance(prompt, str) else 'New Chat'
                await self.db_service.create_chat_session(
                    session_id, 'gpt', 'assistant', canvas_id, user_uuid, title
                )
                logger.info(f"Created new session {session_id}")
                return True
        except Exception as e:
            if "UNIQUE constraint failed" not in str(e):
                logger.error(f"Session initialization error: {e}")
        return False

    async def _process_user_message(self,
                                   message_data: Dict[str, Any],
                                   session_id: str,
                                   canvas_id: str,
                                   user_uuid: Optional[str]) -> Any:
        """Process and send user message incrementally"""
        # Create standardized user message
        user_message = MessageFactory.create_user_message(
            content=message_data.get('content', ''),
            session_id=session_id,
            canvas_id=canvas_id,
            user_id=user_uuid
        )

        # Add to incremental service
        delta_event = await self.message_service.add_message(user_message)

        # Publish delta event (incremental update)
        await self.event_publisher.publish_event(delta_event)

        # Also save to database for persistence
        await self.db_service.create_message(
            session_id,
            'user',
            json.dumps(user_message.to_dict()),
            user_uuid
        )

        logger.info(f"Sent incremental user message for session {session_id}")
        return user_message

    async def _process_generation(self,
                                 messages: List[Dict[str, Any]],
                                 session_id: str,
                                 canvas_id: str,
                                 model_name: str,
                                 user_info: Optional[Dict[str, Any]],
                                 user_has_drawing_intent: str,
                                 user_language: str,
                                 provider: str,
                                 aspect_ratio: str,
                                 quantity: int):
        """Process AI generation with streaming support"""
        try:
            # 1. Create streaming placeholder message
            streaming_message = await self.message_service.create_streaming_message(
                session_id=session_id,
                model=model_name,
                provider=provider
            )

            # 2. Publish streaming start event
            await self.event_publisher.publish_streaming_start(streaming_message)

            # 3. Call AI service
            ai_response = await create_local_response(
                messages=messages,
                session_id=session_id,
                canvas_id=canvas_id,
                model_name=model_name,
                user_info=user_info,
                provider=provider,
                aspect_ratio=aspect_ratio,
                quantity=quantity,
                user_has_drawing_intent=user_has_drawing_intent,
                user_language=user_language
            )

            # 4. Process AI response
            final_message = await self._process_ai_response(
                ai_response=ai_response,
                streaming_message_id=streaming_message.message_id,
                session_id=session_id,
                canvas_id=canvas_id,
                model_name=model_name,
                provider=provider,
                user_uuid=user_info.get('uuid') if user_info else None
            )

            # 5. Handle points deduction if applicable
            if user_has_drawing_intent in ['image', 'video', 'url'] and user_info:
                await self._deduct_points(user_has_drawing_intent, user_info, session_id)

            logger.info(f"Generation completed for session {session_id}")

        except Exception as e:
            logger.error(f"Generation error: {e}")
            # Update streaming message to error state
            if 'streaming_message' in locals():
                await self.message_service.update_message(
                    streaming_message.message_id,
                    {
                        'status': MessageStatus.ERROR,
                        'error_message': str(e),
                        'content': f"Error: {str(e)}"
                    }
                )
            raise

    async def _process_ai_response(self,
                                  ai_response: Dict[str, Any],
                                  streaming_message_id: str,
                                  session_id: str,
                                  canvas_id: str,
                                  model_name: str,
                                  provider: str,
                                  user_uuid: Optional[str]) -> Any:
        """Process AI response and update streaming message"""
        # Extract response content
        content = ai_response.get('content', '')
        response_type = ai_response.get('type', 'text')

        # Handle media messages
        if response_type == 'video' and ai_response.get('video_url'):
            # Update with video content
            await self.message_service.update_message(
                streaming_message_id,
                {
                    'content': content,
                    'status': MessageStatus.COMPLETED,
                    'type': 'video',
                    'video_url': ai_response['video_url'],
                    'media': [
                        {
                            'type': MediaType.VIDEO,
                            'url': ai_response['video_url']
                        }
                    ]
                }
            )
        elif self._contains_image(content):
            # Extract image URL from markdown
            import re
            img_pattern = r'!\[.*?\]\((.*?)\)'
            img_matches = re.findall(img_pattern, content)

            media = []
            if img_matches:
                for url in img_matches:
                    media.append({
                        'type': MediaType.IMAGE,
                        'url': url
                    })

            await self.message_service.update_message(
                streaming_message_id,
                {
                    'content': content,
                    'status': MessageStatus.COMPLETED,
                    'type': 'image',
                    'media': media
                }
            )
        else:
            # Regular text update
            await self.message_service.complete_streaming_message(
                streaming_message_id,
                final_content=content
            )

        # Get updated message
        updated_message = await self.message_service._repository.get_message(streaming_message_id)

        # Publish completion event
        await self.event_publisher.publish_streaming_end(updated_message)

        # Save to database
        await self.db_service.create_message(
            session_id,
            'assistant',
            json.dumps(updated_message.to_dict()),
            user_uuid
        )

        return updated_message

    async def _detect_intent(self, messages: List[Dict], data: Dict) -> str:
        """Detect user intent from messages"""
        # Simplified intent detection
        # In production, this would use the actual intent detection service
        if not messages:
            return 'text'

        last_message = messages[-1]
        content = last_message.get('content', '')

        # Check for image content
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get('type') == 'image_url':
                    return 'image'

        # Check for video keywords
        if isinstance(content, str):
            video_keywords = ['video', '视频', 'animation', '动画']
            if any(keyword in content.lower() for keyword in video_keywords):
                return 'video'

        return 'text'

    async def _should_check_points(self,
                                  intent: str,
                                  user_info: Optional[Dict]) -> bool:
        """Check if points verification is needed"""
        return (
            intent in ['image', 'video', 'url'] and
            user_info and
            user_info.get('id') and
            user_info.get('uuid')
        )

    async def _check_and_reserve_points(self,
                                       intent: str,
                                       user_info: Dict,
                                       session_id: str,
                                       canvas_id: str) -> bool:
        """Check and reserve points for generation"""
        try:
            required_points = 5 if intent == 'video' else 2

            await self.points_service.check_and_reserve_image_generation_points(
                user_info['id'],
                user_info['uuid'],
                required_points=required_points
            )
            return True

        except InsufficientPointsError as e:
            # Send incremental error message
            error_message = i18n_service.get_insufficient_points_message(
                language=user_info.get('language', 'en'),
                current_points=e.current_points,
                required_points=e.required_points,
                show_details=True
            )

            error_msg = MessageFactory.create_error_message(
                error_message=error_message,
                error_type='insufficient_points',
                session_id=session_id,
                canvas_id=canvas_id
            )

            # Send as incremental update
            delta_event = await self.message_service.add_message(error_msg)
            await self.event_publisher.publish_event(delta_event)

            return False

    async def _deduct_points(self,
                           intent: str,
                           user_info: Dict,
                           session_id: str):
        """Deduct points after successful generation"""
        try:
            deduction_points = 5 if intent == 'video' else 2

            result = await self.points_service.deduct_image_generation_points(
                user_id=user_info['id'],
                user_uuid=user_info['uuid'],
                session_id=session_id,
                deduction_points=deduction_points
            )

            if result['success']:
                logger.info(f"Deducted {deduction_points} points for session {session_id}")

        except Exception as e:
            logger.error(f"Points deduction error: {e}")

    async def _send_error_message(self,
                                 session_id: str,
                                 canvas_id: str,
                                 error: str,
                                 user_uuid: Optional[str]):
        """Send error message incrementally"""
        error_msg = MessageFactory.create_error_message(
            error_message=error,
            error_type='system_error',
            session_id=session_id,
            canvas_id=canvas_id
        )

        delta_event = await self.message_service.add_message(error_msg)
        await self.event_publisher.publish_event(delta_event)

        # Save to database
        await self.db_service.create_message(
            session_id,
            'assistant',
            json.dumps(error_msg.to_dict()),
            user_uuid
        )

    def _contains_image(self, content: str) -> bool:
        """Check if content contains image markdown"""
        if not isinstance(content, str):
            return False
        return '![' in content and '](' in content


# Global service instance
_chat_service_instance: Optional[ChatServiceV2] = None


def get_chat_service_v2() -> ChatServiceV2:
    """Get the global chat service instance"""
    global _chat_service_instance
    if _chat_service_instance is None:
        _chat_service_instance = ChatServiceV2()
    return _chat_service_instance


async def handle_chat_v2(data: Dict[str, Any]) -> None:
    """
    Entry point for the new chat handler
    Can be swapped in place of the old handle_chat
    """
    service = get_chat_service_v2()
    await service.handle_chat(data)