// 关注系统API
export interface FollowRelationship {
  followerId: string
  followerName: string
  followingId: string
  followingName: string
  followedAt: number
}

export interface UserFollowStats {
  followingCount: number
  followersCount: number
  isFollowing: boolean
}

class FollowSystem {
  private readonly STORAGE_KEY = 'user-follows'
  private readonly API_BASE = '/api/follows'

  // 获取本地存储的关注数据
  private getFollowData(): FollowRelationship[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY)
      return data ? JSON.parse(data) : []
    } catch (error) {
      console.error('Error reading follow data:', error)
      return []
    }
  }

  // 保存关注数据到本地存储
  private saveFollowData(data: FollowRelationship[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Error saving follow data:', error)
    }
  }

  // 关注用户
  async followUser(followerId: string, followerName: string, followingId: string, followingName: string): Promise<boolean> {
    try {
      // 检查是否已经关注
      const existingFollows = this.getFollowData()
      const alreadyFollowing = existingFollows.some(
        follow => follow.followerId === followerId && follow.followingId === followingId
      )

      if (alreadyFollowing) {
        console.log('Already following this user')
        return true
      }

      // 添加到本地存储
      const newFollow: FollowRelationship = {
        followerId,
        followerName,
        followingId,
        followingName,
        followedAt: Date.now()
      }

      const updatedFollows = [...existingFollows, newFollow]
      this.saveFollowData(updatedFollows)

      // 尝试同步到云端
      try {
        await fetch(`${this.API_BASE}/follow`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(newFollow)
        })
      } catch (error) {
        console.warn('Failed to sync follow to cloud:', error)
      }

      console.log(`✅ User ${followerId} now following ${followingId}`)
      return true
    } catch (error) {
      console.error('Error following user:', error)
      return false
    }
  }

  // 取消关注用户
  async unfollowUser(followerId: string, followingId: string): Promise<boolean> {
    try {
      const existingFollows = this.getFollowData()
      const updatedFollows = existingFollows.filter(
        follow => !(follow.followerId === followerId && follow.followingId === followingId)
      )

      this.saveFollowData(updatedFollows)

      // 尝试同步到云端
      try {
        await fetch(`${this.API_BASE}/unfollow`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ followerId, followingId })
        })
      } catch (error) {
        console.warn('Failed to sync unfollow to cloud:', error)
      }

      console.log(`✅ User ${followerId} unfollowed ${followingId}`)
      return true
    } catch (error) {
      console.error('Error unfollowing user:', error)
      return false
    }
  }

  // 获取用户关注的人列表
  async getFollowingList(userId: string): Promise<FollowRelationship[]> {
    try {
      const follows = this.getFollowData()
      return follows.filter(follow => follow.followerId === userId)
    } catch (error) {
      console.error('Error getting following list:', error)
      return []
    }
  }

  // 获取用户的粉丝列表
  async getFollowersList(userId: string): Promise<FollowRelationship[]> {
    try {
      const follows = this.getFollowData()
      return follows.filter(follow => follow.followingId === userId)
    } catch (error) {
      console.error('Error getting followers list:', error)
      return []
    }
  }

  // 检查是否关注了某个用户
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    try {
      const follows = this.getFollowData()
      return follows.some(
        follow => follow.followerId === followerId && follow.followingId === followingId
      )
    } catch (error) {
      console.error('Error checking follow status:', error)
      return false
    }
  }

  // 获取用户的关注统计
  async getUserFollowStats(userId: string, currentUserId?: string): Promise<UserFollowStats> {
    try {
      const following = await this.getFollowingList(userId)
      const followers = await this.getFollowersList(userId)
      
      let isFollowing = false
      if (currentUserId && currentUserId !== userId) {
        isFollowing = await this.isFollowing(currentUserId, userId)
      }

      return {
        followingCount: following.length,
        followersCount: followers.length,
        isFollowing
      }
    } catch (error) {
      console.error('Error getting user follow stats:', error)
      return {
        followingCount: 0,
        followersCount: 0,
        isFollowing: false
      }
    }
  }

  // 获取关注用户的房间（用于"关注"标签页）
  async getFollowingUsersRooms(userId: string): Promise<any[]> {
    try {
      const following = await this.getFollowingList(userId)
      const followingIds = following.map(f => f.followingId)
      
      // 这里需要结合房间系统获取关注用户的房间
      // 暂时返回空数组，后续可以扩展
      return []
    } catch (error) {
      console.error('Error getting following users rooms:', error)
      return []
    }
  }
}

export const followSystem = new FollowSystem() 