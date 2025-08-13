// .tldr 文件功能集成组件 - 整合所有文件相关功能
import React, { useCallback } from 'react'
import { useUser } from '@clerk/clerk-react'
import { useEditor } from '@tldraw/editor'
import { FileActions, DragDropUpload } from './FileActions'
import { tldrFileHandler } from './tldrFileHandler'

interface TldrFileIntegrationProps {
  children: React.ReactNode
  className?: string
}

// 外部容器组件（提供拖拽功能，不使用 useEditor）
export function TldrFileIntegration({ children, className }: TldrFileIntegrationProps) {
  const { user } = useUser()

  // 处理拖拽上传的文件（简化版本，移除文件管理功能）
  const handleFilesDropped = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    // 由于无法在此处访问 editor，拖拽功能暂时禁用
    // 用户需要通过文件菜单的"导入 .tldr 文件"功能来导入文件
    alert('请使用文件菜单中的"导入 .tldr 文件"功能来导入文件')
  }, [])

  return (
    <DragDropUpload onFilesDropped={handleFilesDropped} className={className}>
      {children}
    </DragDropUpload>
  )
}

// 注意：TldrDragDropUpload 组件已移除，拖拽功能现在集成在 TldrFileIntegration 中

// 文件操作工具栏组件（在 Tldraw 内部使用）
interface FileToolbarProps {
  className?: string
}

export function FileToolbar({ className }: FileToolbarProps) {
  return (
    <div className={`tlui-file-toolbar ${className || ''}`} style={{
      display: 'flex',
      gap: '8px',
      alignItems: 'center'
    }}>
      <FileActions />
    </div>
  )
}

// 导出所有相关组件和工具
export { FileActions } from './FileActions'
export { tldrFileHandler } from './tldrFileHandler'
export { tldrFileAPI } from './api'