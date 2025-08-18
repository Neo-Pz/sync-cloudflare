import { useSync } from '@tldraw/sync'
import { 
	Tldraw, 
	useEditor,
	TldrawUiDropdownMenuRoot,
	TldrawUiDropdownMenuTrigger,
	TldrawUiDropdownMenuContent,
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiMenuItem,
	TldrawUiMenuGroup,
	TldrawUiMenuContextProvider,
	DefaultMainMenu,
	TldrawUiMenuSubmenu,
	DefaultMainMenuContent,
	createTLStore,
	defaultShapeUtils,
	defaultBindingUtils
} from 'tldraw'
import { SignedIn, SignedOut, SignInButton, UserButton, useUser, useClerk } from '@clerk/clerk-react'
import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { getBookmarkPreview } from './getBookmarkPreview'
import { multiplayerAssetStore } from './multiplayerAssetStore'
import { SharePanel } from './SharePanel'
import { CustomShareZone } from './CustomShareZone'
import { RoomManager, Room } from './RoomManager'
import { UserRoom } from './UserRoom'
import { WorkSpace } from './WorkSpace'
import { CurrentRoomInfo } from './CurrentRoomInfo'

// 已在第31行导入 roomUtils，避免重复导入
import { parseRoute, generateRoomUrl, nameToSlug } from './routingUtils'
import { applyViewportState } from './viewportUtils'
import { formatPermissionInfo, type PermissionInfo } from './permissionUtils'
import { userActivityAPI } from './userActivityAPI'
import { TldrFileIntegration, FileToolbar } from './TldrFileIntegration'
import { RoomSettings } from './RoomSettings'
import { roomUtils } from './roomUtils'
import { trackVisit } from './interactionTracker'
import { directRoomLoader } from './DirectRoomLoader'
import { snapshotManager } from './SnapshotManager'
import { DataSyncUtils } from './DataSyncUtils'
import { PublishPage } from './PublishPage'
import { PlazaList } from './PlazaList'
import './mobile.css'

// 扩展 Window 接口以支持权限状态跟踪
declare global {
	interface Window {
		lastProcessedPermission?: string
	}
}

// 创建一个状态来传递editor实例
let globalEditor: any = null

// RoomSettings包装器，在Tldraw内部使用以获取editor实例
function RoomSettingsWrapper({ activeRoomId, user }: { activeRoomId: string; user: any }) {
	const editor = useEditor()
	
	// 将editor实例存储到全局变量
	globalEditor = editor
	
	return null // 不渲染任何内容
}


