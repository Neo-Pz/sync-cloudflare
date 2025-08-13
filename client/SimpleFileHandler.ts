// 简化的 .tldr 文件处理器 - 专注于基本功能
import { Editor } from '@tldraw/editor'

export class SimpleFileHandler {
  /**
   * 下载当前编辑器内容为 .tldr 文件
   */
  static async downloadTldrFile(editor: Editor, fileName?: string): Promise<void> {
    try {
      console.log('🔽 开始下载房间文件...')
      
      // 获取编辑器完整快照
      const snapshot = editor.store.getSnapshot()
      
      // 获取所有页面和记录
      const allRecords = Object.values(snapshot.store)
      const pages = allRecords.filter((record: any) => record.typeName === 'page')
      const documentRecord = allRecords.find((record: any) => record.typeName === 'document')
      
      console.log('📑 房间包含页面:', pages.length, '个')
      console.log('📋 文档信息:', (documentRecord as any)?.name || '未命名')
      
      // 构建完整的 .tldr 文件格式（包含所有页面和内容）
      const fileContent = {
        tldrawFileFormatVersion: 1,
        schema: snapshot.schema,
        records: allRecords
      }

      // 统计各类型记录
      const recordTypes: {[key: string]: number} = {}
      allRecords.forEach((record: any) => {
        const type = record.typeName || 'unknown'
        recordTypes[type] = (recordTypes[type] || 0) + 1
      })

      console.log('📄 文件内容统计:')
      console.log('  - 总记录数:', allRecords.length)
      Object.entries(recordTypes).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`)
      })

      const jsonString = JSON.stringify(fileContent, null, 2)
      const blob = new Blob([jsonString], { 
        type: 'application/vnd.tldraw+json'
      })
      
      // 生成文件名（优先使用文档名称）
      let roomName = 'drawing'
      if ((documentRecord as any)?.name && (documentRecord as any).name.trim()) {
        roomName = (documentRecord as any).name.trim()
      } else {
        // 从URL获取房间名称
        const pathMatch = window.location.pathname.match(/\/r(?:o)?\/([^/]+)/)
        if (pathMatch) {
          roomName = decodeURIComponent(pathMatch[1])
        }
      }
      
      const defaultFileName = fileName || `${roomName}.tldr`
      
      console.log('💾 准备下载文件:', defaultFileName, `(${blob.size} bytes)`)
      console.log('📊 文件包含:', pages.length, '个页面，共', allRecords.length, '条记录')
      
      // 创建下载链接
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = defaultFileName
      link.style.display = 'none'
      
      document.body.appendChild(link)
      link.click()
      
      // 清理
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link)
        }
        URL.revokeObjectURL(url)
      }, 100)
      
      console.log(`✅ 房间文件下载成功: ${defaultFileName}`)
      console.log(`📋 包含完整房间数据: ${pages.length} 页面, ${allRecords.length} 记录`)
    } catch (error) {
      console.error('❌ 下载失败:', error)
      throw new Error(`下载文件失败: ${error}`)
    }
  }

  /**
   * 导入 .tldr 文件创建新房间并直接加载数据
   */
  static async importTldrFileAsRoom(file: File, userId?: string, userName?: string): Promise<{roomId: string, roomName: string, tldrData: any}> {
    try {
      console.log('🔼 开始导入文件创建新房间:', file.name, `(${file.size} bytes)`)
      
      // 验证文件
      if (!file.name.toLowerCase().endsWith('.tldr')) {
        throw new Error('请选择 .tldr 文件')
      }
      
      if (file.size > 50 * 1024 * 1024) { // 50MB 限制
        throw new Error('文件太大，请选择小于 50MB 的文件')
      }

      // 读取文件
      const fileContent = await this.readFileAsText(file)
      console.log('📖 文件内容长度:', fileContent.length)
      
      let tldrData: any
      try {
        tldrData = JSON.parse(fileContent)
      } catch (parseError) {
        console.error('❌ JSON 解析失败:', parseError)
        throw new Error('文件格式错误：无法解析 JSON')
      }

      // 基本验证
      if (!tldrData.records || !Array.isArray(tldrData.records)) {
        throw new Error('文件内容格式不正确：缺少 records 数组')
      }

      console.log('📄 解析成功，记录数量:', tldrData.records.length)

      // 从文件名提取房间名称
      const roomName = file.name.replace('.tldr', '')
      
      // 分析文件中的页面信息
      const pages = tldrData.records.filter((record: any) => record.typeName === 'page')
      const documentRecord = tldrData.records.find((record: any) => record.typeName === 'document')
      
      console.log('📑 发现页面:', pages.length, '个')
      console.log('📋 文档名称:', documentRecord?.name || roomName)

      // 生成新的房间ID
      const roomId = this.generateRoomId()
      
      // 保存到本地存储（作为房间历史）
      const roomHistoryEntry = {
        name: roomId,
        displayName: roomName,
        lastVisited: Date.now(),
        isExpanded: true,
        pages: pages.map((page: any) => ({ 
          name: page.name, 
          id: page.id 
        })),
        lastPageName: pages[0]?.name || 'Page 1'
      }

      // 更新房间历史
      const savedHistory = localStorage.getItem('roomHistory')
      let roomHistory = []
      if (savedHistory) {
        try {
          roomHistory = JSON.parse(savedHistory)
        } catch (e) {
          console.warn('无法解析房间历史记录')
        }
      }

      roomHistory.unshift(roomHistoryEntry)
      roomHistory = roomHistory.slice(0, 20) // 限制最多20个房间
      localStorage.setItem('roomHistory', JSON.stringify(roomHistory))

      // 保存完整的 .tldr 数据到本地存储（以房间ID为键）
      const roomDataKey = `room_data_${roomId}`
      localStorage.setItem(roomDataKey, JSON.stringify(tldrData))

      console.log(`✅ 房间创建成功: ${roomName} (${roomId})`)
      
      return {
        roomId: roomId,
        roomName: roomName,
        tldrData: tldrData
      }
      
    } catch (error) {
      console.error('❌ 导入失败:', error)
      throw error
    }
  }

  /**
   * 从房间数据加载到编辑器
   */
  static async loadRoomToEditor(editor: Editor, roomId: string): Promise<boolean> {
    try {
      console.log('📂 加载房间数据到编辑器:', roomId)
      
      // 从本地存储获取房间数据
      const roomDataKey = `room_data_${roomId}`
      const roomDataJson = localStorage.getItem(roomDataKey)
      
      if (!roomDataJson) {
        throw new Error('未找到房间数据')
      }

      const tldrData = JSON.parse(roomDataJson)
      
      // 清空当前编辑器内容
      editor.selectAll()
      const selectedIds = editor.getSelectedShapeIds()
      if (selectedIds.length > 0) {
        editor.deleteShapes(selectedIds)
      }

      // 加载房间的所有数据
      editor.store.mergeRemoteChanges(() => {
        // 清除当前所有记录（除了基础记录）
        const currentRecords = editor.store.allRecords()
        const recordsToRemove = currentRecords.filter((r: any) => 
          r.typeName !== 'document' && 
          r.typeName !== 'camera' &&
          r.typeName !== 'instance'
        )
        
        if (recordsToRemove.length > 0) {
          editor.store.remove(recordsToRemove.map((r: any) => r.id))
        }

        // 加载新的记录
        for (const record of tldrData.records) {
          try {
            // 更新文档名称
            if (record.typeName === 'document') {
              const updatedDocument = {
                ...record,
                name: record.name || roomId
              }
              editor.store.put([updatedDocument])
            } else if (record.typeName !== 'camera' && record.typeName !== 'instance') {
              editor.store.put([record])
            }
          } catch (recordError) {
            console.warn('⚠️ 跳过记录:', record.typeName, recordError)
          }
        }
      })

      // 调整视图到第一个页面
      setTimeout(() => {
        try {
          const pages = tldrData.records.filter((r: any) => r.typeName === 'page')
          if (pages.length > 0) {
            editor.setCurrentPage(pages[0].id)
          }
          editor.zoomToFit()
          console.log('📐 视图已调整到第一个页面')
        } catch (zoomError) {
          console.warn('⚠️ 视图调整失败:', zoomError)
        }
      }, 200)

      console.log(`✅ 房间数据加载成功`)
      return true
      
    } catch (error) {
      console.error('❌ 加载房间数据失败:', error)
      throw error
    }
  }

  /**
   * 打开文件选择对话框
   */
  static async openFileDialog(): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.tldr'
      input.multiple = false
      input.style.display = 'none'
      
      input.onchange = (event) => {
        const files = (event.target as HTMLInputElement).files
        resolve(files ? Array.from(files) : [])
        if (document.body.contains(input)) {
          document.body.removeChild(input)
        }
      }
      
      input.oncancel = () => {
        resolve([])
        if (document.body.contains(input)) {
          document.body.removeChild(input)
        }
      }
      
      document.body.appendChild(input)
      input.click()
    })
  }

  /**
   * 生成房间ID
   */
  private static generateRoomId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }

  /**
   * 读取文件为文本
   */
  private static readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })
  }
}

// 导出单例方法
export const simpleFileHandler = SimpleFileHandler 