import { Button } from '@/components/ui/button'
import { Hotkey } from '@/components/ui/hotkey'
import { useCanvas } from '@/contexts/canvas'
import { eventBus, TCanvasAddImagesToChatEvent } from '@/lib/event'
import { useKeyPress } from 'ahooks'
import { motion } from 'motion/react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquarePlus } from 'lucide-react'

type CanvasPopbarProps = {
  selectedImages: TCanvasAddImagesToChatEvent
}

const CanvasPopbar = ({ selectedImages }: CanvasPopbarProps) => {
  const { t } = useTranslation()
  const { excalidrawAPI } = useCanvas()

  const handleAddToChat = () => {
    eventBus.emit('Canvas::AddImagesToChat', selectedImages)
    excalidrawAPI?.updateScene({
      appState: { selectedElementIds: {} },
    })
  }

  useKeyPress(['meta.enter', 'ctrl.enter'], handleAddToChat)

  return (
    <Button variant="ghost" size="sm" onClick={handleAddToChat} className="flex items-center gap-1.5">
      <MessageSquarePlus size={14} />
      {t('canvas:popbar.addToChat')} <Hotkey keys={['⌘', '↩︎']} />
    </Button>
  )
}

export default memo(CanvasPopbar)