function TldrawApp() {
	const { user, isLoaded } = useUser()
	// 将当前用户ID暴露到全局，避免闭包拿到旧值
	useEffect(() => {
		;(window as any).__CURRENT_USER_ID__ = user?.id || null
	}, [user?.id])
    const { signOut, openSignIn, openUserProfile } = useClerk()
	const anonymousIdRef = useRef<string>()
	const userColorRef = useRef<string>()
	const [permission, setPermission] = useState<'viewer' | 'editor' | 'assist'>('editor')
	const [previousPermission, setPreviousPermission] = useState<'viewer' | 'editor' | 'assist' | undefined>(undefined)
	const [currentRoomId, setCurrentRoomId] = useState<string>('default-room')
	const [showRoomManager, setShowRoomManager] = useState(false)
	const [showUserGallery, setShowUserGallery] = useState(false)
	const [userGalleryTargetUserId, setUserGalleryTargetUserId] = useState<string | null>(null)
	const [isCurrentRoomExpanded, setIsCurrentRoomExpanded] = useState(false) // 当前房间展开状态
	const [showPlazaList, setShowPlazaList] = useState(false)
	const editorRef = useRef<any>(null)

	// 使用ref避免"暂时性死区(TDZ)"：在声明state之前也可读取
	const roomPermissionDataRef = useRef<any>(null)
	
	// Helper: 检查当前房间的所有者（优先使用 ref，其次 localStorage），确保"所有者至上"
    const isOwnerOfRoom = useCallback((roomId: string) => {
        const rid = roomId
        let ownerId: string | undefined
		const data = roomPermissionDataRef.current
        if (data && rid) {
			ownerId = (data as any).ownerId || (data as any).owner
		}
		if (!ownerId && rid) {
			try {
				const stored = localStorage.getItem(`room-permission-${rid}`)
				if (stored) {
					const parsed = JSON.parse(stored)
					ownerId = parsed.ownerId || parsed.owner
				}
			} catch {}
		}
        return !!(user?.id && ownerId && user.id === ownerId)
    }, [user?.id])
	
	// 当前房间展开/收回切换函数
	const toggleCurrentRoomExpansion = useCallback(() => {
		setIsCurrentRoomExpanded(prev => !prev)
	}, [])
	
	// 暴露切换函数到全局，供WorkSpace调用
	useEffect(() => {
		;(window as any).toggleCurrentRoomExpansion = toggleCurrentRoomExpansion
		;(window as any).toggleRoomManager = () => setShowRoomManager(!showRoomManager)
		return () => {
			delete (window as any).toggleCurrentRoomExpansion
			delete (window as any).toggleRoomManager
		}
	}, [toggleCurrentRoomExpansion, showRoomManager])
	
	// Mobile detection
	const [isMobile, setIsMobile] = useState(false)
	
	useEffect(() => {
		const checkMobile = () => {
			setIsMobile(window.innerWidth <= 768)
		}
		
		checkMobile()
		window.addEventListener('resize', checkMobile)
		
		return () => window.removeEventListener('resize', checkMobile)
	}, [])

	// 完全禁用启动时的自动化操作
	useEffect(() => {
		console.log('🚀 最小化启动初始化...')
		
		// 确保默认房间存在（使用动态导入，避免符号解析时机问题）
		;(async () => {
			try {
				const mod = await import('./roomUtils')
				await mod.roomUtils.ensureDefaultRoom()
				await mod.roomUtils.createSampleRooms()
			} catch (e) {
				console.warn('ensureDefaultRoom 动态导入失败', e)
			}
		})()
		
		console.log('✅ 最小化初始化完成')
	}, [])
	
	// Enhanced URL parsing for semantic routing structure
	const [parsedRoute, setParsedRoute] = useState(() => {
		const route = parseRoute(window.location.pathname)
		console.log('Initial parsed route:', route)
		return route
	})
	
	// Check if current route is plaza list
	const isPlazaListRoute = parsedRoute.type === 'plaza-list'
	
	// Handle plaza list route
	useEffect(() => {
		if (isPlazaListRoute && isLoaded) {
			console.log('🏛️ 检测到广场列表路径，显示广场列表')
			setShowPlazaList(true)
		} else {
			setShowPlazaList(false)
		}
	}, [isPlazaListRoute, isLoaded])
	
	// 处理根路径访问 - 随机跳转到广场房间
	useEffect(() => {
		const handleRootPathRedirect = async () => {
			// 只有在根路径时才执行，并且检查是否已经在重定向中
			const currentPath = window.location.pathname
			
			// 使用内存标志而不是sessionStorage，以提高iOS兼容性
			const isRedirecting = (window as any).__isRedirecting
			
			if ((currentPath === '/' || currentPath === '') && !isRedirecting && isLoaded) {
				console.log('🏛️ 检测到根路径访问，准备随机跳转到广场房间...')
				
				// 设置重定向标志，防止无限循环
				;(window as any).__isRedirecting = true
				
				try {
					// 获取广场房间列表
					const response = await fetch('/api/rooms?plaza=true', {
						headers: {
							'Cache-Control': 'no-cache',
							'Pragma': 'no-cache'
						}
					})
					
					if (response.ok) {
						const allRooms = await response.json()
						const plazaRooms = allRooms.filter(room => room.plaza === true)
						
						console.log('🏛️ 获取到广场房间:', plazaRooms.length, '个')
						
						if (plazaRooms.length > 0) {
							// 随机选择一个广场房间
							const randomIndex = Math.floor(Math.random() * plazaRooms.length)
							const selectedRoom = plazaRooms[randomIndex]
							
							console.log('🎲 随机选择广场房间:', selectedRoom.name, '(', selectedRoom.id, ')')
							
							// 使用replace避免在历史记录中留下根路径
							window.location.replace(`${window.location.origin}/r/${selectedRoom.id}`)
							return
						} else {
							console.log('⚠️ 没有找到广场房间，跳转到默认房间')
							window.location.replace(`${window.location.origin}/r/default-room`)
							return
						}
					} else {
						console.error('❌ 获取广场房间失败，跳转到默认房间')
						window.location.replace(`${window.location.origin}/r/default-room`)
						return
					}
				} catch (error) {
					console.error('❌ 重定向过程中出错:', error)
					// 出错时跳转到默认房间
					window.location.replace(`${window.location.origin}/r/default-room`)
					return
				} finally {
					// 移除重定向标志
					;(window as any).__isRedirecting = false
				}
			}
		}
		
		// 只在用户加载完成后执行重定向
		if (isLoaded) {
			handleRootPathRedirect()
		}
		
		// 清理函数：移除重定向标志
		return () => {
			if (window.location.pathname !== '/') {
				;(window as any).__isRedirecting = false
			}
		}
	}, [isLoaded])
	
	const { roomId: routeRoomId, type: routeType, displayPath, pageId: routePageId, viewport: routeViewport } = parsedRoute
	const [sharePermission, setSharePermission] = useState<'viewer' | 'editor' | 'assist'>('editor')
	const [roomPermissionData, setRoomPermissionData] = useState<{
		publish: boolean,
		shared?: boolean,
		permission: 'viewer' | 'editor' | 'assist', 
		historyLocked?: boolean,
		historyLockTimestamp?: number,
		owner?: string,
		ownerId?: string
	} | null>(null)
	
	// Sync ref with state to avoid TDZ issues
	useEffect(() => {
		roomPermissionDataRef.current = roomPermissionData
	}, [roomPermissionData])
	
	// Use route room ID if available, otherwise use current room ID
	const activeRoomId = routeRoomId !== 'default-room' ? routeRoomId : currentRoomId
	const currentRouteType = routeType || 'direct'
	
	// 从房间数据加载实际权限
	const [permissionInitialized, setPermissionInitialized] = useState(false)
	
	// 加载房间权限的函数
	const loadRoomPermission = useCallback(async (roomId: string) => {
		try {
			console.log('🔧 加载房间权限数据，房间ID:', roomId)
			const room = await roomUtils.getRoom(roomId)
			if (room) {
				setRoomPermissionData({
					publish: room.publish || false,
					shared: room.shared || false,
					permission: room.permission || 'viewer',
					historyLocked: room.historyLocked || false,
					historyLockTimestamp: room.historyLockTimestamp,
					owner: room.owner || room.ownerId,
					ownerId: room.ownerId || room.owner
				})
				// 同步到本地，供 isOwnerOfRoom 使用
				try {
					localStorage.setItem(`room-permission-${roomId}`, JSON.stringify({
						ownerId: room.ownerId || room.owner,
						owner: room.owner || room.ownerId,
						permission: room.permission || 'viewer'
					}))
				} catch {}
					console.log('📋 房间权限已加载:', {
					roomId: roomId,
						publish: room.publish,
					shared: room.shared,
					permission: room.permission,
					owner: room.owner || room.ownerId
				})
			} else {
				// 房间不存在，设置默认权限
				setRoomPermissionData({
					publish: false,
					shared: false,
					permission: 'viewer',
					historyLocked: false,
					owner: user?.id || 'anonymous',
					ownerId: user?.id || 'anonymous'
				})
				try {
					localStorage.setItem(`room-permission-${roomId}`, JSON.stringify({
						ownerId: user?.id || 'anonymous',
						owner: user?.id || 'anonymous',
						permission: 'viewer'
					}))
				} catch {}
			}
		} catch (error) {
			console.error('加载房间权限失败:', error)
			// 降级为默认权限
			setRoomPermissionData({
				publish: false,
				shared: false,
				permission: 'viewer',
				historyLocked: false,
				owner: user?.id || 'anonymous',
				ownerId: user?.id || 'anonymous'
			})
			try {
				localStorage.setItem(`room-permission-${roomId}`, JSON.stringify({
					ownerId: user?.id || 'anonymous',
					owner: user?.id || 'anonymous',
					permission: 'viewer'
				}))
			} catch {}
		}
	}, [user?.id])
	
	// 初始加载权限
	useEffect(() => {
		if (activeRoomId && !permissionInitialized) {
			loadRoomPermission(activeRoomId)
			setPermissionInitialized(true)
		}
	}, [activeRoomId, permissionInitialized, loadRoomPermission])

	// 当房间ID变化时重新加载权限
	useEffect(() => {
		if (activeRoomId && permissionInitialized) {
			console.log('🔄 房间ID变化，重新加载权限:', activeRoomId)
			loadRoomPermission(activeRoomId)
		}
	}, [activeRoomId, loadRoomPermission, permissionInitialized])

	// 监听房间权限变更事件（来自 RoomSettings）
	useEffect(() => {
		const handleRoomDataChanged = (event: CustomEvent) => {
			const { roomId: changedRoomId, permission, shared, publish } = event.detail
			if (changedRoomId === activeRoomId) {
				console.log('🔄 检测到房间权限变更事件:', { permission, shared, publish })
				// 立即更新权限数据
				setRoomPermissionData(prev => prev ? {
					...prev,
					permission: permission || prev.permission,
					shared: shared !== undefined ? shared : prev.shared,
					publish: publish !== undefined ? publish : prev.publish
				} : null)
			}
		}

		window.addEventListener('roomDataChanged', handleRoomDataChanged as EventListener)
		return () => window.removeEventListener('roomDataChanged', handleRoomDataChanged as EventListener)
	}, [activeRoomId])
	
	// 直接使用房间权限设置，房主通过其他逻辑获得特权
	useEffect(() => {
		if (!roomPermissionData) return
		
		const newPermission = roomPermissionData.permission || 'viewer'
		
		if (newPermission !== permission) {
			setPreviousPermission(permission)
			setPermission(newPermission)
			console.log(`🔄 权限更新: ${permission} → ${newPermission}`)
		}
	}, [roomPermissionData, permission])

    // 同步浏览模式只读状态到编辑器
	useEffect(() => {
        if (editorRef.current && permission) {
            // 将"浏览模式"视为编辑模式基础，不再开启只读；权限限制通过工具/动作过滤实现
            const shouldBeReadonly = false
            const isOwner = isOwnerOfRoom(activeRoomId)
			
			console.log(`🔄 准备同步权限到编辑器:`, {
                permission,
                isOwner,
				shouldBeReadonly,
				editorExists: !!editorRef.current,
				activeRoomId
			})
			
			// 强制应用只读状态
			editorRef.current.updateInstanceState({ isReadonly: shouldBeReadonly })
			
            // 不再自动切换工具；工具限制由 overrides.tools 控制
			
            console.log(`🔄 权限同步完成: ${permission}, 只读模式: ${shouldBeReadonly}`)
			
			// 跨浏览器同步：将权限变化写入 localStorage，供其他标签页感知
			localStorage.setItem(`room_permission_${activeRoomId}`, JSON.stringify({
				permission: permission,
				readonly: shouldBeReadonly,
				timestamp: Date.now()
			}))
		}
	}, [permission, activeRoomId, user, roomPermissionData])

	// 监听跨浏览器权限变化
	useEffect(() => {
		const handlePermissionSync = (event: StorageEvent) => {
			if (event.key?.startsWith(`room_permission_${activeRoomId}`) && event.newValue) {
				try {
					const permData = JSON.parse(event.newValue)
					if (editorRef.current && permData.permission !== permission) {
						// 检查是否为房主
                        const isOwner = isOwnerOfRoom(activeRoomId)
						const shouldBeReadonly = permData.permission === 'viewer' && !isOwner
						editorRef.current.updateInstanceState({ isReadonly: shouldBeReadonly })
						if (shouldBeReadonly) {
							editorRef.current.setCurrentTool('laser')
						}
						console.log(`🔄 跨浏览器权限同步: ${permData.permission}`)
					}
				} catch (e) {
					console.warn('权限同步数据解析失败:', e)
				}
			}
		}

		window.addEventListener('storage', handlePermissionSync)
		return () => window.removeEventListener('storage', handlePermissionSync)
	}, [activeRoomId, permission])

	// 定期检查编辑器只读状态，防止状态不一致
	useEffect(() => {
		const interval = setInterval(() => {
			if (editorRef.current && permission) {
				// 检查是否为房主
                const isOwner = isOwnerOfRoom(activeRoomId)
				const expectedReadonly = permission === 'viewer' && !isOwner
				const currentReadonly = editorRef.current.getInstanceState().isReadonly
				
				if (currentReadonly !== expectedReadonly) {
					console.warn(`⚠️ 编辑器状态不一致！期望: ${expectedReadonly}, 当前: ${currentReadonly}, 正在修正...`)
					editorRef.current.updateInstanceState({ isReadonly: expectedReadonly })
					if (expectedReadonly) {
						editorRef.current.setCurrentTool('laser')
					}
					console.log(`🔧 已强制修正编辑器状态: 只读=${expectedReadonly}`)
				}
			}
		}, 3000) // 每3秒检查一次
		
		return () => clearInterval(interval)
	}, [permission, user, roomPermissionData])

	// 权限变化时：
	// - 编辑模式：立即解锁全部历史元素，不应用任何限制
	// - 辅作/浏览：应用历史限制
	useEffect(() => {
		// 防抖机制：避免短时间内重复执行
		const timeoutId = setTimeout(async () => {
			if (!activeRoomId || !permission || !editorRef.current) return
			
			// 防止重复执行：检查是否真的发生了变化
			if (permission === previousPermission) return
			
			// 检查是否已经处理过这个权限状态
			const permissionKey = `${activeRoomId}_${permission}`
			if (window.lastProcessedPermission === permissionKey) return
			
			console.log(`🔄 权限立即切换: ${previousPermission} → ${permission}`)
			
			try {
				const { roomUtils } = await import('./roomUtils')
				
				// 🔥 立即执行权限切换，不要延迟
				if (permission === 'assist') {
					// 辅作模式：立即锁定历史
					console.log('⚡ 立即激活辅作模式')
					// i) 进入辅作时，先全选所有形状再锁定
					try {
						const editor = editorRef.current
						const ids = editor.getCurrentPageShapeIds()
						if (ids && ids.size > 0) {
							editor.setSelectedShapeIds(Array.from(ids))
						}
					} catch {}
					await roomUtils.lockHistory(activeRoomId, editorRef.current, user?.id, user?.fullName || user?.firstName || 'User')
					roomUtils.showModeChangeNotification('辅助模式已激活', '历史内容已锁定，只能编辑新添加的内容', '🔒')
				} else if (permission === 'editor') {
					// 编辑模式：立即解锁历史
					console.log('⚡ 立即激活编辑模式')
					if (previousPermission === 'assist') {
						await roomUtils.unlockHistory(activeRoomId, editorRef.current, user?.id, true, false)
						roomUtils.showModeChangeNotification('编辑模式已激活', '历史锁定已解除，现在可以编辑所有内容', '✏️')
					} else {
						roomUtils.showModeChangeNotification('编辑模式已激活', '现在可以编辑所有内容', '✏️')
					}
				} else if (permission === 'viewer') {
					// 浏览模式：如果从辅作切换，先清理锁定状态
					console.log('⚡ 立即激活浏览模式')
					if (previousPermission === 'assist') {
						await roomUtils.unlockHistory(activeRoomId, editorRef.current, user?.id, true, false)
						roomUtils.showModeChangeNotification('浏览模式已激活', '已从辅作模式切换到只读模式', '👀')
					} else {
						roomUtils.showModeChangeNotification('浏览模式已激活', '现在为完全只读模式', '👀')
					}
				}
				
				// 标记这个权限状态已经处理过
				window.lastProcessedPermission = permissionKey
			} catch (e) {
				console.error('Permission change apply failed', e)
			}
		}, 100) // 100ms 防抖延迟
		
		return () => clearTimeout(timeoutId)
	}, [permission, activeRoomId, user?.id, previousPermission])

	// 临时禁用记录用户房间访问行为 - 避免无限循环
	// useEffect(() => {
	// 	if (user && activeRoomId) {
	// 		const userName = user.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 
	//                        user.fullName || 
	//                        user.username || 
	//                        'User'
			
	// 		const recordVisit = async () => {
	// 			try {
	// 				const room = await roomUtils.getRoom(activeRoomId)
	// 				const roomName = room?.name || activeRoomId
					
	// 				const activity = await userActivityAPI.recordRoomVisit(user.id, userName, activeRoomId, roomName)
	// 				console.log('Recorded room visit:', activity)
	// 			} catch (error) {
	// 				console.error('Failed to record room visit:', error)
	// 			}
	// 		}
			
	// 		recordVisit()
	// 	}
	// }, [user, activeRoomId])


	// 修复 UserButton 弹出框点击问题
	useEffect(() => {
		const fixUserButtonPopover = () => {
			// 查找所有 Clerk UserButton 弹出框
			const popovers = document.querySelectorAll('.cl-userButtonPopoverCard')
			
			popovers.forEach(popover => {
				const htmlElement = popover as HTMLElement
				
				// 确保弹出框本身可以交互
				htmlElement.style.pointerEvents = 'auto'
				htmlElement.style.zIndex = '2147483647'
				htmlElement.style.position = 'fixed'
				
				// 查找弹出框内的所有按钮
				const buttons = popover.querySelectorAll('button, [role="button"], [role="menuitem"]')
				
				buttons.forEach(button => {
					const btnElement = button as HTMLElement
					
					// 强制设置按钮样式
					btnElement.style.pointerEvents = 'auto'
					btnElement.style.cursor = 'pointer'
					btnElement.style.zIndex = 'inherit'
					
					// 检查是否已经修复过
					if (!btnElement.getAttribute('data-fixed')) {
						btnElement.setAttribute('data-fixed', 'true')
						
						// 添加点击事件监听器
						btnElement.addEventListener('click', (e) => {
							console.log('UserButton 按钮被点击:', btnElement.textContent)
							
							// 确保事件能正常传播到 Clerk 的处理器
							// 不阻止默认行为，让 Clerk 自己处理
						}, { capture: false })
					}
				})
			})
		}
		
		// 立即执行一次
		setTimeout(fixUserButtonPopover, 100)
		
		// 定期检查和修复
		const interval = setInterval(fixUserButtonPopover, 2000)
		
		// 监听DOM变化
		const observer = new MutationObserver(fixUserButtonPopover)
		observer.observe(document.body, { childList: true, subtree: true })
		
		return () => {
			clearInterval(interval)
			observer.disconnect()
		}
	}, [])

	// 最简化的用户处理
	useEffect(() => {
		if (isLoaded) {
			console.log('User loaded:', { isLoaded, userId: user?.id })
			// 暂时不执行任何自动化操作，让编辑器先加载
		}
	}, [isLoaded, user?.id])

	// Listen for room data changes (permission updates from RoomSettings)
	useEffect(() => {
		const handleRoomDataChanged = (event: CustomEvent) => {
			const data = event.detail
			if (data.roomId === activeRoomId) {
				console.log('Room data changed, updating permission data:', data)
				setRoomPermissionData(prev => ({
					...prev,
					permission: data.permission || prev?.permission || 'viewer',
					historyLocked: data.historyLocked !== undefined ? data.historyLocked : prev?.historyLocked,
					publish: data.publish !== undefined ? data.publish : prev?.publish
				}))
			}
		}

		window.addEventListener('roomDataChanged', handleRoomDataChanged as EventListener)
		return () => {
			window.removeEventListener('roomDataChanged', handleRoomDataChanged as EventListener)
		}
	}, [activeRoomId])
	
	// Update current room when route changes
	useEffect(() => {
		if (routeRoomId !== 'default-room') {
			setCurrentRoomId(routeRoomId)
		}
	}, [routeRoomId])

	// Helper function to get correct WebSocket URI based on environment
	const getWebSocketUri = (roomId: string): string => {
		if (typeof window !== 'undefined') {
			const hostname = window.location.hostname
			if (hostname === 'localhost' || hostname === '127.0.0.1') {
				// 本地开发时使用本地Worker服务 (确保本地Worker在运行)
				return `ws://localhost:8787/api/connect/${roomId}`
			}
		}
		// 生产环境：根据当前协议构建正确的WebSocket URL
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
		const host = window.location.host
		return `${protocol}//${host}/api/connect/${roomId}`
	}

	// 临时禁用WebSocket连接，使用本地存储模式
	// 创建本地store（不使用多人协作） - 临时禁用
	// const store = useMemo(() => {
	// 	console.log('🔧 创建本地存储模式的store，禁用WebSocket连接')
	// 	return createTLStore({
	// 		shapeUtils: defaultShapeUtils,
	// 		bindingUtils: defaultBindingUtils,
	// 	})
	// }, [])
	
	// Create a store connected to multiplayer - 启用多人协作
	const store = useSync({
		// We need to know the websockets URI...
		uri: getWebSocketUri(activeRoomId),
		// ...and how to handle static assets like images & videos
		assets: multiplayerAssetStore,
	})

	// Enhanced permission sync system (like official tldraw)
	const syncPermissionToAll = (permission: 'viewer' | 'editor') => {
		if (editorRef.current) {
			// Update readonly state
			editorRef.current.updateInstanceState({ 
				isReadonly: permission === 'viewer'
			})
			
			// Multi-channel permission broadcast
			const permissionData = {
				permission,
				roomId: activeRoomId,
				timestamp: Date.now(),
				source: 'sharer'
			}
			
			// 1. LocalStorage for cross-tab sync
			localStorage.setItem(`room-permission-${activeRoomId}`, JSON.stringify(permissionData))
			
			// 2. Custom event for same-tab sync  
			window.dispatchEvent(new CustomEvent('room-permission-change', { detail: permissionData }))
			
			// 3. BroadcastChannel for cross-origin sync (if supported)
			if (typeof BroadcastChannel !== 'undefined') {
				const channel = new BroadcastChannel(`tldraw-room-${activeRoomId}`)
				channel.postMessage(permissionData)
			}
		}
	}


	// Wrapper for generateRoomUrl utility with current user context
const generateSemanticUrl = (room: any, roomId: string, accessType?: 'my' | 'shared' | 'published'): string => {
		// 只有发布白板访问才使用 /p/ 路径（快照）
if (accessType === 'published') {
			console.log(`房间 ${roomId} 通过发布白板访问，生成 /p/ 路径（快照）`)
			return `/p/${roomId}`
		}
		
		// 如果没有指定访问类型，根据房间属性自动判断
		if (!accessType) {
			if (room.plaza && room.published) {
				console.log(`房间 ${roomId} 自动检测为发布白板房间，生成 /p/ 路径（快照）`)
				return `/p/${roomId}`
			}
		}
		
		// 我的白板和共享白板都使用 /r/ 路径（原始房间）
		console.log(`房间 ${roomId} 通过${accessType === 'shared' ? '共享空间' : '个人空间'}访问，生成 /r/ 路径（原始房间）`)
		return `/r/${roomId}`
	}

	// Handle room switching with permission validation
const handleRoomChange = async (roomId: string, accessType?: 'my' | 'shared' | 'published') => {
        try {
            const room = await roomUtils.getRoom(roomId)
            if (!room) { console.error('Room not found:', roomId); alert('房间不存在'); return }
            const isOwner = user && (room.ownerId === user.id || room.owner === user.id)
            const isPublished = room.publish || room.published || false
            const isShared = room.shared || room.isShared || false
            const isPlaza = room.plaza === true
            // 广场入口：不因共享/发布拦截
            if (!isOwner && isPlaza) {
                setCurrentRoomId(roomId)
                const targetUrl = generateSemanticUrl(room, roomId, accessType ?? (isPublished ? 'published' : undefined))
                window.history.pushState({}, '', targetUrl)
                roomUtils.updateRoomLastModified(roomId).catch(error => { console.error('Error updating room last modified time:', error) })
                setShowRoomManager(false)
                window.location.reload()
                return
            }
            // 非广场：仅当既未共享也未发布且非房主才拦截
            if (!isOwner && !isPublished && !isShared) {
                console.warn('Access denied to unshared/unpublished room:', roomId)
                alert('此房间未共享，无法访问')
                return
            }
            setCurrentRoomId(roomId)
            const targetUrl = generateSemanticUrl(room, roomId, accessType)
            window.history.pushState({}, '', targetUrl)
            roomUtils.updateRoomLastModified(roomId).catch(error => { console.error('Error updating room last modified time:', error) })
            setShowRoomManager(false)
            window.location.reload()
        } catch (error) {
            console.error('Error switching room:', error)
            alert('切换房间失败')
        }
    }

	// Handle room creation
	const handleRoomCreate = (room: Room) => {
		console.log('New room created:', room)
		// 立即通知画廊更新
		roomUtils.getAllRooms().then(rooms => {
			window.dispatchEvent(new CustomEvent('roomsUpdated', { detail: { rooms } }))
		}).catch(error => {
			console.error('Error getting rooms after creation:', error)
		})
	}

	// Handle user gallery display
	const handleShowUserGallery = (targetUserId: string) => {
		setUserGalleryTargetUserId(targetUserId)
		setShowUserGallery(true)
	}
	
	// Handle plaza room selection
	const handlePlazaRoomSelect = (roomId: string) => {
		console.log('🏛️ 选择广场房间:', roomId)
		setShowPlazaList(false)
		// 直接跳转到房间，使用 /r/ 路径而不是 /plaza/ 路径
		window.location.href = `/r/${roomId}`
	}
	
	// Handle back to app from plaza list
	const handleBackToApp = () => {
		console.log('🏠 从广场返回应用')
		setShowPlazaList(false)
		window.location.href = '/r/default-room'
	}

	// Expose a global helper so any component (e.g. 画廊) can open "我的画廊/用户画廊"
	useEffect(() => {
		;(window as any).showUserGallery = (targetUserId?: string) => {
			const id = targetUserId || user?.id || 'anonymous'
			handleShowUserGallery(id)
		}
		return () => {
			delete (window as any).showUserGallery
		}
	}, [user])


	// Enhanced permission listening system
	useEffect(() => {
		// Handle custom events (same-tab)
		const handleCustomEvent = (event: CustomEvent) => {
			const data = event.detail
            if (data.permission && data.permission !== permission && data.roomId === activeRoomId) {
                console.log('Permission change via custom event:', data.permission)
                setPermission(data.permission)
			}
		}

		// Handle localStorage changes (cross-tab)
		const handleStorageEvent = (event: StorageEvent) => {
			if (event.key === `room-permission-${activeRoomId}` && event.newValue) {
				try {
					const data = JSON.parse(event.newValue)
                    if (data.permission !== permission) {
                        console.log('Permission change via localStorage:', data.permission)
                        setPermission(data.permission)
					}
				} catch (error) {
					console.error('Error parsing permission data:', error)
				}
			}
		}

		// Handle BroadcastChannel (cross-origin)
		let channel: BroadcastChannel | null = null
		if (typeof BroadcastChannel !== 'undefined') {
			channel = new BroadcastChannel(`tldraw-room-${activeRoomId}`)
			channel.onmessage = (event) => {
				const data = event.data
                if (data.permission && data.permission !== permission) {
                    console.log('Permission change via BroadcastChannel:', data.permission)
                    setPermission(data.permission)
				}
			}
		}

		// Load initial permission from storage
		const storedData = localStorage.getItem(`room-permission-${activeRoomId}`)
        if (storedData) {
			try {
				const data = JSON.parse(storedData)
                if (data.permission && data.permission !== permission) {
                    setPermission(data.permission)
				}
			} catch (error) {
				console.error('Error loading initial permission:', error)
			}
		}

		window.addEventListener('room-permission-change', handleCustomEvent as EventListener)
		window.addEventListener('storage', handleStorageEvent)
		
		return () => {
			window.removeEventListener('room-permission-change', handleCustomEvent as EventListener)
			window.removeEventListener('storage', handleStorageEvent)
			if (channel) {
				channel.close()
			}
		}
	}, [permission, activeRoomId])

	// 添加加载超时保护，但只在首次加载时显示
	const [loadingTimeout, setLoadingTimeout] = useState(false)
	const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false)
	
	useEffect(() => {
		if (isLoaded && !hasInitiallyLoaded) {
			setHasInitiallyLoaded(true)
		}
	}, [isLoaded, hasInitiallyLoaded])
	
	useEffect(() => {
		const timeout = setTimeout(() => {
			if (!isLoaded && !hasInitiallyLoaded) {
				console.warn('⚠️ Clerk加载超时，强制进入匿名模式')
				setLoadingTimeout(true)
			}
		}, 10000) // 10秒超时
		
		return () => clearTimeout(timeout)
	}, [isLoaded, hasInitiallyLoaded])

	// 临时移除加载状态检查，直接进入应用
	// if (!isLoaded && !loadingTimeout && !hasInitiallyLoaded) {
	// 	return (
	// 		<div style={{ 
	// 			position: 'fixed', 
	// 			top: '50%', 
	// 			left: '50%', 
	// 			transform: 'translate(-50%, -50%)',
	// 			textAlign: 'center'
	// 		}}>
	// 			<div>Loading...</div>
	// 			<div style={{ fontSize: '0.8em', color: '#666', marginTop: '10px' }}>
	// 				正在初始化用户认证...
	// 			</div>
	// 		</div>
	// 	)
	// }


	// 如果是发布路由，直接渲染发布页面
	if (parsedRoute.type === 'snapshot') {
		return <PublishPage />
	}

	// Early return for plaza list view
	if (showPlazaList) {
		return (
			<PlazaList 
				onRoomSelect={handlePlazaRoomSelect}
				onBackToApp={handleBackToApp}
			/>
		)
	}
	
	return (
		<>

			{/* User Gallery */}
			{showUserGallery && userGalleryTargetUserId && (
				<div style={{
					position: 'fixed',
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					backgroundColor: 'rgba(0, 0, 0, 0.5)',
					zIndex: 100000,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center'
				}}>
					<div style={{
						width: '90%',
						maxWidth: '1200px',
						height: '80%',
						backgroundColor: 'white',
						borderRadius: '12px',
						display: 'flex',
						flexDirection: 'column',
						overflow: 'hidden',
						boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
					}}>
						<UserRoom 
							currentUserId={user?.id}
							targetUserId={userGalleryTargetUserId}
							onRoomChange={handleRoomChange}
							onClose={() => {
								setShowUserGallery(false)
								setUserGalleryTargetUserId(null)
							}}
							onShowUserGallery={handleShowUserGallery}
						/>
					</div>
				</div>
			)}

			{/* Room Manager */}
			{showRoomManager && (
				<div style={{
					position: 'fixed',
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					backgroundColor: 'rgba(0, 0, 0, 0.5)',
					zIndex: 2500,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center'
				}}>
					<div style={{
						width: '90%',
						maxWidth: '1200px',
						height: '80%',
						backgroundColor: 'white',
						borderRadius: '12px',
						display: 'flex',
						flexDirection: 'column',
						overflow: 'hidden',
						boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
					}}>
						<RoomManager 
							currentRoomId={activeRoomId}
							onRoomChange={handleRoomChange}
							onRoomCreate={handleRoomCreate}
							onClose={() => setShowRoomManager(false)}
						/>
					</div>
				</div>
			)}

			{/* CurrentRoomInfo作为弹出面板渲染，通过桥接触发 */}
			{isCurrentRoomExpanded && (
				<div style={{
					position: 'fixed',
					top: '8px',
					left: '50%',
					transform: 'translateX(-50%)',
					zIndex: 1001,
					pointerEvents: 'auto'
				}}>
					<CurrentRoomInfo 
						roomId={activeRoomId} 
						editor={globalEditor || editorRef.current}
						onShowUserGallery={handleShowUserGallery}
						onShowRoomManager={() => setShowRoomManager(!showRoomManager)}
						permission={permission}
					/>
				</div>
			)}




			
			<div style={{ 
				height: '100%',
				position: 'relative',
				overflow: 'hidden'
			}}>
				<TldrFileIntegration>
				<Tldraw
					// Force re-render when permission changes to update tool filtering
					key={`tldraw-${permission}-${activeRoomId}`}
					// we can pass the connected store into the Tldraw component which will handle
					// loading states & enable multiplayer UX like cursors & a presence menu
					store={store}
					// Replace default PageMenu with our WorkSpace and add file toolbar
					components={{
						// 浏览模式下隐藏样式面板与操作面板，仅保留手形/激光笔
						// 仅在"非房主"的浏览模式下隐藏这些面板；房主不隐藏
						...(permission === 'viewer' && !isOwnerOfRoom(activeRoomId)
							? { StylePanel: null as any, QuickActions: null as any, ActionsMenu: null as any }
							: {}),
						PageMenu: () => (
							<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
						<WorkSpace permission={permission} roomPermissionData={roomPermissionData as any} />
							</div>
						),
						// 自定义主菜单，添加文件操作
						MainMenu: () => {
							const editor = useEditor()
							return (
								<DefaultMainMenu>
									
									{/* 文件操作菜单组 */}
									<TldrawUiMenuGroup id="file-operations">
										<TldrawUiMenuSubmenu id="file-operations" label="文件操作">
											<TldrawUiMenuItem
												id="download-tldr"
												label="下载 .tldr 文件"
												icon="export"
												onSelect={async () => {
													try {
														const { simpleFileHandler } = await import('./SimpleFileHandler')
														await simpleFileHandler.downloadTldrFile(editor)
													} catch (error) {
														console.error('下载失败:', error)
														alert('下载失败：' + (error as Error).message)
													}
												}}
											/>
											<TldrawUiMenuItem
												id="import-tldr"
												label="导入 .tldr 文件"
												icon="folder"
												onSelect={async () => {
													try {
														const { simpleFileHandler } = await import('./SimpleFileHandler')
														const { directRoomLoader } = await import('./DirectRoomLoader')
														
														const files = await simpleFileHandler.openFileDialog()
														if (files.length === 0) return
														
														const file = files[0]
														const result = await simpleFileHandler.importTldrFileAsRoom(
															file,
															user?.id,
															user?.fullName || user?.firstName || 'User'
														)
														
														const roomUrlWithData = directRoomLoader.generateRoomUrlWithData(
															result.roomId, 
															result.tldrData, 
															result.roomName
														)
														
														setTimeout(() => {
															window.location.href = roomUrlWithData
														}, 500)
													} catch (error) {
														console.error('导入失败:', error)
														alert('导入失败：' + (error as Error).message)
													}
												}}
											/>
										</TldrawUiMenuSubmenu>
									</TldrawUiMenuGroup>
									
									{/* 渲染原生菜单内容 */}
									<DefaultMainMenuContent />
									

									
									{/* 用户账户菜单组 */}
									<TldrawUiMenuGroup id="user-account">
										{/* 未登录时显示登录按钮 */}
										{!user && (
											<TldrawUiMenuItem
												id="signin"
												label="👤 登录"
												icon="user"
												onSelect={() => {
													// 直接打开登录面板
													if (openSignIn) {
														try {
															openSignIn({});
														} catch (error) {
															console.log('openSignIn failed');
														}
													}
												}}
											/>
										)}
										
										{/* 已登录时显示用户信息 */}
										{user && (
											<>
												<TldrawUiMenuItem
													id="user-info"
													label={`👤 ${user?.fullName || user?.firstName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'User'}`}
													icon="user"
													onSelect={() => {
														// 直接打开用户配置/账户面板
														try {
															openUserProfile?.({});
														} catch {
															const hiddenUserButton = document.querySelector('.cl-userButtonTrigger') as HTMLElement
															hiddenUserButton?.click()
														}
													}}
												/>
												
												{/* 管理账户 */}
												<TldrawUiMenuItem
													id="manage-account"
													label="⚙️ 管理账户"
													icon="settings"
													onSelect={() => {
														try {
															openUserProfile?.({});
														} catch (error) {
															console.log('openUserProfile failed');
														}
													}}
												/>
												
												{/* 退出登录 */}
												<TldrawUiMenuItem
													id="signout"
													label="🚪 退出登录"
													icon="external-link"
													onSelect={() => {
														// 使用 Clerk 的 signOut 方法
														if (signOut) {
															signOut();
														}
													}}
												/>
											</>
										)}
									</TldrawUiMenuGroup>
									
									{/* 管理员链接 */}
									{user && (user?.publicMetadata?.role === 'admin' ||
									  user?.emailAddresses?.[0]?.emailAddress?.includes('admin') ||
									  ['010.carpe.diem@gmail.com', '1903399675@qq.com', 'admin@example.com', 'administrator@tldraw.com'].includes(user?.emailAddresses?.[0]?.emailAddress || '')) && (
										<TldrawUiMenuGroup id="admin-group">
											<TldrawUiMenuItem
												id="admin"
												label="🔧 后台管理"
												icon="settings"
												onSelect={() => {
													window.open(
														typeof window !== 'undefined' && window.location.hostname === 'localhost'
															? 'http://localhost:8787/admin'
															: '/admin',
														'_blank'
													)
												}}
											/>
											<TldrawUiMenuItem
												id="check-data-sync"
												label="🔄 数据同步检查"
												icon="refresh-cw"
												onSelect={() => {
													DataSyncUtils.showSyncReport().catch(error => {
														alert('数据同步检查失败: ' + error.message)
													})
												}}
											/>
										</TldrawUiMenuGroup>
									)}
								</DefaultMainMenu>
							)
						},
						// 在Tldraw内部渲染RoomSettings以获取editor
											InFrontOfTheCanvas: () => (
						<>
							<RoomSettingsWrapper 
								activeRoomId={activeRoomId}
								user={user}
							/>
							{/* 协作者菜单 */}
							<div style={{
								position: 'fixed',
								top: '16px',
								right: '80px',
								zIndex: 1000
							}}>
								<CustomShareZone roomId={activeRoomId} />
							</div>
						</>
					),
											// 自定义ShareZone，包含协作者功能
					// ShareZone: () => {
					// 	return <CustomShareZone roomId={activeRoomId} />
					// },
					}}
				// Use overrides to control permissions and tools
				overrides={{
                    tools: (editor, tools) => {
                        // 检查是否为房主
                        const isOwner = isOwnerOfRoom(activeRoomId)
                        
                        // 房主拥有所有工具，不受权限限制
                        if (isOwner) {
                            return tools
                        }
						
                        if (permission === 'viewer') {
							// 访客浏览模式：只显示手和激光工具
							const allowedTools = ['hand', 'laser']
							const filteredTools: any = {}
							allowedTools.forEach(toolId => {
								if (tools[toolId]) {
									filteredTools[toolId] = tools[toolId]
								}
							})
							return filteredTools
						} else if (permission === 'assist') {
							// 辅作模式：允许大部分工具但有限制
							return tools
						}
						// 编辑模式: 返回所有工具
						return tools
					},
                    actions: (editor, actions) => {
                        // 检查是否为房主
                        const isOwner = isOwnerOfRoom(activeRoomId)
						// 文件操作功能 - 所有用户都可以使用
						const fileActions = {
							'download-tldr': {
								id: 'download-tldr',
								label: '下载 .tldr 文件',
								icon: 'export',
								onSelect: async () => {
									try {
										const { simpleFileHandler } = await import('./SimpleFileHandler')
										await simpleFileHandler.downloadTldrFile(editor)
									} catch (error) {
										console.error('下载失败:', error)
										alert('下载失败：' + (error as Error).message)
									}
								}
							},
							'import-tldr': {
								id: 'import-tldr',
								label: '导入 .tldr 文件',
								icon: 'folder',
								onSelect: async () => {
									try {
										const { simpleFileHandler } = await import('./SimpleFileHandler')
										const { directRoomLoader } = await import('./DirectRoomLoader')
										
										const files = await simpleFileHandler.openFileDialog()
										if (files.length === 0) return
										
										const file = files[0]
										const result = await simpleFileHandler.importTldrFileAsRoom(
											file,
											user?.id,
											user?.fullName || user?.firstName || 'User'
										)
										
										const roomUrlWithData = directRoomLoader.generateRoomUrlWithData(
											result.roomId, 
											result.tldrData, 
											result.roomName
										)
										
										setTimeout(() => {
											window.location.href = roomUrlWithData
										}, 500)
									} catch (error) {
										console.error('导入失败:', error)
										alert('导入失败：' + (error as Error).message)
									}
								}
							}
						}

                        // 统一的"锁定/解锁"权限校验（所有模式共用）：
                        // - 编辑模式：允许解锁
                        // - 其它模式：只有房主可以解锁历史元素
                        const guardToggleLock = (originalAction: any) => ({
							...originalAction,
							onSelect: async (source: any) => {
                                const selectedShapes = editor.getSelectedShapes()
                                const { roomUtils } = await import('./roomUtils')
                                const room = await roomUtils.getRoom(activeRoomId)
                                const userId = (window as any).__CURRENT_USER_ID__ || user?.id || null
                                const isOwner = !!userId && (room.ownerId === userId || room.owner === userId)
								
                                // 分离锁定与解锁
                                const shapesToUnlock = selectedShapes.filter(shape => shape.isLocked)
                                const shapesToLock = selectedShapes.filter(shape => !shape.isLocked)
								
                                // 非编辑模式：限制历史元素解锁
                                if (permission !== 'editor') {
                                  if (shapesToUnlock.length > 0 && room?.historyLocked && room.historyLockTimestamp) {
                                    const hasHistoryShapes = shapesToUnlock.some(shape =>
                                      shape.meta?.createdAt && shape.meta.createdAt <= room.historyLockTimestamp!
                                    )
                                    if (hasHistoryShapes && !isOwner) {
                                      alert('辅作/查看模式下只有房主可以解锁历史元素')
                                      return
                                    }
                                  }
                                }
								
								// 如果有需要锁定的形状，记录锁定者信息
								if (shapesToLock.length > 0 && userId) {
									const lockInfo = {
										lockedBy: userId,
										lockedAt: Date.now(),
										lockedByName: user?.fullName || user?.firstName || user?.username || '未知用户'
									}
									
									// 锁定形状并记录锁定者信息
									editor.updateShapes(
										shapesToLock.map(shape => ({
											id: shape.id,
											type: shape.type,
											isLocked: true,
											meta: {
												...shape.meta,
												lockInfo: lockInfo
											}
										}))
									)
									
									// 如果只是锁定操作，不需要继续执行原始动作
									if (shapesToUnlock.length === 0) {
										editor.setSelectedShapes([]) // 锁定后取消选择
										return
									}
								}
								
								// 验证通过，执行原始解锁动作
								return originalAction.onSelect?.(source)
							}
						})

                        // 房主拥有所有权限，不受限制
                        if (isOwner) {
                            return {
                                ...actions,
                                ...fileActions
                            }
                        }
                        
                        if (permission === 'viewer') {
							// 访客浏览模式：禁用所有编辑操作，除了toggle-lock（需要认证）
							const restrictedActions = ['delete', 'cut', 'copy', 'paste', 'duplicate', 'undo', 'redo']
							const filteredActions: any = {}
							Object.keys(actions).forEach(actionId => {
								if (!restrictedActions.includes(actionId)) {
                                    if (actionId === 'toggle-lock') {
                                        filteredActions[actionId] = guardToggleLock(actions[actionId])
									} else {
									filteredActions[actionId] = actions[actionId]
									}
								}
							})
							return {
								...filteredActions,
								...fileActions
							}
                        } else if (permission === 'assist') {
                            // Assist mode: 受历史锁定限制
							return {
								...actions,
                                'toggle-lock': guardToggleLock(actions['toggle-lock']),
								delete: {
									...actions.delete,
									onSelect: (source: any) => {
										// Only allow deletion of elements created by current user in assist mode
										if (roomPermissionData?.historyLocked) {
											const selectedShapes = editor.getSelectedShapes()
											const userCanDeleteAll = selectedShapes.every(shape => {
												// Check if shape was created by current user
												// In assist mode with history lock, only allow deletion of own shapes
												return shape.meta?.createdBy === user?.id
											})
											if (!userCanDeleteAll) {
												alert('辅作模式下只能删除自己创建的元素')
												return
											}
										}
										// Call original delete action
										return actions.delete.onSelect?.(source)
									}
								},
								...fileActions
							}
						}
						
                        // Editor mode: 允许自由解锁，但仍通过统一守卫记录锁定者信息
                        return {
                            ...actions,
                            'toggle-lock': guardToggleLock(actions['toggle-lock']),
                            ...fileActions
                        }
					}
				}}
                onMount={(editor) => {
					// Store editor reference for permission updates
					editorRef.current = editor
					// 也存储到全局变量和window对象，供其他组件访问
					globalEditor = editor
					;(window as any).globalEditor = editor
					;(window as any).editorRef = editorRef
					
					// 立即应用当前权限的只读状态，考虑房主身份
                    const isOwner = isOwnerOfRoom(activeRoomId)
					const shouldBeReadonly = permission === 'viewer' && !isOwner
					editor.updateInstanceState({ isReadonly: shouldBeReadonly })
					if (shouldBeReadonly) {
						editor.setCurrentTool('laser')
						console.log(`🔒 编辑器挂载: 访客浏览模式，已设为只读`)
					} else {
						console.log(`✏️ 编辑器挂载: ${permission} 模式，可编辑 (房主: ${isOwner})`)
					}
					
					// 强制刷新编辑器状态
					setTimeout(() => {
						if (editor && editor.updateInstanceState) {
							editor.updateInstanceState({ isReadonly: shouldBeReadonly })
							console.log(`🔄 延迟权限确认: ${permission}, 只读=${shouldBeReadonly} (房主: ${isOwner})`)
						}
					}, 100)
                  // 记录访客访问，并根据权限应用历史锁定限制（非房主）
                  ;(async () => {
                    try {
                      if (!activeRoomId) return
                      const room = await roomUtils.getRoom(activeRoomId)
                      const userId = user?.id || 'anonymous'
                      const userName = user?.fullName || user?.firstName || user?.username || '游客'
                      // 访客记录（房主也记录访问，用于会话统计）
                      trackVisit(activeRoomId, userId, userName)

                      // 如果房间历史被锁定，应用限制（房主身份检查在函数内部）
                      if (room?.historyLocked) {
                        await roomUtils.applyHistoryLockRestrictions(activeRoomId, editorRef.current)
                      }
                    } catch (e) {
                      console.warn('visit/permission bootstrap failed', e)
                    }
                  })()

                  // 监听权限与锁定变化，动态应用/解除限制
                  const handlePermissionEvent = async (event: CustomEvent) => {
                    try {
                      const detail = event.detail || {}
                      if (!detail || detail.roomId !== activeRoomId) return
                      const { roomUtils } = await import('./roomUtils')
                      if (detail.permission === 'editor') {
                        // 直接执行解锁，确保立即生效
                        await roomUtils.unlockHistory(activeRoomId, editorRef.current, user?.id, true)
                      } else if (detail.permission === 'assist') {
                        // 只有辅作模式需要历史锁定限制（房主身份检查在函数内部）
                        await roomUtils.applyHistoryLockRestrictions(activeRoomId, editorRef.current)
                      } else if (detail.historyLocked && detail.permission !== 'viewer') {
                        // 单独的历史锁定事件（但浏览模式除外）
                        await roomUtils.applyHistoryLockRestrictions(activeRoomId, editorRef.current)
                      }
                    } catch (e) {
                      console.warn('permission event handling failed', e)
                    }
                  }
                  window.addEventListener('simplePermissionChanged', handlePermissionEvent as EventListener)
                  window.addEventListener('roomDataChanged', handlePermissionEvent as EventListener)

                  // 清理监听
                  editor.on('dispose', () => {
                    window.removeEventListener('simplePermissionChanged', handlePermissionEvent as EventListener)
                    window.removeEventListener('roomDataChanged', handlePermissionEvent as EventListener)
                  })
					
					// 定义通知函数
					const showSnapshotNotification = () => {
						const notification = document.createElement('div')
						notification.style.cssText = `
							position: fixed;
							top: 20px;
							right: 20px;
							background: #3b82f6;
							color: white;
							padding: 16px 20px;
							border-radius: 8px;
							font-size: 14px;
							font-weight: 500;
							z-index: 10000;
							box-shadow: 0 4px 12px rgba(0,0,0,0.15);
							max-width: 320px;
							line-height: 1.4;
						`
						notification.innerHTML = `
							<div style="display: flex; align-items: flex-start; gap: 8px;">
								<span style="font-size: 16px;">📸</span>
								<div>
									<div style="font-weight: 600; margin-bottom: 4px;">
										发布白板展示版本
									</div>
									<div style="font-size: 12px; opacity: 0.9;">
										这是静态快照，您可以根据权限进行编辑<br>
										但修改内容不会同步到原始房间
									</div>
								</div>
							</div>
						`
						document.body.appendChild(notification)
						
						// 8秒后自动移除提示
						setTimeout(() => {
							if (notification.parentNode) {
								notification.parentNode.removeChild(notification)
							}
						}, 8000)
					}
					
					const showLiveNotification = (roomId: string) => {
						const notification = document.createElement('div')
						notification.style.cssText = `
							position: fixed;
							top: 50%;
							left: 50%;
							transform: translate(-50%, -50%);
							background: white;
							padding: 2rem;
							border-radius: 12px;
							box-shadow: 0 8px 32px rgba(0,0,0,0.1);
							z-index: 10000;
							text-align: center;
							min-width: 350px;
							border: 2px solid #10b981;
						`
						notification.innerHTML = `
							<div style="font-size: 2.5rem; margin-bottom: 1rem;">📡</div>
							<div style="font-size: 1.3rem; font-weight: 600; color: #10b981; margin-bottom: 1rem;">
								房主正在直播中！
							</div>
							<div style="font-size: 1rem; color: #374151; margin-bottom: 1.5rem;">
								房主已切换到直播模式，点击下方按钮进入直播房间查看最新内容
							</div>
							<div style="display: flex; gap: 1rem; justify-content: center;">
								<button onclick="this.parentNode.parentNode.parentNode.removeChild(this.parentNode.parentNode)" style="
									background: #6b7280;
									color: white;
									border: none;
									padding: 0.75rem 1.5rem;
									border-radius: 6px;
									cursor: pointer;
									font-size: 1rem;
									font-weight: 500;
								">
									继续查看快照
								</button>
								<button onclick="window.location.href='/r/${roomId}'" style="
									background: #10b981;
									color: white;
									border: none;
									padding: 0.75rem 1.5rem;
									border-radius: 6px;
									cursor: pointer;
									font-size: 1rem;
									font-weight: 500;
									animation: pulse 2s infinite;
								">
									🔴 进入直播
								</button>
							</div>
						`
						
						// 添加脉冲动画样式
						const style = document.createElement('style')
						style.textContent = `
							@keyframes pulse {
								0%, 100% { transform: scale(1); }
								50% { transform: scale(1.05); }
							}
						`
						document.head.appendChild(style)
						
						document.body.appendChild(notification)
						
						// 20秒后自动移除
						setTimeout(() => {
							if (notification.parentNode) {
								notification.parentNode.removeChild(notification)
							}
						}, 20000)
					}
					
					// Handle routes with viewport and/or page information (both board and direct/r/ routes)
					if ((parsedRoute.type === 'board' || parsedRoute.type === 'direct') && (parsedRoute.viewport || parsedRoute.pageId)) {
						console.log(`${parsedRoute.type} route detected with viewport/page:`, { 
							viewport: parsedRoute.viewport, 
							pageId: parsedRoute.pageId 
						})
						// Apply viewport state after editor initialization
						setTimeout(() => {
							const viewportState = {
								x: parsedRoute.viewport?.x || 0,
								y: parsedRoute.viewport?.y || 0,
								width: parsedRoute.viewport?.width || 1920,
								height: parsedRoute.viewport?.height || 1080,
								pageId: parsedRoute.pageId || 'default'
							}
							console.log('🎯 Applying viewport state from URL:', viewportState)
							applyViewportState(editor, viewportState)
						}, 500) // Increased delay to ensure editor is fully ready
					}
					
					// 暴露调试功能到全局
					;(window as any).debugRoom = () => roomUtils.debugRoomInfo(activeRoomId)
					;(window as any).debugPages = () => {
						const pages = editor.getPages()
						const currentPage = editor.getCurrentPage()
						console.log('📄 All pages:', pages.map((p: any, index: number) => ({ 
							index, 
							id: p.id, 
							name: p.name,
							isCurrent: p.id === currentPage.id
						})))
						return { pages, currentPage }
					}
					;(window as any).testPageSwitch = (pageIdOrIndex: string | number) => {
						const pages = editor.getPages()
						if (typeof pageIdOrIndex === 'number') {
							// 按索引切换
							if (pages[pageIdOrIndex]) {
								editor.setCurrentPage(pages[pageIdOrIndex].id)
								console.log(`✅ Switched to page index ${pageIdOrIndex}:`, pages[pageIdOrIndex].id)
							} else {
								console.warn(`❌ Page index ${pageIdOrIndex} not found`)
							}
						} else {
							// 按ID切换
							const targetPage = pages.find((p: any) => p.id === pageIdOrIndex)
							if (targetPage) {
								editor.setCurrentPage(pageIdOrIndex)
								console.log(`✅ Switched to page ID:`, pageIdOrIndex)
							} else {
								console.warn(`❌ Page ID ${pageIdOrIndex} not found`)
							}
						}
					}
					;(window as any).testShareURL = () => {
						console.log('🧪 Testing share URL generation...')
						const pages = editor.getPages()
						const currentPage = editor.getCurrentPage()
						const currentPageId = editor.getCurrentPageId()
						console.log('Current page info:', { currentPage, currentPageId })
						const viewport = editor.getViewportScreenBounds()
						console.log('Current viewport:', viewport)
						// 模拟分享链接生成
						const shareUrl = window.location.origin + `/r/${activeRoomId}?p=${currentPageId}&d=v0.0.100.100`
						console.log('Generated test share URL:', shareUrl)
						return { pages, currentPage, currentPageId, viewport, shareUrl }
					}
					;(window as any).testWorkspaceInfo = () => {
						console.log('🧪 Testing workspace info...')
						const workspaceInfo = roomUtils.getCurrentWorkspaceInfo(activeRoomId, editor)
						console.log('Workspace info:', workspaceInfo)
						return workspaceInfo
					}
					;(window as any).validateRooms = async () => {
						console.log('🔧 Validating all rooms...')
						await roomUtils.validateAndFixRoomIds()
						const pageIndex = await roomUtils.buildRoomPageIndex(activeRoomId, editor)
						console.log('Page index:', pageIndex)
						return { pageIndex }
					}
					
					// 检查URL中是否有tldr数据需要加载（用于导入的房间）
					setTimeout(async () => {
						try {
							const loaded = await directRoomLoader.loadRoomDataFromUrl(editor)
							if (loaded) {
								console.log('🎉 从URL成功加载房间数据!')
							}
						} catch (error) {
							console.error('❌ 从URL加载房间数据失败:', error)
						}
					}, 1500)

					// 检查是否为快照路由，如果是则加载快照数据
					if (parsedRoute.type === 'snapshot') {
						// 创建加载提示
						const loadingDiv = document.createElement('div')
						loadingDiv.id = 'snapshot-loading'
						loadingDiv.style.cssText = `
							position: fixed;
							top: 50%;
							left: 50%;
							transform: translate(-50%, -50%);
							background: white;
							padding: 2rem;
							border-radius: 12px;
							box-shadow: 0 8px 32px rgba(0,0,0,0.1);
							z-index: 10000;
							text-align: center;
							min-width: 300px;
						`
						loadingDiv.innerHTML = `
							<div style="font-size: 2rem; margin-bottom: 1rem;">📸</div>
							<div style="font-size: 1.1rem; font-weight: 500; color: #374151; margin-bottom: 0.5rem;">
								正在加载快照...
							</div>
							<div style="font-size: 0.9rem; color: #6b7280;">
								请稍候，正在从本地存储加载房间快照
							</div>
						`
						document.body.appendChild(loadingDiv)

						setTimeout(async () => {
							try {
								// 从快照房间ID中提取原始房间ID
								const baseRoomId = activeRoomId.replace('-snapshot', '')
								console.log('📸 检测到快照路由，加载快照数据:', { 
									snapshotRoomId: activeRoomId, 
									baseRoomId 
								})
								
								// 调试：检查localStorage中的快照数据
								const snapshotKey = `snapshot_${baseRoomId}`
								const snapshotData = localStorage.getItem(snapshotKey)
								console.log('🔍 调试快照数据:', {
									snapshotKey,
									hasSnapshot: !!snapshotData,
									snapshotSize: snapshotData ? snapshotData.length : 0
								})
								
								// 列出所有snapshot相关的localStorage键
								const allKeys = Object.keys(localStorage).filter(key => key.includes('snapshot'))
								console.log('📋 所有快照相关的localStorage键:', allKeys)
								
								const snapshot = snapshotManager.getSnapshot(baseRoomId)
								
								if (snapshot) {
									console.log('📂 找到快照，开始加载:', snapshot.version)
									
									// 更新加载提示
									loadingDiv.innerHTML = `
										<div style="font-size: 2rem; margin-bottom: 1rem;">📂</div>
										<div style="font-size: 1.1rem; font-weight: 500; color: #374151; margin-bottom: 0.5rem;">
											正在应用快照数据...
										</div>
										<div style="font-size: 0.9rem; color: #6b7280;">
											版本: ${snapshot.version}
										</div>
									`
									
									await snapshotManager.loadSnapshotToEditor(editor, snapshot)
									console.log('🎉 快照加载完成!')
									
									// 根据房间权限设置编辑模式，而不是强制只读
									try {
										const { SimplePermissionManager } = await import('./SimplePermissionManager')
										const permissionConfig = await SimplePermissionManager.getPermissionConfig(baseRoomId)
										
										if (permissionConfig && permissionConfig.permission !== 'viewer') {
											console.log('✅ 发布白板房间允许编辑，权限:', permissionConfig.permission)
											editor.updateInstanceState({ isReadonly: false })
										} else {
											console.log('🔒 发布白板房间设置为只读，权限:', permissionConfig?.permission || 'none')
											editor.updateInstanceState({ isReadonly: true })
										}
									} catch (error) {
										console.warn('⚠️ 无法获取房间权限配置，默认设置为只读:', error)
										editor.updateInstanceState({ isReadonly: true })
									}
									
									// 移除加载提示
									if (loadingDiv.parentNode) {
										loadingDiv.parentNode.removeChild(loadingDiv)
									}
									
									// 创建持久的发布白板模式指示器
									const createPlazaIndicator = () => {
										const indicator = document.createElement('div')
										indicator.id = 'plaza-mode-indicator'
										indicator.style.cssText = `
											position: fixed;
											bottom: 20px;
											left: 20px;
											background: rgba(59, 130, 246, 0.9);
											color: white;
											padding: 8px 12px;
											border-radius: 20px;
											font-size: 12px;
											font-weight: 500;
											z-index: 1000;
											backdrop-filter: blur(10px);
											display: flex;
											align-items: center;
											gap: 6px;
											box-shadow: 0 2px 8px rgba(0,0,0,0.15);
											user-select: none;
											pointer-events: none;
										`
										indicator.innerHTML = `
											<span style="font-size: 14px;">📸</span>
											<span>发布白板展示模式</span>
										`
										document.body.appendChild(indicator)
										return indicator
									}
									
									// 创建指示器
									createPlazaIndicator()
									
									// 检查是否有直播通知
									const liveNotificationData = localStorage.getItem(`liveNotification_${activeRoomId}`)
									if (liveNotificationData) {
										try {
											const notification = JSON.parse(liveNotificationData)
											// 检查通知是否在最近5分钟内
											const isRecent = (Date.now() - notification.timestamp) < 5 * 60 * 1000
											if (isRecent && notification.mode === 'live') {
												// 显示直播通知
												setTimeout(() => {
													showLiveNotification(activeRoomId)
												}, 1000)
											} else {
												// 清理过期通知，显示快照模式提示
												localStorage.removeItem(`liveNotification_${activeRoomId}`)
												setTimeout(() => {
													showSnapshotNotification()
												}, 1000)
											}
										} catch (e) {
											// 通知数据格式错误，显示快照模式提示
											setTimeout(() => {
												showSnapshotNotification()
											}, 1000)
										}
									} else {
										// 没有直播通知，显示快照模式提示
										setTimeout(() => {
											showSnapshotNotification()
										}, 1000)
									}
									
								} else {
									console.warn('⚠️ 未找到房间快照')
									console.log('🔍 调试信息 - 快照查找失败:', {
										baseRoomId,
										snapshotKey: `snapshot_${baseRoomId}`,
										allSnapshotKeys: Object.keys(localStorage).filter(k => k.startsWith('snapshot_'))
									})
									
									// 更新加载提示为错误状态
									loadingDiv.innerHTML = `
										<div style="font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
										<div style="font-size: 1.1rem; font-weight: 500; color: #dc2626; margin-bottom: 1rem;">
											未找到快照数据
										</div>
										<div style="font-size: 0.9rem; color: #6b7280; margin-bottom: 1.5rem;">
											此房间尚未发布快照，请联系房主发布更新
										</div>
										<button onclick="window.location.href='/r/${baseRoomId}'" style="
											background: #3b82f6;
											color: white;
											border: none;
											padding: 0.5rem 1rem;
											border-radius: 6px;
											cursor: pointer;
											font-size: 0.9rem;
										">
											尝试访问直播房间
										</button>
									`
									
									// 10秒后自动移除
									setTimeout(() => {
										if (loadingDiv.parentNode) {
											loadingDiv.parentNode.removeChild(loadingDiv)
										}
									}, 10000)
								}
							} catch (error) {
								console.error('❌ 加载快照失败:', error)
								// 更新加载提示为错误状态
								loadingDiv.innerHTML = `
									<div style="font-size: 2rem; margin-bottom: 1rem;">❌</div>
									<div style="font-size: 1.1rem; font-weight: 500; color: #dc2626; margin-bottom: 1rem;">
										快照加载失败
									</div>
									<div style="font-size: 0.9rem; color: #6b7280; margin-bottom: 1.5rem;">
										${(error as Error).message}
									</div>
									<button onclick="window.location.reload()" style="
										background: #3b82f6;
										color: white;
										border: none;
										padding: 0.5rem 1rem;
										border-radius: 6px;
										cursor: pointer;
										font-size: 0.9rem;
									">
										重新加载
									</button>
								`
							}
						}, 1000) // 给编辑器更多时间初始化
					}

					// 全局测试函数：验证权限系统
					;(window as any).testPermissionSystem = async () => {
						console.log('=== 权限系统完整测试 ===')
						
						if (!activeRoomId) {
							console.error('❌ 没有活跃的房间')
							return false
						}
						
						try {
							const room = await roomUtils.getRoom(activeRoomId)
							if (!room) {
								console.error('❌ 无法获取房间数据')
								return false
							}
							
							console.log('✅ 1. 房间基本信息:')
							console.log('  - 房间名称:', room.name)
							console.log('  - 房主ID:', room.ownerId || room.owner)
							console.log('  - 当前用户ID:', user?.id)
							console.log('  - 是否为房主:', user?.id && (room.ownerId === user.id || room.owner === user.id))
							
							console.log('✅ 2. 历史锁定状态:')
							console.log('  - 是否锁定:', room.historyLocked)
							console.log('  - 锁定时间:', room.historyLockTimestamp ? new Date(room.historyLockTimestamp).toLocaleString() : '未锁定')
							console.log('  - 锁定人ID:', room.historyLockedBy)
							console.log('  - 锁定人姓名:', room.historyLockedByName)
							console.log('  - 当前用户是否为锁定人:', user?.id && room.historyLockedBy === user.id)
							
							console.log('✅ 3. 权限验证结果:')
							const userId = user?.id
							const isOwner = userId && (room.ownerId === userId || room.owner === userId)
							const isLocker = userId && room.historyLockedBy === userId
							const canUnlockHistory = isOwner || isLocker
							
							console.log('  - 可以解锁历史:', canUnlockHistory)
							console.log('  - 解锁依据:', isOwner ? '房主权限' : isLocker ? '锁定人权限' : '无权限')
							
							console.log('✅ 4. localStorage数据同步检查:')
							const localStorageRooms = JSON.parse(localStorage.getItem('tldraw-rooms') || '[]')
							const localRoom = localStorageRooms.find((r: any) => r.id === activeRoomId)
							console.log('  - localStorage房间数据存在:', !!localRoom)
							if (localRoom) {
								console.log('  - 本地房主ID:', localRoom.ownerId || localRoom.owner)
								console.log('  - 本地历史锁定:', localRoom.historyLocked)
								console.log('  - 本地锁定人:', localRoom.historyLockedBy)
							}
							
							console.log('✅ 5. 编辑器权限配置:')
							console.log('  - 当前权限模式:', permission)
							console.log('  - 只读状态:', permission === 'viewer')
							console.log('  - 权限数据:', roomPermissionData)
							
							// 测试toggle-lock权限验证
							if (room.historyLocked && room.historyLockTimestamp) {
								console.log('🔒 6. Toggle-lock权限验证测试:')
								console.log('  - 历史已锁定，测试解锁权限')
								console.log('  - 房主权限:', isOwner)
								console.log('  - 锁定人权限:', isLocker)
								console.log('  - 可以解锁历史元素:', canUnlockHistory)
								
								if (!canUnlockHistory) {
									console.log('  ⚠️  当前用户无权解锁历史元素（正确行为）')
								} else {
									console.log('  ✅ 当前用户有权解锁历史元素')
								}
							} else {
								console.log('🔓 6. 历史未锁定，所有用户都可以使用toggle-lock')
							}
							
							console.log('=== 权限系统测试完成 ===')
							return true
							
						} catch (error) {
							console.error('❌ 权限系统测试失败:', error)
							return false
						}
					}
					
					// Set readonly state based on permission and owner status (isOwner already declared above)
					const isReadonly = permission === 'viewer' && !isOwner
					editor.updateInstanceState({ isReadonly })
					
					// Add shape creation listener to tag shapes with creator in assist mode
					if (permission === 'assist' || permission === 'editor') {
						const handleShapeChange = () => {
							const currentShapes = editor.getCurrentPageShapes()
							currentShapes.forEach(shape => {
								// Tag new shapes with creator ID if not already tagged
								if (!shape.meta?.createdBy && user?.id) {
									editor.updateShape({
										...shape,
										meta: {
											...shape.meta,
											createdBy: user.id,
											createdAt: Date.now()
										}
									})
								}
							})
						}
						
						// Listen for shape changes
						editor.on('change', handleShapeChange)
					}
					
                    // 历史锁定模式 - 基于时间戳控制历史内容编辑
                    // 编辑模式完全不受历史锁定影响；房主也不受影响
                    if (permission !== 'editor' && !isOwner && roomPermissionData?.historyLocked && roomPermissionData?.historyLockTimestamp) {
						console.log('History lock enabled - restricting edit capabilities based on timestamp')
						
						// 获取当前房间数据用于检查
						const getCurrentRoom = async () => {
							try {
								return await roomUtils.getRoom(activeRoomId)
							} catch (error) {
								console.error('Error getting room for history lock check:', error)
								return null
							}
						}
						
						// 保留原始方法引用
						const originalDeleteShape = editor.deleteShape
						const originalDeleteShapes = editor.deleteShapes
						const originalUpdateShape = editor.updateShape
						const originalUpdateShapes = editor.updateShapes
						
						// 重写删除方法，检查历史锁定时间戳
						editor.deleteShape = async (shapeId: string) => {
							const shape = editor.getShape(shapeId)
							const room = await getCurrentRoom()
							if (shape && room) {
								const { canEdit, reason } = roomUtils.canEditShape(shape, room)
								if (canEdit) {
									return originalDeleteShape.call(editor, shapeId)
								}
								alert(reason || '无法删除历史锁定之前的元素')
								return editor
							}
							return originalDeleteShape.call(editor, shapeId)
						}
						
						editor.deleteShapes = async (shapeIds: string[]) => {
							const room = await getCurrentRoom()
							if (!room) {
								return originalDeleteShapes.call(editor, shapeIds)
							}
							
							// 筛选出可以删除的元素
							const editableShapeIds: string[] = []
							const blockedShapeIds: string[] = []
							
							for (const shapeId of shapeIds) {
								const shape = editor.getShape(shapeId)
								if (shape) {
									const { canEdit } = roomUtils.canEditShape(shape, room)
									if (canEdit) {
										editableShapeIds.push(shapeId)
									} else {
										blockedShapeIds.push(shapeId)
									}
								}
							}
							
							if (editableShapeIds.length === 0) {
								alert('选中的元素都在历史锁定时间之前创建，无法删除')
								return editor
							}
							
							if (blockedShapeIds.length > 0) {
								alert(`${blockedShapeIds.length} 个元素在历史锁定之前创建，已跳过删除`)
							}
							
							return originalDeleteShapes.call(editor, editableShapeIds)
						}
						
						// 重写更新方法，检查历史锁定时间戳
						editor.updateShape = async (partial: any) => {
							const shape = editor.getShape(partial.id)
							const room = await getCurrentRoom()
							if (shape && room) {
								const { canEdit, reason } = roomUtils.canEditShape(shape, room)
								if (canEdit) {
									return originalUpdateShape.call(editor, partial)
								}
								alert(reason || '无法修改历史锁定之前的元素')
								return editor
							}
							return originalUpdateShape.call(editor, partial)
						}
						
						editor.updateShapes = async (partials: any[]) => {
							const room = await getCurrentRoom()
							if (!room) {
								return originalUpdateShapes.call(editor, partials)
							}
							
							// 筛选出可以更新的元素
							const editablePartials: any[] = []
							const blockedCount = partials.length
							
							for (const partial of partials) {
								const shape = editor.getShape(partial.id)
								if (shape) {
									const { canEdit } = roomUtils.canEditShape(shape, room)
									if (canEdit) {
										editablePartials.push(partial)
									}
								}
							}
							
							if (editablePartials.length === 0) {
								alert('选中的元素都在历史锁定时间之前创建，无法修改')
								return editor
							}
							
							if (editablePartials.length < blockedCount) {
								alert(`${blockedCount - editablePartials.length} 个元素在历史锁定之前创建，已跳过修改`)
							}
							
							return originalUpdateShapes.call(editor, editablePartials)
						}
					}

                    // 浏览模式：本质用编辑器，但在 overrides.tools/actions 已限制访客工具/动作，这里不做全局拦截
					
					// when the editor is ready, we need to register our bookmark unfurling service
					editor.registerExternalAssetHandler('url', getBookmarkPreview)
					
					// Set user info for presence
					if (user) {
						// Generate stable color for this user if not already generated
						if (!userColorRef.current) {
							userColorRef.current = '#' + Math.floor(Math.random()*16777215).toString(16)
						}
						
						// 获取用户名，尝试多种方式
						const userName = user.fullName || 
							user.firstName || 
							user.username ||
							user.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 
							'User'
						
						console.log('Setting user preferences:', {
							id: user.id,
							name: userName,
							user: user,
							fullName: user.fullName,
							firstName: user.firstName,
							username: user.username,
							emailAddresses: user.emailAddresses,
							primaryEmail: user.emailAddresses?.[0]?.emailAddress
						})
						
						// 立即设置用户偏好
						editor.user.updateUserPreferences({
							id: user.id,
							name: userName,
							color: userColorRef.current,
						})
						
						// 强制更新协作状态
						setTimeout(() => {
							console.log('Force updating collaboration state with user:', userName)
							editor.user.updateUserPreferences({
								id: user.id,
								name: userName,
								color: userColorRef.current,
							})
						}, 100)
					} else {
						// For anonymous users, generate stable ID and color
						if (!anonymousIdRef.current) {
							anonymousIdRef.current = 'anonymous-' + Math.random().toString(36).substr(2, 9)
						}
						editor.user.updateUserPreferences({
							id: anonymousIdRef.current,
							name: 'Anonymous',
							color: '#888888',
						})
					}
				}}
				/>
				</TldrFileIntegration>
			</div>
		</>
	)
}

function App() {
	return (
		<div style={{ position: 'fixed', inset: 0 }}>
			<TldrawApp />
		</div>
	)
}

export default App
