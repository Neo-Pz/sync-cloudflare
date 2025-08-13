// 直接房间加载器 - 用于在房间URL中加载.tldr数据
import { Editor } from '@tldraw/editor'

export class DirectRoomLoader {
  /**
   * 检查URL参数中是否有tldr数据需要加载
   */
  static checkForTldrDataInUrl(): string | null {
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get('tldr_data_key')
  }

  /**
   * 从URL参数和localStorage加载房间数据
   */
  static async loadRoomDataFromUrl(editor: Editor): Promise<boolean> {
    const dataKey = this.checkForTldrDataInUrl()
    if (!dataKey) {
      return false
    }

    console.log('🔍 检测到URL中的tldr数据键:', dataKey)
    
    try {
      const roomDataJson = localStorage.getItem(dataKey)
      if (!roomDataJson) {
        console.warn('⚠️ 未找到对应的房间数据')
        return false
      }

      const tldrData = JSON.parse(roomDataJson)
      
      // 提取房间名称（如果有的话）
      const roomName = tldrData._roomName || 'Imported Room'
      console.log('🏠 房间名称:', roomName)
      
      // 验证数据结构
      if (!tldrData.records || !Array.isArray(tldrData.records)) {
        console.warn('⚠️ 房间数据格式不正确')
        return false
      }

      console.log('📄 开始加载房间数据，记录数量:', tldrData.records.length)
      
      // 分析数据
      const pages = tldrData.records.filter((record: any) => record.typeName === 'page')
      const shapes = tldrData.records.filter((record: any) => record.typeName === 'shape')
      const documentRecord = tldrData.records.find((record: any) => record.typeName === 'document')
      
      console.log('📑 房间数据包含:', {
        pages: pages.length,
        shapes: shapes.length,
        document: (documentRecord as any)?.name || '未命名'
      })

      // 等待编辑器完全就绪
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // 清空当前编辑器内容
      console.log('🧹 清空当前编辑器内容...')
      editor.selectAll()
      const selectedIds = editor.getSelectedShapeIds()
      if (selectedIds.length > 0) {
        editor.deleteShapes(selectedIds)
      }
      
      // 删除除第一页外的所有页面
      const currentPages = editor.getPages()
      if (currentPages.length > 1) {
        for (let i = 1; i < currentPages.length; i++) {
          editor.deletePage((currentPages[i] as any).id)
        }
      }
      
      // 加载房间的所有数据
      console.log('📥 开始加载新数据...')
      editor.store.mergeRemoteChanges(() => {
        // 先删除当前所有非基础记录
        const currentRecords = editor.store.allRecords()
        const recordsToRemove = currentRecords.filter((r: any) => 
          r.typeName !== 'document' && 
          r.typeName !== 'camera' &&
          r.typeName !== 'instance' &&
          r.typeName !== 'instance_page_state' &&
          r.typeName !== 'pointer'
        )
        
        if (recordsToRemove.length > 0) {
          console.log('🗑️ 删除现有记录:', recordsToRemove.length, '个')
          editor.store.remove(recordsToRemove.map((r: any) => r.id))
        }
        
        // 加载新的记录
        let loadedCount = 0
        for (const record of tldrData.records) {
          try {
            // 更新文档名称
            if (record.typeName === 'document') {
              const updatedDocument = {
                ...record,
                name: roomName // 使用提取的房间名称
              }
              editor.store.put([updatedDocument])
              loadedCount++
            } else if (record.typeName !== 'camera' && record.typeName !== 'instance') {
              editor.store.put([record])
              loadedCount++
            }
          } catch (recordError) {
            console.warn('⚠️ 跳过记录:', record.typeName, recordError)
          }
        }
        console.log('✅ 成功加载记录:', loadedCount, '个')
      })
      
      // 调整视图到第一个页面
      setTimeout(() => {
        try {
          const newPages = editor.getPages()
          if (newPages.length > 0) {
            console.log('📄 切换到第一个页面:', (newPages[0] as any).name)
            editor.setCurrentPage((newPages[0] as any).id)
          }
          editor.zoomToFit()
          console.log('📐 视图已调整')
          
          // 清理URL参数和localStorage数据
          const url = new URL(window.location.href)
          url.searchParams.delete('tldr_data_key')
          window.history.replaceState({}, document.title, url.toString())
          localStorage.removeItem(dataKey)
          console.log('🧹 已清理URL参数和临时数据')
          
        } catch (zoomError) {
          console.warn('⚠️ 视图调整失败:', zoomError)
        }
      }, 500)
      
      console.log('🎉 房间数据加载完成!')
      return true
      
    } catch (error) {
      console.error('❌ 加载房间数据失败:', error)
      return false
    }
  }

  /**
   * 生成带有tldr数据的房间URL
   */
  static generateRoomUrlWithData(roomId: string, tldrData: any, roomName?: string): string {
    // 生成临时数据键
    const dataKey = `temp_tldr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // 保存数据到localStorage，包含房间名称
    const dataToSave = {
      ...tldrData,
      _roomName: roomName // 添加房间名称信息
    }
    localStorage.setItem(dataKey, JSON.stringify(dataToSave))
    
    // 生成带参数的URL
    const url = new URL(`/r/${roomId}`, window.location.origin)
    url.searchParams.set('tldr_data_key', dataKey)
    
    return url.toString()
  }
}

export const directRoomLoader = DirectRoomLoader 