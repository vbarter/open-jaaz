"""
MagicArt API Router
专用于远程服务器任务获取和状态更新的API接口
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Dict
from log import get_logger

from services.sora_task_service import sora_task_service
from services.sora2_service import sora2_service

logger = get_logger(__name__)

router = APIRouter(prefix="/api/sora", tags=["magicart"])


# ==================== Response Models ====================

class TaskItem(BaseModel):
    """单个任务项"""
    task_id: str
    prompt: str


class GetTasksResponse(BaseModel):
    """获取任务响应"""
    status: str
    msg: str
    data: List[Dict[str, str]]


class UpdateTaskRequest(BaseModel):
    """更新任务请求"""
    task_id: str
    ip: str
    status: str  # running/success/failed


class UpdateTaskResponse(BaseModel):
    """更新任务响应"""
    status: str
    msg: str
    data: List


# ==================== API Endpoints ====================

@router.get("/get_tasks", response_model=GetTasksResponse)
async def get_tasks(ip: str = Query(..., description="服务器IP地址")):
    """
    获取待处理的任务

    根据服务器IP查询，如果服务器可用且有等待中的任务，则返回一个任务。
    注意：服务器必须先通过管理员手动注册到 tb_sora_server 表中

    Args:
        ip: 服务器IP地址

    Returns:
        GetTasksResponse: 包含任务列表的响应
    """
    try:
        logger.info(f"📥 Server {ip} requesting tasks...")

        # 1. 检查服务器是否已注册
        server = await sora_task_service.get_server_by_ip(ip)

        if not server:
            logger.warning(f"⚠️ Server {ip} not registered in system")
            return GetTasksResponse(
                status="failed",
                msg=f"Server {ip} is not registered. Please contact administrator.",
                data=[]
            )

        # 2. 检查服务器状态
        server_status = server['status']
        if server_status == 1:
            # 服务器正忙（有任务正在执行）
            logger.warning(f"⚠️ Server {ip} is busy (status=1)")
            return GetTasksResponse(
                status="failed",
                msg=f"Server {ip} is currently busy executing a task. Please wait for the current task to complete.",
                data=[]
            )
        elif server_status != 0:
            # 服务器不可用（已禁用）
            logger.warning(f"⚠️ Server {ip} is inactive (status={server_status})")
            return GetTasksResponse(
                status="failed",
                msg="Server is inactive. Please contact administrator.",
                data=[]
            )

        # 3. 获取一个等待中的任务
        task = await sora_task_service.get_waiting_task()

        if not task:
            logger.info(f"📭 No waiting tasks available for server {ip}")
            return GetTasksResponse(
                status="success",
                msg="No tasks available",
                data=[]
            )

        # 4. 返回任务信息
        task_id = str(task['id'])
        prompt = task.get('prompt', '')

        logger.info(f"✅ Assigned task #{task_id} to server {ip}")

        return GetTasksResponse(
            status="success",
            msg="Task retrieved successfully",
            data=[{
                "task_id": task_id,
                "prompt": prompt
            }]
        )

    except Exception as e:
        logger.error(f"❌ Error in get_tasks: {e}", exc_info=True)
        return GetTasksResponse(
            status="failed",
            msg=f"Internal server error: {str(e)}",
            data=[]
        )


@router.post("/update_task", response_model=UpdateTaskResponse)
async def update_task(request: UpdateTaskRequest):
    """
    更新任务状态

    根据任务ID和服务器IP更新任务状态，并同步更新服务器的任务计数。

    支持的状态转换:
    - waiting: 重新排队等待执行
    - running: 任务开始执行
    - success: 任务成功完成
    - failed: 任务执行失败

    Args:
        request: 更新请求，包含 task_id, ip, status

    Returns:
        UpdateTaskResponse: 更新结果响应
    """
    try:
        task_id = int(request.task_id)
        ip = request.ip
        status = request.status

        logger.info(f"📝 Updating task #{task_id} from server {ip}: status={status}")

        # 1. 验证状态值
        if status not in ["waiting", "running", "success", "failed"]:
            logger.warning(f"⚠️ Invalid status: {status}")
            return UpdateTaskResponse(
                status="failed",
                msg=f"Invalid status value: {status}. Must be waiting/running/success/failed",
                data=[]
            )

        # 2. 获取任务信息
        task = await sora_task_service.get_task_by_id(task_id)

        if not task:
            logger.warning(f"⚠️ Task #{task_id} not found")
            return UpdateTaskResponse(
                status="failed",
                msg=f"Task #{task_id} not found",
                data=[]
            )

        old_status = task['status']
        video_id = task['video_id']

        # 3. 更新任务状态
        if status == "waiting":
            # 任务重新排队：清除服务器IP，减少服务器任务计数，重置为等待状态
            await sora_task_service.update_task_status(
                task_id=task_id,
                status=status,
                server_ip=""  # 清除服务器IP
            )

            # 如果之前是 running 状态，需要减少服务器任务计数
            if old_status == "running" and task.get('server_ip'):
                old_server_ip = task['server_ip']
                await sora_task_service.decrement_server_tasks(old_server_ip)
                # 设置原服务器为空闲状态
                await sora_task_service.set_server_idle(old_server_ip)

            # 同步更新 tb_sora2 记录状态
            await sora2_service.update_record(
                record_id=video_id,
                status="waiting",
                remark="Task re-queued for execution"
            )

            logger.info(f"🔄 Task #{task_id} re-queued to waiting status")

        elif status == "running":
            # 任务开始运行：更新任务状态，记录服务器IP，增加服务器任务计数
            await sora_task_service.update_task_status(
                task_id=task_id,
                status=status,
                server_ip=ip
            )

            # 增加服务器任务计数（仅当从 waiting 变为 running 时）
            if old_status == "waiting":
                await sora_task_service.increment_server_tasks(ip)

            # 设置服务器为忙碌状态
            await sora_task_service.set_server_busy(ip)

            # 同步更新 tb_sora2 记录状态
            await sora2_service.update_record(
                record_id=video_id,
                status="running"
            )

            logger.info(f"✅ Task #{task_id} started on server {ip}")

        elif status == "success":
            # 任务成功：更新任务状态，减少服务器任务计数
            await sora_task_service.update_task_status(
                task_id=task_id,
                status=status
            )

            # 减少服务器任务计数并设置为空闲
            if task.get('server_ip'):
                server_ip = task['server_ip']
                await sora_task_service.decrement_server_tasks(server_ip)
                # 设置服务器为空闲状态
                await sora_task_service.set_server_idle(server_ip)

            # 同步更新 tb_sora2 记录状态
            await sora2_service.update_record(
                record_id=video_id,
                status="success"
            )

            logger.info(f"✅ Task #{task_id} completed successfully")

        elif status == "failed":
            # 任务失败：更新任务状态，减少服务器任务计数
            await sora_task_service.update_task_status(
                task_id=task_id,
                status=status
            )

            # 减少服务器任务计数并设置为空闲
            if task.get('server_ip'):
                server_ip = task['server_ip']
                await sora_task_service.decrement_server_tasks(server_ip)
                # 设置服务器为空闲状态
                await sora_task_service.set_server_idle(server_ip)

            # 同步更新 tb_sora2 记录状态
            await sora2_service.update_record(
                record_id=video_id,
                status="failed",
                remark="Task failed on remote server"
            )

            logger.warning(f"⚠️ Task #{task_id} failed on server {ip}")

        return UpdateTaskResponse(
            status="success",
            msg=f"Task #{task_id} updated to {status}",
            data=[]
        )

    except ValueError as e:
        logger.error(f"❌ Invalid task_id format: {request.task_id}")
        return UpdateTaskResponse(
            status="failed",
            msg=f"Invalid task_id: {request.task_id}",
            data=[]
        )
    except Exception as e:
        logger.error(f"❌ Error in update_task: {e}", exc_info=True)
        return UpdateTaskResponse(
            status="failed",
            msg=f"Internal server error: {str(e)}",
            data=[]
        )
