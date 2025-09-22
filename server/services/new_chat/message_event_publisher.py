"""
Message Event Publisher using Strategy Pattern
Handles WebSocket communication for message events
"""
from typing import Dict, Any, Optional, List, Protocol
from abc import ABC, abstractmethod
import asyncio
import json

from .models import (
    DeltaMessage,
    StandardMessage,
    MessageEventType,
    MessageFactory
)
from services.websocket_service import send_to_websocket
from log import get_logger

logger = get_logger(__name__)


class IEventStrategy(ABC):
    """
    Abstract strategy interface for handling different event types
    Strategy Pattern implementation
    """

    @abstractmethod
    async def publish(self, event: DeltaMessage, websocket_func) -> bool:
        """Publish an event through WebSocket"""
        pass

    @abstractmethod
    def format_event(self, event: DeltaMessage) -> Dict[str, Any]:
        """Format event for transmission"""
        pass


class DeltaMessageStrategy(IEventStrategy):
    """Strategy for handling delta message events"""

    async def publish(self, event: DeltaMessage, websocket_func) -> bool:
        """Publish a delta message event"""
        try:
            formatted = self.format_event(event)
            await websocket_func(
                event.session_id,
                formatted,
                event.canvas_id
            )
            logger.info(f"Published delta message for session {event.session_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to publish delta message: {e}")
            return False

    def format_event(self, event: DeltaMessage) -> Dict[str, Any]:
        """Format delta message for transmission"""
        return {
            "type": MessageEventType.DELTA_MESSAGE.value,
            "message": event.message.to_dict() if event.message else None,
            "is_append": event.is_append,
            "previous_message_id": event.previous_message_id,
            "session_id": event.session_id,
            "canvas_id": event.canvas_id
        }


class StreamingStrategy(IEventStrategy):
    """Strategy for handling streaming events"""

    async def publish(self, event: DeltaMessage, websocket_func) -> bool:
        """Publish a streaming event"""
        try:
            formatted = self.format_event(event)
            await websocket_func(
                event.session_id,
                formatted,
                event.canvas_id
            )
            return True
        except Exception as e:
            logger.error(f"Failed to publish streaming event: {e}")
            return False

    def format_event(self, event: DeltaMessage) -> Dict[str, Any]:
        """Format streaming event for transmission"""
        return {
            "type": event.event_type.value,
            "delta_content": event.delta_content,
            "delta_index": event.delta_index,
            "message_id": event.previous_message_id,
            "session_id": event.session_id,
            "canvas_id": event.canvas_id
        }


class UpdateMessageStrategy(IEventStrategy):
    """Strategy for handling message update events"""

    async def publish(self, event: DeltaMessage, websocket_func) -> bool:
        """Publish an update message event"""
        try:
            formatted = self.format_event(event)
            await websocket_func(
                event.session_id,
                formatted,
                event.canvas_id
            )
            logger.info(f"Published update for message {event.previous_message_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to publish update message: {e}")
            return False

    def format_event(self, event: DeltaMessage) -> Dict[str, Any]:
        """Format update message for transmission"""
        return {
            "type": MessageEventType.UPDATE_MESSAGE.value,
            "message": event.message.to_dict() if event.message else None,
            "message_id": event.previous_message_id,
            "session_id": event.session_id,
            "canvas_id": event.canvas_id
        }


