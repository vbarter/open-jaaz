"""
Message type definitions using dataclasses and enums for type safety
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from datetime import datetime
import uuid


class MessageRole(Enum):
    """Message role enumeration"""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class MessageStatus(Enum):
    """Message status enumeration"""
    PENDING = "pending"
    STREAMING = "streaming"
    COMPLETED = "completed"
    ERROR = "error"


class MessageType(Enum):
    """Message type enumeration"""
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    MIXED = "mixed"


class MediaType(Enum):
    """Media type enumeration"""
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    DOCUMENT = "document"


class MessageEventType(Enum):
    """WebSocket event types"""
    INIT_MESSAGES = "init_messages"
    DELTA_MESSAGE = "delta_message"
    UPDATE_MESSAGE = "update_message"
    DELETE_MESSAGE = "delete_message"
    STREAMING_START = "streaming_start"
    STREAMING_DELTA = "streaming_delta"
    STREAMING_END = "streaming_end"
    SYNC_MESSAGES = "sync_messages"
    ALL_MESSAGES = "all_messages"  # Kept for backward compatibility


@dataclass
class MessageContent:
    """Structured message content"""
    type: str
    text: Optional[str] = None
    image_url: Optional[Dict[str, str]] = None
    video_url: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        result = {"type": self.type}
        if self.text is not None:
            result["text"] = self.text
        if self.image_url is not None:
            result["image_url"] = self.image_url
        if self.video_url is not None:
            result["video_url"] = self.video_url
        return result


@dataclass
class MediaContent:
    """Media content with metadata"""
    type: MediaType
    url: str
    thumbnail_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    size: Optional[int] = None
    mime_type: Optional[str] = None
    canvas_element_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {k: v for k, v in self.__dict__.items() if v is not None}


@dataclass
class StandardMessage:
    """
    Standard message format with all necessary fields
    Using dataclass for cleaner code and automatic __init__, __repr__, etc.
    """
    message_id: str
    timestamp: int  # Millisecond timestamp
    role: MessageRole
    content: Union[str, List[MessageContent]]
    session_id: str

    # Optional fields
    canvas_id: Optional[str] = None
    type: MessageType = MessageType.TEXT
    status: MessageStatus = MessageStatus.COMPLETED

    # Media fields
    media: List[MediaContent] = field(default_factory=list)
    canvas_element_id: Optional[str] = None
    video_url: Optional[str] = None

    # Error fields
    error_type: Optional[str] = None
    error_message: Optional[str] = None

    # Metadata
    user_id: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    tokens_used: Optional[int] = None

    # Tool fields
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None

    @classmethod
    def create(cls,
               role: Union[str, MessageRole],
               content: Union[str, List[Dict[str, Any]]],
               session_id: str,
               **kwargs) -> 'StandardMessage':
        """
        Factory method to create a message with auto-generated ID and timestamp
        """
        if isinstance(role, str):
            role = MessageRole(role)

        # Convert content to MessageContent objects if needed
        if isinstance(content, list):
            content_objects = []
            for item in content:
                if isinstance(item, dict):
                    content_objects.append(MessageContent(**item))
                elif isinstance(item, MessageContent):
                    content_objects.append(item)
            content = content_objects

        # Generate unique message ID
        message_id = kwargs.get('message_id') or f"{session_id}_{int(datetime.now().timestamp() * 1000)}_{str(uuid.uuid4())[:8]}"

        # Generate timestamp if not provided
        timestamp = kwargs.get('timestamp') or int(datetime.now().timestamp() * 1000)

        # Remove already processed kwargs
        kwargs.pop('message_id', None)
        kwargs.pop('timestamp', None)

        return cls(
            message_id=message_id,
            timestamp=timestamp,
            role=role,
            content=content,
            session_id=session_id,
            **kwargs
        )

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert message to dictionary for JSON serialization
        """
        result = {
            "message_id": self.message_id,
            "timestamp": self.timestamp,
            "role": self.role.value if isinstance(self.role, MessageRole) else self.role,
            "session_id": self.session_id,
            "type": self.type.value if isinstance(self.type, MessageType) else self.type,
            "status": self.status.value if isinstance(self.status, MessageStatus) else self.status,
        }

        # Handle content
        if isinstance(self.content, list):
            result["content"] = [c.to_dict() if hasattr(c, 'to_dict') else c for c in self.content]
        else:
            result["content"] = self.content

        # Add optional fields
        if self.canvas_id:
            result["canvas_id"] = self.canvas_id
        if self.media:
            result["media"] = [m.to_dict() for m in self.media]
        if self.canvas_element_id:
            result["canvas_element_id"] = self.canvas_element_id
        if self.video_url:
            result["video_url"] = self.video_url
        if self.error_type:
            result["error_type"] = self.error_type
        if self.error_message:
            result["error_message"] = self.error_message
        if self.user_id:
            result["user_id"] = self.user_id
        if self.model:
            result["model"] = self.model
        if self.provider:
            result["provider"] = self.provider
        if self.tokens_used:
            result["tokens_used"] = self.tokens_used
        if self.tool_calls:
            result["tool_calls"] = self.tool_calls
        if self.tool_call_id:
            result["tool_call_id"] = self.tool_call_id

        return result

    def is_media_message(self) -> bool:
        """Check if this is a media message"""
        return bool(self.media) or self.type in [MessageType.IMAGE, MessageType.VIDEO, MessageType.AUDIO]


@dataclass
class DeltaMessage:
    """
    Delta message for incremental updates
    """
    event_type: MessageEventType
    message: Optional[StandardMessage] = None
    session_id: Optional[str] = None
    canvas_id: Optional[str] = None
    is_append: bool = True
    previous_message_id: Optional[str] = None

    # For streaming updates
    delta_content: Optional[str] = None
    delta_index: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for WebSocket transmission"""
        result = {
            "type": self.event_type.value,
            "is_append": self.is_append
        }

        if self.message:
            result["message"] = self.message.to_dict()
        if self.session_id:
            result["session_id"] = self.session_id
        if self.canvas_id:
            result["canvas_id"] = self.canvas_id
        if self.previous_message_id:
            result["previous_message_id"] = self.previous_message_id
        if self.delta_content:
            result["delta_content"] = self.delta_content
        if self.delta_index is not None:
            result["delta_index"] = self.delta_index

        return result


@dataclass
class MessageEvent:
    """
    WebSocket message event
    """
    type: MessageEventType
    payload: Dict[str, Any]
    session_id: str
    canvas_id: Optional[str] = None
    timestamp: Optional[int] = None

    def __post_init__(self):
        """Generate timestamp if not provided"""
        if self.timestamp is None:
            self.timestamp = int(datetime.now().timestamp() * 1000)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "type": self.type.value,
            "payload": self.payload,
            "session_id": self.session_id,
            "canvas_id": self.canvas_id,
            "timestamp": self.timestamp
        }