import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Grid3X3 } from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'

type RelayoutButtonProps = {
  onClick?: () => void
  disabled?: boolean
}

const RelayoutButton = ({ onClick, disabled }: RelayoutButtonProps) => {
  const { t } = useTranslation()

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    console.log('🔧 RelayoutButton 被点击', { disabled })

    if (!disabled && onClick) {
      console.log('✅ 调用 onClick 回调')
      onClick()
    } else if (disabled) {
      console.log('⚠️ 按钮被禁用，忽略点击')
    } else {
      console.log('⚠️ 没有 onClick 回调')
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className={cn(
            'p-2 rounded-md cursor-pointer hover:bg-primary/5',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          onClick={handleClick}
          onMouseDown={handleClick}
        >
          <Grid3X3 className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {t('canvas:tool.relayout')}
      </TooltipContent>
    </Tooltip>
  )
}

export default RelayoutButton