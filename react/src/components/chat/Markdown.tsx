import { Button } from '@/components/ui/button'
import { useCanvas } from '@/contexts/canvas'
import { memo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown, { Components } from 'react-markdown'
import { PhotoView } from 'react-photo-view'
import remarkGfm from 'remark-gfm'
import TextFoldTag from './Message/TextFoldTag'
import { Download } from 'lucide-react'

type MarkdownProps = {
  children: string
}

const NonMemoizedMarkdown: React.FC<MarkdownProps> = ({ children }) => {
  const { excalidrawAPI } = useCanvas()
  const [filesArray, setFilesArray] = useState<{ id: string; url: string }[]>([])
  const { t } = useTranslation()
  const [isThinkExpanded, setIsThinkExpanded] = useState(false)


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
    if (children.includes('![') && children.includes('](')) {
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
  }, [excalidrawAPI, children])

  // Main function to process think tags
  const processThinkTags = (content: string) => {
    // Remove empty think tags and fix unclosed tags
    const cleanedContent = content.replace(/<think>\s*<\/think>/g, '')
    const openTags = (cleanedContent.match(/<think>/g) || []).length
    const closeTags = (cleanedContent.match(/<\/think>/g) || []).length
    const fixedContent =
      openTags > closeTags
        ? cleanedContent + '</think>'.repeat(openTags - closeTags)
        : cleanedContent

    const thinkRegex = /<think>([\s\S]*?)<\/think>/g
    const parts = []
    let lastIndex = 0
    let match

    while ((match = thinkRegex.exec(fixedContent)) !== null) {
      if (match.index > lastIndex) {
        const beforeContent = fixedContent.slice(lastIndex, match.index).trim()
        if (beforeContent) {
          parts.push({ type: 'normal', content: beforeContent })
        }
      }

      const thinkContent = match[1]?.trim()
      if (thinkContent) {
        parts.push({ type: 'think', content: thinkContent })
      }
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < fixedContent.length) {
      const remainingContent = fixedContent.slice(lastIndex).trim()
      if (remainingContent) {
        parts.push({ type: 'normal', content: remainingContent })
      }
    }

    if (parts.length === 0 && fixedContent.trim()) {
      parts.push({ type: 'normal', content: fixedContent.trim() })
    }

    console.log('Think tags processing:', {
      parts,
      originalContent: children.substring(0, 100),
    })

    return { parts, hasUnclosed: openTags > closeTags }
  }

  // Check if it should auto-expand
  const { parts, hasUnclosed } = children.includes('<think>')
    ? processThinkTags(children)
    : { parts: [], hasUnclosed: false }

  useEffect(() => {
    setIsThinkExpanded(hasUnclosed)
  }, [hasUnclosed])

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

      console.log('✅ [Markdown IMG] 图片下载成功:', link.download)
    } catch (error) {
      console.error('❌ [Markdown IMG] 图片下载失败:', error)
    }
  }

  const components: Components = {
    code: ({ node, className, children, ref, ...props }) => {
      const match = /language-(\w+)/.exec(className || '')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return !(props as any).inline && match ? (
        <pre
          {...props}
          className={`${className} text-sm w-full max-w-full overflow-x-auto p-3 rounded-lg mt-2 bg-zinc-800 text-white dark:bg-zinc-300 dark:text-black whitespace-pre-wrap break-all`}
        >
          <code
            className={match[1]}
            style={{
              wordBreak: 'break-all',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word'
            }}
          >
            {children}
          </code>
        </pre>
      ) : (
        <code
          className={`${className} text-sm py-0.5 px-1 overflow-x-auto whitespace-pre-wrap rounded-md bg-zinc-800 text-white dark:bg-zinc-300 dark:text-black break-all`}
          {...props}
        >
          {children}
        </code>
      )
    },

    ol: ({ node, children, ...props }) => {
      return (
        <ol className="list-decimal list-inside ml-1" {...props}>
          {children}
        </ol>
      )
    },
    li: ({ node, children, ...props }) => {
      return (
        <li className="py-1 [&>p]:inline [&>p]:m-0" {...props}>
          {children}
        </li>
      )
    },
    ul: ({ node, children, ...props }) => {
      return (
        <ul className="list-disc list-inside ml-1" {...props}>
          {children}
        </ul>
      )
    },
    strong: ({ node, children, ...props }) => {
      return (
        <span className="font-bold" {...props}>
          {children}
        </span>
      )
    },
    a: ({ node, children, ...props }) => {
      return (
        <a
          className="text-blue-500 hover:underline break-all"
          target="_blank"
          rel="noreferrer"
          {...props}
        >
          {children}
        </a>
      )
    },
    h1: ({ node, children, ...props }) => {
      return (
        <h1 className="text-3xl font-semibold mt-6 mb-2" {...props}>
          {children}
        </h1>
      )
    },
    h2: ({ node, children, ...props }) => {
      return (
        <h2 className="text-2xl font-semibold mt-6 mb-2" {...props}>
          {children}
        </h2>
      )
    },
    h3: ({ node, children, ...props }) => {
      return (
        <h3 className="text-xl font-semibold mt-6 mb-2" {...props}>
          {children}
        </h3>
      )
    },
    h4: ({ node, children, ...props }) => {
      return (
        <h4 className="text-lg font-semibold mt-6 mb-2" {...props}>
          {children}
        </h4>
      )
    },
    h5: ({ node, children, ...props }) => {
      return (
        <h5 className="text-base font-semibold mt-6 mb-2" {...props}>
          {children}
        </h5>
      )
    },
    h6: ({ node, children, ...props }) => {
      return (
        <h6 className="text-sm font-semibold mt-6 mb-2" {...props}>
          {children}
        </h6>
      )
    },
    blockquote: ({ node, children, ...props }) => {
      return (
        <blockquote
          className="border-l-3 border-b-accent-foreground pl-4 py-2"
          {...props}
        >
          {children}
        </blockquote>
      )
    },
    img: ({ node, children, ...props }) => {
      // 改进的ID匹配逻辑：支持多种URL格式
      let id = undefined

      // 1. 首先尝试直接URL匹配
      const directMatch = filesArray.find((file) => props.src?.includes(file.url))
      if (directMatch) {
        id = directMatch.id
      }

      // 2. 如果没找到，尝试从URL中提取文件名进行匹配
      if (!id && props.src) {
        // 从各种URL格式中提取文件名
        let filename = ''

        if (props.src.includes('/api/file/')) {
          // 处理 /api/file/xxx.png 格式
          filename = props.src.split('/api/file/')[1]?.split('?')[0]
        } else if (props.src.includes('cos.') && props.src.includes('myqcloud.com')) {
          // 处理腾讯云URL格式
          // 腾讯云URL可能是: https://xxx.cos.xxx.myqcloud.com/im_xxx.png.avif
          // 需要提取 im_xxx.png 部分
          const urlObj = new URL(props.src)
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
        } else if (props.src.includes('/')) {
          // 处理其他URL格式，提取最后的文件名
          const parts = props.src.split('/')
          filename = parts[parts.length - 1]?.split('?')[0]
        }

        // 如果提取到文件名，尝试在canvas files中查找
        if (filename) {
          // 首先尝试直接匹配文件名作为ID
          const directFileMatch = filesArray.find(file => file.id === filename)
          if (directFileMatch) {
            id = filename
          } else {
            // 如果文件名有扩展名，尝试去掉扩展名匹配
            const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '')

            const matchWithoutExt = filesArray.find(file => file.id === filenameWithoutExt)
            if (matchWithoutExt) {
              id = filenameWithoutExt
            } else {
              // 特殊处理：尝试查找以 im_ 开头的匹配项
              // 有时候URL中的文件名可能缺少 im_ 前缀，或者有额外的前缀
              const possibleIds = [
                filename,
                filenameWithoutExt,
                `im_${filename}`,
                `im_${filenameWithoutExt}`,
                filename.replace(/^im_/, ''),  // 去掉im_前缀再试
                filenameWithoutExt.replace(/^im_/, '')
              ]

              let foundMatch = false
              for (const possibleId of possibleIds) {
                const match = filesArray.find(file => file.id === possibleId)
                if (match) {
                  id = match.id
                  foundMatch = true
                  break
                }
              }

              if (!foundMatch) {
                // 尝试部分匹配：canvas ID可能包含文件名，或文件名包含canvas ID
                const partialMatch = filesArray.find(file => {
                  // 尝试多种匹配方式
                  const idInFilename = filename.includes(file.id)
                  const filenameInId = file.id.includes(filenameWithoutExt)
                  const filenameInUrl = file.url?.includes(filename)
                  const filenameWithoutExtInUrl = file.url?.includes(filenameWithoutExt)

                  return idInFilename || filenameInId || filenameInUrl || filenameWithoutExtInUrl
                })

                if (partialMatch) {
                  id = partialMatch.id
                }
              }
            }
          }
        }
      }


      // 检查alt文本是否包含video_id标识，这表示这是一个视频文件
      const isVideo = props.alt && props.alt.includes('video_id:')

      if (isVideo) {
        return (
          <span className="group block relative overflow-hidden rounded-md my-2 last:mb-4">
            <video
              className="w-full max-w-full h-auto rounded-md cursor-pointer group-hover:scale-105 transition-transform duration-300"
              controls
              preload="metadata"
              src={props.src}
              {...(props.alt && { title: props.alt })}
            >
              Your browser does not support the video tag.
            </video>

            {/* 定位按钮 - 右上角 */}
            {id && (
              <Button
                variant="secondary"
                className="group-hover:opacity-100 opacity-0 absolute top-2 right-2 z-10 transition-opacity duration-200"
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
              variant="secondary"
              size="icon"
              className="group-hover:opacity-100 opacity-0 absolute bottom-2 right-2 z-10 transition-opacity duration-200 h-8 w-8"
              onClick={(e) => {
                e.stopPropagation()
                // 提取文件名用于下载
                let downloadFilename = ''
                if (props.src) {
                  const urlParts = props.src.split('/')
                  downloadFilename = urlParts[urlParts.length - 1]?.split('?')[0] || 'video.mp4'
                }
                handleDownloadImage(props.src!, downloadFilename)
              }}
              title={t('common:download') || 'Download'}
            >
              <Download className="h-4 w-4" />
            </Button>
          </span>
        )
      }

      return (
        <PhotoView src={props.src}>
          <span className="group block relative overflow-hidden rounded-md my-2 last:mb-4">
            <img
              className="cursor-pointer group-hover:scale-105 transition-transform duration-300"
              {...props}
            />

            {/* 定位按钮 - 右上角 */}
            {id && (
              <Button
                variant="secondary"
                className="group-hover:opacity-100 opacity-0 absolute top-2 right-2 z-10 transition-opacity duration-200"
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
              variant="secondary"
              size="icon"
              className="group-hover:opacity-100 opacity-0 absolute bottom-2 right-2 z-10 transition-opacity duration-200 h-8 w-8"
              onClick={(e) => {
                e.stopPropagation()
                // 提取文件名用于下载
                let downloadFilename = props.alt || ''
                if (!downloadFilename && props.src) {
                  const urlParts = props.src.split('/')
                  downloadFilename = urlParts[urlParts.length - 1]?.split('?')[0] || 'image.png'
                  // 移除可能的额外扩展名
                  downloadFilename = downloadFilename.replace('.avif', '').replace('.webp', '')
                }
                handleDownloadImage(props.src!, downloadFilename)
              }}
              title={t('common:download') || 'Download'}
            >
              <Download className="h-4 w-4" />
            </Button>
          </span>
        </PhotoView>
      )
    },
    video: ({ node, children, ...props }) => {
      const id = filesArray.find((file) => props.src?.includes(file.url))?.id
      return (
        <span className="group block relative overflow-hidden rounded-md my-2 last:mb-4">
          <video
            className="w-full max-w-full h-auto rounded-md"
            controls
            preload="metadata"
            {...props}
          >
            Your browser does not support the video tag.
          </video>

          {/* 定位按钮 - 右上角 */}
          {id && (
            <Button
              variant="secondary"
              className="group-hover:opacity-100 opacity-0 absolute top-2 right-2 z-10 transition-opacity duration-200"
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
            variant="secondary"
            size="icon"
            className="group-hover:opacity-100 opacity-0 absolute bottom-2 right-2 z-10 transition-opacity duration-200 h-8 w-8"
            onClick={(e) => {
              console.log('💾 [Markdown VIDEO] 点击下载视频按钮')
              e.stopPropagation()
              // 提取文件名用于下载
              let downloadFilename = ''
              if (props.src) {
                const urlParts = props.src.split('/')
                downloadFilename = urlParts[urlParts.length - 1]?.split('?')[0] || 'video.mp4'
              }
              handleDownloadImage(props.src!, downloadFilename)
            }}
            title={t('common:download') || 'Download'}
          >
            <Download className="h-4 w-4" />
          </Button>
        </span>
      )
    },
  }
  // Special handling if content contains think tags
  if (children.includes('<think>')) {
    return (
      <div className="space-y-3 flex flex-col w-full max-w-full">
        {parts.map((part, index) =>
          part.type === 'think' ? (
            <TextFoldTag
              key={index}
              isExpanded={isThinkExpanded}
              onToggleExpand={() => setIsThinkExpanded(!isThinkExpanded)}
            >
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={components}
                >
                  {part.content}
                </ReactMarkdown>
              </div>
            </TextFoldTag>
          ) : (
            <div key={index} className="w-full max-w-full">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={components}
              >
                {part.content}
              </ReactMarkdown>
            </div>
          )
        )}
      </div>
    )
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  )
}

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children
)
