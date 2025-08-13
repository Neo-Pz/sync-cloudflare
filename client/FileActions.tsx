// 文件操作组件 - 提供下载和上传 .tldr 文件的UI
import React, { useState, useCallback, useEffect } from 'react'
import { useEditor } from '@tldraw/editor'
import { useUser } from '@clerk/clerk-react'
import { TldrawUiButton, TldrawUiButtonIcon, TldrawUiDropdownMenuRoot, TldrawUiDropdownMenuContent, TldrawUiDropdownMenuItem, TldrawUiDropdownMenuTrigger } from 'tldraw'
import { simpleFileHandler } from './SimpleFileHandler'
import { directRoomLoader } from './DirectRoomLoader'

// 添加旋转动画CSS
const addSpinAnimation = () => {
  if (document.getElementById('spin-animation')) return
  
  const style = document.createElement('style')
  style.id = 'spin-animation'
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `
  document.head.appendChild(style)
}

interface FileActionsProps {
  className?: string
}

export function FileActions({ className }: FileActionsProps) {
  const editor = useEditor()
  const { user } = useUser()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    addSpinAnimation()
  }, [])

  // 下载当前画板为 .tldr 文件
  const handleDownload = useCallback(async () => {
    console.log('🔽 开始下载 .tldr 文件', { editor })
    
    // 等待编辑器就绪
    const actualEditor = editor || (window as any).globalEditor
    if (!actualEditor) {
      console.warn('⏳ 编辑器还未初始化，等待中...')
      setTimeout(() => handleDownload(), 500)
      return
    }

    setIsDownloading(true)
    try {
      await simpleFileHandler.downloadTldrFile(actualEditor)
      console.log('✅ 文件下载成功')
    } catch (error) {
      console.error('❌ 下载失败:', error)
      alert('下载失败：' + (error as Error).message)
    } finally {
      setIsDownloading(false)
    }
  }, [editor])

  // 导入 .tldr 文件创建新房间
  const handleImportAsRoom = useCallback(async () => {
    console.log('🔼 开始导入 .tldr 文件创建新房间')

    try {
      const files = await simpleFileHandler.openFileDialog()
      console.log('📁 选择的文件:', files)
      
      if (files.length === 0) {
        console.log('ℹ️ 用户取消了文件选择')
        return
      }

      const file = files[0] // 只处理第一个文件
      console.log('📄 准备导入文件:', file.name, file.size)
      
      setIsUploading(true)
      setUploadProgress('正在创建新房间...')

      // 导入文件创建新房间
      const result = await simpleFileHandler.importTldrFileAsRoom(
        file, 
        user?.id, 
        user?.fullName || user?.firstName || 'User'
      )
      
      setUploadProgress(`房间创建成功: ${result.roomName}`)
      console.log('✅ 房间创建成功:', result)
      
      // 生成带数据的房间URL并跳转
      const roomUrlWithData = directRoomLoader.generateRoomUrlWithData(result.roomId, result.tldrData, result.roomName)
      
      setTimeout(() => {
        console.log('🚀 跳转到新房间并加载数据:', roomUrlWithData)
        window.location.href = roomUrlWithData
      }, 1000)
      
      setTimeout(() => {
        setUploadProgress('')
        setIsUploading(false)
      }, 2000)
      
    } catch (error) {
      console.error('❌ 导入失败:', error)
      const errorMessage = '导入失败: ' + (error as Error).message
      setUploadProgress(errorMessage)
      alert(errorMessage)
      setTimeout(() => {
        setUploadProgress('')
        setIsUploading(false)
      }, 3000)
    }
  }, [user])

  return (
    <div className={className || ''} style={{ position: 'relative' }}>
      <TldrawUiDropdownMenuRoot id="file-actions">
        <TldrawUiDropdownMenuTrigger>
          <TldrawUiButton type="icon" title="文件操作">
            <TldrawUiButtonIcon icon="folder" />
          </TldrawUiButton>
        </TldrawUiDropdownMenuTrigger>
        
        <TldrawUiDropdownMenuContent align="start">
          {/* 下载当前画板 */}
          <TldrawUiDropdownMenuItem>
            <TldrawUiButton
              type="menu"
              disabled={isDownloading}
              onClick={handleDownload}
              title="导出房间（.tldr 文件）"
            >
              {isDownloading ? (
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(0, 0, 0, 0.3)',
                  borderTop: '2px solid #000',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginRight: '8px'
                }} />
              ) : (
                <TldrawUiButtonIcon icon="download" />
              )}
              <span>导出房间（.tldr 文件）</span>
            </TldrawUiButton>
          </TldrawUiDropdownMenuItem>

          {/* 导入 .tldr 文件创建新房间 */}
          <TldrawUiDropdownMenuItem>
            <TldrawUiButton
              type="menu"
              disabled={isUploading}
              onClick={handleImportAsRoom}
              title="导入 .tldr 文件创建新房间"
            >
              {isUploading ? (
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(0, 0, 0, 0.3)',
                  borderTop: '2px solid #000',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginRight: '8px'
                }} />
              ) : (
                <TldrawUiButtonIcon icon="plus" />
              )}
              <span>导入为新房间</span>
            </TldrawUiButton>
          </TldrawUiDropdownMenuItem>
        </TldrawUiDropdownMenuContent>
      </TldrawUiDropdownMenuRoot>

      {/* 上传进度提示 */}
      {uploadProgress && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '8px',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          zIndex: 1000,
          minWidth: '200px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {isUploading && (
              <div style={{
                width: '12px',
                height: '12px',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderTop: '2px solid white',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            )}
            <span>{uploadProgress}</span>
          </div>
        </div>
      )}

    </div>
  )
}

// 拖拽上传组件
interface DragDropUploadProps {
  onFilesDropped: (files: File[], user?: any) => void
  children: React.ReactNode
  className?: string
}

export function DragDropUpload({ onFilesDropped, children, className }: DragDropUploadProps) {
  const { user } = useUser()
  const [isDragging, setIsDragging] = useState(false)
  const [dragCounter, setDragCounter] = useState(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter(prev => prev + 1)
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter(prev => prev - 1)
    if (dragCounter <= 1) {
      setIsDragging(false)
    }
  }, [dragCounter])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    setDragCounter(0)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const tldrFiles = Array.from(e.dataTransfer.files).filter(file => 
        file.name.toLowerCase().endsWith('.tldr')
      )
      
      if (tldrFiles.length > 0) {
        onFilesDropped(tldrFiles, user)
      }
    }
  }, [onFilesDropped])

  return (
    <div
      className={className || ''}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        pointerEvents: isDragging ? 'none' : 'auto'
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      
      {isDragging && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(37, 99, 235, 0.1)',
          border: '2px dashed rgba(37, 99, 235, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          pointerEvents: 'none'
        }}>
          <div style={{
            background: 'rgba(37, 99, 235, 0.9)',
            color: 'white',
            padding: '20px',
            borderRadius: '12px',
            textAlign: 'center',
            fontSize: '16px',
            fontWeight: '500',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <TldrawUiButtonIcon icon="file" />
            <div>释放以导入 .tldr 文件</div>
          </div>
        </div>
      )}

    </div>
  )
}