import React, { useState, useEffect } from 'react'
import { PosterOutline, PosterPage } from '@/types/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Loader2, Edit2, Check, X, FileText, Image as ImageIcon, Layout, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'motion/react'

interface PosterOutlineMessageProps {
  outline: PosterOutline
  onGenerate: (pages: PosterPage[], fullOutline: string) => void
  onCancel: () => void
  isGenerating: boolean
}

const PATTERNS = [
  '/assets/patterns/abstract_pastel_pattern_1_1764693957114.png',
  '/assets/patterns/abstract_pastel_pattern_2_1764694000592.png',
  '/assets/patterns/abstract_pastel_pattern_3_1764694029791.png'
]

export const PosterOutlineMessage: React.FC<PosterOutlineMessageProps> = ({
  outline,
  onGenerate,
  onCancel,
  isGenerating
}) => {
  const [pages, setPages] = useState<PosterPage[]>(outline.pages)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<{ title: string; content: string }>({ title: '', content: '' })

  useEffect(() => {
    setPages(outline.pages)
  }, [outline])

  const handleEditStart = (index: number, page: PosterPage) => {
    setEditingIndex(index)
    setEditForm({ title: page.title, content: page.content })
  }

  const handleEditSave = () => {
    if (editingIndex === null) return

    const newPages = [...pages]
    newPages[editingIndex] = {
      ...newPages[editingIndex],
      title: editForm.title,
      content: editForm.content
    }
    setPages(newPages)
    setEditingIndex(null)
  }

  const getPageIcon = (type: string) => {
    switch (type) {
      case 'cover': return <ImageIcon className="w-3.5 h-3.5" />
      case 'content': return <FileText className="w-3.5 h-3.5" />
      case 'summary': return <Layout className="w-3.5 h-3.5" />
      default: return <FileText className="w-3.5 h-3.5" />
    }
  }

  const getPageLabel = (type: string) => {
    switch (type) {
      case 'cover': return '封面'
      case 'content': return '内容'
      case 'summary': return '总结'
      default: return '页面'
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto my-6 font-sans">
      <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/50 dark:border-gray-700/50 overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
        
        {/* Header Section */}
        <div className="relative p-8 pb-6">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500" />
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-pink-100 to-purple-100 dark:from-pink-900/30 dark:to-purple-900/30 rounded-xl">
                  <Sparkles className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                  海报生成大纲
                </h2>
              </div>
              <Badge variant="secondary" className="px-3 py-1.5 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg border-0">
                共 {pages.length} 页
              </Badge>
            </div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-base bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
              {outline.outline}
            </p>
          </div>
        </div>

        {/* Grid Layout - Optimized for 2 columns */}
        <div className="px-8 pb-8 bg-gradient-to-b from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-900/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {pages.map((page, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card 
                  className={cn(
                    "group relative h-full border-0 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden bg-white dark:bg-gray-800 rounded-2xl ring-1 ring-gray-200 dark:ring-gray-700",
                    editingIndex === index ? "ring-2 ring-pink-500 ring-offset-2 dark:ring-offset-gray-900 shadow-pink-500/10" : ""
                  )}
                >
                  {/* Card Header Background */}
                  <div className="h-28 w-full relative overflow-hidden">
                    <img 
                      src={PATTERNS[index % PATTERNS.length]} 
                      alt="pattern"
                      className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent dark:from-gray-800 dark:via-gray-800/20" />
                    
                    {/* Page Type Badge */}
                    <div className="absolute top-3 left-3">
                      <Badge className="bg-white/95 dark:bg-gray-900/90 backdrop-blur-md text-gray-700 dark:text-gray-200 shadow-sm border-0 px-2.5 py-1 flex items-center gap-1.5 rounded-lg font-medium">
                        {getPageIcon(page.type)}
                        <span>{getPageLabel(page.type)}</span>
                      </Badge>
                    </div>

                    {/* Page Number */}
                    <div className="absolute top-3 right-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/30 dark:bg-black/30 backdrop-blur-md text-xs font-bold text-gray-600 dark:text-gray-300 border border-white/40 dark:border-white/10">
                        {index + 1}
                      </span>
                    </div>
                  </div>

                  <CardContent className="p-5 relative -mt-6">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-1">
                      {editingIndex === index ? (
                        // Edit Mode
                        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pl-1">标题</label>
                            <Input 
                              value={editForm.title} 
                              onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                              className="h-10 font-bold text-lg border-gray-200 dark:border-gray-700 focus:ring-pink-500/20 bg-gray-50 dark:bg-gray-900/50"
                              placeholder="输入标题..."
                              autoFocus
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pl-1">内容描述</label>
                            <Textarea 
                              value={editForm.content}
                              onChange={(e) => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                              className="min-h-[140px] resize-none text-sm leading-relaxed border-gray-200 dark:border-gray-700 focus:ring-pink-500/20 bg-gray-50 dark:bg-gray-900/50"
                              placeholder="输入内容描述..."
                            />
                          </div>
                          <div className="flex gap-2 pt-2">
                            <Button 
                              size="sm" 
                              className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg" 
                              onClick={handleEditSave}
                            >
                              <Check className="w-3.5 h-3.5 mr-1.5" /> 保存修改
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="px-3 rounded-lg border-gray-200 dark:border-gray-700" 
                              onClick={() => setEditingIndex(null)}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <div className="flex flex-col h-full min-h-[160px] group/content">
                          <h3 className="font-bold text-xl text-gray-900 dark:text-gray-100 mb-3 leading-tight group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
                            {page.title}
                          </h3>
                          <div className="relative flex-1">
                            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-5">
                              {page.content}
                            </p>
                            <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-white dark:from-gray-800 to-transparent" />
                          </div>
                          
                          {/* Edit Button (Visible on Hover) */}
                          <div className="absolute -top-10 right-0 p-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-10">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-9 px-4 rounded-full shadow-lg bg-white dark:bg-gray-700 hover:bg-pink-50 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium text-xs border border-gray-100 dark:border-gray-600"
                              onClick={() => handleEditStart(index, page)}
                            >
                              <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                              编辑
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
          <Button 
            variant="ghost" 
            onClick={onCancel}
            disabled={isGenerating}
            className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl px-6"
          >
            取消
          </Button>
          <Button 
            onClick={() => onGenerate(pages, outline.outline)}
            disabled={isGenerating}
            className="flex-1 sm:flex-none bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:from-pink-600 hover:via-purple-600 hover:to-indigo-600 text-white shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 transition-all duration-300 px-8 py-6 rounded-xl text-base font-medium group"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                正在绘制海报...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5 animate-pulse" />
                开始绘制图片
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default PosterOutlineMessage
