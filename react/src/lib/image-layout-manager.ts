/**
 * 图片布局管理器
 * 负责管理画布上图片的位置，避免重叠
 */

export type ImagePosition = {
  id: string        // 图片元素的唯一ID
  x: number         // 左上角x坐标
  y: number         // 左上角y坐标
  width: number     // 图片宽度
  height: number    // 图片高度
  row: number       // 所在行号 (0-based)
  col: number       // 所在列号 (0-based)
}

export class ImageLayoutManager {
  private images: Map<string, ImagePosition> = new Map()
  private rowHeights: Map<number, number> = new Map() // 记录每行的最大高度

  // 配置参数
  private readonly IMAGES_PER_ROW = 5      // 每行最多放置的图片数
  private readonly IMAGE_SPACING = 20      // 图片之间的间隔（像素）
  private readonly INITIAL_X = 100         // 起始X坐标
  private readonly INITIAL_Y = 100         // 起始Y坐标

  /**
   * 添加图片记录
   */
  addImage(image: ImagePosition): void {
    this.images.set(image.id, image)

    // 更新该行的最大高度
    const currentRowHeight = this.rowHeights.get(image.row) || 0
    if (image.height > currentRowHeight) {
      this.rowHeights.set(image.row, image.height)
    }
  }

  /**
   * 移除图片记录
   */
  removeImage(id: string): void {
    const image = this.images.get(id)
    if (image) {
      this.images.delete(id)

      // 重新计算该行的最大高度
      this.recalculateRowHeight(image.row)
    }
  }

  /**
   * 重新计算指定行的最大高度
   */
  private recalculateRowHeight(row: number): void {
    let maxHeight = 0
    for (const image of this.images.values()) {
      if (image.row === row && image.height > maxHeight) {
        maxHeight = image.height
      }
    }

    if (maxHeight > 0) {
      this.rowHeights.set(row, maxHeight)
    } else {
      this.rowHeights.delete(row)
    }
  }

  /**
   * 计算下一个图片的最佳位置
   * @param width 新图片的宽度
   * @param height 新图片的高度
   * @returns 计算出的位置信息
   */
  calculateNextPosition(width: number, height: number): {
    x: number
    y: number
    row: number
    col: number
  } {
    // 找到下一个可用的位置
    let targetRow = 0
    let targetCol = 0
    let found = false

    // 遍历所有可能的位置，找到第一个空位
    while (!found) {
      // 检查当前位置是否已被占用
      const positionOccupied = this.isPositionOccupied(targetRow, targetCol)

      if (!positionOccupied) {
        found = true
      } else {
        // 移动到下一个位置
        targetCol++
        if (targetCol >= this.IMAGES_PER_ROW) {
          targetCol = 0
          targetRow++
        }
      }
    }

    // 计算X坐标
    const x = this.calculateXPosition(targetCol)

    // 计算Y坐标
    const y = this.calculateYPosition(targetRow)

    return {
      x,
      y,
      row: targetRow,
      col: targetCol
    }
  }

  /**
   * 检查指定的行列位置是否已被占用
   */
  private isPositionOccupied(row: number, col: number): boolean {
    for (const image of this.images.values()) {
      if (image.row === row && image.col === col) {
        return true
      }
    }
    return false
  }

  /**
   * 计算指定列的X坐标
   */
  private calculateXPosition(col: number): number {
    let x = this.INITIAL_X

    // 计算该列之前所有图片的宽度总和
    for (let c = 0; c < col; c++) {
      const maxWidth = this.getMaxWidthInColumn(c)
      x += maxWidth + this.IMAGE_SPACING
    }

    return x
  }

  /**
   * 获取指定列中最大的图片宽度
   */
  private getMaxWidthInColumn(col: number): number {
    let maxWidth = 200 // 默认宽度

    for (const image of this.images.values()) {
      if (image.col === col && image.width > maxWidth) {
        maxWidth = image.width
      }
    }

    return maxWidth
  }

  /**
   * 计算指定行的Y坐标
   */
  private calculateYPosition(row: number): number {
    let y = this.INITIAL_Y

    // 累加之前所有行的高度
    for (let r = 0; r < row; r++) {
      const rowHeight = this.rowHeights.get(r) || 200 // 默认高度
      y += rowHeight + this.IMAGE_SPACING
    }

    return y
  }

  /**
   * 获取所有图片位置
   */
  getAllImages(): ImagePosition[] {
    return Array.from(this.images.values())
  }

