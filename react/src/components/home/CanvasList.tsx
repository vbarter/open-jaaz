import { listCanvases, createCanvas } from '@/api/canvas'
import CanvasCard from '@/components/home/CanvasCard'
import { Button } from '@/components/ui/button'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useConfigs } from '@/contexts/configs'
import { DEFAULT_SYSTEM_PROMPT } from '@/constants'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

const CanvasList: React.FC = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const { authStatus } = useAuth()
  const { setInitCanvas } = useConfigs()
  const isHomePage = location.pathname === '/'

  const { data: canvases, refetch } = useQuery({
    queryKey: ['canvases'],
    queryFn: listCanvases,
    enabled: isHomePage && authStatus.is_logged_in, // 只有在首页且已登录时才查询
    refetchOnMount: 'always',
  })

  // 🔄 监听认证状态变化，当登录/登出时刷新数据
  useEffect(() => {
    if (isHomePage && authStatus.is_logged_in) {
      console.log('🔄 CanvasList: Auth status changed to logged in, refetching canvases')
      refetch()
    }
  }, [authStatus.is_logged_in, isHomePage, refetch])

  const navigate = useNavigate()
  const handleCanvasClick = (id: string) => {
    navigate({ to: '/canvas/$id', params: { id } })
  }

  // 创建新项目的mutation
  const { mutate: createCanvasMutation, isPending: isCreatingCanvas } = useMutation({
    mutationFn: createCanvas,
    onSuccess: (data, variables) => {
      setInitCanvas(true)

      // 跳转到新创建的canvas页面
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

  // 创建新项目的处理函数
  const handleCreateNewProject = () => {
    createCanvasMutation({
      name: t('home:newCanvas'),
      canvas_id: nanoid(),
      messages: [], // 空消息数组，创建空项目
      session_id: nanoid(),
      text_model: null, // 使用默认模型
      tool_list: [], // 使用默认工具
      system_prompt: localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT,
    })
  }

  // 🚨 如果未登录，不显示项目列表
  if (!authStatus.is_logged_in) {
    console.log('🚫 CanvasList: User not logged in, not showing projects')
    return null
  }

  return (
    <div className="flex flex-col px-4 sm:px-6 md:px-10 mt-6 sm:mt-8 md:mt-10 gap-4 select-none max-w-[1200px] mx-auto">
      {canvases && canvases.length > 0 && (
        <motion.div
          className="flex items-center justify-between px-2 sm:px-0"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="text-xl sm:text-2xl font-bold">
            {t('home:allProjects')}
          </span>
          <Button
            onClick={handleCreateNewProject}
            disabled={isCreatingCanvas}
            className="bg-gray-800 hover:bg-gray-700 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="size-4" />
            {t('home:newProject')}
          </Button>
        </motion.div>
      )}

      <AnimatePresence>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4 w-full pb-6 sm:pb-10 px-1 sm:px-0">
          {canvases?.map((canvas, index) => (
            <CanvasCard
              key={canvas.id}
              index={index}
              canvas={canvas}
              handleCanvasClick={handleCanvasClick}
              handleDeleteCanvas={() => refetch()}
            />
          ))}
        </div>
      </AnimatePresence>
    </div>
  )
}

export default memo(CanvasList)
