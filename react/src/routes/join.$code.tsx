import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import TopMenu from '@/components/TopMenu'
import CanvasList from '@/components/home/CanvasList'
import ChatTextarea from '@/components/chat/ChatTextarea'
import InviteModal from '@/components/InviteModal'
import { useMutation } from '@tanstack/react-query'
import { createCanvas } from '@/api/canvas'
import { useNavigate } from '@tanstack/react-router'
import { useConfigs } from '@/contexts/configs'
import { useAuth } from '@/contexts/AuthContext'
import { DEFAULT_SYSTEM_PROMPT } from '@/constants'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import { validateInviteCode } from '@/api/invite'
import { logout } from '@/api/auth'
import Footer from '@/components/common/Footer'

export const Route = createFileRoute('/join/$code')({
  component: JoinLandingPage,
})

function JoinLandingPage() {
  const { code } = Route.useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { setInitCanvas } = useConfigs()
  const { authStatus } = useAuth()
  const [showInviteModal, setShowInviteModal] = useState(true)
  const [inviterName, setInviterName] = useState<string>('Someone')
  const [isProcessingLogout, setIsProcessingLogout] = useState(false)

  // 检查用户是否已登录，如果已登录则强制退出
  useEffect(() => {
    if (authStatus.is_logged_in && !isProcessingLogout) {

      setIsProcessingLogout(true)

      // 设置标记，表示这是静默强制退出，不需要提示
      sessionStorage.setItem('silent_logout', 'true')

      logout()
        .then(() => {

          setIsProcessingLogout(false)
          // 清理静默退出标记
          setTimeout(() => {
            sessionStorage.removeItem('silent_logout')
          }, 1000)
        })
        .catch((error) => {
          console.error('强制退出失败:', error)
          setIsProcessingLogout(false)
          // 清理静默退出标记
          sessionStorage.removeItem('silent_logout')
        })
    }
  }, [authStatus.is_logged_in, isProcessingLogout])

  // 获取邀请者名称
  useEffect(() => {
    const fetchInviterName = async () => {
      try {
        const result = await validateInviteCode(code)
        if (result.is_valid && result.inviter_nickname) {
          setInviterName(result.inviter_nickname)
        }
      } catch (error) {
        console.error('Failed to fetch inviter name:', error)
        // 保持默认的 "Someone"
      }
    }

    if (code) {
      fetchInviterName()
    }
  }, [code])

  const { mutate: createCanvasMutation, isPending } = useMutation({
    mutationFn: createCanvas,
    onSuccess: (data, variables) => {
      setInitCanvas(true)

      if (variables.messages && variables.messages.length > 0) {
        const messageData = {
          sessionId: variables.session_id,
          message: variables.messages[0],
          timestamp: Date.now(),
          canvasId: data.id,
        }
        localStorage.setItem('initial_user_message', JSON.stringify(messageData))
      }

      navigate({
        to: '/canvas/$id',
        params: { id: data.id },
        search: {
          sessionId: variables.session_id,
        },
      })
    },
    onError: (error) => {
      console.error('[debug] Canvas创建失败:', error)
      toast.error(t('common:messages.error'), {
        description: error.message,
      })
    },
  })

  return (
    <div className='flex flex-col h-screen relative overflow-hidden bg-soft-blue-radial'>
      <ScrollArea className='h-full relative z-10'>
        <TopMenu />

        <div className='relative flex flex-col items-center justify-center h-fit min-h-[calc(100vh-400px)] sm:min-h-[calc(100vh-460px)] pt-[40px] sm:pt-[60px] px-4 sm:px-6 select-none'>
          {/* 主内容区域 - 复用首页布局 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.21, 1.11, 0.81, 0.99] }}
            className='w-full max-w-4xl mx-auto p-8 sm:p-12'
          >
            <h1 className='text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-center
                           text-gray-800 dark:text-white drop-shadow-sm leading-tight'>
              {t('home:title')}
            </h1>

            <p className='text-base sm:text-lg md:text-xl lg:text-2xl text-gray-700 dark:text-gray-200
                          mb-10 text-center px-2 sm:px-4 leading-relaxed font-medium'>
              {t('home:subtitle')}
            </p>

            <div className='w-full max-w-2xl mx-auto'>
              <div className='bg-white/95 backdrop-blur-sm rounded-2xl p-1 shadow-lg border border-white/20'>
                <ChatTextarea
                  className='w-full border-0 bg-transparent'
                  messages={[]}
                  onSendMessages={(messages, configs) => {
                    createCanvasMutation({
                      name: t('home:newCanvas'),
                      canvas_id: nanoid(),
                      messages: messages,
                      session_id: nanoid(),
                      text_model: configs.textModel,
                      tool_list: configs.toolList,
                      model_name: configs.modelName,
                      system_prompt: localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT,
                    })
                  }}
                  pending={isPending}
                />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Canvas 列表区域 */}
        <div className='relative z-10 mt-8 sm:mt-12'>
          <CanvasList />
        </div>

        <Footer />
      </ScrollArea>

      {/* 邀请弹窗 - 只要不是正在登录状态就显示 */}
      {showInviteModal && !authStatus.is_logged_in && (
        <InviteModal
          inviteCode={code}
          onClose={() => setShowInviteModal(false)}
          inviterName={inviterName}
        />
      )}
    </div>
  )
}