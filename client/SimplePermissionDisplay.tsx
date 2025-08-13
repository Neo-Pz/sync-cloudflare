import React, { useEffect, useState } from 'react'
import { SimplePermissionManager, type SimplePermission, type SimplePermissionConfig } from './SimplePermissionManager'

interface SimplePermissionDisplayProps {
  roomId: string
  showDetails?: boolean
  style?: React.CSSProperties
  className?: string
}

/**
 * 简化权限显示组件
 * 只读显示，数据自动从数据库同步
 */
export function SimplePermissionDisplay({ roomId, showDetails = false, style, className }: SimplePermissionDisplayProps) {
  const [config, setConfig] = useState<SimplePermissionConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 加载权限配置
  const loadConfig = async () => {
    if (!roomId) return
    
    setIsLoading(true)
    try {
      const permissionConfig = await SimplePermissionManager.getRoomPermissionConfig(roomId)
      setConfig(permissionConfig)
    } catch (error) {
      console.error('Error loading simple permission config for display:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 初始加载
  useEffect(() => {
    loadConfig()
  }, [roomId])

  // 监听权限变更事件
  useEffect(() => {
    const handlePermissionChange = (event: CustomEvent) => {
      const { roomId: changedRoomId, updatedConfig } = event.detail
      
      if (changedRoomId === roomId && updatedConfig) {
        console.log(`🔄 SimplePermissionDisplay: 检测到权限变更 ${roomId}`, updatedConfig)
        
        setConfig({
          roomId: roomId,
          permission: updatedConfig.permission || 'editor',
          published: updatedConfig.published || false,
  plaza: updatedConfig.plaza || false,
          historyLocked: updatedConfig.historyLocked || false,
          historyLockTimestamp: updatedConfig.historyLockTimestamp,
          historyLockedBy: updatedConfig.historyLockedBy,
          historyLockedByName: updatedConfig.historyLockedByName
        })
      }
    }

    window.addEventListener('simplePermissionChanged', handlePermissionChange as EventListener)

    return () => {
      window.removeEventListener('simplePermissionChanged', handlePermissionChange as EventListener)
    }
  }, [roomId])

  if (isLoading) {
    return (
      <div style={{ ...style, color: '#9ca3af', fontSize: '0.875rem' }} className={className}>
        加载中...
      </div>
    )
  }

  if (!config) {
    return (
      <div style={{ ...style, color: '#ef4444', fontSize: '0.875rem' }} className={className}>
        无法获取权限信息
      </div>
    )
  }

  const permissionInfo = SimplePermissionManager.getPermissionInfo(config.permission)

  if (!showDetails) {
    // 简单显示模式
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', gap: '4px' }} className={className}>
        <span>{permissionInfo.icon}</span>
        <span style={{ fontSize: '0.875rem', color: '#374151' }}>
{config.publish ? `已发布${config.plaza ? '（发布白板）' : ''}|${permissionInfo.name}` : permissionInfo.name}
        </span>
        {config.historyLocked && config.permission === 'assist' && (
          <span style={{ color: '#f59e0b', fontSize: '0.75rem' }} title="历史锁定中">
            🔒
          </span>
        )}
      </div>
    )
  }

  // 详细显示模式
  return (
    <div style={{ ...style }} className={className}>
      <div style={{ 
        padding: '0.75rem', 
        backgroundColor: '#f9fafb', 
        border: '1px solid #e5e7eb', 
        borderRadius: '6px',
        fontSize: '0.875rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>{permissionInfo.icon}</span>
          <div>
            <div style={{ fontWeight: '600', color: '#374151', fontSize: '1rem' }}>
              {permissionInfo.name}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
              {permissionInfo.description}
            </div>
          </div>
        </div>
        
        {/* 历史状态说明 */}
        <div style={{ 
          backgroundColor: config.permission === 'assist' && config.historyLocked ? '#fef3c7' : 
                          config.permission === 'editor' && !config.historyLocked ? '#d1fae5' : '#f3f4f6',
          color: config.permission === 'assist' && config.historyLocked ? '#92400e' : 
                 config.permission === 'editor' && !config.historyLocked ? '#065f46' : '#6b7280',
          padding: '6px 8px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          marginBottom: '8px'
        }}>
          📖 {permissionInfo.historyEffect}
          {config.historyLocked && config.permission === 'assist' && ' (当前已锁定)'}
          {!config.historyLocked && config.permission === 'editor' && ' (当前已解锁)'}
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
{config.publish && (
            <span style={{ 
              backgroundColor: '#d1fae5', 
              color: '#065f46', 
              padding: '2px 6px', 
              borderRadius: '4px',
              fontSize: '0.75rem'
            }}>
              📢 已发布{config.plaza ? '（发布白板）' : ''}|{permissionInfo.name}
            </span>
          )}
        </div>

        {config.historyLocked && config.historyLockTimestamp && (
          <div style={{ 
            marginTop: '8px', 
            padding: '6px 8px', 
            backgroundColor: '#fffbeb', 
            borderRadius: '4px',
            fontSize: '0.7rem',
            color: '#92400e',
            fontFamily: 'monospace'
          }}>
            <div>锁定时间: {new Date(config.historyLockTimestamp).toLocaleString()}</div>
            {config.historyLockedByName && (
              <div>锁定人: {config.historyLockedByName}</div>
            )}
          </div>
        )}
        
        <div style={{ 
          marginTop: '8px', 
          fontSize: '0.7rem', 
          color: '#9ca3af',
          textAlign: 'center'
        }}>
          💡 要修改权限，请前往房间设置
        </div>
      </div>
    </div>
  )
}

/**
 * 简单权限图标组件
 */
export function SimplePermissionIcon({ roomId, style }: { roomId: string, style?: React.CSSProperties }) {
  const [permission, setPermission] = useState<SimplePermission>('editor')
  const [historyLocked, setHistoryLocked] = useState(false)

  useEffect(() => {
    const loadPermission = async () => {
      try {
        const config = await SimplePermissionManager.getRoomPermissionConfig(roomId)
        if (config) {
          setPermission(config.permission)
          setHistoryLocked(config.historyLocked)
        }
      } catch (error) {
        console.error('Error loading permission for icon:', error)
      }
    }

    loadPermission()

    // 监听权限变更
    const handlePermissionChange = (event: CustomEvent) => {
      const { roomId: changedRoomId, permission: newPermission, historyLocked: newHistoryLocked } = event.detail
      
      if (changedRoomId === roomId) {
        if (newPermission) setPermission(newPermission)
        if (newHistoryLocked !== undefined) setHistoryLocked(newHistoryLocked)
      }
    }

    window.addEventListener('simplePermissionChanged', handlePermissionChange as EventListener)

    return () => {
      window.removeEventListener('simplePermissionChanged', handlePermissionChange as EventListener)
    }
  }, [roomId])

  const permissionInfo = SimplePermissionManager.getPermissionInfo(permission)

  return (
    <div style={{ ...style, display: 'flex', alignItems: 'center', gap: '2px' }}>
      <span title={`${permissionInfo.name} - ${permissionInfo.description}`}>
        {permissionInfo.icon}
      </span>
      {historyLocked && permission === 'assist' && (
        <span style={{ fontSize: '0.75em', color: '#f59e0b' }} title="历史锁定中">🔒</span>
      )}
    </div>
  )
}