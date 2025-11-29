import { GridSettings, ImageInfo, SliceResult } from './types'

/**
 * Loads an image from a source string into an HTMLImageElement
 */
export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = src
  })
}

/**
 * Calculates the dimensions of the "Viewport" (The final output area)
 */
export const getViewportDimensions = (
  imgWidth: number,
  imgHeight: number,
  cropMode: string
) => {
  if (cropMode === 'square') {
    const minDim = Math.min(imgWidth, imgHeight)
    return { width: minDim, height: minDim }
  }
  return { width: imgWidth, height: imgHeight }
}

/**
 * Slices an image into grid pieces and returns the results
 * This function does NOT download - it returns SliceResult[] for canvas use
 */
export const sliceImage = async (
  imageInfo: ImageInfo,
  settings: GridSettings,
  selectedIndices?: Set<number>,
  onProgress?: (percent: number) => void
): Promise<SliceResult[]> => {
  const { src } = imageInfo
  const { rows, cols, format, cropMode, scaleX, scaleY, offsetX, offsetY } =
    settings

  const img = await loadImage(src)

  // 1. Determine Viewport Dimensions (The total size of the grid)
  const viewport = getViewportDimensions(img.width, img.height, cropMode)

  // 2. Create a canvas representing the Viewport
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas context')

  canvas.width = viewport.width
  canvas.height = viewport.height

  // 3. Draw the image onto the viewport with transformations
  ctx.clearRect(0, 0, viewport.width, viewport.height)

  // Calculate draw dimensions based on independent scales
  const drawWidth = img.width * scaleX
  const drawHeight = img.height * scaleY

  // Calculate centering offsets base
  const baseX = (viewport.width - drawWidth) / 2
  const baseY = (viewport.height - drawHeight) / 2

  // Apply user pan offsets (converted from percentage to pixels)
  const finalX = baseX + offsetX * viewport.width
  const finalY = baseY + offsetY * viewport.height

  // Draw the processed image to the master canvas
  ctx.drawImage(img, finalX, finalY, drawWidth, drawHeight)

  // 4. Slice Generation
  const sliceWidth = viewport.width / cols
  const sliceHeight = viewport.height / rows

  const totalSlices = rows * cols
  const slicesToExport =
    selectedIndices && selectedIndices.size > 0
      ? Array.from(selectedIndices)
      : Array.from({ length: totalSlices }, (_, i) => i)

  const results: SliceResult[] = []
  let processedCount = 0

  const sliceCanvas = document.createElement('canvas')
  const sliceCtx = sliceCanvas.getContext('2d')
  if (!sliceCtx) throw new Error('Could not create slice canvas context')

  const outputWidth = Math.max(1, Math.floor(sliceWidth))
  const outputHeight = Math.max(1, Math.floor(sliceHeight))

  sliceCanvas.width = outputWidth
  sliceCanvas.height = outputHeight

  for (const index of slicesToExport) {
    const row = Math.floor(index / cols)
    const col = index % cols

    sliceCtx.clearRect(0, 0, outputWidth, outputHeight)

    // Calculate source coordinates
    const srcX = col * sliceWidth
    const srcY = row * sliceHeight

    // Draw from master canvas to slice canvas
    sliceCtx.drawImage(
      canvas,
      srcX,
      srcY,
      sliceWidth,
      sliceHeight,
      0,
      0,
      outputWidth,
      outputHeight
    )

    // Convert to blob and dataURL
    const blob = await new Promise<Blob | null>((resolve) => {
      const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`
      sliceCanvas.toBlob(resolve, mimeType, 0.92)
    })

    if (blob) {
      const dataURL = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })

      results.push({
        blob,
        dataURL,
        row,
        col,
        width: outputWidth,
        height: outputHeight,
      })
    }

    processedCount++
    if (onProgress) {
      onProgress(Math.round((processedCount / slicesToExport.length) * 100))
    }
  }

  return results
}

/**
 * Downloads sliced images as a ZIP file (kept for potential future use)
 */
export const downloadSlicesAsZip = async (
  slices: SliceResult[],
  fileName: string,
  format: string
): Promise<void> => {
  const JSZip = (await import('jszip')).default
  const FileSaver = await import('file-saver')

  const zip = new JSZip()
  const ext = format === 'jpg' ? 'jpg' : format

  for (const slice of slices) {
    const filename = `${fileName}_${slice.row + 1}_${slice.col + 1}.${ext}`
    zip.file(filename, slice.blob)
  }

  const content = await zip.generateAsync({ type: 'blob' })
  const saveAs = (FileSaver as { saveAs?: typeof FileSaver.saveAs }).saveAs || FileSaver
  ;(saveAs as typeof FileSaver.saveAs)(content, `${fileName}_grid.zip`)
}
