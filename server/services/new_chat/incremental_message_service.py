"""
Incremental Message Service using Singleton and Observer patterns
Manages message state and provides incremental updates
"""
import asyncio
from typing import Dict, List, Optional, Set, Callable, Any
from collections import defaultdict
from datetime import datetime
import json

from .models import (
    StandardMessage,
    DeltaMessage,
    MessageFactory,
    MessageEventType,
    IMessageRepository
)
from .models.message_types import MessageRole, MessageStatus
from log import get_logger

logger = get_logger(__name__)


class InMemoryMessageRepository(IMessageRepository):
    """
    In-memory implementation of message repository
    Can be replaced with database implementation later
    """

    def __init__(self):
        self._messages: Dict[str, StandardMessage] = {}
        self._session_messages: Dict[str, List[str]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def add_message(self, message: StandardMessage) -> bool:
        """Add a new message to the repository"""
        async with self._lock:
            self._messages[message.message_id] = message
            self._session_messages[message.session_id].append(message.message_id)
            return True

    async def get_message(self, message_id: str) -> Optional[StandardMessage]:
        """Get a message by ID"""
        return self._messages.get(message_id)

    async def get_messages_by_session(self, session_id: str,
                                     limit: Optional[int] = None,
                                     offset: Optional[int] = None) -> List[StandardMessage]:
        """Get all messages for a session"""
        message_ids = self._session_messages.get(session_id, [])

        # Apply offset and limit
        if offset is not None:
            message_ids = message_ids[offset:]
        if limit is not None:
            message_ids = message_ids[:limit]

        messages = []
        for msg_id in message_ids:
            msg = self._messages.get(msg_id)
            if msg:
                messages.append(msg)

        return messages

    async def get_messages_after(self, session_id: str,
                                message_id: str) -> List[StandardMessage]:
        """Get all messages after a specific message ID"""
        message_ids = self._session_messages.get(session_id, [])

        try:
            index = message_ids.index(message_id)
            after_ids = message_ids[index + 1:]

            messages = []
            for msg_id in after_ids:
                msg = self._messages.get(msg_id)
                if msg:
                    messages.append(msg)
            return messages
        except ValueError:
            # Message not found, return all messages
            return await self.get_messages_by_session(session_id)

    async def get_messages_between(self, session_id: str,
                                  start_message_id: str,
                                  end_message_id: Optional[str] = None) -> List[StandardMessage]:
        """Get messages between two message IDs"""
        message_ids = self._session_messages.get(session_id, [])

        try:
            start_index = message_ids.index(start_message_id)
            if end_message_id:
                end_index = message_ids.index(end_message_id)
                between_ids = message_ids[start_index:end_index + 1]
            else:
                between_ids = message_ids[start_index:]

            messages = []
            for msg_id in between_ids:
                msg = self._messages.get(msg_id)
                if msg:
                    messages.append(msg)
            return messages
        except ValueError:
            return []

    async def update_message(self, message_id: str,
                           updates: Dict[str, Any]) -> bool:
        """Update an existing message"""
        async with self._lock:
            if message_id in self._messages:
                message = self._messages[message_id]
                for key, value in updates.items():
                    if hasattr(message, key):
                        setattr(message, key, value)
                return True
            return False

    async def delete_message(self, message_id: str) -> bool:
        """Delete a message"""
        async with self._lock:
            if message_id in self._messages:
                message = self._messages[message_id]
                session_id = message.session_id

                # Remove from messages dict
                del self._messages[message_id]

                # Remove from session list
                if session_id in self._session_messages:
                    self._session_messages[session_id].remove(message_id)

                return True
            return False

    async def get_latest_message(self, session_id: str,
                                role: Optional[str] = None) -> Optional[StandardMessage]:
        """Get the latest message for a session"""
        message_ids = self._session_messages.get(session_id, [])

        for msg_id in reversed(message_ids):
            msg = self._messages.get(msg_id)
            if msg:
                if role is None or msg.role.value == role:
                    return msg
        return None

    async def count_messages(self, session_id: str) -> int:
        """Count total messages in a session"""
        return len(self._session_messages.get(session_id, []))

    async def clear_session(self, session_id: str) -> bool:
        """Clear all messages for a session"""
        async with self._lock:
            message_ids = self._session_messages.get(session_id, [])
            for msg_id in message_ids:
                if msg_id in self._messages:
                    del self._messages[msg_id]

            if session_id in self._session_messages:
                del self._session_messages[session_id]

            return True


class IncrementalMessageService:
    """
    Singleton service for managing incremental message updates
    Uses Observer pattern for notifying subscribers about message changes
    """

    _instance = None
    _initialized = False

    def __new__(cls):
        """Implement Singleton pattern"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize the service (only once due to Singleton)"""
        if not self._initialized:
            self._repository: IMessageRepository = InMemoryMessageRepository()
            self._observers: Dict[str, Set[Callable]] = defaultdict(set)
            self._client_cursors: Dict[str, Dict[str, str]] = defaultdict(dict)
            self._session_locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
            self._initialized = True
            logger.info("IncrementalMessageService initialized")

    async def add_message(self, message: StandardMessage) -> DeltaMessage:
        """
        Add a new message and return delta event
        Thread-safe per session
        """
        session_id = message.session_id

        async with self._session_locks[session_id]:
            # Add to repository
            success = await self._repository.add_message(message)

            if not success:
                logger.error(f"Failed to add message {message.message_id}")
                raise RuntimeError("Failed to add message to repository")

            # Create delta event
            delta = MessageFactory.create_delta_event(
                message=message,
                event_type=MessageEventType.DELTA_MESSAGE,
                is_append=True
            )

            # Notify observers
            await self._notify_observers(session_id, delta)

            logger.info(f"Added message {message.message_id} to session {session_id}")
            return delta

    async def update_message(self, message_id: str,
                            updates: Dict[str, Any]) -> Optional[DeltaMessage]:
        """Update an existing message and return delta event"""
        # Get the message first
        message = await self._repository.get_message(message_id)
        if not message:
            logger.warning(f"Message {message_id} not found for update")
            return None

        session_id = message.session_id

        async with self._session_locks[session_id]:
            # Update in repository
            success = await self._repository.update_message(message_id, updates)

            if not success:
                logger.error(f"Failed to update message {message_id}")
                return None

            # Get updated message
            updated_message = await self._repository.get_message(message_id)

            # Create update event
            delta = DeltaMessage(
                event_type=MessageEventType.UPDATE_MESSAGE,
                message=updated_message,
                session_id=session_id,
                canvas_id=updated_message.canvas_id,
                is_append=False,
                previous_message_id=message_id
            )

            # Notify observers
            await self._notify_observers(session_id, delta)

            logger.info(f"Updated message {message_id}")
            return delta

    async def get_messages_after(self, session_id: str,
                                last_message_id: Optional[str] = None) -> List[StandardMessage]:
        """Get all messages after a specific message ID"""
        if last_message_id:
            return await self._repository.get_messages_after(session_id, last_message_id)
        else:
            return await self._repository.get_messages_by_session(session_id)

    async def get_sync_messages(self, session_id: str,
                               client_id: str) -> List[StandardMessage]:
        """
        Get messages that need to be synced to a specific client
        Uses client cursor to track what has been sent
        """
        last_message_id = self._client_cursors[session_id].get(client_id)
        messages = await self.get_messages_after(session_id, last_message_id)

        # Update client cursor if there are new messages
        if messages:
            self._client_cursors[session_id][client_id] = messages[-1].message_id

        return messages

    async def get_all_messages(self, session_id: str) -> List[StandardMessage]:
        """Get all messages for a session"""
        return await self._repository.get_messages_by_session(session_id)

    async def create_streaming_message(self, session_id: str,
                                      role: MessageRole = MessageRole.ASSISTANT,
                                      model: Optional[str] = None,
                                      provider: Optional[str] = None) -> StandardMessage:
        """
        Create a placeholder message for streaming responses
        """
        message = MessageFactory.create_assistant_message(
            content="",
            session_id=session_id,
            model=model,
            provider=provider,
            status=MessageStatus.STREAMING
        )

        # Add the placeholder message
        await self.add_message(message)

        return message

    async def append_streaming_content(self, message_id: str,
                                      delta_content: str,
                                      delta_index: int) -> Optional[DeltaMessage]:
        """
        Append content to a streaming message
        """
        message = await self._repository.get_message(message_id)
        if not message:
            logger.warning(f"Message {message_id} not found for streaming")
            return None

        # Update content
        if isinstance(message.content, str):
            new_content = message.content + delta_content
        else:
            new_content = delta_content

        # Update message
        updates = {"content": new_content}
        await self._repository.update_message(message_id, updates)

        # Create streaming delta event
        delta = MessageFactory.create_streaming_event(
            session_id=message.session_id,
            delta_content=delta_content,
            delta_index=delta_index,
            message_id=message_id,
            canvas_id=message.canvas_id
        )

        # Notify observers
        await self._notify_observers(message.session_id, delta)

        return delta

    async def complete_streaming_message(self, message_id: str,
                                        final_content: Optional[str] = None) -> Optional[DeltaMessage]:
        """
        Mark a streaming message as completed
        """
        updates = {"status": MessageStatus.COMPLETED}
        if final_content is not None:
            updates["content"] = final_content

        return await self.update_message(message_id, updates)

    def subscribe(self, session_id: str, observer: Callable):
        """Subscribe to message updates for a session"""
        self._observers[session_id].add(observer)
        logger.info(f"Observer subscribed to session {session_id}")

    def unsubscribe(self, session_id: str, observer: Callable):
        """Unsubscribe from message updates"""
        if observer in self._observers[session_id]:
            self._observers[session_id].remove(observer)
            logger.info(f"Observer unsubscribed from session {session_id}")

    async def _notify_observers(self, session_id: str, delta: DeltaMessage):
        """Notify all observers about a message change"""
        observers = self._observers.get(session_id, set())

        for observer in observers:
            try:
                if asyncio.iscoroutinefunction(observer):
                    await observer(delta)
                else:
                    observer(delta)
            except Exception as e:
                logger.error(f"Error notifying observer: {e}")

    def update_client_cursor(self, session_id: str, client_id: str, message_id: str):
        """Update the cursor for a specific client"""
        self._client_cursors[session_id][client_id] = message_id

    def get_client_cursor(self, session_id: str, client_id: str) -> Optional[str]:
        """Get the cursor for a specific client"""
        return self._client_cursors[session_id].get(client_id)

    async def clear_session(self, session_id: str):
        """Clear all messages and observers for a session"""
        # Clear messages
        await self._repository.clear_session(session_id)

        # Clear observers
        if session_id in self._observers:
            del self._observers[session_id]

        # Clear client cursors
        if session_id in self._client_cursors:
            del self._client_cursors[session_id]

        # Clear lock
        if session_id in self._session_locks:
            del self._session_locks[session_id]

        logger.info(f"Cleared session {session_id}")


# Global instance getter
def get_incremental_message_service() -> IncrementalMessageService:
    """Get the singleton instance of IncrementalMessageService"""
    return IncrementalMessageService()