"""
用户头像 URL 生成工具
支持 Gravatar 和 Google 头像
"""
import hashlib
from typing import Optional


def get_gravatar_url(email: str, size: int = 200, default: str = "identicon") -> str:
    """
    根据邮箱生成 Gravatar 头像 URL

    Args:
        email: 用户邮箱
        size: 头像尺寸（像素）
        default: 默认头像类型
            - identicon: 几何图案
            - monsterid: 怪物头像
            - wavatar: 波浪头像
            - retro: 复古像素头像
            - robohash: 机器人头像
            - blank: 空白

    Returns:
        Gravatar 头像 URL
    """
    # 将邮箱转为小写并去除空格
    email = email.lower().strip()

    # 生成 MD5 哈希
    email_hash = hashlib.md5(email.encode('utf-8')).hexdigest()

    # 生成 Gravatar URL
    gravatar_url = f"https://www.gravatar.com/avatar/{email_hash}?s={size}&d={default}"

    return gravatar_url


def get_user_avatar_url(email: str, google_image_url: Optional[str] = None) -> str:
    """
    获取用户头像 URL
    优先使用 Google 头像，如果没有则使用 Gravatar

    Args:
        email: 用户邮箱
        google_image_url: Google OAuth 返回的头像 URL（可选）

    Returns:
        用户头像 URL
    """
    # 如果有 Google 头像，优先使用
    if google_image_url and google_image_url.startswith('http'):
        return google_image_url

    # 否则使用 Gravatar
    return get_gravatar_url(email)
