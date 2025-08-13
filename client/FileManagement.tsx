// 文件管理面板 - 显示和管理用户的 .tldr 文件
import React, { useState, useEffect, useCallback } from 'react'
import { useUser } from '@clerk/clerk-react'
import { useEditor } from '@tldraw/editor'
import { TldrawUiButton, TldrawUiButtonIcon } from 'tldraw'
import { tldrFileAPI, TldrFile } from './api'
import { tldrFileHandler } from './tldrFileHandler'

interface FileManagementProps {
  isOpen: boolean
  onClose: () => void
  className?: string
}

export function FileManagement({ isOpen, onClose, className }: FileManagementProps) {
  const editor = useEditor()
  const { user } = useUser()
  const [files, setFiles] = useState<TldrFile[]>([])
  const [publicFiles, setPublicFiles] = useState<TldrFile[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'my-files' | 'public'>('my-files')
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null)

  // 加载用户文件
  const loadUserFiles = useCallback(async () => {
    if (!user) return
    
    setLoading(true)
    try {
      const userFiles = await tldrFileAPI.getUserTldrFiles(user.id, 20)
      setFiles(userFiles)
    } catch (error) {
      console.error('加载用户文件失败:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  // 加载公开文件
  const loadPublicFiles = useCallback(async () => {
    setLoading(true)
    try {
      const files = await tldrFileAPI.getPublicTldrFiles(20)
      setPublicFiles(files)
    } catch (error) {
      console.error('加载公开文件失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始加载
  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'my-files') {
        loadUserFiles()
      } else {
        loadPublicFiles()
      }
    }
  }, [isOpen, activeTab, loadUserFiles, loadPublicFiles])

  // 加载文件到编辑器
  const handleLoadFile = useCallback(async (file: TldrFile) => {
    setLoadingFileId(file.id)
    try {
      await tldrFileHandler.loadTldrFileFromServer(editor, file.id)
      alert(`文件 "${file.name}" 已成功加载到编辑器`)
      onClose()
    } catch (error) {
      console.error('加载文件失败:', error)
      alert('加载文件失败: ' + error.message)
    } finally {
      setLoadingFileId(null)
    }
  }, [editor, onClose])

  // 下载文件
  const handleDownloadFile = useCallback(async (file: TldrFile) => {
    try {
      const blob = await tldrFileAPI.downloadTldrFile(file.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('下载文件失败:', error)
      alert('下载文件失败')
    }
  }, [])

  // 删除文件
  const handleDeleteFile = useCallback(async (file: TldrFile) => {
    if (!user) return
    if (!confirm(`确定要删除文件 "${file.name}" 吗？`)) return

    try {
      await tldrFileAPI.deleteTldrFile(file.id, user.id)
      setFiles(prev => prev.filter(f => f.id !== file.id))
      alert('文件已删除')
    } catch (error) {
      console.error('删除文件失败:', error)
      alert('删除文件失败')
    }
  }, [user])

  // 切换公开状态
  const handleTogglePublic = useCallback(async (file: TldrFile) => {
    if (!user) return

    try {
      await tldrFileAPI.updateFilePublicStatus(file.id, user.id, !file.isPublic)
      setFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, isPublic: !f.isPublic } : f
      ))
      alert(`文件已${file.isPublic ? '设为私有' : '设为公开'}`)
    } catch (error) {
      console.error('更新文件状态失败:', error)
      alert('更新文件状态失败')
    }
  }, [user])

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 格式化日期
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!isOpen) return null

  const currentFiles = activeTab === 'my-files' ? files : publicFiles

  return (
    <div 
      className={className || ''}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        maxHeight: '500px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
        zIndex: 1000,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb'
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>文件管理</h2>
        <TldrawUiButton type="icon" onClick={onClose}>
          <TldrawUiButtonIcon icon="cross-2" />
        </TldrawUiButton>
      </div>

      {/* 标签切换 */}
      <div 
        style={{
          display: 'flex',
          borderBottom: '1px solid #e5e7eb'
        }}
      >
        <button
          style={{
            flex: 1,
            padding: '12px 16px',
            border: 'none',
            background: activeTab === 'my-files' ? '#eff6ff' : 'none',
            cursor: 'pointer',
            fontSize: '14px',
            borderBottom: activeTab === 'my-files' ? '2px solid #3b82f6' : '2px solid transparent',
            transition: 'all 0.2s',
            color: activeTab === 'my-files' ? '#3b82f6' : 'inherit'
          }}
          onClick={() => setActiveTab('my-files')}
          onMouseEnter={(e) => {
            if (activeTab !== 'my-files') {
              e.currentTarget.style.background = '#f3f4f6'
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'my-files') {
              e.currentTarget.style.background = 'none'
            }
          }}
        >
          我的文件
        </button>
        <button
          style={{
            flex: 1,
            padding: '12px 16px',
            border: 'none',
            background: activeTab === 'public' ? '#eff6ff' : 'none',
            cursor: 'pointer',
            fontSize: '14px',
            borderBottom: activeTab === 'public' ? '2px solid #3b82f6' : '2px solid transparent',
            transition: 'all 0.2s',
            color: activeTab === 'public' ? '#3b82f6' : 'inherit'
          }}
          onClick={() => setActiveTab('public')}
          onMouseEnter={(e) => {
            if (activeTab !== 'public') {
              e.currentTarget.style.background = '#f3f4f6'
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'public') {
              e.currentTarget.style.background = 'none'
            }
          }}
        >
          公开文件
        </button>
      </div>

      {/* 文件列表 */}
      <div 
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px'
        }}
      >
        {loading ? (
          <div 
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#6b7280'
            }}
          >
            加载中...
          </div>
        ) : currentFiles.length === 0 ? (
          <div 
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#6b7280'
            }}
          >
            {activeTab === 'my-files' ? '您还没有保存任何文件' : '暂无公开文件'}
          </div>
        ) : (
          <div 
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            {currentFiles.map((file) => (
              <div 
                key={file.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db'
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div 
                    style={{
                      fontWeight: '500',
                      marginBottom: '4px'
                    }}
                  >
                    {file.name}
                  </div>
                  <div 
                    style={{
                      display: 'flex',
                      gap: '12px',
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '2px'
                    }}
                  >
                    <span>大小: {formatFileSize(file.fileSize)}</span>
                    <span>创建: {formatDate(file.createdAt)}</span>
                    <span>下载: {file.downloadCount} 次</span>
                    {file.isPublic && (
                      <span 
                        style={{
                          background: '#10b981',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px'
                        }}
                      >
                        公开
                      </span>
                    )}
                  </div>
                  <div 
                    style={{
                      fontSize: '12px',
                      color: '#9ca3af'
                    }}
                  >
                    创建者: {file.ownerName}
                  </div>
                </div>
                
                <div 
                  style={{
                    display: 'flex',
                    gap: '8px'
                  }}
                >
                  {/* 加载到编辑器 */}
                  <TldrawUiButton
                    type="icon"
                    onClick={() => handleLoadFile(file)}
                    disabled={loadingFileId === file.id}
                    title="加载到编辑器"
                  >
                    <TldrawUiButtonIcon icon={loadingFileId === file.id ? 'spinner' : 'edit'} />
                  </TldrawUiButton>

                  {/* 下载文件 */}
                  <TldrawUiButton
                    type="icon"
                    onClick={() => handleDownloadFile(file)}
                    title="下载文件"
                  >
                    <TldrawUiButtonIcon icon="download" />
                  </TldrawUiButton>

                  {/* 用户自己的文件才显示管理按钮 */}
                  {user && file.ownerId === user.id && (
                    <>
                      {/* 切换公开状态 */}
                      <TldrawUiButton
                        type="icon"
                        onClick={() => handleTogglePublic(file)}
                        title={file.isPublic ? '设为私有' : '设为公开'}
                      >
                        <TldrawUiButtonIcon icon={file.isPublic ? 'lock' : 'unlock'} />
                      </TldrawUiButton>

                      {/* 删除文件 */}
                      <TldrawUiButton
                        type="icon"
                        onClick={() => handleDeleteFile(file)}
                        title="删除文件"
                      >
                        <TldrawUiButtonIcon icon="trash" />
                      </TldrawUiButton>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 文件管理按钮组件
interface FileManagementButtonProps {
  className?: string
}

export function FileManagementButton({ className }: FileManagementButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <TldrawUiButton
        type="icon"
        onClick={() => setIsOpen(true)}
        className={className}
        title="文件管理"
      >
        <TldrawUiButtonIcon icon="folder-open" />
      </TldrawUiButton>

      <FileManagement isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}