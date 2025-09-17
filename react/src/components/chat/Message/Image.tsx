import { Button } from '@/components/ui/button'
import { useCanvas } from '@/contexts/canvas'
import { useTranslation } from 'react-i18next'
import { PhotoView } from 'react-photo-view'

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
  const files = excalidrawAPI?.getFiles()
  const filesArray = Object.keys(files || {}).map((key) => ({
    id: key,
    url: files![key].dataURL,
  }))

  const { t } = useTranslation()

  const handleImagePositioning = (id: string) => {
    excalidrawAPI?.scrollToContent(id, { animate: true })
  }

  // 优化定位逻辑：优先使用直接传递的canvas元素ID，其次通过URL匹配
  // 修复：也检查URL中是否包含文件名来匹配
  let id = canvasElementId

  // 调试日志
  if (canvasElementId) {
    console.log('🎯 MessageImage: 使用传递的canvasElementId:', canvasElementId)
  }

  if (!id && content.image_url.url) {
    // 尝试通过URL匹配
    const matchedFile = filesArray.find((file) =>
      content.image_url.url?.includes(file.url) ||
      file.url?.includes(content.image_url.url)
    )

    if (matchedFile) {
      id = matchedFile.id
      console.log('🎯 MessageImage: 通过URL完全匹配找到ID:', id)
    } else {
      // 如果还是找不到，尝试从URL中提取文件名并在files中查找
      const urlParts = content.image_url.url.split('/')
      const filename = urlParts[urlParts.length - 1].split('?')[0] // 移除查询参数

      // 查找包含相同文件名的file
      const fileByName = filesArray.find((file) =>
        file.url?.includes(filename)
      )

      if (fileByName) {
        id = fileByName.id
        console.log('🎯 MessageImage: 通过文件名匹配找到ID:', id, 'filename:', filename)
      } else {
        console.log('❌ MessageImage: 无法找到匹配的canvas元素', {
          canvasElementId,
          imageUrl: content.image_url.url,
          filename,
          filesCount: filesArray.length
        })
      }
    }
  }

  return (
    <div className="w-full">
      <PhotoView src={content.image_url.url}>
        <span className="group block relative overflow-hidden rounded-md my-2 last:mb-4">
          <img
            className={`cursor-pointer group-hover:scale-105 transition-transform duration-300 w-full h-auto rounded-md border border-border ${
              isUserMessage ? 'max-h-[140px] object-cover' : 'object-contain'
            }`}
            src={content.image_url.url}
            alt="Image"
          />

          {id && (
            <Button
              variant="secondary"
              className="group-hover:opacity-100 opacity-0 absolute top-2 right-2 z-10"
              onClick={(e) => {
                e.stopPropagation()
                handleImagePositioning(id)
              }}
            >
              {t('chat:messages:imagePositioning')}
            </Button>
          )}
        </span>
      </PhotoView>
    </div>
  )
}

export default MessageImage