class SyncMessagesStrategy(IEventStrategy):
    """Strategy for handling sync messages events"""

    async def publish(self, event: Dict[str, Any], websocket_func) -> bool:
        """Publish a sync messages event"""
        try:
            await websocket_func(
                event["session_id"],
                event,
                event.get("canvas_id")
            )
            logger.info(f"Published sync messages for session {event['session_id']}")
            return True
        except Exception as e:
            logger.error(f"Failed to publish sync messages: {e}")
            return False

    def format_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Format sync messages for transmission"""
        return event  # Already formatted


class MessageEventPublisher:
    """
    Publisher for message events
    Uses Strategy Pattern to handle different event types
    """

    def __init__(self):
        """Initialize the publisher with strategies"""
        self._strategies: Dict[MessageEventType, IEventStrategy] = {
            MessageEventType.DELTA_MESSAGE: DeltaMessageStrategy(),
            MessageEventType.STREAMING_START: StreamingStrategy(),
            MessageEventType.STREAMING_DELTA: StreamingStrategy(),
            MessageEventType.STREAMING_END: StreamingStrategy(),
            MessageEventType.UPDATE_MESSAGE: UpdateMessageStrategy(),
            MessageEventType.SYNC_MESSAGES: SyncMessagesStrategy(),
        }

        # WebSocket function (can be mocked for testing)
        self._websocket_func = send_to_websocket

        # Event queue for batching
        self._event_queue: asyncio.Queue = asyncio.Queue()
        self._batch_task: Optional[asyncio.Task] = None
        self._batch_interval = 0.05  # 50ms batching interval

    async def publish_event(self, event: DeltaMessage) -> bool:
        """
        Publish a message event
        Uses appropriate strategy based on event type
        """
        strategy = self._strategies.get(event.event_type)

        if not strategy:
            logger.warning(f"No strategy found for event type {event.event_type}")
            return False

        return await strategy.publish(event, self._websocket_func)

    async def publish_delta(self, message: StandardMessage) -> bool:
        """Convenience method to publish a delta message"""
        delta = MessageFactory.create_delta_event(
            message=message,
            event_type=MessageEventType.DELTA_MESSAGE
        )
        return await self.publish_event(delta)

    async def publish_streaming_start(self, message: StandardMessage) -> bool:
        """Publish streaming start event"""
        event = DeltaMessage(
            event_type=MessageEventType.STREAMING_START,
            message=message,
            session_id=message.session_id,
            canvas_id=message.canvas_id
        )
        return await self.publish_event(event)

    async def publish_streaming_delta(self,
                                     session_id: str,
                                     message_id: str,
                                     delta_content: str,
                                     delta_index: int,
                                     canvas_id: Optional[str] = None) -> bool:
        """Publish streaming delta event"""
        event = MessageFactory.create_streaming_event(
            session_id=session_id,
            delta_content=delta_content,
            delta_index=delta_index,
            message_id=message_id,
            canvas_id=canvas_id
        )
        return await self.publish_event(event)

    async def publish_streaming_end(self, message: StandardMessage) -> bool:
        """Publish streaming end event"""
        event = DeltaMessage(
            event_type=MessageEventType.STREAMING_END,
            message=message,
            session_id=message.session_id,
            canvas_id=message.canvas_id
        )
        return await self.publish_event(event)

    async def publish_update(self, message: StandardMessage) -> bool:
        """Publish message update event"""
        event = DeltaMessage(
            event_type=MessageEventType.UPDATE_MESSAGE,
            message=message,
            session_id=message.session_id,
            canvas_id=message.canvas_id,
            previous_message_id=message.message_id
        )
        return await self.publish_event(event)

    async def publish_sync(self,
                          messages: List[StandardMessage],
                          session_id: str,
                          canvas_id: Optional[str] = None,
                          client_id: Optional[str] = None) -> bool:
        """Publish sync messages event"""
        sync_event = MessageFactory.create_sync_event(
            messages=messages,
            session_id=session_id,
            canvas_id=canvas_id
        )

        if client_id:
            sync_event["client_id"] = client_id

        strategy = self._strategies[MessageEventType.SYNC_MESSAGES]
        return await strategy.publish(sync_event, self._websocket_func)

    async def publish_init(self,
                          messages: List[StandardMessage],
                          session_id: str,
                          canvas_id: Optional[str] = None) -> bool:
        """Publish initial messages for a new session"""
        init_event = {
            "type": MessageEventType.INIT_MESSAGES.value,
            "messages": [msg.to_dict() for msg in messages],
            "session_id": session_id,
            "canvas_id": canvas_id,
            "is_full_sync": True
        }

        await self._websocket_func(session_id, init_event, canvas_id)
        logger.info(f"Published init messages for session {session_id}")
        return True

    async def batch_publish(self, events: List[DeltaMessage]) -> int:
        """
        Publish multiple events in batch
        Returns number of successfully published events
        """
        success_count = 0

        for event in events:
            if await self.publish_event(event):
                success_count += 1

        logger.info(f"Batch published {success_count}/{len(events)} events")
        return success_count

    async def queue_event(self, event: DeltaMessage):
        """Queue an event for batched publishing"""
        await self._event_queue.put(event)

        # Start batch processing if not already running
        if self._batch_task is None or self._batch_task.done():
            self._batch_task = asyncio.create_task(self._process_batch())

    async def _process_batch(self):
        """Process queued events in batches"""
        await asyncio.sleep(self._batch_interval)

        batch = []
        while not self._event_queue.empty():
            try:
                event = self._event_queue.get_nowait()
                batch.append(event)
            except asyncio.QueueEmpty:
                break

        if batch:
            await self.batch_publish(batch)

    def set_websocket_func(self, func):
        """Set custom WebSocket function (useful for testing)"""
        self._websocket_func = func

    def set_batch_interval(self, interval: float):
        """Set batch processing interval in seconds"""
        self._batch_interval = interval


# Global instance
_publisher_instance: Optional[MessageEventPublisher] = None


def get_message_event_publisher() -> MessageEventPublisher:
    """Get the global message event publisher instance"""
    global _publisher_instance
    if _publisher_instance is None:
        _publisher_instance = MessageEventPublisher()
    return _publisher_instance