  /**
   * 检查图片是否已存在
   */
  hasImage(id: string): boolean {
    return this.images.has(id)
  }

  /**
   * 清空所有图片记录
   */
  clear(): void {
    this.images.clear()
    this.rowHeights.clear()
  }

  /**
   * 根据现有的画布元素同步布局管理器
   * 只添加管理器中不存在的图片，保持它们的原始位置
   * @param elements Excalidraw元素数组
   */
  syncWithElements(elements: readonly any[]): void {
    // 筛选出图片元素
    const imageElements = elements
      .filter(el => el.type === 'image' && !el.isDeleted)

    // 记录哪些图片ID仍然存在
    const existingIds = new Set(imageElements.map(el => el.id))

    // 移除已不存在的图片
    const currentImages = Array.from(this.images.keys())
    currentImages.forEach(id => {
      if (!existingIds.has(id)) {
        this.removeImage(id)
      }
    })

    // 添加新的图片（管理器中不存在的）- 保持它们的原始位置
    imageElements.forEach(element => {
      if (!this.images.has(element.id)) {
        // 这是画布上已存在但管理器中没有的图片
        // 我们需要根据它的实际位置来分配行列

        // 先获取所有已管理的图片，按位置排序
        const managedImages = this.getAllImages()

        // 根据实际位置推断行列
        let row = 0
        let col = 0

        // 查找这个图片应该在哪一行
        for (const img of managedImages) {
          if (Math.abs(element.y - img.y) < 50) {
            // 在同一行
            row = img.row
            // 查找在这一行的哪一列
            if (element.x > img.x) {
              col = Math.max(col, img.col + 1)
            }
          } else if (element.y > img.y) {
            row = Math.max(row, img.row + 1)
          }
        }

        // 如果没有找到合适的位置，根据坐标估算
        if (managedImages.length === 0) {
          row = Math.floor((element.y - this.INITIAL_Y) / (200 + this.IMAGE_SPACING))
          col = Math.floor((element.x - this.INITIAL_X) / (200 + this.IMAGE_SPACING))
        }

        const imagePos: ImagePosition = {
          id: element.id,
          x: element.x,  // 保持原始位置
          y: element.y,  // 保持原始位置
          width: element.width,
          height: element.height,
          row: Math.max(0, row),
          col: Math.min(col, this.IMAGES_PER_ROW - 1)
        }

        this.addImage(imagePos)
      }
    })
  }

  /**
   * 根据现有的画布元素初始化布局管理器
   * 完全重置并根据图片实际位置重建
   * @param elements Excalidraw元素数组
   */
  initializeFromElements(elements: readonly any[]): void {
    this.clear()

    // 筛选出图片元素并按照位置排序
    const imageElements = elements
      .filter(el => el.type === 'image' && !el.isDeleted)
      .sort((a, b) => {
        // 先按Y坐标排序，再按X坐标排序
        if (Math.abs(a.y - b.y) < 50) { // 同一行的判定（Y坐标差小于50）
          return a.x - b.x
        }
        return a.y - b.y
      })

    // 根据实际位置分组到行
    const rows: any[][] = []
    let currentRow: any[] = []
    let lastY = -Infinity

    imageElements.forEach(element => {
      // 如果Y坐标差异较大，认为是新的一行
      if (lastY !== -Infinity && element.y - lastY > 100) {
        if (currentRow.length > 0) {
          rows.push(currentRow)
        }
        currentRow = []
      }
      currentRow.push(element)
      lastY = element.y
    })

    // 添加最后一行
    if (currentRow.length > 0) {
      rows.push(currentRow)
    }

    // 根据分组结果重建布局管理器
    rows.forEach((row, rowIndex) => {
      row.forEach((element, colIndex) => {
        const imagePos: ImagePosition = {
          id: element.id,
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          row: rowIndex,
          col: colIndex
        }

        this.addImage(imagePos)
      })
    })
  }

