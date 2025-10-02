import json
import os
from typing import List, Dict, Optional, Any
from pathlib import Path

class TemplateService:
    """模板数据服务类，负责加载和处理多语言模板数据"""

    def __init__(self):
        self._templates = None
        self._load_templates()

    def _load_templates(self):
        """加载模板数据"""
        current_dir = Path(__file__).parent.parent
        templates_file = current_dir / "data" / "templates.json"

        try:
            with open(templates_file, 'r', encoding='utf-8') as f:
                self._templates = json.load(f)
        except FileNotFoundError:
            print(f"模板文件未找到: {templates_file}")
            self._templates = []
        except json.JSONDecodeError as e:
            print(f"模板文件JSON格式错误: {e}")
            self._templates = []

    def _get_localized_field(self, template: Dict[str, Any], field: str, language: str = "zh") -> str:
        """获取本地化字段值"""
        field_value = template.get(field, "")

        # 如果字段是字典（多语言），则根据语言返回对应值
        if isinstance(field_value, dict):
            return field_value.get(language, field_value.get("zh", ""))

        # 如果字段是字符串，直接返回
        return field_value

    def _localize_template(self, template: Dict[str, Any], language: str = "zh") -> Dict[str, Any]:
        """将模板数据本地化为指定语言"""
        localized = template.copy()

        # 处理需要本地化的字段
        localized_fields = ["title", "description"]
        for field in localized_fields:
            if field in template:
                localized[field] = self._get_localized_field(template, field, language)

        return localized

    def get_templates(self, language: str = "zh") -> List[Dict[str, Any]]:
        """获取所有模板的本地化版本"""
        if not self._templates:
            return []

        return [self._localize_template(template, language) for template in self._templates]

    def get_template_by_id(self, template_id: int, language: str = "zh") -> Optional[Dict[str, Any]]:
        """根据ID获取单个模板的本地化版本"""
        if not self._templates:
            return None

        template = next((t for t in self._templates if t["id"] == template_id), None)
        if not template:
            return None

        return self._localize_template(template, language)

    def filter_templates(self,
                        templates: List[Dict[str, Any]],
                        search: Optional[str] = None,
                        category: Optional[str] = None,
                        language: str = "zh") -> List[Dict[str, Any]]:
        """筛选模板"""
        filtered = templates.copy()

        # 搜索过滤
        if search:
            search_lower = search.lower()
            filtered = [
                template for template in filtered
                if (search_lower in str(template.get("title", "")).lower()
                    or search_lower in str(template.get("description", "")).lower()
                    or any(search_lower in str(tag).lower() for tag in template.get("tags", [])))
            ]

        # 分类过滤
        if category and category != "all":
            filtered = [
                template for template in filtered
                if template.get("category") == category
            ]

        return filtered

    def sort_templates(self,
                      templates: List[Dict[str, Any]],
                      sort_by: str = "downloads",
                      sort_order: str = "desc") -> List[Dict[str, Any]]:
        """排序模板"""
        reverse_order = sort_order == "desc"

        if sort_by in ["downloads", "rating"]:
            return sorted(templates, key=lambda x: x.get(sort_by, 0), reverse=reverse_order)
        elif sort_by == "created_at":
            return sorted(templates, key=lambda x: x.get(sort_by, ""), reverse=reverse_order)

        return templates

# 创建全局实例
template_service = TemplateService()