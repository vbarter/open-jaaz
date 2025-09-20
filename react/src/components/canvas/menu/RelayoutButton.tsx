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
          onMouseDown={(e) => {
            e.preventDefault()
            if (!disabled) {
              onClick?.()
            }
          }}
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