  /**
   * 重新排列所有图片，按一行5个的规律排版，基于实际尺寸避免重叠
   * @param elements 当前画布中的所有图片元素
   * @returns 重新排列后的图片元素数组
   */
  relayoutImages(elements: readonly any[]): any[] {
    // 筛选出所有图片元素
    const imageElements = elements.filter(el => el.type === 'image' && !el.isDeleted)

    console.log('🔧 ImageLayoutManager.relayoutImages 开始:')
    console.log('  - 输入元素总数:', elements.length)
    console.log('  - 筛选出的图片数:', imageElements.length)

    if (imageElements.length === 0) {
      console.log('  - 没有图片元素，返回空数组')
      return []
    }

    // 清空当前布局管理器
    this.clear()

    // 第一步：将图片按行分组
    const rows: any[][] = []
    for (let i = 0; i < imageElements.length; i += this.IMAGES_PER_ROW) {
      rows.push(imageElements.slice(i, i + this.IMAGES_PER_ROW))
    }

    console.log(`📐 分成 ${rows.length} 行:`)
    rows.forEach((row, index) => {
      console.log(`  行 ${index}: ${row.length} 张图片`)
    })

    // 第二步：计算每行的最大高度和每列的最大宽度
    const rowHeights: number[] = []
    const colWidths: number[] = new Array(this.IMAGES_PER_ROW).fill(0)

    rows.forEach((row, rowIndex) => {
      let maxHeight = 0
      row.forEach((img, colIndex) => {
        maxHeight = Math.max(maxHeight, img.height)
        colWidths[colIndex] = Math.max(colWidths[colIndex], img.width)
      })
      rowHeights[rowIndex] = maxHeight
    })

    console.log('📏 计算出的尺寸:')
    console.log('  - 行高度:', rowHeights.map(h => Math.round(h)))
    console.log('  - 列宽度:', colWidths.map(w => Math.round(w)))

    // 第三步：基于实际尺寸重新计算每个图片的位置
    const updatedElements: any[] = []
    let currentY = this.INITIAL_Y

    rows.forEach((row, rowIndex) => {
      let currentX = this.INITIAL_X

      row.forEach((element, colIndex) => {
        const globalIndex = rowIndex * this.IMAGES_PER_ROW + colIndex

        console.log(`  - 处理图片 ${globalIndex + 1}/${imageElements.length}:`)
        console.log(`    原始: (${Math.round(element.x)}, ${Math.round(element.y)}) ${Math.round(element.width)}x${Math.round(element.height)}`)
        console.log(`    fileId: ${element.fileId}`)

        // 新位置：在列内居中对齐
        const x = currentX + (colWidths[colIndex] - element.width) / 2
        const y = currentY + (rowHeights[rowIndex] - element.height) / 2

        console.log(`    新位置: (${Math.round(x)}, ${Math.round(y)}) [行${rowIndex},列${colIndex}]`)

        // 创建更新后的元素
        const updatedElement = {
          ...element,
          x,
          y,
          updated: Date.now()
        }

        // 验证关键属性
        if (!updatedElement.fileId) {
          console.error(`    ⚠️ 警告: 图片 ${globalIndex + 1} 的 fileId 丢失!`)
        }

        updatedElements.push(updatedElement)

        // 添加到布局管理器
        this.addImage({
          id: element.id,
          x,
          y,
          width: element.width,
          height: element.height,
          row: rowIndex,
          col: colIndex
        })

        // 移动到下一列
        currentX += colWidths[colIndex] + this.IMAGE_SPACING
      })

      // 移动到下一行
      currentY += rowHeights[rowIndex] + this.IMAGE_SPACING
    })

    console.log('🔧 ImageLayoutManager.relayoutImages 完成:')
    console.log('  - 返回的元素数:', updatedElements.length)
    console.log('  - 总布局尺寸:', {
      width: Math.max(...colWidths) * this.IMAGES_PER_ROW + this.IMAGE_SPACING * (this.IMAGES_PER_ROW - 1),
      height: rowHeights.reduce((sum, h) => sum + h, 0) + this.IMAGE_SPACING * (rowHeights.length - 1)
    })

    return updatedElements
  }

