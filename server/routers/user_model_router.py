from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Optional
from pydantic import BaseModel
from services.db_service import db_service
from utils.auth_utils import get_current_user, CurrentUser
from log import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api")

class UserModelsRequest(BaseModel):
    """用户模型配置请求体"""
    text_model: Optional[Dict[str, Any]] = None
    selected_image_tool: Optional[Dict[str, Any]] = None
    selected_video_tool: Optional[Dict[str, Any]] = None

@router.get("/user_models")
async def get_user_models(current_user: CurrentUser = Depends(get_current_user)):
    """
    获取用户保存的模型配置
    """
    try:
        user_uuid = current_user.uuid
        if not user_uuid:
            raise HTTPException(status_code=401, detail="User not authenticated")

        logger.info(f"Getting models for user {user_uuid}")

        # 从数据库获取用户模型配置
        user_models = await db_service.get_user_models(user_uuid)

        if user_models:
            logger.info(f"Found saved models for user {user_uuid}: {user_models}")
            return {
                "success": True,
                "data": user_models['model'],
                "mtime": user_models['mtime']
            }
        else:
            logger.info(f"No saved models found for user {user_uuid}")
            return {
                "success": True,
                "data": None,
                "message": "No saved models found"
            }

    except Exception as e:
        logger.error(f"Error getting user models: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/user_models")
async def update_user_models(
    request: UserModelsRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    更新用户的模型配置
    """
    try:
        user_uuid = current_user.uuid
        if not user_uuid:
            raise HTTPException(status_code=401, detail="User not authenticated")

        logger.info(f"Updating models for user {user_uuid}")
        logger.info(f"Models data: text={request.text_model}, image={request.selected_image_tool}, video={request.selected_video_tool}")

        # 构建模型数据
        models_data = {
            'text_model': request.text_model,
            'selected_image_tool': request.selected_image_tool,
            'selected_video_tool': request.selected_video_tool
        }

        # 更新数据库
        success = await db_service.update_user_models(user_uuid, models_data)

        if success:
            logger.info(f"Successfully updated models for user {user_uuid}")
            return {
                "success": True,
                "message": "Models updated successfully"
            }
        else:
            logger.error(f"Failed to update models for user {user_uuid}")
            raise HTTPException(status_code=500, detail="Failed to update models")

    except Exception as e:
        logger.error(f"Error updating user models: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/user_models")
async def delete_user_models(current_user: CurrentUser = Depends(get_current_user)):
    """
    删除用户的模型配置
    """
    try:
        user_uuid = current_user.uuid
        if not user_uuid:
            raise HTTPException(status_code=401, detail="User not authenticated")

        logger.info(f"Deleting models for user {user_uuid}")

        # 删除用户模型配置
        success = await db_service.delete_user_models(user_uuid)

        if success:
            logger.info(f"Successfully deleted models for user {user_uuid}")
            return {
                "success": True,
                "message": "Models deleted successfully"
            }
        else:
            logger.error(f"Failed to delete models for user {user_uuid}")
            raise HTTPException(status_code=500, detail="Failed to delete models")

    except Exception as e:
        logger.error(f"Error deleting user models: {e}")
        raise HTTPException(status_code=500, detail=str(e))