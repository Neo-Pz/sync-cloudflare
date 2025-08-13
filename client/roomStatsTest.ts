// Room-User Statistics Test - 测试房间用户统计功能
import { roomUserStatsManager } from './roomUserStatsManager'

export function testRoomUserStats() {
  console.log('🧪 开始测试房间-用户统计系统...')
  
  // 测试数据
  const testUserId1 = 'user123'
  const testUserId2 = 'user456'
  const testUserName1 = 'Alice'
  const testUserName2 = 'Bob'
  const testRoomId1 = 'room-abc'
  const testRoomId2 = 'room-def'
  
  try {
    // 测试1: 记录用户访问
    console.log('📝 测试1: 记录访问操作')
    roomUserStatsManager.recordVisit(testRoomId1, testUserId1, testUserName1)
    roomUserStatsManager.recordVisit(testRoomId1, testUserId2, testUserName2)
    roomUserStatsManager.recordVisit(testRoomId2, testUserId1, testUserName1)
    
    // 测试2: 记录收藏操作
    console.log('📝 测试2: 记录收藏操作')
    roomUserStatsManager.recordStar(testRoomId1, testUserId1, testUserName1, true)
    roomUserStatsManager.recordStar(testRoomId1, testUserId2, testUserName2, true)
    
    // 测试3: 记录分享操作
    console.log('📝 测试3: 记录分享操作')
    roomUserStatsManager.recordShare(testRoomId1, testUserId1, testUserName1, 'link')
    roomUserStatsManager.recordShare(testRoomId2, testUserId1, testUserName1, 'export')
    
    // 测试4: 记录评论操作
    console.log('📝 测试4: 记录评论操作')
    roomUserStatsManager.recordComment(testRoomId1, testUserId1, testUserName1, '很棒的房间!')
    roomUserStatsManager.recordComment(testRoomId1, testUserId2, testUserName2, '非常有用')
    
    // 测试5: 查询房间统计
    console.log('📊 测试5: 查询房间统计')
    const room1Stats = roomUserStatsManager.getRoomStatsSummary(testRoomId1)
    console.log('房间1统计:', room1Stats)
    
    const room2Stats = roomUserStatsManager.getRoomStatsSummary(testRoomId2)
    console.log('房间2统计:', room2Stats)
    
    // 测试6: 查询用户统计
    console.log('👤 测试6: 查询用户统计')
    const user1Stats = roomUserStatsManager.getUserStatsSummary(testUserId1)
    console.log('用户1统计:', user1Stats)
    
    const user2Stats = roomUserStatsManager.getUserStatsSummary(testUserId2)
    console.log('用户2统计:', user2Stats)
    
    // 测试7: 验证收藏状态
    console.log('⭐ 测试7: 验证收藏状态')
    const user1StarredRoom1 = roomUserStatsManager.hasUserStarredRoom(testUserId1, testRoomId1)
    const user2StarredRoom1 = roomUserStatsManager.hasUserStarredRoom(testUserId2, testRoomId1)
    const user1StarredRoom2 = roomUserStatsManager.hasUserStarredRoom(testUserId1, testRoomId2)
    
    console.log(`用户1收藏房间1: ${user1StarredRoom1}`)
    console.log(`用户2收藏房间1: ${user2StarredRoom1}`)
    console.log(`用户1收藏房间2: ${user1StarredRoom2}`)
    
    // 测试8: 取消收藏
    console.log('📝 测试8: 取消收藏操作')
    roomUserStatsManager.recordStar(testRoomId1, testUserId2, testUserName2, false)
    
    const room1StatsAfterUnstar = roomUserStatsManager.getRoomStatsSummary(testRoomId1)
    console.log('取消收藏后房间1统计:', room1StatsAfterUnstar)
    
    // 验证结果
    console.log('✅ 测试结果验证:')
    console.log(`房间1总收藏数: ${room1Stats.totalStars} -> ${room1StatsAfterUnstar.totalStars} (预期: 2 -> 1)`)
    console.log(`房间1总访问数: ${room1Stats.totalVisits} (预期: 2)`)
    console.log(`房间1总分享数: ${room1Stats.totalShares} (预期: 1)`)
    console.log(`房间1总评论数: ${room1Stats.totalComments} (预期: 2)`)
    
    console.log(`用户1总收藏数: ${user1Stats.totalStars} (预期: 1)`)
    console.log(`用户1总访问数: ${user1Stats.totalVisits} (预期: 2)`)
    console.log(`用户1总分享数: ${user1Stats.totalShares} (预期: 2)`)
    console.log(`用户1总评论数: ${user1Stats.totalComments} (预期: 1)`)
    
    console.log('🎉 房间-用户统计系统测试完成!')
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error)
  }
}

// 自动运行测试（仅在开发环境）
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  // 延迟执行，确保所有模块都已加载
  setTimeout(() => {
    testRoomUserStats()
  }, 1000)
}