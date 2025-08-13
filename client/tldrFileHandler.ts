// .tldr 文件处理模块 - 实现下载和上传功能
import { Editor, createTLStore, TLRecord } from '@tldraw/editor'
import { createTLSchema, defaultShapeSchemas } from '@tldraw/tlschema'
import { defaultShapeUtils } from 'tldraw'
import { api, tldrFileAPI, TldrFileContent } from './api'

// 创建 tldraw schema
const schema = createTLSchema({
  shapes: { ...defaultShapeSchemas },
})

export interface TldrFileInfo {
  id: string
  name: string
  roomId: string
  createdAt: number
  lastModified: number
  fileSize: number
  ownerId: string
  ownerName: string
}

// TldrFileContent 接口已在 api.ts 中定义，这里移除重复定义

export class TldrFileHandler {
  private static instance: TldrFileHandler
  
  public static getInstance(): TldrFileHandler {
    if (!TldrFileHandler.instance) {
      TldrFileHandler.instance = new TldrFileHandler()
    }
    return TldrFileHandler.instance
  }

  /**
   * 下载当前编辑器内容为 .tldr 文件（使用官网标准格式）
   */
  async downloadTldrFile(editor: Editor, fileName?: string): Promise<void> {
    try {
      console.log('🔽 开始下载文件...')
      
      // 使用 tldraw 官方的序列化方法
      const snapshot = editor.store.getSnapshot()
      
      // 构建标准的 .tldr 文件格式
      const fileContent = {
        tldrawFileFormatVersion: 1,
        schema: snapshot.schema,
        records: Object.values(snapshot.store)
      }

      console.log('📄 文件内容:', {
        recordCount: fileContent.records.length,
        schemaVersion: fileContent.tldrawFileFormatVersion
      })

      const jsonString = JSON.stringify(fileContent, null, 2)
      const blob = new Blob([jsonString], { 
        type: 'application/vnd.tldraw+json' // 使用官方 MIME 类型
      })
      
      // 生成文件名
      const roomName = this.getCurrentRoomName()
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
      const defaultFileName = fileName || `${roomName || 'drawing'}-${timestamp}.tldr`
      
      console.log('💾 准备下载文件:', defaultFileName, `(${blob.size} bytes)`)
      
      // 创建下载链接
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = defaultFileName
      link.style.display = 'none'
      
      // 确保链接被添加到 DOM 中
      document.body.appendChild(link)
      
      // 触发下载
      link.click()
      
      // 清理
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }, 100)
      
