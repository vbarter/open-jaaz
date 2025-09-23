# services/stream_service.py
from typing import Dict, Optional, Any
import asyncio
from log import get_logger

logger = get_logger(__name__)


# Dictionary to store active stream tasks, keyed by session_id
stream_tasks: Dict[str, asyncio.Task[Any]] = {}

def add_stream_task(session_id: str, task: asyncio.Task[Any]) -> None:
    """
    Add a stream task for the given session_id.

    Args:
        session_id (str): Unique identifier for the session.
        task: The task object to associate with the session.
    """
    stream_tasks[session_id] = task

def remove_stream_task(session_id: str) -> None:
    """
    Remove the stream task associated with the given session_id.

    Args:
        session_id (str): Unique identifier for the session.
    """
    stream_tasks.pop(session_id, None)

def get_stream_task(session_id: str) -> Optional[asyncio.Task[Any]]:
    """
    Retrieve the stream task associated with the given session_id.

    Args:
        session_id (str): Unique identifier for the session.

    Returns:
        The task object if found, otherwise None.
    """
    logger.info(f"[StreamService] stream_tasks={stream_tasks}")
    return stream_tasks.get(session_id)

# 你也可以加一个 list_stream_tasks() 返回所有 session_id
