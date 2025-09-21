import { getCanvas, renameCanvas, renameSession } from '@/api/canvas'
import CanvasExcali from '@/components/canvas/CanvasExcali'
import CanvasMenu from '@/components/canvas/menu'
import CanvasPopbarWrapper from '@/components/canvas/pop-bar'
import { FloatingProjectInfo } from '@/components/canvas/FloatingProjectInfo'
import { FloatingUserInfo } from '@/components/canvas/FloatingUserInfo'
import { FloatingChatPanel } from '@/components/canvas/FloatingChatPanel'
// VideoCanvasOverlay removed - using native Excalidraw embeddable elements instead
import { CanvasProvider } from '@/contexts/canvas'
import { useConfigs } from '@/contexts/configs'
import { Session } from '@/types/types'
import { createFileRoute, useParams, useSearch, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { nanoid } from 'nanoid'
import { generateChatSessionTitle } from '@/utils/formatDate'
import { useTranslation } from 'react-i18next'

// 检测是否是图片文件
function isImageUrl(url: string): boolean {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.bmp']
  const lowerUrl = url.toLowerCase()
  return imageExtensions.some(ext => lowerUrl.includes(ext))
}

// 检测是否是腾讯云COS URL
function isTencentCosUrl(url: string): boolean {
  return url.includes('.cos.') && url.includes('.myqcloud.com')
}

// 为腾讯云图片URL添加压缩参数
function addCompressionParams(url: string): string {
  // 检查是否已经包含 imageMogr2 参数
  if (url.includes('imageMogr2')) {
    return url
  }
  
  // 检查URL中是否已有参数
  const hasParams = url.includes('?')
  const compressionParam = 'imageMogr2/thumbnail/avif'
  
  if (hasParams) {
    // 已有参数，使用 & 连接
    return `${url}&${compressionParam}`
  } else {
    // 没有参数，使用 ? 连接
    return `${url}?${compressionParam}`
  }
}

// 将旧格式的图片URL转换为优化格式，支持重定向URL和腾讯云压缩参数
function convertLegacyImageUrls(canvasData: any) {
  if (canvasData?.data?.files) {
    const files = canvasData.data.files
    Object.keys(files).forEach(fileId => {
      const file = files[fileId]
      if (file?.dataURL && typeof file.dataURL === 'string') {
        let originalUrl = file.dataURL
        let convertedUrl = originalUrl
        
        // 处理本地 API 格式的 URL
        if (originalUrl.startsWith('/api/file/') && !originalUrl.includes('?redirect=true')) {
          convertedUrl = `${originalUrl}?redirect=true`
          console.log(`🔄 转换本地API URL: ${fileId} -> ${convertedUrl}`)
        }
        // 处理腾讯云COS直链URL
        else if (isTencentCosUrl(originalUrl) && isImageUrl(originalUrl)) {
          convertedUrl = addCompressionParams(originalUrl)
          if (convertedUrl !== originalUrl) {
            console.log(`🗜️ 添加腾讯云压缩参数: ${fileId} -> ${convertedUrl}`)
          }
        }
        
        // 更新URL
        if (convertedUrl !== originalUrl) {
          file.dataURL = convertedUrl
        }
      }
    })
  }
  return canvasData
}

export const Route = createFileRoute('/canvas/$id')({
  component: Canvas,
})

function Canvas() {
  const { id } = useParams({ from: '/canvas/$id' })
  const navigate = useNavigate()
  const { textModel } = useConfigs()
  const { t } = useTranslation('canvas')
  const [canvas, setCanvas] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [canvasName, setCanvasName] = useState('')
  const [originalCanvasName, setOriginalCanvasName] = useState('') // 保存原始canvas名称
  const [projectName, setProjectName] = useState('') // Project名称，用于左上角显示
  const [sessionList, setSessionList] = useState<Session[]>([])
  const [currentSessionTitle, setCurrentSessionTitle] = useState('') // 当前session的标题
  // initialVideos removed - using native Excalidraw embeddable elements instead
  const search = useSearch({ from: '/canvas/$id' }) as {
    sessionId: string
  }
  const searchSessionId = search?.sessionId || ''

  // 获取当前session的标题用于功能栏显示
  const getCurrentSessionTitle = () => {
    if (!searchSessionId || sessionList.length === 0) {
      return t('newChat')
    }

    const currentSession = sessionList.find(s => s.id === searchSessionId)
    if (!currentSession) {
      return t('newChat')
    }

    // 使用session的title字段
    return currentSession.title || t('newChat')
  }
  useEffect(() => {
    let mounted = true

    const fetchCanvas = async () => {
      try {
        const startTime = performance.now()
        setIsLoading(true)
        setError(null)

        // 🔧 清空之前的画布数据，防止新项目继承老项目的数据
        setCanvas(null)

        const data = await getCanvas(id)
        const endTime = performance.now()
        
        // 转换旧格式的图片URL为重定向格式
        const convertedData = convertLegacyImageUrls(data)

        if (mounted) {
          setCanvas(convertedData)
          setCanvasName(data.name)
          setOriginalCanvasName(data.name) // 保存原始canvas名称
          setProjectName(data.name) // 初始化Project名称

          // 处理从后台获取的session，确保每个session都有标题，并按时间倒序排列
          let processedSessions = (data.sessions || []).map((session: Session, index: number) => {
            if (!session.title || !session.title.trim()) {
              // 如果session没有标题，设置默认标题
              return {
                ...session,
                title: index === 0 ? t('newChatWithNumber', { number: 1 }) : t('newChatWithNumber', { number: index + 1 })
              }
            }
            return session
          })

          // 按创建时间倒序排列（最新的在前面）
          processedSessions = processedSessions.sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )

          setSessionList(processedSessions)

          // 智能选择session：如果URL中没有sessionId，或sessionId对应的session不存在，则自动选择最新的session
          if (processedSessions.length > 0) {
            const currentSessionExists = processedSessions.some(s => s.id === searchSessionId)

            if (!searchSessionId || !currentSessionExists) {
              // 自动选择最新的session（第一个）
              const latestSession = processedSessions[0]
              console.log('自动选择最新session:', latestSession.id, latestSession.title)

              // 导航到最新session
              navigate({
                to: '/canvas/$id',
                params: { id: id },
                search: { sessionId: latestSession.id },
                replace: true // 使用replace避免影响浏览器历史
              })
            }
          } else {
            // 如果没有任何sessions，检查是否有URL传递的sessionId
            console.log('没有找到任何sessions，检查URL传递的sessionId:', searchSessionId)

            if (searchSessionId) {
              // 🔧 修复：如果URL中有sessionId，使用它创建新session（来自首页跳转）
              console.log('使用URL传递的sessionId创建新session:', searchSessionId)

              const urlSession: Session = {
                id: searchSessionId,
                title: t('newChatWithNumber', { number: 1 }),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                model: textModel?.model || 'gpt-4o',
                provider: textModel?.provider || 'openai',
              }

              // 立即将URL session添加到sessionList中
              setSessionList([urlSession])
              console.log('已创建并添加URL session:', searchSessionId, urlSession.title)

              // 不需要再次导航，URL已经包含正确的sessionId
            } else {
              // 只有在没有URL sessionId时才创建新的默认session
              console.log('没有URL sessionId，自动创建默认session')

              // 生成新的会话ID
              const defaultSessionId = nanoid()
              const defaultSessionName = t('newChatWithNumber', { number: 1 })

              // 创建默认session对象
              const defaultSession: Session = {
                id: defaultSessionId,
                title: defaultSessionName,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                model: textModel?.model || 'gpt-4o',
                provider: textModel?.provider || 'openai',
              }

              // 立即将默认session添加到sessionList中
              setSessionList([defaultSession])
              console.log('已创建并添加默认session:', defaultSessionId, defaultSessionName)

              // 导航到默认session
              navigate({
                to: '/canvas/$id',
                params: { id: id },
                search: { sessionId: defaultSessionId },
                replace: true // 使用replace避免影响浏览器历史
              })
            }
          }
          // Video elements now handled by native Excalidraw embeddable elements
        }
      } catch (err) {
        console.error('[debug] Canvas数据获取失败:', err)
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to fetch canvas data'))
          console.error('Failed to fetch canvas data:', err)
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    fetchCanvas()

    return () => {
      mounted = false
    }
  }, [id])

  // 🔧 监听路由参数变化，在切换到新画布时立即清空数据
  useEffect(() => {
    console.log('🔄 Canvas ID 变化，清空当前数据，准备加载新画布:', id)
    setCanvas(null)
    setSessionList([])
    setProjectName('')
    setCanvasName('')
    setOriginalCanvasName('')
    setCurrentSessionTitle('')
  }, [id])

  // 监听session变化，更新当前session标题
  useEffect(() => {
    if (sessionList.length > 0) {
      const newTitle = getCurrentSessionTitle()
      setCurrentSessionTitle(newTitle)
      console.log('当前session标题更新为:', newTitle)
    }
  }, [searchSessionId, sessionList])

  const handleNameSave = async () => {
    await renameCanvas(id, canvasName)
  }

  // 处理画布重命名
  const handleCanvasNameChange = async (newName: string) => {
    setCanvasName(newName)
    setOriginalCanvasName(newName) // 同时更新原始名称，这样后续的title计算会基于新名称
    await renameCanvas(id, newName)
  }

  // 处理Project名称变更（实时更新state）
  const handleProjectNameChange = (newName: string) => {
    setProjectName(newName)
  }

  // 保存Project名称到服务器
  const handleProjectNameSave = async (nameToSave?: string) => {
    const finalName = nameToSave || projectName
    try {
      console.log('正在保存Project名称:', finalName)
      await renameCanvas(id, finalName)
      // 同时更新其他相关的名称状态，保持一致性
      setOriginalCanvasName(finalName)
      setCanvasName(finalName) // 确保canvas名称也同步更新
      console.log('Project名称保存成功:', finalName)
    } catch (error) {
      console.error('保存Project名称失败:', error)
      // 可以添加错误提示
      throw error // 重新抛出错误，让子组件能够处理
    }
  }

  // 新建会话函数 - 创建新的会话ID并跳转
  const handleNewSession = () => {
    // 生成新的会话ID
    const newSessionId = nanoid()

    // 计算新session的名称
    const newSessionNumber = sessionList.length + 1
    const newSessionName = t('newChatWithNumber', { number: newSessionNumber })

    // 创建新的session对象，使用当前选择的模型
    const newSession: Session = {
      id: newSessionId,
      title: newSessionName, // 设置明确的session标题
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      model: textModel?.model || 'gpt-4o',
      provider: textModel?.provider || 'openai',
    }

    // 立即将新session添加到sessionList中，这样用户就能在History中看到
    setSessionList(prevSessions => [newSession, ...prevSessions])

    // 跳转到新的会话 - title会通过useEffect自动更新
    navigate({
      to: '/canvas/$id',
      params: { id: id },
      search: { sessionId: newSessionId }
    })
  }

  // 处理Session标题变更
  const handleSessionNameChange = async (sessionId: string, newTitle: string) => {
    const trimmedTitle = newTitle.trim() || `Session ${sessionId.slice(0, 8)}`
    console.log('更新Session标题:', sessionId, trimmedTitle)

    // 检查标题是否真的发生了变化
    const currentSession = sessionList.find(s => s.id === sessionId)
    const hasChanged = currentSession?.title !== trimmedTitle

    try {
      // 立即更新本地状态（乐观更新）
      setSessionList(prevSessions =>
        prevSessions.map(session =>
          session.id === sessionId
            ? { ...session, title: trimmedTitle }
            : session
        )
      )

      // 只有在标题真正改变时才调用后端API
      if (hasChanged) {
        await renameSession(sessionId, trimmedTitle)
        console.log('Session标题保存成功:', sessionId, trimmedTitle)
      } else {
        console.log('Session标题未改变，跳过API调用:', sessionId, trimmedTitle)
      }
    } catch (error) {
      console.error('保存Session标题失败:', error)

      // 如果保存失败，恢复原来的标题
      const originalSession = sessionList.find(s => s.id === sessionId)
      if (originalSession) {
        setSessionList(prevSessions =>
          prevSessions.map(session =>
            session.id === sessionId
              ? { ...session, title: originalSession.title }
              : session
          )
        )
      }
    }
  }

  if (isLoading) {
    return (
      <CanvasProvider>
        <div className='flex items-center justify-center w-screen h-screen bg-white'>
          <div className='flex flex-col items-center gap-4'>
            <Loader2 className='w-8 h-8 animate-spin text-primary' />
            <p className='text-muted-foreground'>{t('loading')}</p>
          </div>
        </div>
      </CanvasProvider>
    )
  }

  if (error) {
    return (
      <CanvasProvider>
        <div className='flex items-center justify-center w-screen h-screen bg-white'>
          <div className='flex flex-col items-center gap-4'>
            <p className='text-red-500'>{t('loadingFailed')} {error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className='px-4 py-2 bg-primary text-primary-foreground rounded'
            >
              {t('retry')}
            </button>
          </div>
        </div>
      </CanvasProvider>
    )
  }

  return (
    <CanvasProvider>
      <div className='relative w-screen h-screen bg-white overflow-hidden'>
        {/* 全屏画布 */}
        <div className='w-full h-full'>
          <CanvasExcali canvasId={id} initialData={canvas?.data} />
          <CanvasMenu />
          <CanvasPopbarWrapper />
          <FloatingProjectInfo
            projectName={projectName}
            onProjectNameChange={handleProjectNameChange}
            onProjectNameSave={handleProjectNameSave}
          />
          <FloatingUserInfo />
        </div>

        {/* 浮动聊天面板 */}
        <FloatingChatPanel
          canvasId={id}
          sessionList={sessionList}
          setSessionList={setSessionList}
          sessionId={searchSessionId}
          onNewSession={handleNewSession}
          onSessionNameChange={handleSessionNameChange}
        />
      </div>
    </CanvasProvider>
  )
}