      console.log(`✅ 文件下载成功: ${defaultFileName}`)
    } catch (error) {
      console.error('❌ 下载 .tldr 文件失败:', error)
      throw new Error(`下载文件失败: ${(error as Error).message}`)
    }
  }

  /**
   * 上传 .tldr 文件到编辑器（使用官网标准解析）
   */
  async uploadTldrFile(editor: Editor, file: File): Promise<boolean> {
    try {
      console.log('🔼 开始解析文件:', file.name, `(${file.size} bytes)`)
      
      // 验证文件类型
      if (!this.validateTldrFile(file)) {
        throw new Error('无效的 .tldr 文件格式')
      }

      // 读取文件内容
      const fileContent = await this.readFileAsText(file)
      console.log('📖 文件内容长度:', fileContent.length)
      
      let tldrData: TldrFileContent
      try {
        tldrData = JSON.parse(fileContent) as TldrFileContent
      } catch (parseError) {
        console.error('❌ JSON 解析失败:', parseError)
        throw new Error('文件格式错误：无法解析 JSON')
      }

      // 验证文件结构
      if (!this.validateTldrContent(tldrData)) {
        throw new Error('文件内容格式不正确')
      }

      console.log('📄 解析的文件数据:', {
        version: tldrData.tldrawFileFormatVersion,
        recordCount: tldrData.records.length,
        recordTypes: Array.from(new Set(tldrData.records.map((r: any) => r.typeName)))
      })

      // 使用 editor 的标准方法加载数据
      try {
        // 先清空当前内容
        editor.selectAll()
        editor.deleteShapes(editor.getSelectedShapeIds())
        
        // 加载新内容 - 使用 editor 的批量操作
        editor.store.mergeRemoteChanges(() => {
          // 移除当前所有记录（除了基础的 document 和 page）
          const currentRecords = editor.store.allRecords()
                     const recordsToRemove = currentRecords.filter((r: any) => 
             r.typeName !== 'document' && 
             r.typeName !== 'page' &&
             r.typeName !== 'camera'
           )
          
          if (recordsToRemove.length > 0) {
            editor.store.remove(recordsToRemove.map(r => r.id))
          }
          
                     // 添加新记录
           const recordsToAdd = tldrData.records.filter((r: any) => 
             r.typeName !== 'document' && 
             r.typeName !== 'camera' // 避免冲突
           )
          
          for (const record of recordsToAdd) {
            try {
              editor.store.put([record])
                         } catch (recordError) {
               console.warn('⚠️ 跳过无效记录:', (record as any).typeName, (record as any).id, recordError)
             }
          }
        })

        // 等待一帧后调整视图
        setTimeout(() => {
          try {
            editor.zoomToFit()
            console.log('📐 视图已调整')
          } catch (zoomError) {
            console.warn('⚠️ 视图调整失败:', zoomError)
          }
        }, 100)
        
        console.log(`✅ .tldr 文件加载成功: ${file.name}`)
        return true
        
      } catch (loadError) {
        console.error('❌ 数据加载失败:', loadError)
        throw new Error(`数据加载失败: ${(loadError as Error).message}`)
      }
      
    } catch (error) {
      console.error('❌ 上传 .tldr 文件失败:', error)
      throw error
    }
  }

  /**
   * 批量上传多个 .tldr 文件
   */
  async uploadMultipleTldrFiles(files: FileList, userId: string, userName: string): Promise<{success: string[], failed: string[]}> {
    const results = { success: [], failed: [] }
    
    for (const file of Array.from(files)) {
      try {
        if (this.validateTldrFile(file)) {
          // 创建新房间并上传文件
          await this.createRoomFromTldrFile(file, userId, userName)
          results.success.push(file.name)
        } else {
          results.failed.push(file.name)
        }
      } catch (error) {
        console.error(`上传文件 ${file.name} 失败:`, error)
        results.failed.push(file.name)
      }
    }
    
    return results
  }

  /**
   * 从 .tldr 文件创建新房间
   */
  private async createRoomFromTldrFile(file: File, userId: string, userName: string): Promise<void> {
    const fileContent = await this.readFileAsText(file)
    const tldrData = JSON.parse(fileContent) as TldrFileContent
    
    // 生成房间名称（从文件名中提取）
    const roomName = file.name.replace('.tldr', '')
    
    // 创建新房间
    const room = await api.createRoom({
      name: roomName,
      ownerId: userId,
      ownerName: userName,
      published: false,
      permission: 'editor'
    })

    // 保存 .tldr 文件内容
    await tldrFileAPI.saveTldrFile({
      name: file.name,
      roomId: room.id,
      ownerId: userId,
      ownerName: userName,
      content: tldrData,
      isPublic: false
    })

    console.log(`✅ 新房间已创建并保存文件: ${room.name} (${room.id})`)
  }

  /**
   * 保存当前编辑器内容为 .tldr 文件到服务器
   */
  async saveTldrFileToServer(editor: Editor, fileName: string, userId: string, userName: string, isPublic: boolean = false): Promise<void> {
    try {
      const snapshot = editor.store.getSnapshot()
      const fileContent: TldrFileContent = {
        tldrawFileFormatVersion: 1,
        schema: schema.serialize(),
        records: Object.values(snapshot.store)
      }

      const roomId = this.getCurrentRoomId()
      
      await tldrFileAPI.saveTldrFile({
        name: fileName.endsWith('.tldr') ? fileName : `${fileName}.tldr`,
        roomId: roomId,
        ownerId: userId,
        ownerName: userName,
        content: fileContent,
        isPublic: isPublic
      })

      console.log(`✅ 文件已保存到服务器: ${fileName}`)
    } catch (error) {
      console.error('❌ 保存文件到服务器失败:', error)
      throw new Error('保存文件到服务器失败')
    }
  }

  /**
   * 从服务器加载 .tldr 文件到编辑器
   */
  async loadTldrFileFromServer(editor: Editor, fileId: string): Promise<void> {
    try {
      const tldrData = await tldrFileAPI.getTldrFileContent(fileId)

      // 验证文件结构
      if (!this.validateTldrContent(tldrData)) {
        throw new Error('服务器文件内容格式不正确')
      }

      // 替换编辑器内容
      editor.store.mergeRemoteChanges(() => {
        // 清空当前内容
        const currentRecords = editor.store.allRecords()
        editor.store.remove(currentRecords.map(r => r.id))
        
        // 加载新内容
        for (const record of tldrData.records) {
          editor.store.put([record])
        }
      })

      // 重置视图到适合的位置
      editor.zoomToFit()
      
      console.log(`✅ 从服务器加载文件成功: ${fileId}`)
    } catch (error) {
      console.error('❌ 从服务器加载文件失败:', error)
      throw error
    }
  }

  /**
   * 验证是否为有效的 .tldr 文件
   */
  private validateTldrFile(file: File): boolean {
    // 检查文件扩展名
    if (!file.name.toLowerCase().endsWith('.tldr')) {
      return false
    }
    
    // 检查文件大小（限制为50MB）
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      console.warn('文件太大，超过50MB限制')
      return false
    }
    
    return true
  }

  /**
   * 验证 .tldr 文件内容结构
   */
  private validateTldrContent(content: any): content is TldrFileContent {
    return (
      content &&
      typeof content === 'object' &&
      typeof content.tldrawFileFormatVersion === 'number' &&
      content.schema &&
      Array.isArray(content.records)
    )
  }

  /**
   * 读取文件为文本
   */
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })
  }

  /**
   * 获取当前房间名称
   */
  private getCurrentRoomName(): string {
    const path = window.location.pathname
    const match = path.match(/\/r(?:o)?\/([^/]+)/)
    return match ? decodeURIComponent(match[1]) : 'untitled'
  }

  /**
   * 获取当前房间ID
   */
  private getCurrentRoomId(): string {
    const path = window.location.pathname
    const match = path.match(/\/(?:r(?:o)?|p)\/([^/]+)/)
    return match ? decodeURIComponent(match[1]) : 'shared-room'
  }

  /**
   * 创建文件选择对话框
   */
  async openFileDialog(): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.tldr'
      input.multiple = true
      input.style.display = 'none'
      
      input.onchange = (event) => {
        const files = (event.target as HTMLInputElement).files
        resolve(files ? Array.from(files) : [])
        document.body.removeChild(input)
      }
      
      document.body.appendChild(input)
      input.click()
    })
  }
}

// 导出单例实例
export const tldrFileHandler = TldrFileHandler.getInstance()