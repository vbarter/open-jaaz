"""
Message Repository Interface using Repository Pattern
"""
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from .message_types import StandardMessage


class IMessageRepository(ABC):
    """
    Abstract interface for message repository
    Implements Repository Pattern for message storage
    """

    @abstractmethod
    async def add_message(self, message: StandardMessage) -> bool:
        """Add a new message to the repository"""
        pass

    @abstractmethod
    async def get_message(self, message_id: str) -> Optional[StandardMessage]:
        """Get a message by ID"""
        pass

    @abstractmethod
    async def get_messages_by_session(self, session_id: str,
                                     limit: Optional[int] = None,
                                     offset: Optional[int] = None) -> List[StandardMessage]:
        """Get all messages for a session"""
        pass

    @abstractmethod
    async def get_messages_after(self, session_id: str,
                                message_id: str) -> List[StandardMessage]:
        """Get all messages after a specific message ID"""
        pass

    @abstractmethod
    async def get_messages_between(self, session_id: str,
                                  start_message_id: str,
                                  end_message_id: Optional[str] = None) -> List[StandardMessage]:
        """Get messages between two message IDs"""
        pass

    @abstractmethod
    async def update_message(self, message_id: str,
                           updates: Dict[str, Any]) -> bool:
        """Update an existing message"""
        pass

    @abstractmethod
    async def delete_message(self, message_id: str) -> bool:
        """Delete a message"""
        pass

    @abstractmethod
    async def get_latest_message(self, session_id: str,
                                role: Optional[str] = None) -> Optional[StandardMessage]:
        """Get the latest message for a session, optionally filtered by role"""
        pass

    @abstractmethod
    async def count_messages(self, session_id: str) -> int:
        """Count total messages in a session"""
        pass

    @abstractmethod
    async def clear_session(self, session_id: str) -> bool:
        """Clear all messages for a session"""
        pass