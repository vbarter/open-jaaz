import React from 'react'
import { Message } from '@/types/types'
import { Markdown } from '../Markdown'
import MessageImage from './Image'
import VideoMessage from '../VideoMessage'
import Timestamp from './Timestamp'

interface MultiMediaMessageProps {
  message: Message & {
    media?: {
      images?: Array<{
        url: string
        id: string
        timestamp: number
      }>
      videos?: Array<{
        url: string
        id: string
        timestamp: number
        metadata?: any
      }>
    }
  }
}

/**
 * 多媒体消息组件 - 支持在一条消息中显示多个图片和视频
 */
const MultiMediaMessage: React.FC<MultiMediaMessageProps> = ({ message }) => {
  const media = message.media || {}
  const images = media.images || []
  const videos = media.videos || []

  // 也检查旧格式的兼容性
  const hasLegacyVideo = message.type === 'video' && message.video_url
  const hasLegacyImage = message.type === 'image' && message.image_url

  // 合并旧格式和新格式的媒体
  const allVideos = [...videos]
  if (hasLegacyVideo && !videos.some(v => v.url === message.video_url)) {
    allVideos.push({
      url: message.video_url!,
      id: 'legacy_video',
      timestamp: message.timestamp || Date.now()
    })
  }

  const allImages = [...images]
  if (hasLegacyImage && !images.some(img => img.url === message.image_url)) {
    allImages.push({
      url: message.image_url!,
      id: 'legacy_image',
      timestamp: message.timestamp || Date.now()
    })
  }

  // 从content中移除媒体引用，只保留纯文本
  let textContent = message.content || ''
  if (typeof textContent === 'string') {
    // 移除markdown图片语法
    textContent = textContent.replace(/!\[.*?\]\(.*?\)/g, '').trim()
    // 移除视频标记
    textContent = textContent.replace(/🎬 \[Video\]\(.*?\)/g, '').trim()
  }

  const isUser = message.role === 'user'

  return (
    <div className={`${!isUser ? 'mb-4' : ''}`}>
      {/* 时间戳 */}
      <Timestamp
        timestamp={message.timestamp}
        align={isUser ? 'right' : 'left'}
      />

      {/* 文本内容 */}
      {textContent && (
        <div className={isUser ? 'flex justify-end mb-2' : 'mb-2'}>
          {isUser ? (
            <div className='bg-primary text-primary-foreground rounded-xl rounded-br-md px-4 py-3 text-left max-w-[300px] w-fit'>
              <Markdown>{textContent}</Markdown>
            </div>
          ) : (
            <div className='text-gray-800 dark:text-gray-200 text-left'>
              <Markdown>{textContent}</Markdown>
            </div>
          )}
        </div>
      )}

      {/* 视频内容 */}
      {allVideos.length > 0 && (
        <div className='space-y-3 mb-3'>
          {allVideos.map((video, index) => (
            <div key={video.id || index} className='w-full'>
              <VideoMessage
                content=""
                videoUrl={video.url}
                videoId={video.id}
                metadata={video.metadata}
                timestamp={video.timestamp}
              />
            </div>
          ))}
        </div>
      )}

      {/* 图片内容 */}
      {allImages.length > 0 && (
        <div className={`${allImages.length === 1 ? '' : 'grid grid-cols-2 gap-2'} mb-3`}>
          {allImages.map((image, index) => (
            <div key={image.id || index} className={isUser ? 'max-w-[140px] ml-auto' : 'max-w-[300px]'}>
              <MessageImage
                content={{
                  type: 'image_url',
                  image_url: { url: image.url }
                }}
                isUserMessage={isUser}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MultiMediaMessage