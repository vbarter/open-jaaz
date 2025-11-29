export type ExportFormat = 'png' | 'jpg' | 'webp'
export type CropMode = 'original' | 'square'

export interface ImageInfo {
  src: string
  width: number
  height: number
  originalName: string
}

export interface GridSettings {
  rows: number
  cols: number
  format: ExportFormat
  cropMode: CropMode
  scaleX: number
  scaleY: number
  offsetX: number
  offsetY: number
}

export interface SliceResult {
  blob: Blob
  dataURL: string
  row: number
  col: number
  width: number
  height: number
}

export interface ProcessingState {
  isProcessing: boolean
  progress: number // 0-100
  error: string | null
}

export const DEFAULT_SETTINGS: GridSettings = {
  rows: 3,
  cols: 3,
  format: 'png',
  cropMode: 'original',
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
}
