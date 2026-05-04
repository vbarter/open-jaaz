from typing import Annotated, Optional, Dict, Any, Sequence, List
from typing_extensions import TypedDict
from langgraph.types import Command
from langgraph.prebuilt import InjectedState
from langchain_core.messages import ToolMessage
from langchain_core.tools import BaseTool, InjectedToolCallId, tool  # type: ignore
from langgraph_swarm.handoff import METADATA_KEY_HANDOFF_DESTINATION
from models.tool_model import ToolInfoJson


class ToolConfig(TypedDict):
    """工具配置"""
    tool: str


def _normalize_agent_name(name: str) -> str:
    """Normalize agent name to be compatible with tool names."""
    return name.lower().replace(" ", "_").replace("-", "_")


def create_handoff_tool(
    *, agent_name: str, name: Optional[str] = None, description: Optional[str] = None
) -> BaseTool:
    """Create a tool that can handoff control to the requested agent.

    Args:
        agent_name: The name of the agent to handoff control to, i.e.
            the name of the agent node in the multi-agent graph.
            Agent names should be simple, clear and unique, preferably in snake_case,
            although you are only limited to the names accepted by LangGraph
            nodes as well as the tool names accepted by LLM providers
            (the tool name will look like this: `transfer_to_<agent_name>`).
        name: Optional name of the tool to use for the handoff.
            If not provided, the tool name will be `transfer_to_<agent_name>`.
        description: Optional description for the handoff tool.
            If not provided, the tool description will be `Ask agent <agent_name> for help`.
    """
    if name is None:
        name = f"transfer_to_{_normalize_agent_name(agent_name)}"

    if description is None:
        description = f"Ask agent '{agent_name}' for help"

    @tool(name, description=description+"""
    \nIMPORTANT RULES:
            1. You MUST complete the other tool calls and wait for their result BEFORE attempting to transfer to another agent
            2. Do NOT call this handoff tool with other tools simultaneously
            3. Always wait for the result of other tool calls before making this handoff call
    """)
    def handoff_to_agent(
        state: Annotated[Dict[str, Any], InjectedState],
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> Command[Any]:
        tool_message = ToolMessage(
            content=f"<hide_in_user_ui> Successfully transferred to {agent_name}",
            name=name,
            tool_call_id=tool_call_id,
        )
        return Command(
            goto=agent_name,
            graph=Command.PARENT,
            update={"messages": state["messages"] +
                    [tool_message], "active_agent": agent_name},
        )

    setattr(handoff_to_agent, 'metadata', {
            METADATA_KEY_HANDOFF_DESTINATION: agent_name})

    return handoff_to_agent


class HandoffConfig(TypedDict):
    """切换智能体配置"""
    agent_name: str
    description: str


class BaseAgentConfig:
    """智能体配置基类

    此类用于存储智能体配置信息的配置类，不是实际的智能体。
    实际的智能体将通过 LangGraph 的 create_react_agent 函数创建。
    """

    def __init__(
        self,
        name: str,
        tools: Sequence[ToolInfoJson],
        system_prompt: str,
        handoffs: Optional[List[HandoffConfig]] = None
    ) -> None:
        self.name = name
        self.tools = tools
        self.system_prompt = system_prompt
        self.handoffs: List[HandoffConfig] = handoffs or []
