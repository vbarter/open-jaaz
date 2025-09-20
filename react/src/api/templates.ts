export interface Template {
  id: number
  title: string
  description: string
  image: string
  tags: string[]
  downloads: number
  rating: number
  category: string
  created_at?: string
  updated_at?: string
  prompt?: string
  need_upload_file?: number
  use_mask?: number
  is_image?: number
}

export interface TemplateListResponse {
  templates: Template[]
  total: number
  page: number
  limit: number
}

export interface TemplateSearchParams {
  search?: string
  page?: number
  limit?: number
  category?: string
  sort_by?: 'downloads' | 'rating' | 'created_at'
  sort_order?: 'asc' | 'desc'
  lang?: string
}

export async function getTemplates(params?: TemplateSearchParams): Promise<TemplateListResponse> {
  const searchParams = new URLSearchParams()
  
  if (params?.search) {
    searchParams.append('search', params.search)
  }
  if (params?.page) {
    searchParams.append('page', params.page.toString())
  }
  if (params?.limit) {
    searchParams.append('limit', params.limit.toString())
  }
  if (params?.category) {
    searchParams.append('category', params.category)
  }
  if (params?.sort_by) {
    searchParams.append('sort_by', params.sort_by)
  }
  if (params?.sort_order) {
    searchParams.append('sort_order', params.sort_order)
  }
  if (params?.lang) {
    searchParams.append('lang', params.lang)
  }

  const response = await fetch(`/api/templates?${searchParams.toString()}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch templates: ${response.statusText}`)
  }
  
  return await response.json()
}

export async function getTemplate(id: number, lang?: string): Promise<Template> {
  const searchParams = new URLSearchParams()
  if (lang) {
    searchParams.append('lang', lang)
  }

  const url = `/api/templates/${id}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch template: ${response.statusText}`)
  }

  return await response.json()
}

export async function downloadTemplate(id: number, lang?: string): Promise<{ success: boolean; message: string }> {
  const searchParams = new URLSearchParams()
  if (lang) {
    searchParams.append('lang', lang)
  }

  const url = `/api/templates/${id}/download${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  const response = await fetch(url, {
    method: 'POST',
  })

  return await response.json()
}