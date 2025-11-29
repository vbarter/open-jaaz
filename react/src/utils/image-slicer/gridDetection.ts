/**
 * Analyzes an image and suggests optimal grid dimensions
 * Based on image aspect ratio and common grid patterns
 */

export interface GridSuggestion {
  rows: number
  cols: number
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

/**
 * Suggests grid dimensions based on image aspect ratio and size
 */
export const suggestGridDimensions = (
  width: number,
  height: number
): GridSuggestion => {
  const aspectRatio = width / height
  const totalPixels = width * height

  // Common aspect ratios and their typical use cases
  if (Math.abs(aspectRatio - 1) < 0.1) {
    // Square image (1:1)
    if (totalPixels > 2000 * 2000) {
      return {
        rows: 4,
        cols: 4,
        confidence: 'high',
        reason: '大尺寸方形图片，建议 4×4 网格',
      }
    }
    return {
      rows: 3,
      cols: 3,
      confidence: 'high',
      reason: '方形图片，建议 3×3 网格',
    }
  }

  if (aspectRatio > 2) {
    // Wide panoramic (e.g., 3:1, 4:1)
    const suggestedCols = Math.min(Math.round(aspectRatio * 2), 8)
    return {
      rows: 2,
      cols: suggestedCols,
      confidence: 'medium',
      reason: '宽幅图片，建议横向切割',
    }
  }

  if (aspectRatio < 0.5) {
    // Tall vertical image
    const suggestedRows = Math.min(Math.round((1 / aspectRatio) * 2), 8)
    return {
      rows: suggestedRows,
      cols: 2,
      confidence: 'medium',
      reason: '竖幅图片，建议纵向切割',
    }
  }

  if (aspectRatio > 1.3 && aspectRatio < 1.8) {
    // 16:9 or similar landscape
    return {
      rows: 3,
      cols: 4,
      confidence: 'high',
      reason: '16:9 横向图片，建议 3×4 网格',
    }
  }

  if (aspectRatio > 0.5 && aspectRatio < 0.8) {
    // Portrait orientation (e.g., 3:4, 9:16)
    return {
      rows: 4,
      cols: 3,
      confidence: 'high',
      reason: '9:16 竖向图片，建议 4×3 网格',
    }
  }

  // Default fallback based on orientation
  if (aspectRatio > 1) {
    return { rows: 3, cols: 4, confidence: 'low', reason: '横向图片，默认 3×4 网格' }
  } else {
    return { rows: 4, cols: 3, confidence: 'low', reason: '竖向图片，默认 4×3 网格' }
  }
}
