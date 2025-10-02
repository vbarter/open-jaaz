from typing import Optional, Dict, Any, Union
from services.db_service import db_service
import math

class CanvasLayoutConfig:
    """画布布局配置类"""
    def __init__(self):
        # 标准图片尺寸（保持16:9比例）- 调整为更大的默认尺寸
        self.standard_width = 640  # 从320调整为640
        self.standard_height = 360  # 从180调整为360

        # 布局参数 - 适当增加间距以适应更大的元素
        self.horizontal_spacing = 40  # 从30调整为40
        self.vertical_spacing = 40    # 从30调整为40
        self.margin_left = 50
        self.margin_top = 50
        
        # 画布参数
        self.canvas_width = 1600  # 假定画布宽度
        self.max_columns = None   # 自动计算
        
        # 布局策略
        self.default_preserve_aspect_ratio = True  # 默认保持宽高比
        self.default_use_original_size = True      # 默认使用原始尺寸
        
    def calculate_max_columns(self) -> int:
        """根据画布宽度和图片尺寸计算最大列数"""
        if self.max_columns is not None:
            return self.max_columns
            
        # 计算能容纳的最大列数
        available_width = self.canvas_width - (2 * self.margin_left)
        column_width = self.standard_width + self.horizontal_spacing
        max_cols = max(1, available_width // column_width)
        
        return min(max_cols, 6)  # 最多6列，避免过于密集
    
    def set_layout_strategy(self, preserve_aspect_ratio: bool = True, use_original_size: bool = True):
        """
        设置布局策略
        
        Args:
            preserve_aspect_ratio: 是否保持宽高比
            use_original_size: 是否使用原始尺寸
        """
        self.default_preserve_aspect_ratio = preserve_aspect_ratio
        self.default_use_original_size = use_original_size
        print(f"🎛️ [CONFIG] 布局策略已更新:")
        print(f"   📐 保持宽高比: {preserve_aspect_ratio}")
        print(f"   📏 使用原始尺寸: {use_original_size}")

# 全局布局配置
layout_config = CanvasLayoutConfig()

async def find_next_best_element_position(
    canvas_data: Dict[str, Any], 
    element_width: Optional[int] = None,
    element_height: Optional[int] = None,
    force_standard_size: bool = False  # 默认改为False
) -> tuple[int, int]:
    """
    智能布局系统 - 计算新元素的最佳位置
    
    Args:
        canvas_data: 画布数据
        element_width: 元素宽度（可选）
        element_height: 元素高度（可选）
        force_standard_size: 是否强制使用标准尺寸（默认False保持原始尺寸）
        
    Returns:
        tuple[int, int]: (x, y) 坐标
    """
    elements = canvas_data.get("elements", [])
    
    # 过滤出媒体元素（图片、视频等）
    media_elements = [
        e for e in elements 
        if e.get("type") in ["image", "embeddable", "video"] and not e.get("isDeleted")
    ]

    print(f"🎯 [LAYOUT] 布局计算:")
    print(f"   🖼️ 现有元素数量: {len(media_elements)}")
    print(f"   📐 目标元素尺寸: {element_width} x {element_height}")
    print(f"   🎛️ 强制标准尺寸: {force_standard_size}")

    # 如果没有元素，返回起始位置
    if not media_elements:
        result_x, result_y = layout_config.margin_left, layout_config.margin_top
        print(f"   📍 空画布，起始位置: ({result_x}, {result_y})")
        return result_x, result_y

    # 使用灵活的布局算法
    if force_standard_size:
        # 使用网格布局（所有元素标准尺寸）
        max_columns = layout_config.calculate_max_columns()
        result_x, result_y = _calculate_grid_position(media_elements, max_columns, layout_config.standard_width, layout_config.standard_height)
        print(f"   🌐 网格布局，位置: ({result_x}, {result_y})")
    else:
        # 使用自由流式布局（保持原始尺寸）
        actual_width = element_width or layout_config.standard_width
        actual_height = element_height or layout_config.standard_height
        result_x, result_y = _calculate_flow_position(media_elements, actual_width, actual_height)
        print(f"   🌊 流式布局，位置: ({result_x}, {result_y})")
    
    return result_x, result_y

def _calculate_grid_position(
    media_elements: list, 
    max_columns: int, 
    item_width: int, 
    item_height: int
) -> tuple[int, int]:
    """
    使用网格系统计算下一个位置
    
    Args:
        media_elements: 现有媒体元素列表
        max_columns: 最大列数
        item_width: 项目宽度
        item_height: 项目高度
        
    Returns:
        tuple[int, int]: (x, y) 坐标
    """
    
    # 创建网格占位图
    grid_positions = {}
    
    # 遍历现有元素，标记已占用的网格位置
    for element in media_elements:
        x = element.get("x", 0)
        y = element.get("y", 0)
        
        # 计算元素所在的网格位置
        col = _pos_to_grid_col(x)
        row = _pos_to_grid_row(y)
        
        # 标记为已占用
        grid_positions[f"{row}_{col}"] = True
    
    # 查找第一个空闲的网格位置
    row = 0
    while True:
        for col in range(max_columns):
            grid_key = f"{row}_{col}"
            if grid_key not in grid_positions:
                # 找到空闲位置，转换为坐标
                x = _grid_col_to_pos(col)
                y = _grid_row_to_pos(row)
                return x, y
        row += 1

def _pos_to_grid_col(x: int) -> int:
    """将x坐标转换为网格列"""
    if x < layout_config.margin_left:
        return 0
    adjusted_x = x - layout_config.margin_left
    col_width = layout_config.standard_width + layout_config.horizontal_spacing
    return max(0, adjusted_x // col_width)

def _pos_to_grid_row(y: int) -> int:
    """将y坐标转换为网格行"""
    if y < layout_config.margin_top:
        return 0
    adjusted_y = y - layout_config.margin_top
    row_height = layout_config.standard_height + layout_config.vertical_spacing
    return max(0, adjusted_y // row_height)

def _grid_col_to_pos(col: int) -> int:
    """将网格列转换为x坐标"""
    return layout_config.margin_left + col * (layout_config.standard_width + layout_config.horizontal_spacing)

def _grid_row_to_pos(row: int) -> int:
    """将网格行转换为y坐标"""
    return layout_config.margin_top + row * (layout_config.standard_height + layout_config.vertical_spacing)

def _calculate_flow_position(media_elements: list, element_width: int, element_height: int) -> tuple[int, int]:
    """
    计算流式布局位置 - 适用于不同尺寸的元素
    
    Args:
        media_elements: 现有媒体元素列表
        element_width: 新元素宽度
        element_height: 新元素高度
        
    Returns:
        tuple[int, int]: (x, y) 坐标
    """
    print(f"   🌊 [FLOW_LAYOUT] 开始流式布局计算:")
    print(f"      新元素尺寸: {element_width} x {element_height}")
    
    if not media_elements:
        return layout_config.margin_left, layout_config.margin_top
    
    # 按行分组现有元素
    rows = _group_elements_by_rows(media_elements)
    print(f"      现有行数: {len(rows)}")
    
    # 尝试在现有行中找到合适的位置
    for row_index, row_elements in enumerate(rows):
        print(f"      检查第 {row_index + 1} 行 (元素数: {len(row_elements)}):")
        
        # 计算行的Y范围
        row_top = min(e.get("y", 0) for e in row_elements)
        row_bottom = max(e.get("y", 0) + e.get("height", 0) for e in row_elements)
        row_height = row_bottom - row_top
        
        print(f"         行Y范围: {row_top} - {row_bottom} (高度: {row_height})")
        
        # 检查新元素是否可以放在这一行
        if element_height <= row_height + layout_config.vertical_spacing:
            # 找到行中最右边的位置
            rightmost_x = max(e.get("x", 0) + e.get("width", 0) for e in row_elements)
            candidate_x = rightmost_x + layout_config.horizontal_spacing
            
            # 检查是否超出画布宽度
            if candidate_x + element_width <= layout_config.canvas_width - layout_config.margin_left:
                result_y = row_top  # 与行顶部对齐
                print(f"         ✅ 可以放在第 {row_index + 1} 行，位置: ({candidate_x}, {result_y})")
                return candidate_x, result_y
            else:
                print(f"         ❌ 第 {row_index + 1} 行宽度不足")
    
    # 如果所有现有行都放不下，创建新行
    if rows:
        # 找到最下方的元素
        bottom_most_y = max(e.get("y", 0) + e.get("height", 0) for e in media_elements)
        new_y = bottom_most_y + layout_config.vertical_spacing
    else:
        new_y = layout_config.margin_top
    
    new_x = layout_config.margin_left
    print(f"      📍 创建新行，位置: ({new_x}, {new_y})")
    
    return new_x, new_y

def _group_elements_by_rows(media_elements: list) -> list[list]:
    """
    将元素按行分组 - 改进版本，更好地处理不同尺寸
    """
    if not media_elements:
        return []
    
    # 按Y坐标排序
    sorted_elements = sorted(media_elements, key=lambda e: e.get("y", 0))
    
    rows = []
    tolerance = 20  # 允许20px的误差
    
    for element in sorted_elements:
        element_y = element.get("y", 0)
        placed = False
        
        # 尝试将元素分配到现有行
        for row in rows:
            # 检查是否与该行有垂直重叠
            row_y_min = min(e.get("y", 0) for e in row)
            row_y_max = max(e.get("y", 0) + e.get("height", 0) for e in row)
            element_y_max = element_y + element.get("height", 0)
            
            # 如果有垂直重叠，归为同一行
            if (element_y <= row_y_max + tolerance and 
                element_y_max >= row_y_min - tolerance):
                row.append(element)
                placed = True
                break
        
        # 如果没有放入现有行，创建新行
        if not placed:
            rows.append([element])
    
    # 按行的平均Y坐标排序
    rows.sort(key=lambda row: sum(e.get("y", 0) for e in row) / len(row))
    
    return rows

# 向后兼容的函数（保持原有调用方式）
async def find_next_best_element_position_legacy(canvas_data, max_num_per_row=4, spacing=20):
    """
    向后兼容的函数，保持原有的调用接口
    """
    # 临时修改配置以匹配原有参数
    original_max_cols = layout_config.max_columns
    original_h_spacing = layout_config.horizontal_spacing
    original_v_spacing = layout_config.vertical_spacing
    
    try:
        layout_config.max_columns = max_num_per_row
        layout_config.horizontal_spacing = spacing
        layout_config.vertical_spacing = spacing
        
        return await find_next_best_element_position(canvas_data)
    finally:
        # 恢复原有配置
        layout_config.max_columns = original_max_cols
        layout_config.horizontal_spacing = original_h_spacing
        layout_config.vertical_spacing = original_v_spacing