"""
Sora2 视频生成记录服务
处理 tb_sora2 表的数据库操作
"""
import sqlite3
import aiosqlite
import json
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime
from log import get_logger
from services.db_service import DB_PATH

logger = get_logger(__name__)


class Sora2Service:
    """Sora2 视频生成记录管理服务"""

    def __init__(self):
        self.db_path = DB_PATH

    async def create_record(
        self,
        user_uuid: str,
        prompt: str,
        model: str = "sora2",
        images: List[str] = None,
        video_url: str = "",
        status: str = "running",
        remark: str = ""
    ) -> int:
        """
        创建新的 Sora2 视频生成记录

        Args:
            user_uuid: 用户 UUID
            prompt: 视频生成提示词
            model: 视频生成模型（默认 sora2）
            images: 引用图片列表（可选）
            video_url: 视频地址（初始为空）
            status: 状态（running/success/failed）
            remark: 备注

        Returns:
            int: 新创建记录的 ID
        """
        images_json = json.dumps(images) if images else ""

        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                """
                INSERT INTO tb_sora2 (user_uuid, prompt, model, images, video_url, status, remark)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (user_uuid, prompt, model, images_json, video_url, status, remark)
            )
            await db.commit()
            record_id = cursor.lastrowid

            logger.info(f"✅ Created Sora2 record #{record_id} for user {user_uuid[:8]}...")
            return record_id

    async def update_record(
        self,
        record_id: int,
        video_url: Optional[str] = None,
        status: Optional[str] = None,
        remark: Optional[str] = None
    ) -> bool:
        """
        更新 Sora2 视频生成记录

        Args:
            record_id: 记录 ID
            video_url: 视频地址（可选）
            status: 状态（可选）
            remark: 备注（可选）

        Returns:
            bool: 更新是否成功
        """
        updates = []
        params = []

        if video_url is not None:
            updates.append("video_url = ?")
            params.append(video_url)

        if status is not None:
            updates.append("status = ?")
            params.append(status)

        if remark is not None:
            updates.append("remark = ?")
            params.append(remark)

        if not updates:
            logger.warning(f"⚠️ No fields to update for record #{record_id}")
            return False

        # 更新时间
        updates.append("mtime = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')")
        params.append(record_id)

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                f"""
                UPDATE tb_sora2
                SET {', '.join(updates)}
                WHERE id = ?
                """,
                params
            )
            await db.commit()

            logger.info(f"✅ Updated Sora2 record #{record_id}: {', '.join(updates)}")
            return True

    async def get_record(self, record_id: int) -> Optional[Dict[str, Any]]:
        """
        获取单条 Sora2 记录

        Args:
            record_id: 记录 ID

        Returns:
            Dict: 记录详情，如果不存在返回 None
        """
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = await db.execute(
                """
                SELECT id, user_uuid, prompt, model, images, video_url, status, remark, ctime, mtime
                FROM tb_sora2
                WHERE id = ?
                """,
                (record_id,)
            )
            row = await cursor.fetchone()

            if row:
                record = dict(row)
                # 解析 JSON 字段
                if record['images']:
                    try:
                        record['images'] = json.loads(record['images'])
                    except:
                        record['images'] = []
                else:
                    record['images'] = []
                return record

            return None

    async def list_user_records(
        self,
        user_uuid: str,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        获取用户的 Sora2 记录列表

        Args:
            user_uuid: 用户 UUID
            status: 筛选状态（可选）
            limit: 返回数量限制
            offset: 偏移量

        Returns:
            List[Dict]: 记录列表
        """
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row

            if status:
                cursor = await db.execute(
                    """
                    SELECT s.id, s.user_uuid, s.prompt, s.model, s.images, s.video_url,
                           s.status, s.remark, s.ctime, s.mtime,
                           COALESCE(sh.views, 0) as views,
                           COALESCE(sh.likes, 0) as likes
                    FROM tb_sora2 s
                    LEFT JOIN tb_sora2_share sh ON s.id = sh.video_id
                    WHERE s.user_uuid = ? AND s.status = ?
                    ORDER BY s.ctime DESC
                    LIMIT ? OFFSET ?
                    """,
                    (user_uuid, status, limit, offset)
                )
            else:
                cursor = await db.execute(
                    """
                    SELECT s.id, s.user_uuid, s.prompt, s.model, s.images, s.video_url,
                           s.status, s.remark, s.ctime, s.mtime,
                           COALESCE(sh.views, 0) as views,
                           COALESCE(sh.likes, 0) as likes
                    FROM tb_sora2 s
                    LEFT JOIN tb_sora2_share sh ON s.id = sh.video_id
                    WHERE s.user_uuid = ?
                    ORDER BY s.ctime DESC
                    LIMIT ? OFFSET ?
                    """,
                    (user_uuid, limit, offset)
                )

            rows = await cursor.fetchall()
            records = []

            for row in rows:
                record = dict(row)
                # 解析 JSON 字段
                if record['images']:
                    try:
                        record['images'] = json.loads(record['images'])
                    except:
                        record['images'] = []
                else:
                    record['images'] = []
                records.append(record)

            logger.info(f"📋 Retrieved {len(records)} Sora2 records for user {user_uuid[:8]}...")
            return records

    async def get_user_record_count(
        self,
        user_uuid: str,
        status: Optional[str] = None
    ) -> int:
        """
        获取用户的记录数量

        Args:
            user_uuid: 用户 UUID
            status: 筛选状态（可选）

        Returns:
            int: 记录数量
        """
        async with aiosqlite.connect(self.db_path) as db:
            if status:
                cursor = await db.execute(
                    "SELECT COUNT(*) FROM tb_sora2 WHERE user_uuid = ? AND status = ?",
                    (user_uuid, status)
                )
            else:
                cursor = await db.execute(
                    "SELECT COUNT(*) FROM tb_sora2 WHERE user_uuid = ?",
                    (user_uuid,)
                )

            result = await cursor.fetchone()
            return result[0] if result else 0

    async def generate_video_async(
        self,
        record_id: int,
        prompt: str,
        model: str,
        user_uuid: str,
        aspect_ratio: str = "9:16",
        duration: int = 5,
        resolution: str = "480p"
    ) -> None:
        """
        异步生成视频（后台任务）

        Args:
            record_id: 数据库记录 ID
            prompt: 视频生成提示词
            model: 视频生成模型
            user_uuid: 用户UUID（用于扣除积分）
            aspect_ratio: 视频宽高比
            duration: 视频时长
            resolution: 视频分辨率
        """
        try:
            logger.info(f"🎬 [Task #{record_id}] 开始异步视频生成 - model: {model}")

            # 导入TuziLLMService
            from services.new_chat.tuzi_llm_service import TuziLLMService

            # 模型映射
            model_mapping = {
                "sora2": "sora-2-hd",
                "veo3-fast": "veo3-fast",
                "veo3": "veo3-fast",
            }
            actual_model = model_mapping.get(model.lower(), model)

            # 创建服务实例并生成视频
            tuzi_service = TuziLLMService()
            result = await tuzi_service.generate_video(
                prompt=prompt,
                model=actual_model,
                aspect_ratio=aspect_ratio,
                duration=duration,
                resolution=resolution,
            )

            video_url = result.get('result_url')

            if video_url:
                # 视频生成成功
                await self.update_record(
                    record_id=record_id,
                    video_url=video_url,
                    status="success",
                    remark=f"Generated successfully with {model}"
                )
                logger.info(f"✅ [Task #{record_id}] 视频生成成功 - url: {video_url}")

                # 扣除5积分
                try:
                    from services.db_service import db_service
                    user_info = await db_service.get_user_by_uuid(user_uuid)
                    if user_info:
                        current_points = user_info.get('points', 0)
                        new_points = max(0, current_points - 5)  # 确保积分不会为负数
                        await db_service.update_user_points(user_info['id'], new_points)
                        logger.info(f"💰 扣除积分成功 - 用户: {user_uuid[:8]}..., {current_points} -> {new_points}")
                    else:
                        logger.warning(f"⚠️ 无法扣除积分 - 用户不存在: {user_uuid}")
                except Exception as deduct_error:
                    logger.error(f"❌ 扣除积分失败: {deduct_error}", exc_info=True)
                    # 积分扣除失败不影响视频生成结果
            else:
                # 视频生成失败（没有返回URL）
                await self.update_record(
                    record_id=record_id,
                    status="failed",
                    remark="Video generation completed but no URL returned"
                )
                logger.warning(f"⚠️ [Task #{record_id}] 视频生成完成但没有返回URL")

        except Exception as e:
            # 视频生成失败
            logger.error(f"❌ [Task #{record_id}] 视频生成失败: {e}", exc_info=True)

            # 提取友好的错误信息
            error_message = str(e)

            # 处理 OpenAI 错误
            if "Error code: 500" in error_message or "openai_error" in error_message:
                if "违反了OpenAI的相关服务政策" in error_message or "violate" in error_message.lower():
                    friendly_message = "内容可能违反AI服务政策，请调整提示词后重试"
                elif "rate limit" in error_message.lower():
                    friendly_message = "请求频率过高，请稍后重试"
                elif "timeout" in error_message.lower():
                    friendly_message = "请求超时，请重试"
                else:
                    friendly_message = "视频生成服务暂时不可用，请稍后重试"
            else:
                # 其他错误，截取前200个字符
                friendly_message = error_message[:200] if len(error_message) > 200 else error_message

            await self.update_record(
                record_id=record_id,
                status="failed",
                remark=friendly_message
            )

    async def list_all_success_videos(
        self,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "time"
    ) -> List[Dict[str, Any]]:
        """
        获取所有用户的成功视频（用于发现页面）
        自动为没有分享记录的视频创建分享

        Args:
            limit: 返回数量限制
            offset: 偏移量
            sort_by: 排序方式（time=时间，likes=点赞，views=浏览）

        Returns:
            List[Dict]: 视频记录列表（按指定方式排序）
        """
        # 导入分享服务
        from services.sora2_share_service import get_sora2_share_service
        from common import BASE_URL

        share_service = get_sora2_share_service()

        # 根据排序类型确定 ORDER BY 子句
        order_by_map = {
            "time": "s.ctime DESC",
            "likes": "COALESCE(sh.likes, 0) DESC, s.ctime DESC",
            "views": "COALESCE(sh.views, 0) DESC, s.ctime DESC"
        }
        order_by = order_by_map.get(sort_by, "s.ctime DESC")

        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row

            cursor = await db.execute(
                f"""
                SELECT s.id, s.user_uuid, s.prompt, s.model, s.images, s.video_url,
                       s.status, s.remark, s.ctime, s.mtime,
                       COALESCE(sh.views, 0) as views,
                       COALESCE(sh.likes, 0) as likes,
                       sh.share_id as share_id,
                       u.image_url as user_image_url,
                       u.email as user_email
                FROM tb_sora2 s
                LEFT JOIN tb_sora2_share sh ON s.id = sh.video_id
                LEFT JOIN tb_user u ON s.user_uuid = u.uuid
                WHERE s.status = 'success' AND s.video_url != ''
                ORDER BY {order_by}
                LIMIT ? OFFSET ?
                """,
                (limit, offset)
            )

            rows = await cursor.fetchall()
            records = []

            for row in rows:
                record = dict(row)
                # 解析 JSON 字段
                if record['images']:
                    try:
                        record['images'] = json.loads(record['images'])
                    except:
                        record['images'] = []
                else:
                    record['images'] = []

                # 如果没有 share_id，自动创建分享记录
                if not record.get('share_id'):
                    try:
                        logger.info(f"🔗 自动为视频 #{record['id']} 创建分享记录")
                        share_record = await share_service.create_share(
                            user_uuid=record['user_uuid'],
                            video_id=record['id'],
                            base_url=BASE_URL
                        )
                        record['share_id'] = share_record['share_id']
                        # 新创建的分享，views 和 likes 都是 0
                        record['views'] = 0
                        record['likes'] = 0
                        logger.info(f"✅ 分享创建成功: share_id={share_record['share_id']}")
                    except Exception as e:
                        logger.error(f"❌ 为视频 #{record['id']} 创建分享失败: {e}")
                        # 如果创建失败，仍然返回视频，但 share_id 为 None
                        record['share_id'] = None

                # 移除 user_email 字段（前端不需要）
                if 'user_email' in record:
                    del record['user_email']

                records.append(record)

            logger.info(f"📋 Retrieved {len(records)} success videos for discover page")
            return records

    async def get_all_success_videos_count(self) -> int:
        """
        获取所有成功视频的总数

        Returns:
            int: 视频总数
        """
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "SELECT COUNT(*) FROM tb_sora2 WHERE status = 'success' AND video_url != ''"
            )
            result = await cursor.fetchone()
            return result[0] if result else 0

    async def delete_record(self, record_id: int) -> bool:
        """
        删除 Sora2 记录

        Args:
            record_id: 记录 ID

        Returns:
            bool: 删除是否成功
        """
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM tb_sora2 WHERE id = ?", (record_id,))
            await db.commit()

            logger.info(f"🗑️ Deleted Sora2 record #{record_id}")
            return True


# 单例实例
sora2_service = Sora2Service()
