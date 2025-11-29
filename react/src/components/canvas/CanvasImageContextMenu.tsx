import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Grid3x3 } from 'lucide-react'

interface ImageContextMenuProps {
  open: boolean
  position: { x: number; y: number }
  onClose: () => void
  onSlice: () => void
}

/**
 * A floating context menu for image operations
 * Displays at the specified position when open
 */
const ImageContextMenu: React.FC<ImageContextMenuProps> = ({
  open,
  position,
  onClose,
  onSlice,
}) => {
  const { t } = useTranslation('canvas')
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    // Delay adding listener to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose])

  if (!open) return null

  const handleSliceClick = () => {
    onSlice()
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <button
        onClick={handleSliceClick}
        className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
      >
        <Grid3x3 className="w-4 h-4 mr-2" />
        {t('imageSlicer.contextMenu.slice', '图片分割')}
      </button>
    </div>
  )
}

export default ImageContextMenu
