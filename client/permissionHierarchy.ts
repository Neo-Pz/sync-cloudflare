// 权限层级系统
export type Permission = 'viewer' | 'assist' | 'editor'

export interface PermissionHierarchy {
  viewer: 0
  assist: 1  
  editor: 2
}

// 权限级别映射
export const PERMISSION_LEVELS: PermissionHierarchy = {
  viewer: 0,
  assist: 1,
  editor: 2
}

// 权限显示名称
export const PERMISSION_NAMES = {
  viewer: '浏览',
  assist: '辅作', 
  editor: '编辑'
}

export class PermissionController {
  /**
   * 获取权限级别
   */
  static getPermissionLevel(permission: Permission): number {
    return PERMISSION_LEVELS[permission]
  }

  /**
   * 比较两个权限的级别
   * @param permission1 
   * @param permission2 
   * @returns 1: permission1 > permission2, 0: 相等, -1: permission1 < permission2
   */
  static comparePermissions(permission1: Permission, permission2: Permission): number {
    const level1 = this.getPermissionLevel(permission1)
    const level2 = this.getPermissionLevel(permission2)
    
    if (level1 > level2) return 1
    if (level1 < level2) return -1
    return 0
  }

  /**
   * 检查是否可以设置某个权限
   * @param currentMaxPermission 房主设定的最大权限
   * @param targetPermission 想要设置的权限
   * @returns 是否可以设置
   */
  static canSetPermission(currentMaxPermission: Permission, targetPermission: Permission): boolean {
    return this.getPermissionLevel(targetPermission) <= this.getPermissionLevel(currentMaxPermission)
  }

  /**
   * 获取可用的权限选项
   * @param maxPermission 房主设定的最大权限
   * @returns 可用的权限列表
   */
  static getAvailablePermissions(maxPermission: Permission): Permission[] {
    const maxLevel = this.getPermissionLevel(maxPermission)
    const permissions: Permission[] = []
    
    if (maxLevel >= PERMISSION_LEVELS.viewer) permissions.push('viewer')
    if (maxLevel >= PERMISSION_LEVELS.assist) permissions.push('assist')
    if (maxLevel >= PERMISSION_LEVELS.editor) permissions.push('editor')
    
    return permissions
  }

  /**
   * 获取权限描述
   */
  static getPermissionDescription(permission: Permission): string {
    const descriptions = {
      viewer: '浏览 - 只能查看，无法编辑',
      assist: '辅作 - 可以编辑新内容，不能修改历史',
      editor: '编辑 - 可以修改所有内容'
    }
    return descriptions[permission]
  }

  /**
   * 检查历史锁定后的权限限制
   */
  static getPermissionsAfterHistoryLock(): Permission[] {
    // 锁定历史后，只能选择辅作或浏览
    return ['viewer', 'assist']
  }

  /**
   * 检查权限是否可以编辑历史内容
   */
  static canEditHistory(permission: Permission, isHistoryLocked: boolean): boolean {
    if (!isHistoryLocked) return true
    
    // 历史锁定后，只有编辑权限可以编辑历史（但编辑权限在锁定后不可选）
    // 实际上历史锁定后，没有权限可以编辑历史内容
    return false
  }

  /**
   * 检查权限是否可以编辑新内容
   */
  static canEditNew(permission: Permission): boolean {
    return permission === 'editor' || permission === 'assist'
  }
}