import { Button } from '@/components/ui/button'
import { useCanvas } from '@/contexts/canvas'
import { useTranslation } from 'react-i18next'
import { PhotoView } from 'react-photo-view'
import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'

type MessageImageProps = {
  content: {
    image_url: {
      url: string
    }
    type: 'image_url'
  }
  // 支持直接传递canvas元素ID (GPT生成的图片)
  canvasElementId?: string
  // 是否为用户消息，决定图片尺寸
  isUserMessage?: boolean
}

const MessageImage = ({ content, canvasElementId, isUserMessage = false }: MessageImageProps) => {
  const { excalidrawAPI } = useCanvas()
  const { t } = useTranslation()
  const [filesArray, setFilesArray] = useState<{ id: string; url: string }[]>([])
  const [showMobileButtons, setShowMobileButtons] = useState(false)

  // 更新files数组，包括延迟重试以处理时序问题
  useEffect(() => {
    const updateFiles = () => {
      if (!excalidrawAPI) {
        return
      }

      const files = excalidrawAPI.getFiles()
      const newFilesArray = Object.keys(files || {}).map((key) => ({
        id: key,
        url: files![key].dataURL,
      }))

      setFilesArray(newFilesArray)
    }

    // 立即更新一次
    updateFiles()

    // 如果有图片URL但没有找到对应的canvas文件，延迟重试几次
    if (content.image_url.url) {
      // 延迟500ms重试一次（等待canvas files更新）
      const timer1 = setTimeout(updateFiles, 500)
      // 延迟1秒再重试一次
      const timer2 = setTimeout(updateFiles, 1000)
      // 延迟2秒最后重试一次
      const timer3 = setTimeout(updateFiles, 2000)

      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
        clearTimeout(timer3)
      }
    }
  }, [excalidrawAPI, content.image_url.url])

  const handleImagePositioning = (id: string) => {
    excalidrawAPI?.scrollToContent(id, { animate: true })
  }

  const handleDownloadImage = async (url: string, filename?: string) => {
    try {
      // 获取图片数据
      const response = await fetch(url)
      const blob = await response.blob()

      // 创建下载链接
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl

      // 设置文件名
      if (filename) {
        link.download = filename
      } else {
        // 从URL中提取文件名
        const urlParts = url.split('/')
        const defaultFilename = urlParts[urlParts.length - 1]?.split('?')[0] || 'image.png'
        link.download = defaultFilename
      }

      // 触发下载
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // 清理
      window.URL.revokeObjectURL(downloadUrl)

      console.log('✅ [MessageImage] 图片下载成功:', link.download)
    } catch (error) {
      console.error('❌ [MessageImage] 图片下载失败:', error)
    }
  }

  // 移动端触摸交互处理
  const handleMobileTouch = () => {
    setShowMobileButtons(true)

    // 3秒后自动隐藏按钮
    setTimeout(() => {
      setShowMobileButtons(false)
    }, 3000)
  }

  // 改进的ID匹配逻辑：借鉴Markdown.tsx的复杂匹配逻辑
  let id = canvasElementId

  // 调试日志
  if (canvasElementId) {
    console.log('🎯 MessageImage: 使用传递的canvasElementId:', canvasElementId)
  }

  if (!id && content.image_url.url) {
    // 1. 首先尝试直接URL匹配
    const directMatch = filesArray.find((file) => content.image_url.url?.includes(file.url))
    if (directMatch) {
      id = directMatch.id
      console.log('🎯 MessageImage: 通过URL完全匹配找到ID:', id)
    }

    // 2. 如果没找到，尝试从URL中提取文件名进行匹配
    if (!id && content.image_url.url) {
      // 从各种URL格式中提取文件名
      let filename = ''

      if (content.image_url.url.includes('/api/file/')) {
        // 处理 /api/file/xxx.png 格式
        filename = content.image_url.url.split('/api/file/')[1]?.split('?')[0]
      } else if (
        content.image_url.url.includes('cos.') &&
        content.image_url.url.includes('myqcloud.com')
      ) {
        // 处理腾讯云URL格式
        // 腾讯云URL可能是: https://xxx.cos.xxx.myqcloud.com/im_xxx.png.avif
        // 需要提取 im_xxx.png 部分
        const urlObj = new URL(content.image_url.url)
        const pathname = urlObj.pathname

        // 移除开头的斜杠
        let fullPath = pathname.startsWith('/') ? pathname.substring(1) : pathname

        // 处理多重扩展名（如 .png.avif, .jpg.webp 等）
        const multiExtensions = ['.avif', '.webp']
        for (const ext of multiExtensions) {
          if (fullPath.endsWith(ext)) {
            fullPath = fullPath.substring(0, fullPath.length - ext.length)
          }
        }

        // 提取文件名（可能包含路径）
        filename = fullPath

        // 如果文件名还包含路径，提取最后部分
        if (filename.includes('/')) {
          filename = filename.split('/').pop() || filename
        }
      } else if (content.image_url.url.includes('/')) {
        // 处理其他URL格式，提取最后的文件名
        const parts = content.image_url.url.split('/')
        filename = parts[parts.length - 1]?.split('?')[0]
      }

      // 如果提取到文件名，尝试在canvas files中查找
      if (filename) {
        // 首先尝试直接匹配文件名作为ID
        const directFileMatch = filesArray.find((file) => file.id === filename)
        if (directFileMatch) {
          id = filename
          console.log('🎯 MessageImage: 通过文件名直接匹配找到ID:', id)
        } else {
          // 如果文件名有扩展名，尝试去掉扩展名匹配
          const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '')

          const matchWithoutExt = filesArray.find((file) => file.id === filenameWithoutExt)
          if (matchWithoutExt) {
            id = filenameWithoutExt
            console.log('🎯 MessageImage: 通过去扩展名匹配找到ID:', id)
          } else {
            // 特殊处理：尝试查找以 im_ 开头的匹配项
            // 有时候URL中的文件名可能缺少 im_ 前缀，或者有额外的前缀
            const possibleIds = [
              filename,
              filenameWithoutExt,
              `im_${filename}`,
              `im_${filenameWithoutExt}`,
              filename.replace(/^im_/, ''), // 去掉im_前缀再试
              filenameWithoutExt.replace(/^im_/, ''),
            ]

            let foundMatch = false
            for (const possibleId of possibleIds) {
              const match = filesArray.find((file) => file.id === possibleId)
              if (match) {
                id = match.id
                foundMatch = true
                console.log('🎯 MessageImage: 通过可能ID匹配找到:', id, 'from:', possibleId)
                break
              }
            }

            if (!foundMatch) {
              // 尝试部分匹配：canvas ID可能包含文件名，或文件名包含canvas ID
              const partialMatch = filesArray.find((file) => {
                // 尝试多种匹配方式
                const idInFilename = filename.includes(file.id)
                const filenameInId = file.id.includes(filenameWithoutExt)
                const filenameInUrl = file.url?.includes(filename)
                const filenameWithoutExtInUrl = file.url?.includes(filenameWithoutExt)

                return idInFilename || filenameInId || filenameInUrl || filenameWithoutExtInUrl
              })

              if (partialMatch) {
                id = partialMatch.id
              } else {
                console.log('❌ MessageImage: 无法找到匹配的canvas元素', {
                  canvasElementId,
                  imageUrl: content.image_url.url,
                  filename,
                  filesCount: filesArray.length,
                  possibleIds,
                })
              }
            }
          }
        }
      }
    }
  }

  return (
    <div className='w-full'>
      <PhotoView src={content.image_url.url}>
        <span
          className='group block relative overflow-hidden rounded-md my-2 last:mb-4'
          onTouchStart={handleMobileTouch}
        >
          <img
            className={`cursor-pointer group-hover:scale-105 transition-transform duration-300 w-full h-auto rounded-md border border-border ${
              isUserMessage ? 'max-h-[140px] object-cover' : 'object-contain'
            }`}
            src={content.image_url.url}
            alt='Image'
          />

          {/* 定位按钮 - 右上角 */}
          {id && (
            <Button
              variant='secondary'
              className={`absolute top-2 right-2 z-10 transition-opacity duration-200 ${
                // 移动端：根据状态显示，桌面端：hover显示
                showMobileButtons ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                handleImagePositioning(id)
              }}
            >
              {t('chat:messages:imagePositioning')}
            </Button>
          )}

          {/* 下载按钮 - 右下角 */}
          <Button
            variant='secondary'
            size='icon'
            className={`absolute bottom-2 right-2 z-10 transition-opacity duration-200 h-8 w-8 ${
              // 移动端：根据状态显示，桌面端：hover显示
              showMobileButtons ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'
            }`}
            onClick={(e) => {
              e.stopPropagation()
              // 提取文件名用于下载
              let downloadFilename = ''
              if (content.image_url.url) {
                const urlParts = content.image_url.url.split('/')
                downloadFilename = urlParts[urlParts.length - 1]?.split('?')[0] || 'image.png'
                // 移除可能的额外扩展名
                downloadFilename = downloadFilename.replace('.avif', '').replace('.webp', '')
              }
              handleDownloadImage(content.image_url.url, downloadFilename)
            }}
            title={t('common:download') || 'Download'}
          >
            <Download className='h-4 w-4' />
          </Button>
        </span>
      </PhotoView>
    </div>
  )
}

export default MessageImage
