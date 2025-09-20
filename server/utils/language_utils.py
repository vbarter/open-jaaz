from fastapi import Request
from typing import Optional

class LanguageDetector:
    """语言检测工具类"""

    # 支持的语言列表
    SUPPORTED_LANGUAGES = ["zh", "en"]
    DEFAULT_LANGUAGE = "zh"

    @classmethod
    def detect_language(cls, request: Request, lang_param: Optional[str] = None) -> str:
        """
        检测请求的首选语言

        优先级：
        1. URL 查询参数 lang
        2. Accept-Language HTTP 头
        3. 默认语言（中文）
        """

        # 1. 检查 URL 查询参数
        if lang_param and cls._is_supported_language(lang_param):
            return lang_param

        # 2. 检查 Accept-Language 头
        accept_language = request.headers.get("accept-language", "")
        if accept_language:
            detected_lang = cls._parse_accept_language(accept_language)
            if detected_lang and cls._is_supported_language(detected_lang):
                return detected_lang

        # 3. 返回默认语言
        return cls.DEFAULT_LANGUAGE

    @classmethod
    def _is_supported_language(cls, lang: str) -> bool:
        """检查语言是否受支持"""
        return lang.lower() in cls.SUPPORTED_LANGUAGES

    @classmethod
    def _parse_accept_language(cls, accept_language: str) -> Optional[str]:
        """
        解析 Accept-Language 头

        示例：
        - "zh-CN,zh;q=0.9,en;q=0.8" -> "zh"
        - "en-US,en;q=0.9" -> "en"
        """

        # 分割多个语言选项
        languages = accept_language.split(',')

        for lang_entry in languages:
            # 移除空格并分割语言和权重
            lang_entry = lang_entry.strip()
            if ';' in lang_entry:
                lang, _ = lang_entry.split(';', 1)
            else:
                lang = lang_entry

            # 提取主要语言代码（如 zh-CN -> zh）
            primary_lang = lang.split('-')[0].lower()

            if cls._is_supported_language(primary_lang):
                return primary_lang

        return None

# 创建全局实例
language_detector = LanguageDetector()