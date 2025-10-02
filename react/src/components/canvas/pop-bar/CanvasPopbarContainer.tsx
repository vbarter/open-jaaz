import { useCanvas } from '@/contexts/canvas'
import { TCanvasAddImagesToChatEvent } from '@/lib/event'
import { motion } from 'motion/react'
import { memo, useState } from 'react'
import { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import CanvasMagicGenerator from './CanvasMagicGenerator'
import CanvasInlineChat from './CanvasInlineChat'

type CanvasPopbarContainerProps = {
    pos: { x: number; y: number }
    selectedImages: TCanvasAddImagesToChatEvent
    selectedElements: OrderedExcalidrawElement[]
    showAddToChat: boolean
    showMagicGenerate: boolean
    showChat: boolean
}

const CanvasPopbarContainer = ({
    pos,
    selectedImages,
    selectedElements,
    showAddToChat, // 保留参数以免破坏接口兼容性
    showMagicGenerate,
    showChat
}: CanvasPopbarContainerProps) => {
    const [isChatExpanded, setIsChatExpanded] = useState(false)

    return (
        <motion.div
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="absolute z-20 flex items-center gap-1 -translate-x-1/2 "
            style={{
                left: `${pos.x}px`,
                top: `${pos.y + 5}px`,
            }}
        >
            {/* Chat展开时隐藏白色背景容器，但保持同一个CanvasInlineChat实例 */}
            <div className={`flex items-center gap-1 ${!isChatExpanded ? 'bg-white/85 backdrop-blur-md rounded-xl p-1.5 shadow-lg border border-white/40' : ''} pointer-events-auto`}>
                {showChat && (
                    <CanvasInlineChat
                        selectedImages={selectedImages}
                        selectedElements={selectedElements}
                        onExpandedChange={setIsChatExpanded}
                    />
                )}
                {showMagicGenerate && !isChatExpanded && (
                    <CanvasMagicGenerator selectedImages={selectedImages} selectedElements={selectedElements} />
                )}
            </div>
        </motion.div>
    )
}

export default memo(CanvasPopbarContainer) 