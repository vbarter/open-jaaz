#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

class Config:
    """Supabase配置类"""

    # Supabase连接配置
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
    SUPABASE_DB = os.getenv("SUPABASE_DB", "magicart")

    # 重试配置
    SUPABASE_MAX_RETRIES = int(os.getenv("SUPABASE_MAX_RETRIES", "3"))
    SUPABASE_RETRY_DELAY = int(os.getenv("SUPABASE_RETRY_DELAY", "1"))
