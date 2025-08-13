import { roomUtils } from './roomUtils'
import { RoomAPI } from './roomAPI'

export class DataSyncUtils {
  // 检查本地和云端数据同步状态
  static async checkSyncStatus(): Promise<{
    localCount: number,
    cloudCount: number,
    syncStatus: 'synced' | 'partial' | 'failed',
    unsyncedRooms: any[],
    details: string
  }> {
    try {
      console.log('🔍 检查数据同步状态...')
      
      // 获取本地房间数据
      const localRooms = roomUtils.getAllRoomsFromLocalStorage()
      console.log(`📱 本地房间数量: ${localRooms.length}`)
      
      // 获取云端房间数据
      let cloudRooms: any[] = []
      try {
        cloudRooms = await RoomAPI.getAllRooms() || []
        console.log(`☁️  云端房间数量: ${cloudRooms.length}`)
      } catch (error) {
        console.warn('❌ 无法获取云端数据:', error)
        return {
          localCount: localRooms.length,
          cloudCount: 0,
          syncStatus: 'failed',
          unsyncedRooms: localRooms,
          details: '无法连接到云端数据库'
        }
      }
      
      // 找出未同步的房间
      const cloudRoomIds = new Set(cloudRooms.map(room => room.id))
      const unsyncedRooms = localRooms.filter(room => !cloudRoomIds.has(room.id))
      
      console.log(`🔄 未同步房间数量: ${unsyncedRooms.length}`)
      if (unsyncedRooms.length > 0) {
        console.log('未同步房间列表:', unsyncedRooms.map(r => `${r.name} (${r.id})`))
      }
      
      // 确定同步状态
      let syncStatus: 'synced' | 'partial' | 'failed' = 'synced'
      let details = '数据已完全同步'
      
      if (unsyncedRooms.length > 0) {
        if (cloudRooms.length === 0) {
          syncStatus = 'failed'
          details = '云端数据库为空，所有房间都未同步'
        } else {
          syncStatus = 'partial'
          details = `${unsyncedRooms.length} 个房间未同步到云端`
        }
      }
      
      return {
        localCount: localRooms.length,
        cloudCount: cloudRooms.length,
        syncStatus,
        unsyncedRooms,
        details
      }
    } catch (error) {
      console.error('❌ 检查同步状态失败:', error)
      return {
        localCount: 0,
        cloudCount: 0,
        syncStatus: 'failed',
        unsyncedRooms: [],
        details: `检查失败: ${error.message}`
      }
    }
  }
  
  // 执行数据同步修复
  static async repairDataSync(): Promise<{
    success: boolean,
    syncedCount: number,
    failedCount: number,
    details: string[]
  }> {
    try {
      console.log('🔧 开始修复数据同步...')
      
      const syncStatus = await this.checkSyncStatus()
      const unsyncedRooms = syncStatus.unsyncedRooms
      
      if (unsyncedRooms.length === 0) {
        return {
          success: true,
          syncedCount: 0,
          failedCount: 0,
          details: ['数据已经同步，无需修复']
        }
      }
      
      let syncedCount = 0
      let failedCount = 0
      const details: string[] = []
      
      console.log(`📤 开始同步 ${unsyncedRooms.length} 个房间到云端...`)
      
      // 逐个同步未同步的房间
      for (const room of unsyncedRooms) {
        try {
          console.log(`🔄 同步房间: ${room.name} (${room.id})`)
          await RoomAPI.createRoom(room)
          syncedCount++
          details.push(`✅ ${room.name} 同步成功`)
          console.log(`✅ ${room.name} 同步成功`)
        } catch (error) {
          failedCount++
          const errorMsg = `❌ ${room.name} 同步失败: ${error.message}`
          details.push(errorMsg)
          console.error(errorMsg)
        }
        
        // 添加小延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      const success = failedCount === 0
      const summary = `同步完成: ${syncedCount} 成功, ${failedCount} 失败`
      details.unshift(summary)
      console.log(`🎯 ${summary}`)
      
      return {
        success,
        syncedCount,
        failedCount,
        details
      }
    } catch (error) {
      console.error('❌ 数据同步修复失败:', error)
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        details: [`修复失败: ${error.message}`]
      }
    }
  }
  
