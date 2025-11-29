import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { GridSettings, ImageInfo, getViewportDimensions } from '@/utils/image-slicer'

interface ImageSlicerPreviewProps {
  imageInfo: ImageInfo
  settings: GridSettings
  selectedIndices: Set<number>
  onSelectionChange: (indices: Set<number>) => void
  onSettingsChange?: (newSettings: Partial<GridSettings>) => void
}

const ImageSlicerPreview: React.FC<ImageSlicerPreviewProps> = ({
  imageInfo,
  settings,
  selectedIndices,
  onSelectionChange,
  onSettingsChange,
}) => {
  const { t } = useTranslation('canvas')
  const containerRef = useRef<HTMLDivElement>(null)

  // Interaction state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [initialOffset, setInitialOffset] = useState({ x: 0, y: 0 })
  const [hasMoved, setHasMoved] = useState(false)

  // Calculate Viewport Logical Dimensions
  const viewportDims = useMemo(() => {
    return getViewportDimensions(
      imageInfo.width,
      imageInfo.height,
      settings.cropMode
    )
  }, [imageInfo, settings.cropMode])

  // UI Grid dimensions (Logical)
  const blockWidth = Math.round(viewportDims.width / settings.cols)
  const blockHeight = Math.round(viewportDims.height / settings.rows)

  // Mouse Wheel Zoom Logic
  useEffect(() => {
    const container = containerRef.current
    if (!container || !onSettingsChange) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      const zoomIn = e.deltaY < 0
      const step = 0.05
      const delta = zoomIn ? step : -step

      // Update both Scale X and Y uniformly on wheel
      let newScaleX = settings.scaleX + delta
      let newScaleY = settings.scaleY + delta

      newScaleX = Math.min(3, Math.max(0.5, newScaleX))
      newScaleY = Math.min(3, Math.max(0.5, newScaleY))

      newScaleX = Number(newScaleX.toFixed(2))
      newScaleY = Number(newScaleY.toFixed(2))

      onSettingsChange({
        scaleX: newScaleX,
        scaleY: newScaleY,
      })
    }

    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [settings.scaleX, settings.scaleY, onSettingsChange])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return // Only left click
    setIsDragging(true)
    setHasMoved(false)
    setDragStart({ x: e.clientX, y: e.clientY })
    setInitialOffset({ x: settings.offsetX, y: settings.offsetY })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !onSettingsChange) return

    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      setHasMoved(true)
    }

    // Convert screen pixel movement to Percentage Movement
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()

      const percentX = dx / rect.width
      const percentY = dy / rect.height

      onSettingsChange({
        offsetX: initialOffset.x + percentX,
        offsetY: initialOffset.y + percentY,
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleGridClick = (index: number) => {
    // Only select if it was a click, not a drag
    if (hasMoved) return

    const newSet = new Set(selectedIndices)
    if (newSet.has(index)) {
      newSet.delete(index)
    } else {
      newSet.add(index)
    }
    onSelectionChange(newSet)
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mouseup', handleMouseUp)
    } else {
      window.removeEventListener('mouseup', handleMouseUp)
    }
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [isDragging])

  // 1000x1000 Transparent SVG for Square Mode Layout Driver
  const SQUARE_SVG_DATA =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAwIiBoZWlnaHQ9IjEwMDAiIHZpZXdCb3g9IjAgMCAxIDEiPjwvc3ZnPg=='

  return (
    <div className="flex flex-col h-full w-full select-none">
      {/* Container Area */}
      <div className="flex-1 flex items-center justify-center min-h-0 w-full relative overflow-hidden bg-muted/30 rounded-lg p-1">
        {/* The Viewport Wrapper */}
        <div
          ref={containerRef}
          className="relative shadow-sm overflow-hidden bg-background flex items-center justify-center rounded-md"
          style={{
            aspectRatio:
              settings.cropMode === 'square'
                ? '1 / 1'
                : `${imageInfo.width} / ${imageInfo.height}`,
            maxWidth: '100%',
            maxHeight: '100%',
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
        >
          {/* PHANTOM DRIVER IMAGE */}
          <img
            src={settings.cropMode === 'square' ? SQUARE_SVG_DATA : imageInfo.src}
            alt="layout-driver"
            className="opacity-0 pointer-events-none block"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
            }}
          />

          {/* REAL IMAGE LAYER */}
          <img
            src={imageInfo.src}
            alt="preview"
            draggable={false}
            className="absolute inset-0 w-full h-full pointer-events-none select-none"
            style={{
              objectFit: settings.cropMode === 'square' ? 'cover' : 'contain',
              transform: `translate(${settings.offsetX * 100}%, ${settings.offsetY * 100}%) scale(${settings.scaleX}, ${settings.scaleY})`,
              transformOrigin: 'center',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            }}
          />

          {/* GRID OVERLAY */}
          <div
            className="absolute inset-0 grid z-20 pointer-events-none"
            style={{
              gridTemplateColumns: `repeat(${settings.cols}, 1fr)`,
              gridTemplateRows: `repeat(${settings.rows}, 1fr)`,
            }}
          >
            {Array.from({ length: settings.rows * settings.cols }).map((_, i) => {
              const isSelected = selectedIndices.has(i)

              return (
                <div
                  key={i}
                  style={{ pointerEvents: 'auto' }}
                  onMouseUp={() => handleGridClick(i)}
                  className={`
                    relative border border-dashed border-red-500/60
                    transition-colors duration-75
                    hover:bg-red-500/10
                    ${isSelected ? 'bg-red-500/20 ring-1 ring-inset ring-red-500 border-solid' : ''}
                  `}
                >
                  {isSelected && (
                    <div className="absolute top-0.5 left-0.5 bg-red-500 text-white text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center shadow-sm font-bold">
                      ✓
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Info Footer */}
      <div className="flex-shrink-0 mt-2 pt-2 border-t flex items-center justify-between text-xs text-muted-foreground px-2">
        <div className="flex items-center gap-3">
          <span>
            {t('imageSlicer.originalSize', '原图')}: {imageInfo.width}×{imageInfo.height}
          </span>
          <span className="text-foreground/80">
            {hasMoved || settings.scaleX !== 1 || settings.scaleY !== 1
              ? t('imageSlicer.adjusted', '(已调整)')
              : ''}
          </span>
        </div>
        <div className="font-medium text-foreground">
          {t('imageSlicer.blockSize', '单块')}: {blockWidth} × {blockHeight}px
        </div>
      </div>
    </div>
  )
}

export default ImageSlicerPreview
