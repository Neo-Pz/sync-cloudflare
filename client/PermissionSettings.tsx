import React, { useState, useEffect } from 'react'

// 权限类型定义
export type Permission = 'viewer' | 'assist' | 'editor'

// 权限配置接口
export interface PermissionConfig {
  roomId: string
  permission: Permission
  maxPermission: Permission
  published: boolean
  publish: boolean
  historyLocked: boolean
  historyLockTimestamp?: number
  historyLockedBy?: string
  historyLockedByName?: string
}

// 权限层级
const PERMISSION_LEVELS = {
  viewer: 0,
  assist: 1,
  editor: 2
}

// 权限描述
const PERMISSION_DESCRIPTIONS = {
  viewer: '浏览 - 只能查看，无法编辑',
  assist: '辅作 - 可以编辑新内容，不能修改历史',
  editor: '编辑 - 可以修改所有内容'
}

// 权限图标
const PERMISSION_ICONS = {
  viewer: '👁️',
  assist: '✏️',
  editor: '🖊️'
}

interface PermissionSettingsProps {
  roomId: string
  currentConfig?: PermissionConfig
  onPermissionChange?: (permission: Permission) => void
  onPublishToggle?: (published: boolean) => void
  onHistoryLockToggle?: (locked: boolean) => void
  disabled?: boolean
  compact?: boolean
}

export function PermissionSettings({
  roomId,
  currentConfig,
  onPermissionChange,
  onPublishToggle,
  onHistoryLockToggle,
  disabled = false,
  compact = false
}: PermissionSettingsProps) {
  const [config, setConfig] = useState<PermissionConfig | null>(currentConfig || null)
  const [isLoading, setIsLoading] = useState(!currentConfig)

  // 加载权限配置
  const loadConfig = async () => {
    if (!roomId) return
    
    setIsLoading(true)
    try {
      // 从API加载配置的逻辑
      // 这里应该调用实际的API
      console.log('加载房间权限配置:', roomId)
    } catch (error) {
      console.error('加载权限配置失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!currentConfig) {
      loadConfig()
    }
  }, [roomId, currentConfig])

  // 获取可用的权限选项
  const getAvailablePermissions = (): Permission[] => {
    if (!config) return ['viewer', 'assist', 'editor']
    
    const maxLevel = PERMISSION_LEVELS[config.maxPermission]
    const permissions: Permission[] = []
    
    if (maxLevel >= PERMISSION_LEVELS.viewer) permissions.push('viewer')
    if (maxLevel >= PERMISSION_LEVELS.assist) permissions.push('assist')
    if (maxLevel >= PERMISSION_LEVELS.editor) permissions.push('editor')
    
    // 历史锁定后，只能选择浏览或辅作
    if (config.historyLocked) {
      return permissions.filter(p => p !== 'editor')
    }
    
    return permissions
  }

  // 处理权限变更
  const handlePermissionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newPermission = event.target.value as Permission
    
    if (config) {
      const updatedConfig = { ...config, permission: newPermission }
      setConfig(updatedConfig)
      onPermissionChange?.(newPermission)
    }
  }

  // 处理发布状态切换
  const handlePublishToggle = () => {
    if (!config || disabled) return
    
const newPublished = !config.publish
    const updatedConfig = { ...config, published: newPublished }
    setConfig(updatedConfig)
    onPublishToggle?.(newPublished)
  }

  // 处理历史锁定切换
  const handleHistoryLockToggle = () => {
    if (!config || disabled) return
    
    const newLocked = !config.historyLocked
    const updatedConfig = {
      ...config,
      historyLocked: newLocked,
      historyLockTimestamp: newLocked ? Date.now() : undefined
    }
    setConfig(updatedConfig)
    onHistoryLockToggle?.(newLocked)
  }

  if (isLoading) {
    return (
      <div style={{
        padding: compact ? '0.5rem' : '1rem',
        backgroundColor: '#f9fafb',
        borderRadius: '6px',
        fontSize: '0.875rem',
        color: '#6b7280'
      }}>
        正在加载权限设置...
      </div>
    )
  }

  if (!config) {
    return (
      <div style={{
        padding: compact ? '0.5rem' : '1rem',
        backgroundColor: '#fee2e2',
        color: '#991b1b',
        borderRadius: '6px',
        fontSize: '0.875rem'
      }}>
        无法加载权限配置
      </div>
    )
  }

  const availablePermissions = getAvailablePermissions()

  if (compact) {
    // 紧凑模式 - 只显示权限下拉菜单
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '0.875rem', color: '#374151' }}>权限:</span>
        <select
          value={config.permission}
          onChange={handlePermissionChange}
          disabled={disabled}
          style={{
            padding: '4px 8px',
            fontSize: '0.875rem',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            backgroundColor: disabled ? '#f3f4f6' : 'white'
          }}
        >
          {availablePermissions.map(permission => (
            <option key={permission} value={permission}>
              {PERMISSION_ICONS[permission]} {PERMISSION_DESCRIPTIONS[permission].split(' - ')[0]}
            </option>
          ))}
        </select>
        
        {config.historyLocked && (
          <span style={{ color: '#f59e0b', fontSize: '0.75rem' }} title="历史已锁定">
            🔒
          </span>
        )}
        
