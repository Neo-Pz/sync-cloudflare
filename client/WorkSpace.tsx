import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, memo, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { nanoid } from 'nanoid'
import { useUser } from '@clerk/clerk-react'
import {
	useEditor,
	useValue,
	PageRecordType,
	TLPageId,
	stopEventPropagation,
	tlenv,
	getIndexAbove,
	getIndexBelow,
	getIndexBetween,
	IndexKey,
	Editor,
} from '@tldraw/editor'
import {
	TldrawUiPopover,
	TldrawUiPopoverTrigger,
	TldrawUiPopoverContent,
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiButtonCheck,
	TldrawUiButtonLabel,
	TldrawUiDropdownMenuRoot,
	TldrawUiDropdownMenuTrigger,
	TldrawUiDropdownMenuContent,
	TldrawUiMenuContextProvider,
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	useMenuIsOpen,
	useReadonly,
	useTranslation,
	useUiEvents,
} from 'tldraw'
import './WorkSpace.css'
import { roomUtils } from './roomUtils'
import { Room } from './RoomManager'
import { RoomInfo } from './RoomInfo'
import { RoomSettings } from './RoomSettings'
import { formatPermissionInfo, type PermissionInfo } from './permissionUtils'
import { userActivityAPI, UserRoomStats } from './userActivityAPI'
import { generateShareUrlWithViewport, getCurrentViewportState, parseAndApplyViewportFromUrl } from './viewportUtils'
import { SimplePermissionManager } from './SimplePermissionManager'
import { workspaceManager, RoomHistoryInfo as WorkspaceRoomInfo } from './WorkspaceDataManager'

const ITEM_HEIGHT = 36

// 使用统一的WorkspaceRoomInfo类型
type RoomHistoryInfo = WorkspaceRoomInfo

// 移植原生的 onMovePage 函数
const onMovePage = (
	editor: Editor,
	id: TLPageId,
	from: number,
	to: number,
	trackEvent: any
) => {
	let index: IndexKey

	const pages = editor.getPages()

	const below = from > to ? pages[to - 1] : pages[to]
	const above = from > to ? pages[to] : pages[to + 1]

	if (below && !above) {
		index = getIndexAbove(below.index)
	} else if (!below && above) {
		index = getIndexBelow(pages[0].index)
	} else {
		index = getIndexBetween(below.index, above.index)
	}

	if (index !== pages[from].index) {
		editor.markHistoryStoppingPoint('moving page')
		editor.updatePage({
			id: id as TLPageId,
			index,
		})
		trackEvent('move-page', { source: 'page-menu' })
	}
}

interface WorkSpaceProps {
    currentPermission?: 'viewer' | 'editor' | 'assist'
    roomPermissionData?: {
        publish: boolean
        permission: 'viewer' | 'editor' | 'assist'
        historyLocked?: boolean
        historyLockTimestamp?: number
        owner?: string
        ownerId?: string
    } | null
}

