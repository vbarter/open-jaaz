import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { 
  Copy, 
  Users, 
  Gift, 
  TrendingUp, 
  Clock,
  CheckCircle,
  Share2,
  ExternalLink
} from 'lucide-react'

import TopMenu from '@/components/TopMenu'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'

import { 
  getMyInviteCode, 
  getInviteStats, 
  getInviteHistory, 
  getPointsBalance,
  getPointsHistory,
  generateInviteUrl,
  copyToClipboard
} from '@/api/invite'

export const Route = createFileRoute('/invite')({
  component: InviteCenter,
})

function InviteCenter() {
  const { t } = useTranslation('invite')
  const { t: tCommon } = useTranslation('common')
  const [activeTab, setActiveTab] = useState('overview')

  // API queries
  const { data: inviteCode, isLoading: codeLoading } = useQuery({
    queryKey: ['inviteCode'],
    queryFn: getMyInviteCode,
  })

  const { data: inviteStats, isLoading: statsLoading } = useQuery({
    queryKey: ['inviteStats'],
    queryFn: getInviteStats,
  })

  const { data: inviteHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['inviteHistory'],
    queryFn: () => getInviteHistory(20, 0),
  })

  const { data: pointsBalance, isLoading: balanceLoading } = useQuery({
    queryKey: ['pointsBalance'],
    queryFn: getPointsBalance,
  })

  const { data: pointsHistory, isLoading: pointsHistoryLoading } = useQuery({
    queryKey: ['pointsHistory'],
    queryFn: () => getPointsHistory(20, 0),
  })

  const handleCopyInviteCode = () => {
    if (inviteCode?.code) {
      const success = copyToClipboard(inviteCode.code)
      if (success) {
        toast.success(tCommon('toast.copySuccess'))
      } else {
        toast.error(tCommon('toast.copyError'))
      }
    }
  }

  const handleCopyInviteLink = () => {
    if (inviteCode?.code) {
      const url = generateInviteUrl(inviteCode.code)
      const success = copyToClipboard(url)
      if (success) {
        toast.success(tCommon('toast.copySuccess'))
      } else {
        toast.error(tCommon('toast.copyError'))
      }
    }
  }

  const handleShareInvite = async () => {
    if (inviteCode?.code) {
      const url = generateInviteUrl(inviteCode.code)
      const shareData = {
        title: t('inviteCode.shareTitle'),
        text: t('inviteCode.shareText'),
        url: url,
      }

      if (navigator.share) {
        try {
          await navigator.share(shareData)
        } catch (err) {
          // User cancelled share
          handleCopyInviteLink()
        }
      } else {
        handleCopyInviteLink()
      }
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-stone-100 dark:bg-stone-700 text-stone-800 dark:text-stone-200 border-stone-200 dark:border-stone-600">{t('status.completed')}</Badge>
      case 'registered':
        return <Badge variant="secondary" className="bg-stone-200 dark:bg-stone-600 text-stone-800 dark:text-stone-200">{t('status.registered')}</Badge>
      case 'pending':
        return <Badge variant="outline" className="border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300">{t('status.pending')}</Badge>
      default:
        return <Badge variant="outline" className="border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300">{status}</Badge>
    }
  }

  const getPointsTypeIcon = (type: string) => {
    switch (type) {
      case 'earn_invite':
        return <Users className="h-4 w-4 text-stone-600 dark:text-stone-400" />
      case 'earn_register':
        return <Gift className="h-4 w-4 text-stone-600 dark:text-stone-400" />
      case 'spend':
        return <TrendingUp className="h-4 w-4 text-stone-600 dark:text-stone-400" />
      default:
        return <Clock className="h-4 w-4 text-stone-500 dark:text-stone-500" />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-gray-50 to-slate-100 dark:from-slate-900 dark:via-stone-900 dark:to-gray-900">
      <TopMenu />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-br from-gray-900 via-gray-700 to-stone-600 dark:from-white dark:via-gray-200 dark:to-stone-300 bg-clip-text text-transparent mb-3 sm:mb-4">
              {t('title')}
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-stone-600 dark:text-stone-300 max-w-2xl mx-auto px-4">
              {t('subtitle')}
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-stone-100 dark:bg-stone-800 h-auto">
              <TabsTrigger value="overview" className="text-xs sm:text-sm py-2 sm:py-2.5">{t('tabs.overview')}</TabsTrigger>
              <TabsTrigger value="history" className="text-xs sm:text-sm py-2 sm:py-2.5">{t('tabs.history')}</TabsTrigger>
              <TabsTrigger value="points" className="text-xs sm:text-sm py-2 sm:py-2.5">{t('tabs.points')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 sm:mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {/* Invite Code Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Share2 className="h-5 w-5" />
                      {t('inviteCode.title')}
                    </CardTitle>
                    <CardDescription>
                      {t('inviteCode.description')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {codeLoading ? (
                      <Skeleton className="h-12 w-full" />
                    ) : inviteCode?.success && inviteCode.code ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-center p-4 bg-stone-50 dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-700">
                          <span className="text-2xl font-mono font-bold text-stone-800 dark:text-stone-200">
                            {inviteCode.code}
                          </span>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button onClick={handleCopyInviteCode} variant="outline" size="sm" className="flex-1">
                            <Copy className="h-4 w-4 mr-2" />
                            {t('inviteCode.copyCode')}
                          </Button>
                          <Button onClick={handleCopyInviteLink} variant="outline" size="sm" className="flex-1">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            {t('inviteCode.copyLink')}
                          </Button>
                          <Button onClick={handleShareInvite} size="sm" className="flex-1">
                            <Share2 className="h-4 w-4 mr-2" />
                            {t('inviteCode.share')}
                          </Button>
                        </div>

                        <div className="text-sm text-stone-600 dark:text-stone-400">
                          {t('inviteCode.used')}: <span className="font-semibold">{inviteCode.used_count}</span> / {inviteCode.max_uses}
                          <span className="text-stone-500 dark:text-stone-400 ml-2">
                            ({inviteCode.remaining_uses} {t('inviteCode.remaining')})
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500">
                        {t('inviteCode.loadFailed')}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Points Balance Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Gift className="h-5 w-5" />
                      {t('pointsBalance.title')}
                    </CardTitle>
                    <CardDescription>
                      {t('pointsBalance.description')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {balanceLoading ? (
                      <Skeleton className="h-12 w-full" />
                    ) : pointsBalance?.success ? (
                      <div className="text-center">
                        <div className="text-2xl sm:text-3xl font-bold text-stone-800 dark:text-stone-200 mb-2">
                          {pointsBalance.balance}
                        </div>
                        <div className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">
                          {t('pointsBalance.available')}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500">
                        {t('pointsBalance.loadFailed')}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Statistics Cards */}
                {statsLoading ? (
                  <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <Card key={i}>
                        <CardContent className="p-4">
                          <Skeleton className="h-8 w-full mb-2" />
                          <Skeleton className="h-4 w-20" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : inviteStats ? (
                  <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-xl sm:text-2xl font-bold text-stone-800 dark:text-stone-200">
                          {inviteStats.total_invitations}
                        </div>
                        <div className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">{t('stats.totalInvites')}</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-xl sm:text-2xl font-bold text-stone-800 dark:text-stone-200">
                          {inviteStats.successful_invitations}
                        </div>
                        <div className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">{t('stats.successful')}</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-xl sm:text-2xl font-bold text-stone-800 dark:text-stone-200">
                          {inviteStats.pending_invitations}
                        </div>
                        <div className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">{t('stats.pending')}</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-xl sm:text-2xl font-bold text-stone-800 dark:text-stone-200">
                          {inviteStats.total_points_earned}
                        </div>
                        <div className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">{t('stats.pointsEarned')}</div>
                      </CardContent>
                    </Card>
                  </div>
                ) : null}

                {/* How it Works */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>{t('howItWorks.title')}</CardTitle>
                    <CardDescription>
                      {t('howItWorks.description')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                      <div className="text-center p-4 bg-stone-50 dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-700">
                        <div className="w-12 h-12 bg-stone-100 dark:bg-stone-700 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Share2 className="h-6 w-6 text-stone-600 dark:text-stone-300" />
                        </div>
                        <h3 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base text-stone-800 dark:text-stone-200">{t('howItWorks.step1.title')}</h3>
                        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">
                          {t('howItWorks.step1.description')}
                        </p>
                      </div>

                      <div className="text-center p-4 bg-stone-50 dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-700">
                        <div className="w-12 h-12 bg-stone-100 dark:bg-stone-700 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Users className="h-6 w-6 text-stone-600 dark:text-stone-300" />
                        </div>
                        <h3 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base text-stone-800 dark:text-stone-200">{t('howItWorks.step2.title')}</h3>
                        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">
                          {t('howItWorks.step2.description')}
                        </p>
                      </div>

                      <div className="text-center p-4 bg-stone-50 dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-700">
                        <div className="w-12 h-12 bg-stone-100 dark:bg-stone-700 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Gift className="h-6 w-6 text-stone-600 dark:text-stone-300" />
                        </div>
                        <h3 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base text-stone-800 dark:text-stone-200">{t('howItWorks.step3.title')}</h3>
                        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">
                          {t('howItWorks.step3.description')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-4 sm:mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('inviteHistory.title')}</CardTitle>
                  <CardDescription>
                    {t('inviteHistory.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {historyLoading ? (
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : inviteHistory?.success && inviteHistory.history?.length > 0 ? (
                    <ScrollArea className="h-64 sm:h-80 lg:h-96">
                      <div className="space-y-3">
                        {inviteHistory.history.map((record) => (
                          <div key={record.id} className="flex items-center justify-between p-4 bg-stone-50 dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-700">
                            <div className="flex-1">
                              <div className="font-medium">
                                {record.invitee_nickname || record.invitee_email}
                              </div>
                              <div className="text-sm text-stone-600 dark:text-stone-400">
                                {new Date(record.created_at).toLocaleDateString()}
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {getStatusBadge(record.status)}
                              {record.status === 'completed' && (
                                <div className="text-sm font-medium text-stone-600 dark:text-stone-400">
                                  +{record.inviter_points_awarded} {t('inviteHistory.pointsAwarded')}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-8 text-stone-500 dark:text-stone-400">
                      <Users className="h-12 w-12 mx-auto mb-4 text-stone-300 dark:text-stone-600" />
                      <p>{t('inviteHistory.noInvites')}</p>
                      <p className="text-sm">{t('inviteHistory.noInvitesHint')}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="points" className="mt-4 sm:mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('pointsHistory.title')}</CardTitle>
                  <CardDescription>
                    {t('pointsHistory.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pointsHistoryLoading ? (
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : pointsHistory?.success && pointsHistory.history?.length > 0 ? (
                    <ScrollArea className="h-64 sm:h-80 lg:h-96">
                      <div className="space-y-3">
                        {pointsHistory.history.map((transaction) => (
                          <div key={transaction.id} className="flex items-center justify-between p-4 bg-stone-50 dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-700">
                            <div className="flex items-center gap-3">
                              {getPointsTypeIcon(transaction.type)}
                              <div>
                                <div className="font-medium">
                                  {transaction.description}
                                </div>
                                <div className="text-sm text-stone-600 dark:text-stone-400">
                                  {new Date(transaction.created_at).toLocaleDateString()}
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className={`font-medium ${transaction.points > 0 ? 'text-stone-800 dark:text-stone-200' : 'text-stone-600 dark:text-stone-400'}`}>
                                {transaction.points > 0 ? '+' : ''}{transaction.points}
                              </div>
                              <div className="text-sm text-stone-600 dark:text-stone-400">
                                {t('pointsHistory.balance')}: {transaction.balance_after}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-8 text-stone-500 dark:text-stone-400">
                      <Gift className="h-12 w-12 mx-auto mb-4 text-stone-300 dark:text-stone-600" />
                      <p>{t('pointsHistory.noTransactions')}</p>
                      <p className="text-sm">{t('pointsHistory.noTransactionsHint')}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  )
}