{config.publish && (
          <span style={{ color: '#10b981', fontSize: '0.75rem' }} title="已发布">
            📢
          </span>
        )}
      </div>
    )
  }

  // 完整模式
  return (
    <div style={{
      padding: '1rem',
      backgroundColor: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      fontSize: '0.875rem'
    }}>
      <h3 style={{
        margin: '0 0 1rem 0',
        fontSize: '1rem',
        fontWeight: '600',
        color: '#374151'
      }}>
        权限设置
      </h3>

      {/* 权限选择 */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{
          display: 'block',
          marginBottom: '0.5rem',
          fontWeight: '500',
          color: '#374151'
        }}>
          访问权限
        </label>
        
        <select
          value={config.permission}
          onChange={handlePermissionChange}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '0.5rem',
            fontSize: '0.875rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            backgroundColor: disabled ? '#f3f4f6' : 'white'
          }}
        >
          {availablePermissions.map(permission => (
            <option key={permission} value={permission}>
              {PERMISSION_ICONS[permission]} {PERMISSION_DESCRIPTIONS[permission]}
            </option>
          ))}
        </select>
        
        <div style={{
          marginTop: '0.5rem',
          fontSize: '0.75rem',
          color: '#6b7280'
        }}>
          {PERMISSION_DESCRIPTIONS[config.permission]}
        </div>
      </div>

      {/* 发布设置 */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}>
          <input
            type="checkbox"
checked={config.publish}
            onChange={handlePublishToggle}
            disabled={disabled}
            style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
          />
          <span style={{ fontWeight: '500', color: '#374151' }}>
            📢 发布到公开列表
          </span>
        </label>
        
        <div style={{
          marginTop: '0.25rem',
          fontSize: '0.75rem',
          color: '#6b7280',
          marginLeft: '1.5rem'
        }}>
          发布后其他用户可以在公开列表中找到此房间
        </div>
      </div>

      {/* 历史锁定设置 */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}>
          <input
            type="checkbox"
            checked={config.historyLocked}
            onChange={handleHistoryLockToggle}
            disabled={disabled}
            style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
          />
          <span style={{ fontWeight: '500', color: '#374151' }}>
            🔒 锁定历史内容
          </span>
        </label>
        
        <div style={{
          marginTop: '0.25rem',
          fontSize: '0.75rem',
          color: '#6b7280',
          marginLeft: '1.5rem'
        }}>
          锁定后只允许新增内容，历史内容无法修改
        </div>

        {config.historyLocked && config.historyLockTimestamp && (
          <div style={{
            marginTop: '0.5rem',
            marginLeft: '1.5rem',
            padding: '0.5rem',
            backgroundColor: '#fffbeb',
            borderRadius: '4px',
            fontSize: '0.75rem',
            color: '#92400e'
          }}>
            锁定时间: {new Date(config.historyLockTimestamp).toLocaleString()}
            {config.historyLockedByName && (
              <div>锁定人: {config.historyLockedByName}</div>
            )}
          </div>
        )}
      </div>

      {/* 状态指示 */}
      <div style={{
        padding: '0.75rem',
        backgroundColor: '#f0f9ff',
        borderRadius: '6px',
        fontSize: '0.75rem',
        color: '#1e40af'
      }}>
        <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
          当前状态:
        </div>
        <div>
          {PERMISSION_ICONS[config.permission]} {PERMISSION_DESCRIPTIONS[config.permission].split(' - ')[0]}
{config.publish && ' • 📢 已发布'}
          {config.publish && ' • 🏛️ 发布白板显示'}
          {config.historyLocked && ' • 🔒 历史锁定'}
        </div>
      </div>
    </div>
  )
}

// 权限工具函数
export const PermissionUtils = {
  // 获取权限级别
  getPermissionLevel: (permission: Permission): number => PERMISSION_LEVELS[permission],
  
  // 比较权限级别
  comparePermissions: (p1: Permission, p2: Permission): number => {
    const level1 = PERMISSION_LEVELS[p1]
    const level2 = PERMISSION_LEVELS[p2]
    return level1 - level2
  },
  
  // 检查是否可以设置某个权限
  canSetPermission: (maxPermission: Permission, targetPermission: Permission): boolean => {
    return PERMISSION_LEVELS[targetPermission] <= PERMISSION_LEVELS[maxPermission]
  },
  
  // 检查是否可以执行操作
  canPerformAction: (
    permission: Permission, 
    action: 'view' | 'edit_new' | 'edit_history',
    historyLocked?: boolean
  ): boolean => {
    switch (action) {
      case 'view':
        return true // 所有权限都可以查看
      case 'edit_new':
        return permission === 'assist' || permission === 'editor'
      case 'edit_history':
        return permission === 'editor' && !historyLocked
      default:
        return false
    }
  }
}

export default PermissionSettings