export const WorkSpace = memo(function WorkSpace({ currentPermission, roomPermissionData }: WorkSpaceProps) {
	const editor = useEditor()
	const trackEvent = useUiEvents()
	const msg = useTranslation()
	const { user, isLoaded } = useUser()

	// 本地弹窗状态：从工作空间直接打开“房间设置/信息”
	const [roomSettingsTargetId, setRoomSettingsTargetId] = useState<string | null>(null)
	const [roomInfoTarget, setRoomInfoTarget] = useState<any | null>(null)

	// Get current room from URL path
	const getCurrentRoom = useCallback(() => {
		const path = window.location.pathname
		// Match /r/, /ro/, and /p/ paths
		const roomMatch = path.match(/^\/(?:r(?:o)?|p)\/([^/]+)\/?/)
		const roomName = roomMatch ? decodeURIComponent(roomMatch[1]) : 'shared-room'
		console.log('🔍 WorkSpace.tsx getCurrentRoom:', { path, roomName })
		return roomName
	}, [])
	
	// Get current room ID by looking up the room name in the gallery
	const getCurrentRoomId = useCallback(() => {
		const roomNameFromUrl = getCurrentRoom()
		// For now, return the room name from URL as fallback
		// The actual room lookup will be done in useEffect with async
		return roomNameFromUrl
	}, [getCurrentRoom])

	const currentRoom = getCurrentRoom()
	const currentRoomId = getCurrentRoomId()
	
	console.log('Current room:', currentRoom)
	console.log('Current room ID:', currentRoomId)
	console.log('Current URL:', window.location.pathname)
	
	// 优化的房间同步逻辑 - 避免重复创建，改为仅更新现有房间信息
	const syncToRoomManager = useCallback(async (roomInfo: RoomHistoryInfo) => {
		// 只有在用户加载完成后才处理房间同步
		if (!isLoaded || !user) {
			return
		}
		
		try {
			// 异步检查房间是否存在
			const existingRoom = await roomUtils.getRoom(roomInfo.name)
			
			if (existingRoom) {
				console.log('Room already exists, updating last modified:', roomInfo.name)
				// 仅更新最后修改时间，不创建重复房间
				await roomUtils.updateRoomLastModified(roomInfo.name)
				return
			}
			
			// 如果房间不存在，这可能是一个新房间或者临时房间
			// 检查是否是用户当前正在访问的房间，只有当前房间才创建
			if (roomInfo.name === currentRoomId) {
				// 获取用户信息
				const userId = user.id
				// 优先使用邮箱前缀作为用户名
				const userName = user.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 
								   user.fullName || 
								   `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
								   user.username ||
								   'User'
				
				// 创建新房间
				const newRoom: Room = {
					id: roomInfo.name,
					name: roomInfo.displayName || roomInfo.name, // 确保使用用户输入的名称
					createdAt: roomInfo.lastVisited || Date.now(),
					lastModified: roomInfo.lastVisited || Date.now(),
					owner: userId,
					ownerId: userId,
					ownerName: userName,
					isShared: false,
					shared: false, // 添加缺失的 shared 字段
					published: false,
					permission: 'editor',
					publishStatus: 'private',
					description: '',
					tags: [],
					publish: false // 默认未发布
				}
				
				console.log('🏗️ 创建新房间:', {
					id: newRoom.id,
					name: newRoom.name,
					displayName: roomInfo.displayName,
					userId,
					userName
				})
				
				// 添加房间
				await roomUtils.addRoom(newRoom)
				console.log('Created new room in gallery:', newRoom.name)
			} else {
				console.log('Room not found but not current room, skipping sync:', roomInfo.name)
			}
		} catch (error) {
			console.error('Error syncing room to gallery:', error)
		}
	}, [user, isLoaded, currentRoomId])
	
	const handleOpenChange = useCallback((open: boolean) => {
		if (!open) {
			setIsEditing(false)
		}
	}, [])
	const [isOpen, onOpenChange] = useMenuIsOpen('page-menu', handleOpenChange)
	
	const rSortableContainer = useRef<HTMLDivElement>(null)
	const workspaceRef = useRef<HTMLDivElement>(null)

	const pages = useValue('pages', () => editor.getPages(), [editor])
	const currentPage = useValue('currentPage', () => editor.getCurrentPage(), [editor])
	const currentPageId = useValue('currentPageId', () => editor.getCurrentPageId(), [editor])

	// 计算当前页面的索引（从1开始）
	const currentPageIndex = useMemo(() => {
		if (!currentPage || !pages) return 1
		const index = pages.findIndex(page => page.id === currentPage.id)
		return index >= 0 ? index + 1 : 1
	}, [currentPage, pages])

	const isReadonlyMode = useReadonly()
	const maxPageCountReached = useValue(
		'maxPageCountReached',
		() => editor.getPages().length >= editor.options.maxPages,
		[editor]
	)

	const [isEditing, setIsEditing] = useState(false)
    const [workspaceRooms, setWorkspaceRooms] = useState<RoomHistoryInfo[]>([])
    // 兼容遗留代码：提供 setRoomHistory 包装器，实质更新 workspaceRooms
    const setRoomHistory = useCallback((updater: (prev: RoomHistoryInfo[]) => RoomHistoryInfo[]) => {
        setWorkspaceRooms((prev) => updater(prev))
    }, [])
	const [roomInfoModal, setRoomInfoModal] = useState<Room | null>(null)
	// 初始化时使用当前房间ID，避免空值造成的显示切换
	const [currentRoomName, setCurrentRoomName] = useState<string>(currentRoom)
	
	// 生成显示用的房间名称/页面索引格式
	const roomPageDisplay = useMemo(() => {
		// 优先显示用户设定的房间名称，如果没有则显示房间ID，避免在加载过程中切换
		const displayName = currentRoomName || currentRoom
		return `${displayName}/p${currentPageIndex}`
	}, [currentRoomName, currentRoom, currentPageIndex])
	
	// 统一数据源：从workspaceRooms获取房间显示名称的函数
	const getRoomDisplayName = useCallback((roomId: string): string => {
		// 在工作空间数据中查找房间信息
		const roomInfo = workspaceRooms.find(room => room.name === roomId)
		if (roomInfo?.displayName && roomInfo.displayName !== roomId) {
			return roomInfo.displayName // 返回用户设置的显示名称
		}
		return roomId // 回退到房间ID，保持一致性
	}, [workspaceRooms])

	// 加载工作空间数据的函数
	const loadWorkspaceData = useCallback(async () => {
		try {
			const rooms = await workspaceManager.getWorkspaceRooms(user?.id)
			setWorkspaceRooms(rooms)
			console.log('Loaded unified workspace data:', rooms.length, 'rooms')
		} catch (error) {
			console.error('Error loading workspace data:', error)
		}
	}, [user?.id])
	
	// 数据丰富(Data Enrichment)：异步检查并修复房间的displayName
	const enrichRoomData = useCallback(async (rooms: RoomHistoryInfo[]): Promise<RoomHistoryInfo[]> => {
		try {
			const galleryRooms = await roomUtils.getAllRooms()
			const galleryRoomMap = new Map(galleryRooms.map(room => [room.id, room]))
			
			return rooms.map(historyRoom => {
				const galleryRoom = galleryRoomMap.get(historyRoom.name)
				if (galleryRoom && galleryRoom.name !== historyRoom.displayName) {
					console.log(`Enriching room data: ${historyRoom.name} displayName: ${historyRoom.displayName} -> ${galleryRoom.name}`)
					return {
						...historyRoom,
						displayName: galleryRoom.name
					}
				}
				return historyRoom
			})
		} catch (error) {
			console.warn('Failed to enrich room data:', error)
			return rooms
		}
	}, [])
	
	// 实时、响应式的UI更新：监听workspaceRooms和currentRoomId变化
	useEffect(() => {
		const displayName = getRoomDisplayName(currentRoomId)
		// 只有当显示名称确实不同且不为空时才更新，避免频繁切换
		if (displayName && displayName !== currentRoomName) {
			setCurrentRoomName(displayName)
			console.log(`Current room name updated: ${currentRoomId} -> ${displayName}`)
		}
	}, [currentRoomId, getRoomDisplayName, currentRoomName])
	
	// 清理工作空间中已删除的房间 - 使用统一数据管理器
	const cleanupDeletedRooms = useCallback(async () => {
		try {
			const galleryRooms = await roomUtils.getAllRooms()
			const galleryRoomIds = new Set(galleryRooms.map(room => room.id))
			
			setWorkspaceRooms(prev => {
				const filteredRooms = prev.filter(room => {
					const exists = galleryRoomIds.has(room.name)
					if (!exists) {
						console.log(`Room ${room.displayName} (${room.name}) no longer exists in gallery, removing from workspace`)
						// 从数据管理器中移除
						workspaceManager.removeRoom(room.name)
					}
					return exists
				})
				
				return filteredRooms
			})
		} catch (error) {
			console.error('Error cleaning up deleted rooms:', error)
		}
	}, [])

	// 从数据库加载用户最近访问的房间
	const loadUserRecentRooms = useCallback(async () => {
		if (!user?.id) return

		try {
			console.log('Loading user recent rooms from database...')
			const recentRooms = await userActivityAPI.getUserRecentRooms(user.id, 20)
			console.log('Loaded recent rooms from database:', recentRooms)
			setUserRecentRooms(recentRooms)
		} catch (error) {
			console.error('Error loading user recent rooms:', error)
			// 如果数据库查询失败，仍使用localStorage作为后备
		}
	}, [user?.id])

	// 删除不再需要的loadAndEnrichRoomHistory函数，已由workspaceManager统一管理
	
	// 辅助函数：去除重复的房间历史记录
	const deduplicateRoomHistory = useCallback((history: RoomHistoryInfo[]): RoomHistoryInfo[] => {
		// 按房间ID去重，保留最近访问的房间
		const uniqueMap = new Map<string, RoomHistoryInfo>()
		const roomIdCounts = new Map<string, number>()
		
		// 统计每个ID出现的次数
		history.forEach(room => {
			roomIdCounts.set(room.name, (roomIdCounts.get(room.name) || 0) + 1)
		})
		
		// 记录重复情况
		roomIdCounts.forEach((count, id) => {
			if (count > 1) {
				console.log(`发现重复房间历史: ${id}, 出现 ${count} 次`)
			}
		})
		
		// 按lastVisited倒序排序，确保保留最近访问的房间
		const sortedHistory = [...history].sort((a, b) => b.lastVisited - a.lastVisited)
		
		// 遍历并去重
		sortedHistory.forEach(room => {
			if (!uniqueMap.has(room.name)) {
				uniqueMap.set(room.name, room)
			}
		})
		
		return Array.from(uniqueMap.values())
	}, [])
	
	// 确保当前房间始终显示在工作空间中 - 使用统一数据管理器
	useEffect(() => {
		if (currentRoomId) {
			const ensureCurrentRoom = async () => {
				const existing = workspaceRooms.find(room => room.name === currentRoomId)
				if (!existing) {
					// 添加当前房间到工作空间
					try {
						const galleryRoom = await roomUtils.getRoom(currentRoomId)
						const displayName = galleryRoom?.name || currentRoom
						
						const newRoom = {
							name: currentRoomId,
							displayName: displayName,
							lastVisited: Date.now(),
							isExpanded: true,
							pages: pages.map(page => ({ name: page.name, id: page.id })),
							lastPageName: currentPage?.name
						}
						
						await workspaceManager.addRoom(newRoom)
						loadWorkspaceData() // 重新加载数据
					} catch (error) {
						console.error('Error adding current room to workspace:', error)
					}
				}
			}
			
			ensureCurrentRoom()
		}
	}, [currentRoomId, currentRoom, pages, currentPage, workspaceRooms, loadWorkspaceData])

	// 加载统一的工作空间数据
	useEffect(() => {
		// 只有在用户加载完成后才处理房间历史记录
		if (!isLoaded) {
			return
		}
		
		// 检查用户登录状态变化
		if (!user) {
			// 用户已退出登录，清除工作空间记录
			console.log('用户已退出登录，清除工作空间记录')
			setWorkspaceRooms([])
			return
		}
		
		// 使用统一数据管理器加载数据
		loadWorkspaceData()
	}, [isLoaded, user, loadWorkspaceData])
	
	// 使用统一数据管理器更新房间信息
	const updateRoomHistory = useCallback((forceUpdate = false) => {
		if (!currentRoomId || (!forceUpdate && pages.length === 0)) return

		const updateRoomData = async () => {
			try {
				const currentRoomPages = pages.map(page => ({ name: page.name, id: page.id }))
				const currentPageName = currentPage?.name

				// 获取房间显示名称
				const galleryRoom = roomUtils.getAllRoomsFromLocalStorage().find(room => room.id === currentRoomId)
				const displayName = galleryRoom?.name || currentRoom

				const updatedInfo = {
					displayName: displayName,
					lastVisited: Date.now(),
					pages: currentRoomPages,
					lastPageName: currentPageName
				}

				await workspaceManager.updateRoom(currentRoomId, updatedInfo)
				// 重新加载数据以反映更新
				loadWorkspaceData()
			} catch (error) {
				console.error('Error updating room history:', error)
			}
		}

		updateRoomData()
	}, [currentRoomId, currentRoom, pages, currentPage, loadWorkspaceData])

	// 简化的房间历史更新 - 只在关键变化时触发
	useEffect(() => {
		if (currentRoomId && pages.length > 0) {
			const timeoutId = setTimeout(() => {
				updateRoomHistory()
			}, 300) // 防抖，避免频繁更新
			
			return () => clearTimeout(timeoutId)
		}
	}, [currentRoomId, pages.length, currentPage?.id, updateRoomHistory])

	// 初始化当前房间 - 只在房间切换时触发一次
	useEffect(() => {
		if (currentRoomId) {
			const timeoutId = setTimeout(() => {
				updateRoomHistory(true) // 强制更新
			}, 200)
			
			return () => clearTimeout(timeoutId)
		}
	}, [currentRoomId, updateRoomHistory]) // 只依赖 currentRoomId，避免重复触发

	const [sortablePositionItems, setSortablePositionItems] = useState(
		Object.fromEntries(
			pages.map((page, i) => [page.id, { y: i * ITEM_HEIGHT, offsetY: 0, isSelected: false }])
		)
	)

	useLayoutEffect(() => {
		setSortablePositionItems(
			Object.fromEntries(
				pages.map((page, i) => [page.id, { y: i * ITEM_HEIGHT, offsetY: 0, isSelected: false }])
			)
		)
	}, [pages])

	const toggleEditing = useCallback(() => {
		if (isReadonlyMode) return
		setIsEditing((s) => !s)
	}, [isReadonlyMode])

	const handleCreatePageClick = useCallback(() => {
		if (isReadonlyMode) return

		editor.run(() => {
			editor.markHistoryStoppingPoint('creating page')
			const newPageId = PageRecordType.createId()
			editor.createPage({ name: msg('page-menu.new-page-initial-name'), id: newPageId })
			editor.setCurrentPage(newPageId)

			setIsEditing(true)

			editor.timers.requestAnimationFrame(() => {
				const elm = document.querySelector(`[data-pageid="${newPageId}"]`) as HTMLDivElement
				if (elm) {
					elm.querySelector('button')?.focus()
				}
			})
		})
		trackEvent('new-page', { source: 'page-menu' })
		
		// 强制更新房间历史 - 使用统一数据管理器
		setTimeout(async () => {
			try {
				const updatedPages = editor.getPages()
				const currentPageName = editor.getCurrentPage().name
				
				const currentRoomPages = updatedPages.map(page => ({ name: page.name, id: page.id }))
				
				const existing = workspaceRooms.find(room => room.name === currentRoom)
				const displayName = existing?.displayName || currentRoom
				
				const updatedInfo = {
					displayName,
					lastVisited: Date.now(),
					pages: currentRoomPages,
					lastPageName: currentPageName
				}

				await workspaceManager.updateRoom(currentRoom, updatedInfo)
				loadWorkspaceData() // 重新加载数据
			} catch (error) {
				console.error('Error updating room after page creation:', error)
			}
		}, 100)
	}, [editor, msg, isReadonlyMode, trackEvent, currentRoom, workspaceRooms, loadWorkspaceData])

	const changePage = useCallback(
		(id: TLPageId) => {
			editor.setCurrentPage(id)
			trackEvent('change-page', { source: 'page-menu' })
		},
		[editor, trackEvent]
	)

	const renamePage = useCallback(
		(id: TLPageId, name: string) => {
			editor.renamePage(id, name)
			trackEvent('rename-page', { source: 'page-menu' })
			
			// 强制更新房间历史 - 使用统一数据管理器
			setTimeout(async () => {
				try {
					const updatedPages = editor.getPages()
					const currentPageName = editor.getCurrentPage().name
					
					const currentRoomPages = updatedPages.map(page => ({ name: page.name, id: page.id }))
					
					const updatedInfo = {
						pages: currentRoomPages,
						lastPageName: currentPageName,
						lastVisited: Date.now()
					}

					await workspaceManager.updateRoom(currentRoom, updatedInfo)
					loadWorkspaceData() // 重新加载数据
				} catch (error) {
					console.error('Error updating room after page rename:', error)
				}
			}, 100)
		},
		[editor, trackEvent, currentRoom, loadWorkspaceData]
	)

	// 跳转到房间（使用上次的页面或第一页）
	const handleSwitchRoom = useCallback(async (roomName: string) => {
		if (roomName !== currentRoom) {
			// 在跳转前，确保目标房间在工作空间中展开并更新访问时间
			setWorkspaceRooms(prev => {
				const updated = prev.map(room => 
					room.name === roomName 
						? { ...room, isExpanded: true, lastVisited: Date.now() }
						: room
				)
				// 同步更新到数据管理器
				updated.forEach(room => {
					if (room.name === roomName) {
						workspaceManager.updateRoom(roomName, { lastVisited: room.lastVisited, isExpanded: room.isExpanded })
					}
				})
				return updated
			})
			
			// 检查房间是否已发布，如果是则跳转到 /p/ 路径
			try {
    const publishRooms = await roomUtils.getPlazaRooms()
				const isPlazaRoom = publishRooms.some(room => room.id === roomName)
				
				if (isPlazaRoom) {
					console.log(`房间 ${roomName} 已发布，跳转到 /p/ 路径`)
					window.history.pushState({}, '', `/p/${encodeURIComponent(roomName)}`)
				} else {
					console.log(`房间 ${roomName} 是普通房间，跳转到 /r/ 路径`)
					window.history.pushState({}, '', `/r/${encodeURIComponent(roomName)}`)
				}
				window.location.reload()
			} catch (error) {
				console.error('检查房间发布状态失败，使用默认 /r/ 路径:', error)
				window.history.pushState({}, '', `/r/${encodeURIComponent(roomName)}`)
				window.location.reload()
			}
		}
	}, [currentRoom])

	// 精确跳转到房间的特定页面
	const handleSwitchToRoomPage = useCallback(async (roomName: string, pageName: string) => {
		// 在跳转前，确保目标房间在工作空间中展开
		setRoomHistory(prev => {
			const newHistory = prev.map(room => 
				room.name === roomName 
					? { ...room, isExpanded: true, lastVisited: Date.now() }
					: room
			)
			localStorage.setItem('roomHistory', JSON.stringify(newHistory))
			return newHistory
		})
		
		// 查找目标房间的页面ID
		let pageId = ''
		const room = workspaceRooms.find(r => r.name === roomName)
		if (room && room.pages) {
			const page = room.pages.find(p => p.name === pageName)
			if (page) pageId = page.id
		}
		if (!pageId) pageId = pageName
		// 用 base64 编码 pageId，URL安全
		let encodedPageId = ''
		try {
			encodedPageId = btoa(pageId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
		} catch {
			encodedPageId = encodeURIComponent(pageId)
		}
		
		// 检查房间是否已发布，决定使用 /p/ 还是 /r/ 路径
		try {
    const publishRooms = await roomUtils.getPlazaRooms()
			const isPlazaRoom = publishRooms.some(room => room.id === roomName)
			
			const encodedRoom = encodeURIComponent(roomName)
			let url
			if (isPlazaRoom) {
				console.log(`房间 ${roomName} 已发布，跳转到 /p/ 路径页面`)
				url = `/p/${encodedRoom}?d=v0.0.0.0.${encodedPageId}`
			} else {
				console.log(`房间 ${roomName} 是普通房间，跳转到 /r/ 路径页面`)
				url = `/r/${encodedRoom}?d=v0.0.0.0.${encodedPageId}`
			}
			
			window.history.pushState({}, '', url)
			window.location.reload()
		} catch (error) {
			console.error('检查房间发布状态失败，使用默认 /r/ 路径:', error)
			const encodedRoom = encodeURIComponent(roomName)
			const url = `/r/${encodedRoom}?d=v0.0.0.0.${encodedPageId}`
			window.history.pushState({}, '', url)
			window.location.reload()
		}
	}, [workspaceRooms])

	// 跳转到房间并恢复最后页面
	const handleSwitchToRoomWithLastPage = useCallback((roomName: string) => {
		if (roomName === currentRoom) return

		const room = workspaceRooms.find(r => r.name === roomName)
		
		if (room && room.lastPageName) {
			handleSwitchToRoomPage(roomName, room.lastPageName)
		} else {
			handleSwitchRoom(roomName)
		}
	}, [currentRoom, workspaceRooms, handleSwitchRoom, handleSwitchToRoomPage])

	const handleCreateNewRoom = useCallback(async () => {
		// 检查用户是否已加载
		if (!isLoaded) {
			alert('用户信息加载中，请稍后再试')
			return
		}
		
		const newRoomName = prompt('请输入新房间名:', '')
		if (newRoomName && newRoomName.trim()) {
			const trimmedName = newRoomName.trim()
			const newRoomId = nanoid(12) // 生成唯一ID
			
			console.log('🏗️ 用户创建新房间:', { roomId: newRoomId, roomName: trimmedName })
			
			// 先在画廊中创建房间对象
			const galleryRoom = {
				id: newRoomId,
				name: trimmedName, // 直接使用用户输入的名称
				createdAt: Date.now(),
				lastModified: Date.now(),
				owner: user?.id || 'anonymous',
				ownerId: user?.id || 'anonymous',
				ownerName: user?.fullName || user?.firstName || user?.username || 'User',
				isShared: false,
				shared: false,
				published: false,
				permission: 'editor' as const,
				publishStatus: 'private' as const,
				description: '',
				tags: [],
				publish: false
			}
			
			try {
				// 直接添加到画廊
				await roomUtils.addRoom(galleryRoom)
				console.log('✅ 房间已添加到画廊:', galleryRoom.name)
				
				// 同时添加到工作空间历史
				const workspaceRoom = {
					name: newRoomId, // 使用生成的ID作为name
					displayName: trimmedName, // 使用用户输入的名称作为displayName
					lastVisited: Date.now(),
					isExpanded: true,
					pages: [],
					lastPageName: undefined
				}
				
				await workspaceManager.addRoom(workspaceRoom)
				console.log('✅ 房间已添加到工作空间历史')
				
				// 重新加载数据
				loadWorkspaceData()
			} catch (error) {
				console.error('Error creating new room:', error)
				alert('创建房间失败，请重试')
				return
			}
			
			// 导航到新房间
			window.history.pushState({}, '', `/r/${encodeURIComponent(newRoomId)}`)
			window.location.reload()
		}
	}, [syncToRoomManager, isLoaded, loadWorkspaceData])

	const handleClearWorkspace = useCallback(async () => {
		if (confirm('确定要清空工作空间中的房间列表吗？\n\n注意：这只是清空工作空间历史记录，不会删除房间本身。')) {
			// 使用统一的数据管理器清空
			await workspaceManager.clearWorkspace()
			
			// 清空组件状态
			setWorkspaceRooms([])
			
			console.log('已清空工作空间房间列表')
		}
	}, [])

	// 检查当前房间是否仍然存在
	const checkCurrentRoomExists = useCallback(async () => {
		if (currentRoomId) {
			try {
				// 添加延迟以确保房间创建完成
				await new Promise(resolve => setTimeout(resolve, 1000))
				
				const galleryRooms = await roomUtils.getAllRooms()
				const currentRoomExists = galleryRooms.some(room => room.id === currentRoomId)
				
				if (!currentRoomExists && currentRoomId !== 'default-room') {
					console.log(`Current room ${currentRoomId} no longer exists, redirecting to default room`)
					alert('当前房间已不存在或您已失去访问权限，将返回到默认房间')
					window.history.pushState({}, '', '/r/default-room')
					window.location.reload()
				}
			} catch (error) {
				console.error('Error checking current room exists:', error)
			}
		}
	}, [currentRoomId])

	// 监听房间变化，检查当前房间是否仍然存在，清理已删除的房间，并添加新创建的房间到工作空间
	useEffect(() => {
		const handleRoomUpdate = async (event: Event) => {
			// 安全地转换为CustomEvent
			const customEvent = event as CustomEvent
			const { rooms: updatedRooms } = customEvent.detail || {}
			
			console.log('Room update event received, checking for new rooms')
			
			// 检查当前房间是否存在
			await checkCurrentRoomExists()
			
			// 清理已删除的房间
			await cleanupDeletedRooms()
			
			// 如果有更新的房间列表，检查是否有新创建的房间需要添加到工作空间
			if (updatedRooms && Array.isArray(updatedRooms)) {
				// 获取当前工作空间中的房间ID列表
				const workspaceRoomIds = workspaceRooms.map(room => room.name)
				
				// 查找不在工作空间中的新房间
				const newRooms = updatedRooms.filter(room => !workspaceRoomIds.includes(room.id))
				
				if (newRooms.length > 0) {
					console.log('Found new rooms to add to workspace:', newRooms)
					
					// 添加新房间到工作空间
					setRoomHistory(prev => {
						const updatedHistory = [...prev]
						
						for (const newRoom of newRooms) {
							// 只添加当前用户创建的房间
							if (user?.id === newRoom.ownerId || user?.id === newRoom.owner) {
								console.log(`Adding new room to workspace: ${newRoom.name} (${newRoom.id})`)
								
								// 创建新的工作空间房间条目
								const newRoomHistory: RoomHistoryInfo = {
									name: newRoom.id,
									displayName: newRoom.name,
									lastVisited: newRoom.lastModified || Date.now(),
									isExpanded: true,
									pages: [], // 页面信息将在访问时填充
									lastPageName: undefined
								}
								
								updatedHistory.push(newRoomHistory)
							}
						}
						
						// 按最后访问时间排序
						updatedHistory.sort((a, b) => b.lastVisited - a.lastVisited)
						
						// 更新localStorage
						localStorage.setItem('roomHistory', JSON.stringify(updatedHistory))
						
						return updatedHistory
					})
				}
			}
		}
		
		window.addEventListener('roomsUpdated', handleRoomUpdate)
		
		return () => {
			window.removeEventListener('roomsUpdated', handleRoomUpdate)
		}
	}, [checkCurrentRoomExists, cleanupDeletedRooms, workspaceRooms, user?.id])

	// 点击外部关闭工作空间
	useEffect(() => {
		if (!isOpen) return

		const handleClickOutside = (event: MouseEvent) => {
			// 如果房间信息面板已打开，不要关闭工作空间
			if (roomInfoModal) return
			
			// 检查点击的元素是否在工作空间内部
			if (workspaceRef.current && !workspaceRef.current.contains(event.target as Node)) {
				// 检查是否点击在房间信息面板内部
				const target = event.target as Element
				if (target && target.closest('.room-info-modal')) {
					return // 点击在房间信息面板内，不关闭工作空间
				}
				
				// 点击在工作空间外部，关闭菜单
				onOpenChange(false)
			}
		}

		// 添加全局点击监听器
		document.addEventListener('mousedown', handleClickOutside, true)

		// 清理函数
		return () => {
			document.removeEventListener('mousedown', handleClickOutside, true)
		}
	}, [isOpen, onOpenChange, roomInfoModal])

	// Listen for permission changes and update room data accordingly
	useEffect(() => {
		const handlePermissionChange = (event: CustomEvent) => {
  const { roomId, permission, historyLocked, publish } = event.detail
			
			// Update the room history if this is the current room
			setRoomHistory(prev => {
				return prev.map(room => {
					if (room.name === roomId) {
						console.log(`Updated room ${roomId} permission to ${permission}`)
						// Note: We don't store permission in RoomHistoryInfo, 
						// but we can trigger a re-render to reflect changes
						return {
							...room,
							lastVisited: Date.now() // Update last visited to trigger UI update
						}
					}
					return room
				})
			})
			
			// Also update localStorage to keep workspace in sync
			const savedHistory = localStorage.getItem('roomHistory')
			if (savedHistory) {
				try {
					const history = JSON.parse(savedHistory)
					const updatedHistory = history.map((room: RoomHistoryInfo) => {
						if (room.name === roomId) {
							return {
								...room,
								lastVisited: Date.now()
							}
						}
						return room
					})
					localStorage.setItem('roomHistory', JSON.stringify(updatedHistory))
				} catch (error) {
					console.error('Error updating room history with permission change:', error)
				}
			}
		}

		window.addEventListener('roomDataChanged', handlePermissionChange as EventListener)
		
		return () => {
			window.removeEventListener('roomDataChanged', handlePermissionChange as EventListener)
		}
	}, [])

	// Listen for room updates (including renames) and update workspace accordingly
	useEffect(() => {
		const handleRoomUpdate = (event: Event) => {
			// Handle roomsUpdated event for room renames and other updates
			const customEvent = event as CustomEvent
			const { roomId, name } = customEvent.detail || {}
			
			console.log('WorkSpace: Received roomsUpdated event', { roomId, name })
			
			// If we have specific room rename info, update it directly
			if (roomId && name) {
				setRoomHistory(prev => {
					const updatedHistory = prev.map(room => {
						if (room.name === roomId) {
							console.log(`Updating room display name: ${room.displayName} -> ${name}`)
							return {
								...room,
								displayName: name
							}
						}
						return room
					})
					
					// Update localStorage
					localStorage.setItem('roomHistory', JSON.stringify(updatedHistory))
					return updatedHistory
				})
			} else {
				// Fallback: refresh all room data from gallery
				const refreshRoomData = async () => {
					try {
						const galleryRooms = await roomUtils.getAllRooms()
						const galleryRoomMap = new Map(galleryRooms.map(room => [room.id, room]))
						
						setRoomHistory(prev => {
							const updatedHistory = prev.map(room => {
								const galleryRoom = galleryRoomMap.get(room.name)
								if (galleryRoom && galleryRoom.name !== room.displayName) {
									console.log(`Updating room display name: ${room.displayName} -> ${galleryRoom.name}`)
									return {
										...room,
										displayName: galleryRoom.name
									}
								}
								return room
							})
							
							// Update localStorage
							localStorage.setItem('roomHistory', JSON.stringify(updatedHistory))
							return updatedHistory
						})
					} catch (error) {
						console.error('Error refreshing room data:', error)
					}
				}
				
				refreshRoomData()
			}
		}

		window.addEventListener('roomsUpdated', handleRoomUpdate)
		
		return () => {
			window.removeEventListener('roomsUpdated', handleRoomUpdate)
		}
	}, [])

	// Helper function to get room permission info for display (simplified)
	const getRoomPermissionInfo = useCallback(async (roomId: string) => {
		try {
			// Use SimplePermissionManager for consistent permission info
			const config = await SimplePermissionManager.getRoomPermissionConfig(roomId)
			if (config) {
				const isOwner = user ? await SimplePermissionManager.isRoomOwner(roomId, user.id) : false
				
				return {
					permission: config.permission,
  publish: config.publish,
					historyLocked: config.historyLocked || false,
					historyLockTimestamp: config.historyLockTimestamp,
					isOwner
				}
			}
		} catch (error) {
			console.error('Error getting room permission info:', error)
		}
		
		return {
			permission: 'editor' as const,
			published: false,
			historyLocked: false,
			isOwner: false
		}
	}, [user])

	// Get current room permission for immediate display
	const currentRoomPermission = currentPermission || 'editor'

	// 使用统一数据源的简化排序逻辑
	const sortedRoomHistory = useMemo(() => {
		const sorted = [...workspaceRooms].sort((a, b) => {
			if (a.name === currentRoomId) return -1
			if (b.name === currentRoomId) return 1
			return b.lastVisited - a.lastVisited
		})
		return sorted
	}, [workspaceRooms, currentRoomId])



	const toggleRoomExpansion = useCallback(async (roomName: string) => {
		try {
			const currentRoom = workspaceRooms.find(room => room.name === roomName)
			if (currentRoom) {
				await workspaceManager.updateRoom(roomName, { 
					isExpanded: !currentRoom.isExpanded 
				})
				loadWorkspaceData() // 重新加载数据
			}
		} catch (error) {
			console.error('Error toggling room expansion:', error)
		}
	}, [workspaceRooms, loadWorkspaceData])

	// 从工作空间中删除房间记录
	const handleRemoveRoomFromWorkspace = useCallback(async (roomName: string) => {
		if (roomName === currentRoomId) {
			alert('不能删除当前正在访问的房间')
			return
		}
		
		if (confirm(`确定要从工作空间中移除房间 "${getRoomDisplayName(roomName)}" 吗？\n\n注意：这只是从工作空间历史记录中移除，不会删除房间本身。`)) {
			try {
				await workspaceManager.removeRoom(roomName)
				loadWorkspaceData() // 重新加载数据
				console.log(`Removed room ${roomName} from workspace history`)
			} catch (error) {
				console.error('Error removing room from workspace:', error)
			}
		}
	}, [currentRoomId, getRoomDisplayName, loadWorkspaceData])

	// 展开或收起所有房间
	const toggleAllRoomsExpansion = useCallback(async (expand: boolean) => {
		try {
			// 批量更新所有房间的展开状态
			const updatePromises = workspaceRooms.map(room => 
				workspaceManager.updateRoom(room.name, { isExpanded: expand })
			)
			await Promise.all(updatePromises)
			loadWorkspaceData() // 重新加载数据
		} catch (error) {
			console.error('Error toggling all rooms expansion:', error)
		}
	}, [workspaceRooms, loadWorkspaceData])

	// 手动添加房间到工作空间
	const handleAddRoomToWorkspace = useCallback(async () => {
		try {
			// 获取所有可用的房间
			const allRooms = await roomUtils.getAllRooms()
			const currentWorkspaceRoomIds = new Set(workspaceRooms.map(room => room.name))
			
			// 过滤出不在工作空间中的房间
			const availableRooms = allRooms.filter(room => !currentWorkspaceRoomIds.has(room.id))
			
			if (availableRooms.length === 0) {
				alert('所有房间都已添加到工作空间中')
				return
			}
			
			// 创建房间选择列表
			const roomOptions = availableRooms.map(room => 
				`${room.name} (${room.ownerName || '未知用户'})`
			).join('\n')
			
			const selectedIndex = prompt(
				`请选择要添加到工作空间的房间 (输入数字 1-${availableRooms.length}):\n\n${availableRooms.map((room, index) => 
					`${index + 1}. ${room.name} (${room.ownerName || '未知用户'})`
				).join('\n')}`
			)
			
			if (selectedIndex && !isNaN(Number(selectedIndex))) {
				const index = Number(selectedIndex) - 1
				if (index >= 0 && index < availableRooms.length) {
					const selectedRoom = availableRooms[index]
					
					// 添加到工作空间
					const newRoomHistory: RoomHistoryInfo = {
						name: selectedRoom.id,
						displayName: selectedRoom.name,
						lastVisited: Date.now(),
						isExpanded: selectedRoom.id === currentRoomId, // 当前房间默认展开
						pages: [],
						lastPageName: undefined
					}
					
					setRoomHistory(prev => {
						const newHistory = [newRoomHistory, ...prev]
						newHistory.sort((a, b) => b.lastVisited - a.lastVisited)
						const limitedHistory = newHistory.slice(0, 20)
						localStorage.setItem('roomHistory', JSON.stringify(limitedHistory))
						console.log(`Added room ${selectedRoom.name} to workspace`)
						return limitedHistory
					})
				}
			}
		} catch (error) {
			console.error('Error adding room to workspace:', error)
			alert('添加房间失败，请重试')
		}
	}, [workspaceRooms, loadWorkspaceData])

	const PageItemSubmenu = ({ index, item, listSize, onRename }: any) => {
		// 仅房主可见/可操作页面菜单
		const [isOwner, setIsOwner] = useState(false)
		useEffect(() => {
			;(async () => {
				try {
					const info = await getRoomPermissionInfo(currentRoomId)
					setIsOwner(!!info?.isOwner)
				} catch {}
			})()
		}, [currentRoomId])

		const onDuplicate = useCallback(() => {
			editor.markHistoryStoppingPoint('creating page')
			const newId = PageRecordType.createId()
			editor.duplicatePage(item.id as TLPageId, newId)
			trackEvent('duplicate-page', { source: 'page-menu' })
		}, [item])

		const onMoveUp = useCallback(() => {
			onMovePage(editor, item.id as TLPageId, index, index - 1, trackEvent)
		}, [item, index])

		const onMoveDown = useCallback(() => {
			onMovePage(editor, item.id as TLPageId, index, index + 1, trackEvent)
		}, [item, index])

		const onDelete = useCallback(() => {
			editor.markHistoryStoppingPoint('deleting page')
			editor.deletePage(item.id as TLPageId)
			trackEvent('delete-page', { source: 'page-menu' })
			
			// 强制更新房间历史
			setTimeout(() => {
				const updatedPages = editor.getPages()
				const currentPageName = editor.getCurrentPage().name
				
				setRoomHistory(prev => {
					const existingIndex = prev.findIndex(room => room.name === currentRoom)
					if (existingIndex >= 0) {
						const currentRoomPages = updatedPages.map(page => ({ name: page.name, id: page.id }))
						
						const updatedRoom: RoomHistoryInfo = {
							...prev[existingIndex],
							pages: currentRoomPages,
							lastPageName: currentPageName,
							lastVisited: Date.now()
						}

						const newHistory = [...prev]
						newHistory[existingIndex] = updatedRoom
						newHistory.sort((a, b) => b.lastVisited - a.lastVisited)
						localStorage.setItem('roomHistory', JSON.stringify(newHistory))
						
						return newHistory
					}
					return prev
				})
			}, 100)
		}, [item])

		// 非房主：不显示三点菜单（注意：放在所有 hooks 之后以保持一致的 hooks 次序）
		if (!isOwner) return null

		return (
			<TldrawUiDropdownMenuRoot id={`page item submenu ${index}`}>
				<TldrawUiDropdownMenuTrigger>
					<TldrawUiButton type="icon" title={msg('page-menu.submenu.title')}>
						<TldrawUiButtonIcon icon="dots-vertical" small />
					</TldrawUiButton>
				</TldrawUiDropdownMenuTrigger>
				<TldrawUiDropdownMenuContent alignOffset={0} side="right" sideOffset={-4}>
					<TldrawUiMenuContextProvider type="menu" sourceId="page-menu">
						<TldrawUiMenuGroup id="modify">
							{onRename && (
								<TldrawUiMenuItem id="rename" label="page-menu.submenu.rename" onSelect={onRename} />
							)}
							<TldrawUiMenuItem
								id="duplicate"
								label="page-menu.submenu.duplicate-page"
								onSelect={onDuplicate}
								disabled={pages.length >= editor.options.maxPages}
							/>
							{index > 0 && (
								<TldrawUiMenuItem
									id="move-up"
									onSelect={onMoveUp}
									label="page-menu.submenu.move-up"
								/>
							)}
							{index < listSize - 1 && (
								<TldrawUiMenuItem
									id="move-down"
									label="page-menu.submenu.move-down"
									onSelect={onMoveDown}
								/>
							)}
						</TldrawUiMenuGroup>
						{listSize > 1 && (
							<TldrawUiMenuGroup id="delete">
								<TldrawUiMenuItem id="delete" onSelect={onDelete} label="page-menu.submenu.delete" />
							</TldrawUiMenuGroup>
						)}
					</TldrawUiMenuContextProvider>
				</TldrawUiDropdownMenuContent>
			</TldrawUiDropdownMenuRoot>
		)
	}

	// 在编辑器初始化后自动应用URL中的视窗状态
	useEffect(() => {
		if (editor) {
			parseAndApplyViewportFromUrl(editor)
		}
	}, [editor])

	return (
		<>
			<TldrawUiPopover id="pages" onOpenChange={onOpenChange} open={isOpen}>
				<div ref={workspaceRef}>
				<TldrawUiPopoverTrigger data-testid="main.page-menu">
					<TldrawUiButton
						type="menu"
						title={roomPageDisplay}
						data-testid="page-menu.button"
						className="tlui-page-menu__trigger"
					>
						<TldrawUiButtonIcon icon="chevron-down" small />
						<div className="tlui-page-menu__name">{roomPageDisplay}</div>
						<div className="tlui-page-menu__actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
							{/* 当前房间信息按钮 */}
							<div
								style={{
									padding: '0.25rem',
									cursor: 'pointer',
									borderRadius: '4px',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: 'var(--color-background)',
									border: '1px solid var(--color-divider)',
									fontSize: '12px',
									fontWeight: '500',
									color: 'var(--color-text)',
									gap: '2px'
								}}
								onClick={(e) => {
									e.stopPropagation()
									console.log('当前房间展开/收回按钮被点击')
									// 通过桥接触发当前房间展开/收回
									if ((window as any).toggleCurrentRoomExpansion) {
										(window as any).toggleCurrentRoomExpansion()
									}
								}}
								title="当前房间详情"
							>
								<span>ℹ️</span>
								<span style={{ // Triangle icon
									width: '0',
									height: '0',
									borderLeft: '4px solid transparent',
									borderRight: '4px solid transparent',
									borderTop: '6px solid var(--color-text)',
									transform: 'rotate(0deg)', // Initial state, can be rotated for collapse
									transition: 'transform 0.2s ease'
								}}></span>
							</div>
							{/* 新建房间按钮 */}
							<div
								style={{
									padding: '0.25rem',
									cursor: 'pointer',
									borderRadius: '4px',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
								onClick={(e) => {
									e.stopPropagation()
									handleCreateNewRoom()
								}}
								title="新建房间"
							>
								<TldrawUiButtonIcon icon="plus" small />
							</div>
							
							{/* 画廊按钮 */}
							<div
								style={{
									padding: '0.25rem',
									cursor: 'pointer',
									borderRadius: '4px',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center'
								}}
								onClick={(e) => {
									e.stopPropagation()
									// 触发画廊打开
									if ((window as any).toggleRoomManager) {
										(window as any).toggleRoomManager()
									}
								}}
								title="画廊"
								onMouseEnter={(e) => {
									e.currentTarget.style.backgroundColor = 'var(--color-muted-1)'
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor = 'transparent'
								}}
							>
								🎨
							</div>
							
						</div>
					</TldrawUiButton>
				</TldrawUiPopoverTrigger>
				<TldrawUiPopoverContent
					side="bottom"
					align="start"
					sideOffset={0}
				>
					<div className="tlui-page-menu__wrapper">
											<div className="tlui-page-menu__header">
						<div className="tlui-page-menu__header__title">工作空间</div>
						<div className="tlui-buttons__horizontal">
							<button
								onClick={handleClearWorkspace}
								style={{
									padding: '4px 8px',
									backgroundColor: '#ef4444',
									color: 'white',
									border: 'none',
									borderRadius: '4px',
									cursor: 'pointer',
									fontSize: '12px',
									fontWeight: '500',
									marginRight: '4px'
								}}
								title="清空工作空间房间列表"
							>
								清空
							</button>
						</div>
					</div>
					<div className="tlui-rooms-list">
						{sortedRoomHistory.length === 0 ? (
							<div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
								暂无访问过的房间
							</div>
						) : (
							sortedRoomHistory.map((room) => (
							<div key={room.name} className="tlui-room-container">
								<div className="tlui-room-header">
									<TldrawUiButton
										type="icon"
										className="tlui-room-expand-toggle"
										onClick={() => toggleRoomExpansion(room.name)}
										title={room.isExpanded ? `折叠房间 ${room.displayName}` : `展开房间 ${room.displayName}`}
									>
										<TldrawUiButtonIcon icon={room.isExpanded ? "chevron-down" : "chevron-right"} small />
									</TldrawUiButton>

									<TldrawUiButton
										type="normal"
										className={`tlui-room-name-button ${room.name === currentRoom ? 'tlui-current-room' : ''}`}
										onClick={() => {
											// 如果是当前房间，toggle展开/收起
											if (room.name === currentRoom) {
												toggleRoomExpansion(room.name)
											} else {
												// 如果不是当前房间，切换到该房间
												handleSwitchToRoomWithLastPage(room.name)
												onOpenChange(false) // 自动关闭工作空间
											}
										}}
										title={
											room.name === currentRoom 
												? `${room.isExpanded ? '收起' : '展开'}当前房间: ${room.displayName}`
												: `切换到房间: ${room.displayName}${room.lastPageName ? ` (${room.lastPageName})` : ''}`
										}
									>
										<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
											<TldrawUiButtonLabel>{room.displayName}</TldrawUiButtonLabel>
										</div>
									</TldrawUiButton>

									<div className="tlui-room-actions">
							{/* roomMenu - 房间级菜单 */}
							<TldrawUiDropdownMenuRoot id={`roomMenu-${room.name}`}>
								<TldrawUiDropdownMenuTrigger>
									<TldrawUiButton type="icon" className="tlui-room-menu-btn" title="房间菜单">
										<TldrawUiButtonIcon icon="dots-horizontal" small />
									</TldrawUiButton>
								</TldrawUiDropdownMenuTrigger>
								<TldrawUiDropdownMenuContent alignOffset={0} side="bottom" sideOffset={4}>
									<TldrawUiMenuContextProvider type="menu" sourceId="page-menu">
										<TldrawUiMenuGroup id="room-actions">
                                                <TldrawUiMenuItem
                                                    id="room-info"
                                                    label="房间信息 / 设置"
                                                    onSelect={async () => {
                                                        try {
                                                            const r: any = await roomUtils.getRoom(room.name)
                                                            const ownerId = r?.ownerId || r?.owner
                                                            if (user?.id && ownerId && user.id === ownerId) {
                                                                setRoomSettingsTargetId(room.name)
                                                            } else {
                                                                setRoomInfoTarget(r || { id: room.name, name: room.displayName })
                                                            }
                                                        } catch {
                                                            setRoomInfoTarget({ id: room.name, name: room.displayName })
                                                        }
                                                    }}
                                                />
											<TldrawUiMenuItem
												id="create-page"
												label="为该房间新建页面"
												onSelect={() => {
													if (room.name !== currentRoom) {
														handleSwitchRoom(room.name)
													}
													setTimeout(() => handleCreatePageClick(), 100)
												}}
												disabled={maxPageCountReached}
											/>
											<TldrawUiMenuItem
												id="remove-room"
												label="从工作空间中移除"
												onSelect={() => handleRemoveRoomFromWorkspace(room.name)}
												disabled={room.name === currentRoomId}
											/>
										</TldrawUiMenuGroup>
									</TldrawUiMenuContextProvider>
								</TldrawUiDropdownMenuContent>
							</TldrawUiDropdownMenuRoot>
									</div>
								</div>

								{room.isExpanded && (
									<div className="tlui-room-pages">
										{room.name === currentRoom ? (
											// 当前房间：显示实时页面
											pages.map((page, index) => (
												<div
													key={page.id}
													data-pageid={page.id}
													className="tlui-page-item"
												>
													<div className="tlui-page-indent"></div>
													<div className="tlui-page-icon">
														{page.id === currentPage.id ? (
															<span className="tlui-current-page-icon">✓</span>
														) : (
															<span className="tlui-page-document-icon">📄</span>
														)}

                    
													</div>
													<TldrawUiButton
														type="normal"
														className={`tlui-page-name-button ${page.id === currentPage.id ? 'tlui-current-page' : ''}`}
														onClick={() => changePage(page.id)}
														onDoubleClick={toggleEditing}
														title={`跳转到页面: ${page.name}`}
														onKeyDown={(e) => {
															if (e.key === 'Enter') {
																if (page.id === currentPage.id) {
																	toggleEditing()
																	stopEventPropagation(e)
																}
															}
														}}
													>
														<TldrawUiButtonLabel>{page.name}</TldrawUiButtonLabel>
													</TldrawUiButton>
													{!isReadonlyMode && (
														<div className="tlui-page-menu-button">
															<PageItemSubmenu
																index={index}
																item={page}
																listSize={pages.length}
																onRename={() => {
																	if (tlenv.isIos) {
																		const name = window.prompt('重命名页面', page.name)
																		if (name && name !== page.name) {
																			renamePage(page.id, name)
																		}
																	} else {
																		const name = window.prompt('重命名页面', page.name)
																		if (name && name !== page.name) {
																			renamePage(page.id, name)
																		}
																	}
																}}
															/>
														</div>
													)}
												</div>
											))
										) : (
											// 其他房间：显示存储的页面信息
											room.pages && room.pages.length > 0 ? (
												room.pages.map((pageInfo, index) => (
													<div
														key={`${room.name}-${pageInfo.name}`}
														className="tlui-page-item tlui-other-room-page"
													>
														<div className="tlui-page-indent"></div>
														<div className="tlui-page-icon">
															{pageInfo.name === room.lastPageName ? (
																<span className="tlui-last-page-icon">🔖</span>
															) : (
																<span className="tlui-page-document-icon">📄</span>
															)}
														</div>
														<TldrawUiButton
															type="normal"
															className="tlui-page-name-button tlui-other-room-page-button"
															onClick={() => handleSwitchToRoomPage(room.name, pageInfo.name)}
															title={`精确跳转到 ${room.name} → ${pageInfo.name}${pageInfo.name === room.lastPageName ? ' (上次页面)' : ''}`}
														>
															<TldrawUiButtonLabel>{pageInfo.name}</TldrawUiButtonLabel>
														</TldrawUiButton>
													</div>
												))
											) : (
												<div className="tlui-room-placeholder">
													<div className="tlui-page-indent"></div>
													<span className="tlui-room-placeholder-text">
														暂无页面
													</span>
												</div>
											)
										)}
									</div>
								)}
							</div>
							))
						)}
					</div>
				</div>
			</TldrawUiPopoverContent>
				</div>
			</TldrawUiPopover>

			{/* 本地挂载的房间设置 / 房间信息 弹窗（放在根部，避免被Popover裁剪） */}
			{roomSettingsTargetId && createPortal(
				<div
					style={{ position: 'fixed', inset: 0, zIndex: 2600, pointerEvents: 'auto' }}
					onWheel={(e) => e.stopPropagation()}
					onMouseDown={(e) => e.stopPropagation()}
					onTouchMove={(e) => e.stopPropagation()}
				>
					<RoomSettings
						isOpen={true}
						onClose={() => setRoomSettingsTargetId(null)}
						roomId={roomSettingsTargetId}
						editor={undefined}
					/>
				</div>,
				document.body
			)}
			{roomInfoTarget && createPortal(
				<div
					style={{ position: 'fixed', inset: 0, zIndex: 2600, pointerEvents: 'auto' }}
					onWheel={(e) => e.stopPropagation()}
					onMouseDown={(e) => e.stopPropagation()}
					onTouchMove={(e) => e.stopPropagation()}
				>
					<RoomInfo
						room={roomInfoTarget}
						onClose={() => setRoomInfoTarget(null)}
						onRoomUpdate={() => setRoomInfoTarget(null)}
					/>
				</div>,
				document.body
			)}
			
			{/* Room Info Modal */}
			{roomInfoModal && (
				<RoomInfo
					room={roomInfoModal}
					onClose={() => setRoomInfoModal(null)}
					onRoomUpdate={(updatedRoom) => {
						console.log('WorkSpace: onRoomUpdate 被调用，房间:', updatedRoom)
						// 更新房间历史记录
						setRoomHistory(prev => {
							const newHistory = prev.map(historyRoom => 
								historyRoom.name === updatedRoom.id 
									? { ...historyRoom, name: updatedRoom.name }
									: historyRoom
							)
							localStorage.setItem('roomHistory', JSON.stringify(newHistory))
							return newHistory
						})
						
						// 更新模态框中的房间数据
						setRoomInfoModal(updatedRoom)
						console.log('WorkSpace: 已更新房间信息模态框数据')
						// setRoomInfoModal(null)  // 不关闭面板
					}}
				/>
			)}
		</>
	)
})

// 只导出 WorkSpace，不再使用 RoomPageManager

