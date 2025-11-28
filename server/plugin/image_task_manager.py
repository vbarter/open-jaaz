#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Image Task Manager
管理图片生成/编辑的异步任务
"""

import uuid
import asyncio
import logging
from typing import Dict, Any, Optional, Literal
from datetime import datetime
from dataclasses import dataclass, asdict

logger = logging.getLogger('image_task_manager')

TaskStatus = Literal["pending", "processing", "completed", "failed"]


@dataclass
class ImageTask:
    """图片任务数据类"""
    task_id: str
    status: TaskStatus
    created_at: str
    updated_at: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ImageTaskManager:
    """图片任务管理器 - 单例模式"""

    _instance = None
    _lock = asyncio.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._tasks: Dict[str, ImageTask] = {}
        self._tasks_lock = asyncio.Lock()
        self._initialized = True
        logger.info("ImageTaskManager initialized")

    def create_task(self) -> str:
        """
        创建新任务并返回task_id

        Returns:
            str: 新任务的ID
        """
        task_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        task = ImageTask(
            task_id=task_id,
            status="pending",
            created_at=now,
            updated_at=now
        )

        self._tasks[task_id] = task
        logger.info(f"Created task: {task_id}")
        return task_id

    async def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        获取任务状态

        Args:
            task_id: 任务ID

        Returns:
            Dict 或 None: 任务信息
        """
        async with self._tasks_lock:
            task = self._tasks.get(task_id)
            if task:
                return asdict(task)
            return None

    async def update_task_status(self, task_id: str, status: TaskStatus):
        """
        更新任务状态

        Args:
            task_id: 任务ID
            status: 新状态
        """
        async with self._tasks_lock:
            task = self._tasks.get(task_id)
            if task:
                task.status = status
                task.updated_at = datetime.utcnow().isoformat()
                logger.info(f"Task {task_id} status updated to: {status}")

    async def set_task_result(self, task_id: str, result: Dict[str, Any]):
        """
        设置任务成功结果

        Args:
            task_id: 任务ID
            result: 结果数据
        """
        async with self._tasks_lock:
            task = self._tasks.get(task_id)
            if task:
                task.status = "completed"
                task.result = result
                task.updated_at = datetime.utcnow().isoformat()
                logger.info(f"Task {task_id} completed successfully")

    async def set_task_error(self, task_id: str, error: str):
        """
        设置任务失败错误

        Args:
            task_id: 任务ID
            error: 错误信息
        """
        async with self._tasks_lock:
            task = self._tasks.get(task_id)
            if task:
                task.status = "failed"
                task.error = error
                task.updated_at = datetime.utcnow().isoformat()
                logger.error(f"Task {task_id} failed: {error}")

    async def cleanup_old_tasks(self, max_age_seconds: int = 3600):
        """
        清理超过指定时间的旧任务（防止内存泄漏）

        Args:
            max_age_seconds: 最大保留时间（秒），默认1小时
        """
        now = datetime.utcnow()
        removed_count = 0

        async with self._tasks_lock:
            tasks_to_remove = []
            for task_id, task in self._tasks.items():
                created_at = datetime.fromisoformat(task.created_at)
                age = (now - created_at).total_seconds()
                if age > max_age_seconds:
                    tasks_to_remove.append(task_id)

            for task_id in tasks_to_remove:
                del self._tasks[task_id]
                removed_count += 1

        if removed_count > 0:
            logger.info(f"Cleaned up {removed_count} old tasks")


# 全局实例
task_manager = ImageTaskManager()