  /**
   * 获取第一张图片信息（第一行第一列，用于重排版后的跳转）
   * @returns 第一张图片的信息，如果没有图片则返回null
   */
  getFirstImageInfo(): { id: string; x: number; y: number } | null {
    const images = this.getAllImages()
    if (images.length === 0) {
      console.log('🎯 getFirstImageInfo: 没有图片')
      return null
    }

    // 按行列顺序排序，确保第一张图片是第一行第一列
    const sortedImages = images.sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row
      return a.col - b.col
    })

    console.log(`🎯 getFirstImageInfo: 总共 ${images.length} 张图片`)

    // 获取第一张图片（第一行第一列）
    const firstImage = sortedImages[0]

    console.log(`🎯 选择第一张图片: 行 ${firstImage.row}, 列 ${firstImage.col}`)
    console.log(`🎯 第一张图片ID: ${firstImage.id}`)
    console.log(`🎯 第一张图片位置: (${Math.round(firstImage.x)}, ${Math.round(firstImage.y)}) 尺寸: ${Math.round(firstImage.width)}x${Math.round(firstImage.height)}`)

    // 返回图片中心点坐标，这样滚动视角更自然
    const centerX = firstImage.x + firstImage.width / 2
    const centerY = firstImage.y + firstImage.height / 2

    console.log(`🎯 第一张图片中心点: (${Math.round(centerX)}, ${Math.round(centerY)})`)

    return {
      id: firstImage.id,
      x: centerX,
      y: centerY
    }
  }

  /**
   * 获取适合滚动显示的第一行图片区域
   * @returns 第一行图片的视野区域，包含前几张图片的显示范围
   */
  getFirstRowViewArea(): { x: number; y: number; width: number; height: number } | null {
    const images = this.getAllImages()
    if (images.length === 0) {
      console.log('🎯 getFirstRowViewArea: 没有图片')
      return null
    }

    // 获取第一行的所有图片
    const firstRowImages = images.filter(img => img.row === 0)
    if (firstRowImages.length === 0) {
      console.log('🎯 getFirstRowViewArea: 没有第一行图片')
      return null
    }

    // 按列顺序排序
    firstRowImages.sort((a, b) => a.col - b.col)

    console.log(`🎯 第一行包含 ${firstRowImages.length} 张图片`)

    // 计算第一行的边界框
    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity

    firstRowImages.forEach(img => {
      minX = Math.min(minX, img.x)
      minY = Math.min(minY, img.y)
      maxX = Math.max(maxX, img.x + img.width)
      maxY = Math.max(maxY, img.y + img.height)
    })

    // 添加一些边距，让视野更舒适
    const padding = 50
    const viewArea = {
      x: minX - padding,
      y: minY - padding,
      width: (maxX - minX) + padding * 2,
      height: (maxY - minY) + padding * 2
    }

    console.log(`🎯 第一行视野区域: (${Math.round(viewArea.x)}, ${Math.round(viewArea.y)}) ${Math.round(viewArea.width)}x${Math.round(viewArea.height)}`)

    return viewArea
  }

  /**
   * 获取中间位置的图片信息（用于重排版后的跳转）
   * @returns 中间图片的信息，如果没有图片则返回null
   */
  getMiddleImageInfo(): { id: string; x: number; y: number } | null {
    const images = this.getAllImages()
    if (images.length === 0) {
      console.log('🎯 getMiddleImageInfo: 没有图片')
      return null
    }

    // 按行列顺序排序
    const sortedImages = images.sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row
      return a.col - b.col
    })

    console.log(`🎯 getMiddleImageInfo: 总共 ${images.length} 张图片`)

    // 找到中间位置的图片
    const middleIndex = Math.floor(images.length / 2)
    const middleImage = sortedImages[middleIndex]

    console.log(`🎯 选择中间图片: 索引 ${middleIndex}, 行 ${middleImage.row}, 列 ${middleImage.col}`)
    console.log(`🎯 中间图片ID: ${middleImage.id}`)
    console.log(`🎯 中间图片位置: (${Math.round(middleImage.x)}, ${Math.round(middleImage.y)}) 尺寸: ${Math.round(middleImage.width)}x${Math.round(middleImage.height)}`)

    // 返回图片信息
    const centerX = middleImage.x + middleImage.width / 2
    const centerY = middleImage.y + middleImage.height / 2

    console.log(`🎯 中间图片中心点: (${Math.round(centerX)}, ${Math.round(centerY)})`)

    return {
      id: middleImage.id,
      x: centerX,
      y: centerY
    }
  }

  /**
   * 获取中间位置的图片坐标（向后兼容）
   * @returns 中间图片的位置信息，如果没有图片则返回null
   */
  getMiddleImagePosition(): { x: number; y: number } | null {
    const info = this.getMiddleImageInfo()
    return info ? { x: info.x, y: info.y } : null
  }

  /**
   * 获取整个图片布局的边界框（用于滚动到整体视图）
   * @returns 布局的边界框信息，如果没有图片则返回null
   */
  getLayoutBounds(): { x: number; y: number; width: number; height: number } | null {
    const images = this.getAllImages()
    if (images.length === 0) return null

    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity

    images.forEach(img => {
      minX = Math.min(minX, img.x)
      minY = Math.min(minY, img.y)
      maxX = Math.max(maxX, img.x + img.width)
      maxY = Math.max(maxY, img.y + img.height)
    })

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }
}