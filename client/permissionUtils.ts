export interface PermissionInfo {
  mode: 'viewer' | 'editor' | 'assist'
  historyLocked?: boolean
  historyLockTimestamp?: number
}

export interface FormattedPermissionInfo {
  text: string
  icon: string
  colors: {
    color: string
    backgroundColor: string
  }
}

export function formatPermissionInfo(permissionInfo: PermissionInfo): FormattedPermissionInfo {
  const { mode, historyLocked } = permissionInfo
  
  // 基础权限配置
  const baseConfig = {
    viewer: {
      text: '查看者',
      icon: '👁️',
      colors: {
        color: '#6b7280',
        backgroundColor: '#f3f4f6'
      }
    },
    editor: {
      text: '编辑者',
      icon: '✏️',
      colors: {
        color: '#059669',
        backgroundColor: '#d1fae5'
      }
    },
    assist: {
      text: '协助者',
      icon: '🤝',
      colors: {
        color: '#7c3aed',
        backgroundColor: '#ede9fe'
      }
    }
  }
  
  const config = baseConfig[mode]
  
  // 如果历史被锁定，修改显示
  if (historyLocked) {
    return {
      text: `${config.text} (历史锁定)`,
      icon: '🔒',
      colors: {
        color: '#dc2626',
        backgroundColor: '#fef2f2'
      }
    }
  }
  
  return config
} 