"""
Message Factory using Factory Pattern for creating different types of messages
"""
from typing import Any, Dict, List, Optional, Union
from .message_types import (
    StandardMessage,
    DeltaMessage,
    MessageRole,
    MessageType,
    MessageStatus,
    MessageEventType,
    MediaContent,
    MediaType
)


class MessageFactory:
    """
    Factory class for creating various types of messages
    Implements the Factory Pattern for message creation
    """

    @staticmethod
    def create_user_message(content: Union[str, List[Dict[str, Any]]],
                           session_id: str,
                           canvas_id: Optional[str] = None,
                           **kwargs) -> StandardMessage:
        """Create a user message"""
        return StandardMessage.create(
            role=MessageRole.USER,
            content=content,
            session_id=session_id,
            canvas_id=canvas_id,
            type=MessageFactory._infer_message_type(content),
            **kwargs
        )

    @staticmethod
    def create_assistant_message(content: Union[str, List[Dict[str, Any]]],
                                session_id: str,
                                canvas_id: Optional[str] = None,
                                model: Optional[str] = None,
                                provider: Optional[str] = None,
                                **kwargs) -> StandardMessage:
        """Create an assistant message"""
        return StandardMessage.create(
            role=MessageRole.ASSISTANT,
            content=content,
            session_id=session_id,
            canvas_id=canvas_id,
            model=model,
            provider=provider,
            type=MessageFactory._infer_message_type(content),
            **kwargs
        )

    @staticmethod
    def create_tool_message(content: str,
                           tool_call_id: str,
                           session_id: str,
                           **kwargs) -> StandardMessage:
        """Create a tool response message"""
        return StandardMessage.create(
            role=MessageRole.TOOL,
            content=content,
            session_id=session_id,
            tool_call_id=tool_call_id,
            type=MessageType.TEXT,
            **kwargs
        )

    @staticmethod
    def create_error_message(error_message: str,
                            error_type: str,
                            session_id: str,
                            **kwargs) -> StandardMessage:
        """Create an error message"""
        return StandardMessage.create(
            role=MessageRole.ASSISTANT,
            content=error_message,
            session_id=session_id,
            status=MessageStatus.ERROR,
            error_type=error_type,
            error_message=error_message,
            type=MessageType.TEXT,
            **kwargs
        )

    @staticmethod
    def create_media_message(content: str,
                            media_type: MediaType,
                            media_url: str,
                            session_id: str,
                            canvas_element_id: Optional[str] = None,
                            **kwargs) -> StandardMessage:
        """Create a message with media content"""
        media = MediaContent(
            type=media_type,
            url=media_url,
            canvas_element_id=canvas_element_id
        )

        message_type = MessageType.IMAGE if media_type == MediaType.IMAGE else \
                      MessageType.VIDEO if media_type == MediaType.VIDEO else \
                      MessageType.AUDIO if media_type == MediaType.AUDIO else \
                      MessageType.MIXED

        return StandardMessage.create(
            role=kwargs.pop('role', MessageRole.ASSISTANT),
            content=content,
            session_id=session_id,
            type=message_type,
            media=[media],
            canvas_element_id=canvas_element_id,
            video_url=media_url if media_type == MediaType.VIDEO else None,
            **kwargs
        )

    @staticmethod
    def create_delta_event(message: StandardMessage,
                          event_type: MessageEventType = MessageEventType.DELTA_MESSAGE,
                          is_append: bool = True,
                          previous_message_id: Optional[str] = None) -> DeltaMessage:
        """Create a delta message event"""
        return DeltaMessage(
            event_type=event_type,
            message=message,
            session_id=message.session_id,
            canvas_id=message.canvas_id,
            is_append=is_append,
            previous_message_id=previous_message_id
        )

    @staticmethod
    def create_streaming_event(session_id: str,
                             delta_content: str,
                             delta_index: int,
                             message_id: str,
                             canvas_id: Optional[str] = None) -> DeltaMessage:
        """Create a streaming delta event"""
        return DeltaMessage(
            event_type=MessageEventType.STREAMING_DELTA,
            session_id=session_id,
            canvas_id=canvas_id,
            delta_content=delta_content,
            delta_index=delta_index,
            previous_message_id=message_id
        )

    @staticmethod
    def create_sync_event(messages: List[StandardMessage],
                         session_id: str,
                         canvas_id: Optional[str] = None) -> Dict[str, Any]:
        """Create a sync messages event"""
        return {
            "type": MessageEventType.SYNC_MESSAGES.value,
            "messages": [msg.to_dict() for msg in messages],
            "session_id": session_id,
            "canvas_id": canvas_id,
            "is_incremental": True
        }

    @staticmethod
    def _infer_message_type(content: Union[str, List[Dict[str, Any]]]) -> MessageType:
        """Infer message type from content"""
        if isinstance(content, str):
            return MessageType.TEXT

        # Check if content contains different media types
        has_text = False
        has_image = False
        has_video = False

        for item in content:
            if isinstance(item, dict):
                item_type = item.get('type', '')
                if item_type == 'text':
                    has_text = True
                elif item_type == 'image_url':
                    has_image = True
                elif item_type == 'video_url':
                    has_video = True

        if has_video:
            return MessageType.VIDEO
        elif has_image:
            return MessageType.IMAGE
        elif has_text:
            return MessageType.TEXT
        else:
            return MessageType.MIXED

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> StandardMessage:
        """Create a message from dictionary (for deserialization)"""
        # Convert role string to enum if needed
        role = data.get('role', 'assistant')
        if isinstance(role, str):
            role = MessageRole(role)

        # Convert type string to enum if needed
        msg_type = data.get('type', 'text')
        if isinstance(msg_type, str):
            msg_type = MessageType(msg_type)

        # Convert status string to enum if needed
        status = data.get('status', 'completed')
        if isinstance(status, str):
            status = MessageStatus(status)

        # Create media objects
        media = []
        if 'media' in data:
            for media_item in data['media']:
                if isinstance(media_item, dict):
                    media_type = media_item.get('type', 'image')
                    if isinstance(media_type, str):
                        media_type = MediaType(media_type)
                    media.append(MediaContent(
                        type=media_type,
                        url=media_item.get('url', ''),
                        thumbnail_url=media_item.get('thumbnail_url'),
                        width=media_item.get('width'),
                        height=media_item.get('height'),
                        duration=media_item.get('duration'),
                        size=media_item.get('size'),
                        mime_type=media_item.get('mime_type'),
                        canvas_element_id=media_item.get('canvas_element_id')
                    ))

        return StandardMessage(
            message_id=data.get('message_id', ''),
            timestamp=data.get('timestamp', 0),
            role=role,
            content=data.get('content', ''),
            session_id=data.get('session_id', ''),
            canvas_id=data.get('canvas_id'),
            type=msg_type,
            status=status,
            media=media,
            canvas_element_id=data.get('canvas_element_id'),
            video_url=data.get('video_url'),
            error_type=data.get('error_type'),
            error_message=data.get('error_message'),
            user_id=data.get('user_id'),
            model=data.get('model'),
            provider=data.get('provider'),
            tokens_used=data.get('tokens_used'),
            tool_calls=data.get('tool_calls'),
            tool_call_id=data.get('tool_call_id')
        )