  // 显示同步状态报告
  static async showSyncReport(): Promise<void> {
    const status = await this.checkSyncStatus()
    
    // 创建状态报告弹窗
    const modal = document.createElement('div')
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    `
    
    const getStatusColor = () => {
      switch (status.syncStatus) {
        case 'synced': return '#10b981'
        case 'partial': return '#f59e0b'
        case 'failed': return '#ef4444'
        default: return '#6b7280'
      }
    }
    
    const getStatusIcon = () => {
      switch (status.syncStatus) {
        case 'synced': return '✅'
        case 'partial': return '⚠️'
        case 'failed': return '❌'
        default: return '❓'
      }
    }
    
    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 2rem;
        max-width: 500px;
        width: calc(100% - 2rem);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      ">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
          <div style="font-size: 2rem;">${getStatusIcon()}</div>
          <div>
            <h2 style="margin: 0; font-size: 1.25rem; color: #111827;">数据同步状态报告</h2>
            <p style="margin: 0.5rem 0 0 0; color: ${getStatusColor()}; font-weight: 500;">
              ${status.details}
            </p>
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
          <div style="padding: 1rem; background: #f3f4f6; border-radius: 8px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #111827;">${status.localCount}</div>
            <div style="font-size: 0.875rem; color: #6b7280;">前端房间</div>
          </div>
          <div style="padding: 1rem; background: #f3f4f6; border-radius: 8px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #111827;">${status.cloudCount}</div>
            <div style="font-size: 0.875rem; color: #6b7280;">云端房间</div>
          </div>
        </div>
        
        ${status.unsyncedRooms.length > 0 ? `
          <div style="margin-bottom: 1.5rem;">
            <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; color: #111827;">未同步房间:</h3>
            <div style="max-height: 150px; overflow-y: auto; background: #f9fafb; border-radius: 6px; padding: 0.75rem;">
              ${status.unsyncedRooms.map(room => `
                <div style="font-size: 0.875rem; color: #374151; margin-bottom: 0.25rem;">
                  • ${room.name} <span style="color: #9ca3af; font-family: monospace;">(${room.id})</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        
        <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
          <button onclick="this.parentElement.parentElement.parentElement.remove()" style="
            padding: 0.5rem 1rem;
            background: #6b7280;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.875rem;
          ">关闭</button>
          
          ${status.unsyncedRooms.length > 0 ? `
            <button onclick="window.repairDataSync()" style="
              padding: 0.5rem 1rem;
              background: #3b82f6;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 0.875rem;
            ">修复同步</button>
          ` : ''}
        </div>
      </div>
    `
    
    document.body.appendChild(modal)
    
    // 全局暴露修复函数
    ;(window as any).repairDataSync = async () => {
      modal.remove()
      
      // 显示修复进度
      const progressModal = document.createElement('div')
      progressModal.style.cssText = modal.style.cssText
      progressModal.innerHTML = `
        <div style="
          background: white;
          border-radius: 12px;
          padding: 2rem;
          max-width: 400px;
          width: calc(100% - 2rem);
          text-align: center;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        ">
          <div style="font-size: 2rem; margin-bottom: 1rem;">🔄</div>
          <h2 style="margin: 0 0 1rem 0; font-size: 1.25rem; color: #111827;">正在修复数据同步...</h2>
          <p style="margin: 0; color: #6b7280; font-size: 0.875rem;">请稍等，正在同步房间数据到云端</p>
        </div>
      `
      document.body.appendChild(progressModal)
      
      try {
        const result = await this.repairDataSync()
        progressModal.remove()
        
        // 显示修复结果
        const resultModal = document.createElement('div')
        resultModal.style.cssText = modal.style.cssText
        resultModal.innerHTML = `
          <div style="
            background: white;
            border-radius: 12px;
            padding: 2rem;
            max-width: 500px;
            width: calc(100% - 2rem);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          ">
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
              <div style="font-size: 2rem;">${result.success ? '✅' : '⚠️'}</div>
              <div>
                <h2 style="margin: 0; font-size: 1.25rem; color: #111827;">修复完成</h2>
                <p style="margin: 0.5rem 0 0 0; color: ${result.success ? '#10b981' : '#f59e0b'}; font-weight: 500;">
                  ${result.success ? '数据同步修复成功' : '部分数据同步失败'}
                </p>
              </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
              <div style="padding: 1rem; background: #d1fae5; border-radius: 8px; text-align: center;">
                <div style="font-size: 1.5rem; font-weight: bold; color: #065f46;">${result.syncedCount}</div>
                <div style="font-size: 0.875rem; color: #047857;">成功同步</div>
              </div>
              <div style="padding: 1rem; background: ${result.failedCount > 0 ? '#fee2e2' : '#f3f4f6'}; border-radius: 8px; text-align: center;">
                <div style="font-size: 1.5rem; font-weight: bold; color: ${result.failedCount > 0 ? '#dc2626' : '#6b7280'};">${result.failedCount}</div>
                <div style="font-size: 0.875rem; color: ${result.failedCount > 0 ? '#b91c1c' : '#6b7280'};">同步失败</div>
              </div>
            </div>
            
            <div style="max-height: 200px; overflow-y: auto; background: #f9fafb; border-radius: 6px; padding: 0.75rem; margin-bottom: 1.5rem;">
              ${result.details.map(detail => `
                <div style="font-size: 0.875rem; color: #374151; margin-bottom: 0.25rem;">
                  ${detail}
                </div>
              `).join('')}
            </div>
            
            <div style="text-align: right;">
              <button onclick="this.parentElement.parentElement.parentElement.remove(); window.location.reload()" style="
                padding: 0.5rem 1rem;
                background: #10b981;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.875rem;
              ">刷新页面</button>
            </div>
          </div>
        `
        document.body.appendChild(resultModal)
        
        // 触发房间数据更新
        window.dispatchEvent(new CustomEvent('roomsUpdated', { detail: {} }))
        
      } catch (error) {
        progressModal.remove()
        alert('修复失败: ' + error.message)
      }
    }
  }
  
  // 自动检查并提示同步问题
  static async autoCheckAndNotify(): Promise<void> {
    try {
      const status = await this.checkSyncStatus()
      
      if (status.syncStatus !== 'synced' && status.unsyncedRooms.length > 0) {
        console.log('🚨 检测到数据同步问题，显示通知')
        
        // 创建右上角通知
        const notification = document.createElement('div')
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: white;
          padding: 1rem 1.25rem;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          z-index: 9999;
          max-width: 350px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          cursor: pointer;
          transform: translateX(400px);
          transition: all 0.3s ease;
        `
        
        notification.innerHTML = `
          <div style="display: flex; align-items: flex-start; gap: 12px;">
            <div style="font-size: 20px; line-height: 1;">⚠️</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">数据同步异常</div>
              <div style="font-size: 12px; opacity: 0.9; line-height: 1.4;">
                ${status.unsyncedRooms.length} 个房间未同步到云端<br>
                点击查看详情并修复
              </div>
            </div>
          </div>
        `
        
        notification.addEventListener('click', () => {
          notification.remove()
          this.showSyncReport()
        })
        
        document.body.appendChild(notification)
        
        // 动画显示
        setTimeout(() => {
          notification.style.transform = 'translateX(0)'
        }, 100)
        
        // 10秒后自动隐藏
        setTimeout(() => {
          if (notification.parentElement) {
            notification.style.transform = 'translateX(400px)'
            setTimeout(() => {
              notification.remove()
            }, 300)
          }
        }, 10000)
      }
    } catch (error) {
      console.warn('❌ 自动检查同步状态失败:', error)
    }
  }
}

// 全局暴露工具函数
;(window as any).DataSyncUtils = DataSyncUtils
;(window as any).checkDataSync = () => DataSyncUtils.showSyncReport()