import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { MoreHorizontal, Grid3X3 } from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import icons, { toolShortcuts, ToolType } from './CanvasMenuIcon'

// 自定义菜单项类型
type CustomMenuItem = {
  id: string
  type: 'relayout'
  icon: React.ComponentType<{ className?: string }>
  label: string
  disabled?: boolean
  onClick: () => void
}

type ToolOverflowMenuProps = {
  tools: ToolType[]
  activeTool?: ToolType
  onToolSelect: (tool: ToolType) => void
  customItems?: CustomMenuItem[]
}

const ToolOverflowMenu = ({ tools, activeTool, onToolSelect, customItems = [] }: ToolOverflowMenuProps) => {
  const { t } = useTranslation()

  // 如果没有工具和自定义项，不显示菜单
  if (tools.length === 0 && customItems.length === 0) {
    return null
  }

  // 检查是否有激活的工具在折叠菜单中
  const hasActiveTool = tools.includes(activeTool as ToolType)

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'p-2 rounded-md cursor-pointer hover:bg-primary/5',
                hasActiveTool && 'bg-primary/10'
              )}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {t('canvas:tool.moreTools')}
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        align="center"
        side="top"
        className="bg-white/95 backdrop-blur-md border border-white/40 shadow-lg min-w-[180px]"
      >
        {/* 显示工具项 */}
        {tools.map((tool) => {
          const Icon = icons[tool]
          const isActive = activeTool === tool

          return (
            <DropdownMenuItem
              key={tool}
              onClick={() => onToolSelect(tool)}
              className={cn(
                'flex items-center gap-3 cursor-pointer py-2.5 px-3',
                isActive && 'bg-primary/10'
              )}
            >
              <Icon className="size-4 flex-shrink-0" />
              <span className="flex-1 text-sm">{t(`canvas:tool.${tool}`)}</span>
              {toolShortcuts[tool] && (
                <span className="text-xs text-muted-foreground ml-2">
                  {toolShortcuts[tool]}
                </span>
              )}
            </DropdownMenuItem>
          )
        })}

        {/* 分隔符（当有工具和自定义项时） */}
        {tools.length > 0 && customItems.length > 0 && (
          <DropdownMenuSeparator className="my-1" />
        )}

        {/* 显示自定义项 */}
        {customItems.map((item) => {
          const Icon = item.icon

          return (
            <DropdownMenuItem
              key={item.id}
              onClick={item.onClick}
              disabled={item.disabled}
              className={cn(
                'flex items-center gap-3 cursor-pointer py-2.5 px-3',
                item.disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Icon className="size-4 flex-shrink-0" />
              <span className="flex-1 text-sm">{item.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ToolOverflowMenu