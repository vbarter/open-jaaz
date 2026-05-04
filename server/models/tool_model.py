from typing import Optional
from typing_extensions import TypedDict
from langchain_core.tools import BaseTool

class ToolInfoRequired(TypedDict):
    tool_function: BaseTool
    provider: str

class ToolInfoOptional(TypedDict, total=False):
    display_name: Optional[str]
    type: Optional[str]

class ToolInfo(ToolInfoRequired, ToolInfoOptional):
    pass

class ToolInfoJsonRequired(TypedDict):
    provider: str
    id: str

class ToolInfoJson(ToolInfoJsonRequired, ToolInfoOptional):
    pass
