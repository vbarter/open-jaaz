import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Grid3x3,
  ArrowLeftRight,
  ArrowUpDown,
  RefreshCw,
  CheckSquare,
  XSquare,
  Loader2,
  Settings2,
} from 'lucide-react'
import ImageSlicerPreview from './ImageSlicerPreview'
import {
  GridSettings,
  ImageInfo,
  SliceResult,
  DEFAULT_SETTINGS,
  sliceImage,
  suggestGridDimensions,
} from '@/utils/image-slicer'

interface ImageSlicerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageInfo: ImageInfo | null
  onApply: (slices: SliceResult[], settings: GridSettings) => void
}

const ImageSlicerDialog: React.FC<ImageSlicerDialogProps> = ({
  open,
  onOpenChange,
  imageInfo,
  onApply,
}) => {
  const { t } = useTranslation('canvas')

  // Settings state
  const [settings, setSettings] = useState<GridSettings>(() => {
    if (imageInfo) {
      const suggestion = suggestGridDimensions(imageInfo.width, imageInfo.height)
      return {
        ...DEFAULT_SETTINGS,
        rows: suggestion.rows,
        cols: suggestion.cols,
      }
    }
    return DEFAULT_SETTINGS
  })

  // Selected grid cells
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)

  // Update settings when imageInfo changes
  React.useEffect(() => {
    if (imageInfo) {
      const suggestion = suggestGridDimensions(imageInfo.width, imageInfo.height)
      setSettings({
        ...DEFAULT_SETTINGS,
        rows: suggestion.rows,
        cols: suggestion.cols,
      })
      setSelectedIndices(new Set())
    }
  }, [imageInfo])

  const handleSettingsChange = useCallback((newSettings: Partial<GridSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }))
  }, [])

  const handleSelectAll = () => {
    const total = settings.rows * settings.cols
    const newSet = new Set<number>()
    for (let i = 0; i < total; i++) {
      newSet.add(i)
    }
    setSelectedIndices(newSet)
  }

  const handleSelectNone = () => {
    setSelectedIndices(new Set())
  }

  const resetTransforms = () => {
    setSettings((prev) => ({
      ...prev,
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
    }))
  }

  const handleApply = async () => {
    if (!imageInfo) return

    setIsProcessing(true)
    setProgress(0)

    try {
      const slices = await sliceImage(imageInfo, settings, selectedIndices, (p) =>
        setProgress(p)
      )
      onApply(slices, settings)
      onOpenChange(false)
    } catch (error) {
      console.error('Slice failed:', error)
    } finally {
      setIsProcessing(false)
      setProgress(0)
    }
  }

  const totalSlices = settings.rows * settings.cols
  const selectedCount = selectedIndices.size

  if (!imageInfo) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[90vw] h-[85vh] p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Grid3x3 className="w-5 h-5" />
            {t('imageSlicer.title', '图片分割')}
          </DialogTitle>
        </DialogHeader>

        {/* Main Content - Left Right Layout */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Preview Area */}
          <div className="flex-1 flex flex-col min-w-0 border-r">
            {/* Preview Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 flex-shrink-0">
              <span className="text-sm text-muted-foreground">
                {t('imageSlicer.preview', '预览')}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  className="h-7 px-2 text-xs"
                >
                  <CheckSquare className="w-3.5 h-3.5 mr-1" />
                  {t('imageSlicer.selectAll', '全选')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectNone}
                  className="h-7 px-2 text-xs"
                >
                  <XSquare className="w-3.5 h-3.5 mr-1" />
                  {t('imageSlicer.reset', '重置')}
                </Button>
              </div>
            </div>

            {/* Preview Component */}
            <div className="flex-1 min-h-0 p-4">
              <ImageSlicerPreview
                imageInfo={imageInfo}
                settings={settings}
                selectedIndices={selectedIndices}
                onSelectionChange={setSelectedIndices}
                onSettingsChange={handleSettingsChange}
              />
            </div>
          </div>

          {/* Right: Controls Panel */}
          <div className="w-[280px] flex-shrink-0 flex flex-col bg-muted/20">
            {/* Panel Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
              <Settings2 className="w-4 h-4" />
              <span className="text-sm font-medium">
                {t('imageSlicer.settings', '设置')}
              </span>
            </div>

            {/* Scrollable Controls */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Grid Layout */}
              <div className="bg-background rounded-lg p-4 shadow-sm border">
                <div className="flex items-center gap-2 mb-3">
                  <Grid3x3 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">
                    {t('imageSlicer.gridLayout', '网格布局')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      {t('imageSlicer.cols', '列数')}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={settings.cols}
                      onChange={(e) =>
                        handleSettingsChange({
                          cols: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      className="w-full px-3 py-2 bg-muted border-0 rounded-md text-center text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      {t('imageSlicer.rows', '行数')}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={settings.rows}
                      onChange={(e) =>
                        handleSettingsChange({
                          rows: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      className="w-full px-3 py-2 bg-muted border-0 rounded-md text-center text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-dashed flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    {t('imageSlicer.totalSlices', '切片总数')}
                  </span>
                  <span className="font-semibold text-primary">{totalSlices}</span>
                </div>
              </div>

              {/* Adjustments */}
              <div className="bg-background rounded-lg p-4 shadow-sm border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">
                    {t('imageSlicer.adjustments', '调整')}
                  </span>
                  <button
                    onClick={resetTransforms}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {t('imageSlicer.resetAdjust', '重置')}
                  </button>
                </div>

                {/* Crop Mode */}
                <div className="mb-4">
                  <label className="text-xs text-muted-foreground mb-2 block">
                    {t('imageSlicer.cropMode', '裁剪模式')}
                  </label>
                  <div className="flex bg-muted p-1 rounded-lg">
                    <button
                      onClick={() => handleSettingsChange({ cropMode: 'original' })}
                      className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${
                        settings.cropMode === 'original'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('imageSlicer.original', '原比例')}
                    </button>
                    <button
                      onClick={() => handleSettingsChange({ cropMode: 'square' })}
                      className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${
                        settings.cropMode === 'square'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('imageSlicer.square', '正方形')}
                    </button>
                  </div>
                </div>

                {/* Scale X */}
                <div className="mb-4">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      {t('imageSlicer.scaleX', '横向缩放')}
                    </span>
                    <span className="font-medium tabular-nums">
                      {Math.round(settings.scaleX * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[settings.scaleX]}
                    min={0.5}
                    max={3}
                    step={0.01}
                    onValueChange={([v]) => handleSettingsChange({ scaleX: v })}
                    className="py-1"
                  />
                </div>

                {/* Scale Y */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      {t('imageSlicer.scaleY', '纵向缩放')}
                    </span>
                    <span className="font-medium tabular-nums">
                      {Math.round(settings.scaleY * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[settings.scaleY]}
                    min={0.5}
                    max={3}
                    step={0.01}
                    onValueChange={([v]) => handleSettingsChange({ scaleY: v })}
                    className="py-1"
                  />
                </div>

                <p className="text-[10px] text-muted-foreground text-center mt-3 leading-relaxed">
                  {t('imageSlicer.hint', '提示：可在预览区滚轮缩放，拖拽移动')}
                </p>
              </div>

              {/* Export Format */}
              <div className="bg-background rounded-lg p-4 shadow-sm border">
                <label className="text-xs text-muted-foreground mb-2 block">
                  {t('imageSlicer.format', '输出格式')}
                </label>
                <div className="flex bg-muted p-1 rounded-lg">
                  {(['png', 'jpg', 'webp'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => handleSettingsChange({ format: fmt })}
                      className={`flex-1 py-2 text-xs font-medium uppercase rounded-md transition-all ${
                        settings.format === fmt
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t bg-background flex-shrink-0">
              {isProcessing && (
                <div className="mb-3">
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 text-center">
                    {t('imageSlicer.processing', '处理中...')} {progress}%
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                  disabled={isProcessing}
                >
                  {t('imageSlicer.cancel', '取消')}
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  {selectedCount > 0
                    ? t('imageSlicer.applySelected', '应用选中 ({{count}})', {
                        count: selectedCount,
                      })
                    : t('imageSlicer.applyAll', '应用全部 ({{count}})', {
                        count: totalSlices,
                      })}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ImageSlicerDialog
