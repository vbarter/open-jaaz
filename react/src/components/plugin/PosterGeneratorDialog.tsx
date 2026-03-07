import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Sparkles, Image as ImageIcon, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { eventBus } from '@/lib/event'

interface Page {
  index: number
  type: string
  content: string
}

interface GeneratedImage {
  index: number
  success: boolean
  image_url?: string
  error?: string
}

interface PosterGeneratorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTopic?: string
  referenceImage?: {
    fileId: string
    base64?: string
  }
}

export function PosterGeneratorDialog({
  open,
  onOpenChange,
  initialTopic = '',
  referenceImage
}: PosterGeneratorDialogProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'topic' | 'outline' | 'generating' | 'result'>('topic')
  const [topic, setTopic] = useState(initialTopic)
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false)
  const [outline, setOutline] = useState<{ raw: string; pages: Page[] } | null>(null)
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [generationProgress, setGenerationProgress] = useState(0)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('topic')
      setTopic(initialTopic)
      setOutline(null)
      setGeneratedImages([])
      setGenerationProgress(0)
    }
  }, [open, initialTopic])

  const handleGenerateOutline = async () => {
    if (!topic.trim()) {
      toast.error('请输入主题')
      return
    }

    setIsGeneratingOutline(true)
    try {
      const response = await fetch('/api/plugin/poster/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic })
      })
      const data = await response.json()
      
      if (data.code === 0) {
        setOutline({
          raw: data.data.outline,
          pages: data.data.pages
        })
        setStep('outline')
      } else {
        toast.error('生成大纲失败: ' + data.message)
      }
    } catch (error) {
      console.error('Failed to generate outline:', error)
      toast.error('生成大纲失败')
    } finally {
      setIsGeneratingOutline(false)
    }
  }

  const handleGenerateImages = async () => {
    if (!outline) return

    setStep('generating')
    setIsGeneratingImages(true)
    setGeneratedImages([])
    setGenerationProgress(0)

    try {
      const response = await fetch('/api/plugin/poster/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pages: outline.pages,
          full_outline: outline.raw,
          user_topic: topic,
          style: 'default'
        })
      })
      const data = await response.json()

      if (data.code === 0) {
        const results = data.data.results
        setGeneratedImages(results)
        setStep('result')
        
        // Add images to canvas automatically
        results.forEach((img: GeneratedImage) => {
          if (img.success && img.image_url) {
            // We need to fetch the image to get dimensions or just add it
            // For now, we'll emit an event to add it to canvas
            // Note: This requires the image_url to be accessible
            
            // If we have a reference image, we might want to position near it
            // But for now, let's just let the user see the result
          }
        })
      } else {
        toast.error('生成图片失败: ' + data.message)
        setStep('outline') // Go back
      }
    } catch (error) {
      console.error('Failed to generate images:', error)
      toast.error('生成图片失败')
      setStep('outline')
    } finally {
      setIsGeneratingImages(false)
    }
  }

  const handleAddToCanvas = () => {
    if (generatedImages.length === 0) return

    // Filter successful images
    const successfulImages = generatedImages
      .filter(img => img.success && img.image_url)
      .map(img => ({
        url: img.image_url!,
        index: img.index
      }))

    if (successfulImages.length === 0) {
      toast.error('没有生成的图片可添加到画布')
      return
    }

    // Emit event to add images to canvas
    eventBus.emit('Canvas::AddPosterImages', {
      images: successfulImages,
      referenceImageId: referenceImage?.fileId
    })

    toast.success(`已添加 ${successfulImages.length} 张图片到画布`)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            小红书海报生成器
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden py-4">
          {step === 'topic' && (
            <div className="flex flex-col gap-4 h-full justify-center">
              <div className="space-y-2">
                <label className="text-sm font-medium">海报主题</label>
                <Textarea
                  placeholder="请输入海报主题，例如：'5分钟学会手冲咖啡' 或 '夏日海边穿搭指南'..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="min-h-[120px] text-lg"
                />
              </div>
              {referenceImage && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-md">
                  <ImageIcon className="w-4 h-4" />
                  <span>已选择参考图片</span>
                </div>
              )}
            </div>
          )}

          {step === 'outline' && outline && (
            <div className="flex flex-col gap-4 h-full">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">大纲预览</h3>
                <span className="text-sm text-muted-foreground">共 {outline.pages.length} 页</span>
              </div>
              <ScrollArea className="flex-1 border rounded-md p-4 bg-muted/30">
                <div className="space-y-6">
                  {outline.pages.map((page, idx) => (
                    <div key={idx} className="bg-background p-4 rounded-lg border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-medium">
                          第 {idx + 1} 页
                        </span>
                        <span className="font-medium text-sm">
                          {page.type === 'cover' ? '封面' : page.type === 'summary' ? '总结' : '内容页'}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {page.content}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <div className="text-center space-y-2">
                <h3 className="text-lg font-medium">正在生成海报...</h3>
                <p className="text-sm text-muted-foreground">
                  正在为您绘制 {outline?.pages.length} 张精美图片，请稍候
                </p>
              </div>
            </div>
          )}

          {step === 'result' && (
            <div className="flex flex-col gap-4 h-full">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">生成结果</h3>
                <div className="flex gap-2">
                  <span className="text-sm text-muted-foreground">
                    成功: {generatedImages.filter(i => i.success).length} / {generatedImages.length}
                  </span>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-4">
                  {generatedImages.map((img, idx) => (
                    <div key={idx} className="aspect-[3/4] relative group rounded-lg overflow-hidden border bg-muted">
                      {img.success && img.image_url ? (
                        <>
                          <img 
                            src={img.image_url} 
                            alt={`Page ${idx + 1}`} 
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-0.5 rounded text-xs backdrop-blur-sm">
                            P{idx + 1}
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center gap-2">
                          <AlertCircle className="w-8 h-8 text-destructive/50" />
                          <span className="text-xs text-muted-foreground">生成失败</span>
                          <span className="text-[10px] text-destructive line-clamp-2">{img.error}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'topic' && (
            <Button 
              onClick={handleGenerateOutline} 
              disabled={isGeneratingOutline}
              className="w-full sm:w-auto"
            >
              {isGeneratingOutline ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  生成大纲中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  生成大纲
                </>
              )}
            </Button>
          )}

          {step === 'outline' && (
            <div className="flex w-full justify-between sm:justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('topic')}>
                返回修改
              </Button>
              <Button onClick={handleGenerateImages} disabled={isGeneratingImages}>
                <ImageIcon className="w-4 h-4 mr-2" />
                开始生成图片
              </Button>
            </div>
          )}

          {step === 'result' && (
            <div className="flex w-full justify-between sm:justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('outline')}>
                <RefreshCw className="w-4 h-4 mr-2" />
                重新生成
              </Button>
              <Button onClick={handleAddToCanvas}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                添加到画布
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
