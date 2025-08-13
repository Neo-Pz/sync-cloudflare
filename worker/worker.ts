import { handleUnfurlRequest } from 'cloudflare-workers-unfurl'
import { AutoRouter, error, IRequest } from 'itty-router'
import { handleAssetDownload, handleAssetUpload } from './assetUploads'
import { RoomService } from './roomService'
import { TldrFileManager } from './tldrFileManager'
import { PublishRequestService } from './publishRequestService'
import { Env } from './types'
import { requireAdmin, logAdminAction, AdminAuthRequest } from './adminAuth'
import { createCorsResponse, createOptionsResponse, getCorsConfig } from './corsConfig'

// make sure our sync durable object is made available to cloudflare
export { TldrawDurableObject } from './TldrawDurableObject'

// Cache bust: Force new deployment 2025-07-26-15:30 - Added new board URL format support

// Board URL 解析函数
function parseBoardPath(boardPath: string): { roomId: string, pageId?: string, viewport?: { x: number, y: number, width: number, height: number } } | null {
  try {
    console.log(`🔍 parseBoardPath: Input boardPath = "${boardPath}"`)
    const parts = boardPath.split('.')
    console.log(`🔍 parseBoardPath: Split parts =`, parts)
    
    if (parts.length < 1) {
      console.log(`❌ parseBoardPath: No parts found`)
      return null
    }
    
    const result: any = {
      roomId: parts[0]
    }
    console.log(`🔍 parseBoardPath: roomId = "${result.roomId}"`)
    
    let currentIndex = 1
    
    // 检查是否有视窗信息（以v开头）
    const viewportIndex = parts.findIndex(part => part.startsWith('v'))
    console.log(`🔍 parseBoardPath: viewportIndex = ${viewportIndex}`)
    
    // 解析页面索引：/board/roomId[.pageIndex][.vx.y.w.h]
    if (viewportIndex > 1) {
      // 有页面索引，位于roomId和viewport之间
      const pageIndexStr = parts[1]
      const pageIndex = parseInt(pageIndexStr, 10)
      console.log(`🔍 parseBoardPath: pageIndexStr = "${pageIndexStr}", parsed = ${pageIndex}`)
      if (!isNaN(pageIndex)) {
        result.pageId = `page:${pageIndex}`
        console.log(`✅ parseBoardPath: Set pageId = "${result.pageId}"`)
      }
    } else if (parts.length > 1 && viewportIndex === -1) {
      // 没有viewport信息，但可能有页面索引
      const pageIndexStr = parts[1]
      const pageIndex = parseInt(pageIndexStr, 10)
      console.log(`🔍 parseBoardPath: pageIndexStr (no viewport) = "${pageIndexStr}", parsed = ${pageIndex}`)
      if (!isNaN(pageIndex)) {
        result.pageId = `page:${pageIndex}`
        console.log(`✅ parseBoardPath: Set pageId (no viewport) = "${result.pageId}"`)
      }
    }
    
    // 解析视窗信息
    if (viewportIndex >= 1 && viewportIndex + 3 <= parts.length) {
      const vPart = parts[viewportIndex]
      const x = parseFloat(vPart.substring(1)) // 去掉'v'前缀
      const y = parseFloat(parts[viewportIndex + 1])
      const width = parseFloat(parts[viewportIndex + 2])
      const height = parseFloat(parts[viewportIndex + 3])
      
      console.log(`🔍 parseBoardPath: viewport values - x=${x}, y=${y}, w=${width}, h=${height}`)
      
      if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
        result.viewport = { x, y, width, height }
        console.log(`✅ parseBoardPath: Set viewport =`, result.viewport)
      } else {
        console.log(`❌ parseBoardPath: Invalid viewport values`)
      }
    } else {
      console.log(`🔍 parseBoardPath: No viewport found (viewportIndex=${viewportIndex}, needed=${viewportIndex + 3}, available=${parts.length})`)
    }
    
    console.log(`✅ parseBoardPath: Final result =`, result)
    return result
  } catch (error) {
    console.error('❌ parseBoardPath: Failed to parse board path:', error)
    return null
  }
}

// Admin dashboard handler function
function adminDashboardHandler() {
	const adminHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>流学 管理后台</title>
    <script crossorigin src="/libs/react.production.min.js"></script>
    <script crossorigin src="/libs/react-dom.production.min.js"></script>  
    <script src="/libs/babel.min.js"></script>
    <script>
        // 同步加载后直接渲染
        console.log('✓ All core dependencies loaded synchronously');
        
        // 确保renderApp函数定义后再调用
        function initializeAdmin() {
            if (window.React && window.ReactDOM && typeof renderApp === 'function') {
                console.log('✓ Initializing admin dashboard');
                renderApp();
            } else {
                console.log('⏳ Waiting for dependencies and renderApp...');
                setTimeout(initializeAdmin, 100);
            }
        }
        
        // 启动初始化
        setTimeout(initializeAdmin, 50);
    </script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-number { font-size: 24px; font-weight: bold; color: #3b82f6; }
        .stat-label { color: #666; margin-top: 4px; }
        .tabs { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .tab-buttons { display: flex; border-bottom: 1px solid #eee; }
        .tab-button { padding: 12px 24px; border: none; background: none; cursor: pointer; border-bottom: 2px solid transparent; }
        .tab-button.active { background: #f8fafc; border-bottom-color: #3b82f6; color: #3b82f6; }
        .tab-content { padding: 20px; }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; }
        .table th { background: #f8fafc; font-weight: 600; }
        .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .btn-danger { background: #dc2626; color: white; }
        .btn-success { background: #16a34a; color: white; }
        .loading { text-align: center; padding: 40px; }
    </style>
</head>
<body>
    <div id="root"></div>
    
    <script type="text/babel">
        const { useState, useEffect } = React;
        
        function AdminDashboard() {
            const [activeTab, setActiveTab] = useState('overview');
            const [stats, setStats] = useState(null);
            const [rooms, setRooms] = useState([]);
            const [users, setUsers] = useState([]);
            const [publishRequests, setPublishRequests] = useState([]);
            const [loading, setLoading] = useState(false);
            
            useEffect(() => {
                loadData();
            }, []);
            
            const loadData = async () => {
                setLoading(true);
                try {
                    // Load stats from main domain
                    const statsRes = await fetch('/api/admin/stats', {
                        headers: { 'X-Admin-Token': 'admin123' }
                    });
                    if (statsRes.ok) {
                        setStats(await statsRes.json());
                    }
                    
                    // Load rooms from main domain
                    const roomsRes = await fetch('/api/rooms');
                    if (roomsRes.ok) {
                        setRooms(await roomsRes.json());
                    }
                    
                    // Load users from main domain
                    const usersRes = await fetch('/api/admin/users', {
                        headers: { 'X-Admin-Token': 'admin123' }
                    });
                    if (usersRes.ok) {
                        const usersData = await usersRes.json();
                        // 处理新的响应格式
                        if (usersData.users) {
                            setUsers(usersData.users);
                            console.log('Clerk集成状态:', usersData.clerkEnabled ? '已启用' : '未启用');
                        } else {
                            setUsers(usersData); // 向后兼容
                        }
                    }

                    // Load publish requests
                    const requestsRes = await fetch('/api/admin/publish-requests', {
                        headers: { 'X-Admin-Token': 'admin123' }
                    });
                    if (requestsRes.ok) {
                        setPublishRequests(await requestsRes.json());
                    }

                } catch (error) {
                    console.error('Error loading data:', error);
                } finally {
                    setLoading(false);
                }
            };

            
            const deleteRoom = async (roomId) => {
                if (!confirm('确定要删除这个房间吗？')) return;
                try {
                    const res = await fetch('/api/admin/rooms/batch-delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Admin-Token': 'admin123'
                        },
                        body: JSON.stringify({ roomIds: [roomId] })
                    });

                    // 后端统一返回200，但需要检查结果中的 success
                    const data = await res.json().catch(() => null);
                    const first = data && data.results && data.results[0];
                    const success = !!(first && first.success);

                    if (res.ok && success) {
                        // 乐观更新，避免缓存或刷新延迟
                        setRooms(prev => prev.filter(r => r.id !== roomId));
                        alert('房间删除成功');
                    } else {
                        const text = (first && first.error) || (await res.text().catch(() => '')) || res.status;
                        alert('删除失败：' + text);
                    }
                } catch (error) {
                    alert('删除失败: ' + error.message);
                }
            };

            const togglePublish = async (roomId, currentStatus) => {
                console.log('togglePublish clicked:', roomId, currentStatus);
                const newStatus = !currentStatus;
                const notes = prompt(newStatus ? '允许发布原因:' : '禁止发布原因:');
                if (notes === null) return;
                
                try {
                    const response = await fetch(\`/api/admin/rooms/\${roomId}/toggle-publish\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Admin-Token': 'admin123'
                        },
                        body: JSON.stringify({ adminPublished: newStatus, notes })
                    });
                    
                    if (response.ok) {
                        await loadData();
                        alert(newStatus ? '已允许发布' : '已禁止发布');
                    } else {
                        alert('操作失败');
                    }
                } catch (error) {
                    alert('操作失败: ' + error.message);
                }
            };

            const togglePlaza = async (roomId, currentStatus) => {
                console.log('togglePlaza clicked:', roomId, currentStatus);
                const newStatus = !currentStatus;
                
                try {
                    const response = await fetch(\`/api/admin/rooms/\${roomId}/toggle-plaza\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Admin-Token': 'admin123'
                        },
                        body: JSON.stringify({ plaza: newStatus })
                    });
                    
                    if (response.ok) {
                        await loadData();
                        alert(newStatus ? '已添加到广场' : '已从广场移除');
                    } else {
                        alert('操作失败');
                    }
                } catch (error) {
                    alert('操作失败: ' + error.message);
                }
            };

            const togglePlaza = async (roomId, currentStatus) => {
                console.log('togglePlaza clicked:', roomId, currentStatus);
                const newStatus = !currentStatus;
                const notes = prompt(newStatus ? '发布原因:' : '取消发布原因:');
                if (notes === null) return;
                
                try {
                    const response = await fetch(\`/api/admin/rooms/\${roomId}/toggle-plaza\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Admin-Token': 'admin123'
                        },
                        body: JSON.stringify({ plaza: newStatus, notes })
                    });
                    
                    if (response.ok) {
                        await loadData();
                        alert(newStatus ? '已发布' : '已取消发布');
                    } else {
                        alert('操作失败');
                    }
                } catch (error) {
                    alert('操作失败: ' + error.message);
                }
            };

            const handlePublishRequest = async (requestId, status) => {
                const notes = prompt(\`\${status === 'approved' ? '批准' : '拒绝'}原因:\`);
                if (notes === null) return;
                
                try {
                    const response = await fetch(\`/api/admin/publish-requests/\${requestId}\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Admin-Token': 'admin123'
                        },
                        body: JSON.stringify({ status, notes })
                    });
                    
                    if (response.ok) {
                        await loadData();
                        alert(\`申请已\${status === 'approved' ? '批准' : '拒绝'}\`);
                    } else {
                        alert('操作失败');
                    }
                } catch (error) {
                    alert('操作失败: ' + error.message);
                }
            };

            
            return (
                <div className="container">
                    <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h1>🛠️ 流学 管理后台</h1>
                            <p>管理用户、房间和系统统计</p>
                        </div>
                        <a 
                            href="https://iflowone.com"
                            style={{
                                padding: '8px 16px',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                textDecoration: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            返回主应用
                        </a>
                    </div>
                    
                    {stats && (
                        <div className="stats-grid">
                            <div className="stat-card">
                                <div className="stat-number">{stats.totalUsers}</div>
                                <div className="stat-label">总用户数</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-number">{stats.totalRooms}</div>
                                <div className="stat-label">总房间数</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-number">{stats.sharedRooms}</div>
                                <div className="stat-label">已共享房间</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-number">{stats.storageUsed}</div>
                                <div className="stat-label">存储使用</div>
                            </div>
                        </div>
                    )}
                    
                    <div className="tabs">
                        <div className="tab-buttons">
                            <button 
                                className={\`tab-button \${activeTab === 'overview' ? 'active' : ''}\`}
                                onClick={() => setActiveTab('overview')}
                            >
                                📊 概览
                            </button>
                            <button 
                                className={\`tab-button \${activeTab === 'rooms' ? 'active' : ''}\`}
                                onClick={() => setActiveTab('rooms')}
                            >
                                🏠 房间管理
                            </button>
                            <button 
                                className={\`tab-button \${activeTab === 'users' ? 'active' : ''}\`}
                                onClick={() => setActiveTab('users')}
                            >
                                👥 用户管理
                            </button>
                        </div>
                        
                        <div className="tab-content">
                            {loading && <div className="loading">加载中...</div>}
                            
                            {activeTab === 'overview' && (
                                <div>
                                    <h3>系统概览</h3>
                                    <p>系统运行正常，所有服务可用。</p>
                                </div>
                            )}
                            
                            {activeTab === 'rooms' && (
                                <div style={{ width: '100%', overflowX: 'auto' }}>
                                    <h3>房间管理</h3>
                                    <table className="table" style={{ width: '100%', tableLayout: 'auto', minWidth: '960px' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ whiteSpace: 'nowrap' }}>房间ID</th>
                                                <th style={{ whiteSpace: 'nowrap' }}>房间名称</th>
                                                <th style={{ whiteSpace: 'nowrap' }}>房主ID</th>
                                                <th style={{ whiteSpace: 'nowrap' }}>创建时间</th>
                                                <th style={{ whiteSpace: 'nowrap' }}>状态</th>
                                                <th style={{ whiteSpace: 'nowrap' }}>操作</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rooms.map(room => (
                                                <tr key={room.id}>
                                                    <td style={{ whiteSpace: 'nowrap' }}>{room.id}</td>
                                                    <td style={{ whiteSpace: 'nowrap' }}>{room.name || '未命名房间'}</td>
                                                    <td style={{ whiteSpace: 'nowrap' }}>{room.ownerId}</td>
                                                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(room.createdAt).toLocaleDateString()}</td>
                                                    <td>
                                                        <span style={{ 
                                                            padding: '4px 8px', 
                                                            borderRadius: '12px', 
                                                            fontSize: '12px', 
                                                            background: room.shared ? '#d4edda' : '#f8d9da',
                                                            color: room.shared ? '#155724' : '#7a1c24'
                                                        }}>
                                                            {room.shared ? '已共享' : '未共享'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <button 
                                                            className="btn"
                                                            style={{ 
                                                                background: room.shared ? '#10b981' : '#6b7280',
                                                                color: 'white',
                                                                marginRight: '4px'
                                                            }}
                                                            onClick={async (e) => {
                                                                e.preventDefault();
                                                                const newStatus = !room.shared;
                                                                const notes = prompt(newStatus ? '共享原因:' : '取消共享原因:');
                                                                if (notes === null) return;
                                                                const res = await fetch('/api/admin/rooms/' + room.id + '/toggle-shared', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'admin123' },
                                                                    body: JSON.stringify({ shared: newStatus, notes })
                                                                });
                                                                if (res.ok) loadData(); else alert('操作失败');
                                                            }}
                                                        >
                                                            {room.shared ? '取消共享' : '共享'}（shared）
                                                        </button>
                                                        <button 
                                                            className="btn"
                                                            style={{ 
                                                                background: room.adminPublished ? '#ffc107' : '#28a745',
                                                                color: 'white',
                                                                marginRight: '4px'
                                                            }}
                                                            onClick={(e) => {
                                                                console.log('Publish button clicked for room:', room.id);
                                                                e.preventDefault();
                                                                togglePublish(room.id, room.adminPublished);
                                                            }}
                                                        >
                                                            {room.adminPublished ? '禁止发布' : '允许发布'}（admin）
                                                        </button>
                                                        <button 
                                                            className="btn"
                                                            style={{ background: '#2563eb', color: 'white', marginRight: '4px' }}
                                                            title="转移房主"
                                                            onClick={async () => {
                                                                const newOwnerId = prompt('输入新的房主用户ID：')
                                                                if (!newOwnerId) return
                                                                const url = '/api/admin/rooms/' + room.id + '/transfer-owner'
                                                                const res = await fetch(url, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'admin123' },
                                                                    body: JSON.stringify({ newOwnerId })
                                                                })
                                                                if (res.ok) {
                                                                    alert('所有权已转移')
                                                                    await loadData()
                                                                } else {
                                                                    const text = await res.text().catch(() => '')
                                                                    alert('转移失败：' + text)
                                                                }
                                                            }}
                                                        >
                                                            转移
                                                        </button>
                                                        <button 
                                                            className="btn btn-danger"
                                                            onClick={() => deleteRoom(room.id)}
                                                        >
                                                            删除
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            
                            {activeTab === 'users' && (
                                <div>
                                    <h3>用户管理</h3>
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>用户ID</th>
                                                <th>用户名</th>
                                                <th>邮箱</th>
                                                <th>房间数</th>
                                                <th>状态</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map(user => (
                                                <tr key={user.userId}>
                                                    <td>{user.userId}</td>
                                                    <td>{user.userName}</td>
                                                    <td>{user.userEmail}</td>
                                                    <td>{user.roomCount}</td>
                                                    <td>{user.status}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            
                        </div>
                    </div>
                </div>
            );
        }
        
        // 等待依赖加载完成后渲染React组件
        function renderApp() {
            console.log('renderApp called, React:', !!window.React, 'ReactDOM:', !!window.ReactDOM);
            if (window.React && window.ReactDOM) {
                try {
                    ReactDOM.render(React.createElement(AdminDashboard), document.getElementById('root'));
                    console.log('✓ Admin dashboard rendered successfully');
                } catch (error) {
                    console.error('✗ Error rendering Admin dashboard:', error);
                    document.getElementById('root').innerHTML = '<div style="padding: 20px; background: #ffebee; border: 1px solid #f44336; border-radius: 4px;"><h2>Admin Dashboard</h2><p>Loading error: ' + error.message + '</p><p>Please refresh the page.</p></div>';
                }
            } else {
                console.error('✗ React dependencies not available for rendering');
                document.getElementById('root').innerHTML = '<div style="padding: 20px; background: #ffebee; border: 1px solid #f44336; border-radius: 4px;"><h2>Loading Error</h2><p>React dependencies not loaded</p></div>';
            }
        }
        
        // renderApp函数现在由initializeAdmin调用，无需事件监听
        console.log('✓ renderApp function defined and ready');
    </script>
</body>
</html>`
	
	return new Response(adminHtml, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
		},
	})
}

// 动态获取最新资源文件名
async function getLatestAssets(env: Env): Promise<{js: string, css: string}> {
	try {
		// 检查ASSETS绑定是否可用
		if (!env.ASSETS || !env.ASSETS.fetch) {
			console.warn('ASSETS binding not available, using fixed filenames')
			return {
				js: 'index.js',
				css: 'index.css'
			}
		}
		
		// 直接从 index.html 解析最新的资源文件名
		const indexRequest = new Request('https://iflowone.com/index.html');
		const indexResponse = await env.ASSETS.fetch(indexRequest);
		
		if (indexResponse.ok) {
			const indexHtml = await indexResponse.text();
			
			// 从HTML中解析资源文件名，使用更灵活的正则表达式
			const jsMatch = indexHtml.match(/src="[^"]*\/assets\/(index-\d+\.js)"/);
			const cssMatch = indexHtml.match(/href="[^"]*\/assets\/(index-\d+\.css)"/);
			
			if (jsMatch && cssMatch) {
				console.log(`✅ Found latest assets from index.html: JS=${jsMatch[1]}, CSS=${cssMatch[1]}`);
				return {
					js: jsMatch[1],
					css: cssMatch[1]
				};
			} else {
				console.warn('Could not parse asset filenames from index.html');
				console.log('Index HTML content:', indexHtml.substring(0, 500));
			}
		} else {
			console.error('Failed to fetch index.html:', indexResponse.status, indexResponse.statusText);
		}
	} catch (error) {
		console.error('Error getting latest assets from index.html:', error);
	}
	
	// 回退：返回固定文件名
	console.log('🔄 Using fixed asset filenames');
	return {
		js: 'index.js',
		css: 'index.css'
	};
}

// 统一的动态HTML生成器
async function generateDynamicHTML(env: Env, title: string = 'iFlowOne', customScript?: string): Promise<string> {
	const latestAssets = await getLatestAssets(env);
	
	return `<!DOCTYPE html>
<html lang="zh-CN">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
		<meta name="mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
		<meta name="format-detection" content="telephone=no" />
		<meta name="apple-touch-fullscreen" content="yes" />
		<title>${title}</title>
		<style>
			* {
				box-sizing: border-box;
				-webkit-tap-highlight-color: transparent;
			}
			
			html, body {
				margin: 0;
				padding: 0;
				width: 100%;
				height: 100%;
				overflow: hidden;
				-webkit-user-select: none;
				-webkit-touch-callout: none;
				-webkit-text-size-adjust: none;
				-webkit-font-smoothing: antialiased;
				-moz-osx-font-smoothing: grayscale;
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
				position: fixed;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
			}
			
			#root {
				width: 100%;
				height: 100%;
				position: fixed;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				overflow: hidden;
			}
			
			/* iOS Safari specific fixes */
			@supports (-webkit-touch-callout: none) {
				html {
					height: -webkit-fill-available;
				}
				
				body {
					min-height: 100vh;
					min-height: -webkit-fill-available;
					position: fixed;
					width: 100%;
					height: 100%;
				}
				
				#root {
					min-height: -webkit-fill-available;
				}
			}
			
			/* Safari specific fixes */
			@media screen and (-webkit-min-device-pixel-ratio: 0) {
				html, body {
					-webkit-transform: translateZ(0);
					transform: translateZ(0);
				}
			}
			
			/* Mobile specific button adjustments */
			@media (max-width: 768px) {
				button {
					min-height: 44px;
					min-width: 44px;
					-webkit-appearance: none;
					appearance: none;
				}
				
				input, textarea {
					-webkit-appearance: none;
					appearance: none;
					border-radius: 0;
				}
			}
			
			/* Prevent zoom on input focus in iOS */
			@media screen and (-webkit-min-device-pixel-ratio: 0) {
				input[type="text"],
				input[type="email"],
				input[type="password"],
				textarea {
					font-size: 16px;
				}
			}
		</style>
		<script type="module" crossorigin src="/assets/${latestAssets.js}"></script>
		<link rel="stylesheet" crossorigin href="/assets/${latestAssets.css}">
		${customScript || ''}
	</head>
	<body>
		<div id="root"></div>
	</body>
</html>`;
}

// we use itty-router (https://itty.dev/) to handle routing. in this example we turn on CORS because
// we're hosting the worker separately to the client. you should restrict this to your own domain.
const router = AutoRouter<IRequest, [env: Env, ctx: ExecutionContext]>({
	catch: (e) => {
		console.error(e)
		return error(e)
	},
})
	// Debug middleware to log all requests
	.all('*', (request) => {
		const url = new URL(request.url)
		console.log(`🔍 ${request.method} ${url.pathname} - ${new Date().toISOString()}`)
		// Return undefined to continue to next route
		return undefined
	})
	
	// Handle preflight OPTIONS requests for CORS FIRST
	.options('*', (request) => {
		const origin = request.headers.get('Origin')
		console.log(`OPTIONS request - Origin: ${origin}`)
		
		const response = new Response(null, { status: 204 })
		
		// 强制设置CORS头，优先使用原始origin，否则使用通配符
		if (origin) {
			response.headers.set('Access-Control-Allow-Origin', origin)
			console.log(`OPTIONS: Setting Access-Control-Allow-Origin to: ${origin}`)
		} else {
			response.headers.set('Access-Control-Allow-Origin', '*')
			console.log(`OPTIONS: Setting Access-Control-Allow-Origin to: *`)
		}
		
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Email, X-User-ID, X-Admin-Token')
		response.headers.set('Access-Control-Max-Age', '86400')
		response.headers.set('Vary', 'Origin')
		
		return response
	})
	// Handle admin.iflowone.com root path
	.get('/', async (request, env) => {
		const url = new URL(request.url)
		console.log(`GET / route hit! URL: ${request.url}, hostname: ${url.hostname}, pathname: ${url.pathname}`)
		
		if (url.hostname === 'admin.iflowone.com') {
			console.log('Admin subdomain detected, returning admin dashboard')
			// Redirect to admin interface for admin subdomain
			return adminDashboardHandler()
		}
		
		// For main domain root path, return HTML with JavaScript redirect
		const isMainDomain = (url.hostname === 'iflowone.com' || url.hostname === 'www.iflowone.com')
		const isRootPath = url.pathname === '/'
		console.log(`Main domain check: ${isMainDomain}, Root path check: ${isRootPath}`)
		
		if (isMainDomain && isRootPath) {
			// Return HTML with immediate JavaScript redirect to plaza
			const redirectHtml = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<link rel="icon" href="/favicon.ico" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
		<meta name="apple-mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
		<meta name="format-detection" content="telephone=no" />
		<title>iFlowOne 共享白板</title>
		<style>
			* { box-sizing: border-box; }
			html, body {
				margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;
				-webkit-user-select: none; -webkit-touch-callout: none; -webkit-text-size-adjust: none;
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			}
			#root { width: 100%; height: 100%; position: fixed; top: 0; left: 0; right: 0; bottom: 0; }
			.loading { display: flex; justify-content: center; align-items: center; height: 100vh; }
		</style>
	</head>
	<body>
		<div id="root">
			<div class="loading">正在跳转到广场...</div>
		</div>
		<script>
			// Fetch plaza rooms and redirect to random one
			async function redirectToPlaza() {
				try {
					const response = await fetch('/api/rooms?plaza=true');
					const plazaRooms = await response.json();
					
					// 只选择真正设为广场的房间
					const actualPlazaRooms = plazaRooms.filter(room => room.plaza === true);
					
					if (actualPlazaRooms && actualPlazaRooms.length > 0) {
						const randomIndex = Math.floor(Math.random() * actualPlazaRooms.length);
						const randomRoom = actualPlazaRooms[randomIndex];
						
						console.log('🎲 随机选择广场房间:', randomRoom.name, '(' + randomRoom.id + ')');
						
						// 直接跳转到选中的广场房间
						window.location.href = '/r/' + randomRoom.id;
					} else {
						// No plaza rooms, load default content
						console.log('⚠️ 没有广场房间，加载默认内容');
						loadApp();
					}
				} catch (error) {
					console.error('Error fetching plaza rooms:', error);
					loadApp();
				}
			}
			
			function loadApp() {
				// Load the main app assets
				const script = document.createElement('script');
				script.src = '/assets/index.js';
				script.type = 'module';
				script.crossOrigin = 'anonymous';
				document.head.appendChild(script);
				
				const link = document.createElement('link');
				link.rel = 'stylesheet';
				link.href = '/assets/index.css';
				link.crossOrigin = 'anonymous';
				document.head.appendChild(link);
			}
			
			// Start redirect process
			redirectToPlaza();
		</script>
	</body>
</html>`
			
			return new Response(redirectHtml, {
				status: 200,
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					'Pragma': 'no-cache',
					'Expires': '0'
				}
			})
		}
		
		// For other cases, continue to SPA handling
		// This allows the request to fall through to the catch-all handler
		return undefined
	})
	
	// Add explicit route for plaza paths
	.get('/plaza/:roomSlug', async (request, env) => {
		// 直接返回 index.html，让前端路由处理
		if (env.ASSETS) {
			const url = new URL(request.url)
			const indexRequest = new Request(url.origin + '/index.html', {
				method: 'GET',
				headers: request.headers
			})
			const response = await env.ASSETS.fetch(indexRequest)
			if (response.ok) {
				return response
			}
		}
		// 回退到动态生成
		const html = await generateDynamicHTML(env, 'iFlowOne 共享白板');
		return new Response(html, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-cache, no-store, must-revalidate'
			}
		});
	})

	// Test route to verify worker routing
	.get('/test', () => {
		return new Response('Worker routing is working!', {
			headers: { 'Content-Type': 'text/plain' }
		})
	})

	// Cache clearing route for debugging
	.get('/clear-cache', async (request, env) => {
		const html = `<!DOCTYPE html>
<html>
<head>
	<title>缓存清理</title>
	<meta charset="UTF-8">
</head>
<body>
	<h1>缓存清理工具</h1>
	<p>当前时间: ${new Date().toISOString()}</p>
	<script>
		// 清除所有可能的缓存
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.getRegistrations().then(registrations => {
				registrations.forEach(reg => reg.unregister());
			});
		}
		
		// 清除浏览器缓存
		if ('caches' in window) {
			caches.keys().then(names => {
				names.forEach(name => caches.delete(name));
			});
		}
		
		// 强制重新加载最新资源
		setTimeout(() => {
			window.location.href = '/plaza/default-room?t=' + Date.now();
		}, 2000);
		
		document.body.innerHTML += '<p>正在清理缓存并重定向...</p>';
	</script>
</body>
</html>`;
		
		return new Response(html, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-cache, no-store, must-revalidate',
				'Pragma': 'no-cache',
				'Expires': '0'
			}
		});
	})

	// Admin routes first (before SPA handling)
	.get('/admin-login', (request) => {
		console.log('Admin login route hit:', request.url)
		const loginHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>管理员登录 - 流学</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 400px;
        }
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo h1 {
            color: #333;
            font-size: 28px;
            margin-bottom: 8px;
        }
        .logo p {
            color: #666;
            font-size: 14px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
        }
        .form-group input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        .form-group input:focus {
            outline: none;
            border-color: #667eea;
        }
        .login-btn {
            width: 100%;
            padding: 12px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.3s;
        }
        .login-btn:hover {
            background: #5a67d8;
        }
        .login-btn:disabled {
            background: #a0aec0;
            cursor: not-allowed;
        }
        .error-message {
            color: #e53e3e;
            font-size: 14px;
            margin-top: 10px;
            text-align: center;
        }
        .success-message {
            color: #38a169;
            font-size: 14px;
            margin-top: 10px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">
            <h1>🛠️ 流学 管理后台</h1>
            <p>流学 系统管理员登录</p>
        </div>
        
        <form id="loginForm">
            <div class="form-group">
                <label for="username">用户名</label>
                <input type="text" id="username" name="username" required>
            </div>
            
            <div class="form-group">
                <label for="password">密码</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <button type="submit" class="login-btn" id="loginBtn">
                登录
            </button>
            
            <div id="message"></div>
        </form>
    </div>

    <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const loginBtn = document.getElementById('loginBtn');
            const messageDiv = document.getElementById('message');
            
            loginBtn.disabled = true;
            loginBtn.textContent = '登录中...';
            messageDiv.innerHTML = '';
            
            try {
                const response = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = '<div class="success-message">登录成功，正在跳转...</div>';
                    // 设置session token
                    localStorage.setItem('admin-token', result.token);
                    // 跳转到管理后台
                    setTimeout(() => {
                        window.location.href = '/admin';
                    }, 1000);
                } else {
                    messageDiv.innerHTML = '<div class="error-message">' + (result.error || '登录失败') + '</div>';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="error-message">网络错误，请重试</div>';
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = '登录';
            }
        });
    </script>
</body>
</html>`
		
		return new Response(loginHtml, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
			},
		})
	})

	// Admin login API
	.post('/api/admin/login', async (request) => {
		const origin = request.headers.get('Origin')
		
		try {
			const { username, password } = await request.json()
			
			// 简单的管理员认证 (实际项目中应该使用数据库和加密)
			const adminCredentials = {
				'admin': 'admin123',
				'iflowone-admin': 'iflowone2024',
				'carpe-diem': 'carpe123'
			}
			
			if (adminCredentials[username] === password) {
				// 生成简单的token (实际项目中应该使用JWT)
				const token = 'admin-' + Date.now() + '-' + Math.random().toString(36).substr(2)
				
				return createCorsResponse({ 
					success: true, 
					token: token,
					message: '登录成功'
				}, 200, origin, true)
			} else {
				return createCorsResponse({ 
					error: '用户名或密码错误' 
				}, 401, origin, true)
			}
		} catch (error) {
			return createCorsResponse({ 
				error: '请求格式错误' 
			}, 400, origin, true)
		}
	})

	// Admin dashboard route (now requires authentication)
	.get('/admin', () => {
		const adminHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>流学 管理后台</title>
    <script crossorigin src="/libs/react.production.min.js"></script>
    <script crossorigin src="/libs/react-dom.production.min.js"></script>  
    <script src="/libs/babel.min.js"></script>
    <script>
        // 同步加载后直接渲染
        console.log('✓ All core dependencies loaded synchronously');
        
        // 确保renderApp函数定义后再调用
        function initializeAdmin() {
            if (window.React && window.ReactDOM && typeof renderApp === 'function') {
                console.log('✓ Initializing admin dashboard');
                renderApp();
            } else {
                console.log('⏳ Waiting for dependencies and renderApp...');
                setTimeout(initializeAdmin, 100);
            }
        }
        
        // 启动初始化
        setTimeout(initializeAdmin, 50);
    </script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-number { font-size: 24px; font-weight: bold; color: #3b82f6; }
        .stat-label { color: #666; margin-top: 4px; }
        .tabs { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .tab-buttons { display: flex; border-bottom: 1px solid #eee; }
        .tab-button { padding: 12px 24px; border: none; background: none; cursor: pointer; border-bottom: 2px solid transparent; }
        .tab-button.active { background: #f8fafc; border-bottom-color: #3b82f6; color: #3b82f6; }
        .tab-content { padding: 20px; }
        .table { width: 100%; border-collapse: collapse; }
        .table th, .table td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; }
        .table th { background: #f8fafc; font-weight: 600; }
        .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .btn-danger { background: #dc2626; color: white; }
        .btn-success { background: #16a34a; color: white; }
        .loading { text-align: center; padding: 40px; }
    </style>
</head>
<body>
    <div id="root"></div>
    
    <script type="text/babel">
        const { useState, useEffect } = React;
        
        function AdminDashboard() {
            const [activeTab, setActiveTab] = useState('overview');
            const [stats, setStats] = useState(null);
            const [rooms, setRooms] = useState([]);
            const [users, setUsers] = useState([]);
            const [publishRequests, setPublishRequests] = useState([]);
            const [loading, setLoading] = useState(false);
            const [isAuthenticated, setIsAuthenticated] = useState(false);
            const [checking, setChecking] = useState(true);
            
            // 批量操作相关状态
            const [selectedRooms, setSelectedRooms] = useState(new Set());
            const [selectAll, setSelectAll] = useState(false);
            
            useEffect(() => {
                checkAuth();
            }, []);

            const checkAuth = () => {
                const token = localStorage.getItem('admin-token');
                if (!token) {
                    window.location.href = '/admin-login';
                    return;
                }
                setIsAuthenticated(true);
                setChecking(false);
                loadData();
            };

            const logout = () => {
                localStorage.removeItem('admin-token');
                window.location.href = '/admin-login';
            };
            
            const loadData = async () => {
                setLoading(true);
                try {
                    // Load stats
                    const statsRes = await fetch('/api/admin/stats', {
                        headers: { 'X-Admin-Token': 'admin123' }
                    });
                    if (statsRes.ok) {
                        setStats(await statsRes.json());
                    }
                    
                    // Load rooms
                    const roomsRes = await fetch('/api/rooms');
                    if (roomsRes.ok) {
                        setRooms(await roomsRes.json());
                    }
                    
                    // Load users
                    const usersRes = await fetch('/api/admin/users', {
                        headers: { 'X-Admin-Token': 'admin123' }
                    });
                    if (usersRes.ok) {
                        const usersData = await usersRes.json();
                        // 处理新的响应格式
                        if (usersData.users) {
                            setUsers(usersData.users);
                            console.log('Clerk集成状态:', usersData.clerkEnabled ? '已启用' : '未启用');
                        } else {
                            setUsers(usersData); // 向后兼容
                        }
                    }
                } catch (error) {
                    console.error('Error loading data:', error);
                } finally {
                    setLoading(false);
                }
            };
            
            const deleteRoom = async (roomId) => {
                if (!confirm('确定要删除这个房间吗？')) return;
                try {
                    const res = await fetch('/api/admin/rooms/batch-delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Admin-Token': 'admin123'
                        },
                        body: JSON.stringify({ roomIds: [roomId] })
                    });
                    const data = await res.json().catch(() => null);
                    const first = data && data.results && data.results[0];
                    const success = !!(first && first.success);
                    if (res.ok && success) {
                        setRooms(prev => prev.filter(r => r.id !== roomId));
                        alert('房间删除成功');
                    } else {
                        const text = (first && first.error) || (await res.text().catch(() => '')) || res.status;
                        alert('删除失败：' + text);
                    }
                } catch (error) {
                    alert('删除失败: ' + error.message);
                }
            };

            const togglePublish = async (roomId, currentStatus) => {
                console.log('togglePublish clicked:', roomId, currentStatus);
                const newStatus = !currentStatus;
                const notes = prompt(newStatus ? '允许发布原因:' : '禁止发布原因:');
                if (notes === null) return;
                
                try {
                    const response = await fetch(\`/api/admin/rooms/\${roomId}/toggle-publish\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Admin-Token': 'admin123'
                        },
                        body: JSON.stringify({ adminPublished: newStatus, notes })
                    });
                    
                    if (response.ok) {
                        await loadData();
                        alert(newStatus ? '已允许发布' : '已禁止发布');
                    } else {
                        alert('操作失败');
                    }
                } catch (error) {
                    alert('操作失败: ' + error.message);
                }
            };

            const togglePlaza = async (roomId, currentStatus) => {
                console.log('togglePlaza clicked:', roomId, currentStatus);
                const newStatus = !currentStatus;
            const notes = prompt(newStatus ? '发布原因:' : '取消发布原因:');
                if (notes === null) return;
                
                try {
                    const response = await fetch(\`/api/admin/rooms/\${roomId}/toggle-plaza\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Admin-Token': 'admin123'
                        },
                        body: JSON.stringify({ plaza: newStatus, notes })
                    });
                    
                    if (response.ok) {
                        await loadData();
                        alert(newStatus ? '已发布' : '已取消发布');
                    } else {
                        alert('操作失败');
                    }
                } catch (error) {
                    alert('操作失败: ' + error.message);
                }
            };

            const handlePublishRequest = async (requestId, status) => {
                const notes = prompt(\`\${status === 'approved' ? '批准' : '拒绝'}原因:\`);
                if (notes === null) return;
                
                try {
                    const response = await fetch(\`/api/admin/publish-requests/\${requestId}\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Admin-Token': 'admin123'
                        },
                        body: JSON.stringify({ status, notes })
                    });
                    
                    if (response.ok) {
                        await loadData();
                        alert(\`申请已\${status === 'approved' ? '批准' : '拒绝'}\`);
                    } else {
                        alert('操作失败');
                    }
                } catch (error) {
                    alert('操作失败: ' + error.message);
                }
            };


            // 批量操作处理函数
            const handleSelectAll = (checked) => {
                setSelectAll(checked);
                if (checked) {
                    setSelectedRooms(new Set(rooms.map(room => room.id)));
                } else {
                    setSelectedRooms(new Set());
                }
            };

            const handleRoomSelect = (roomId, checked) => {
                const newSelected = new Set(selectedRooms);
                if (checked) {
                    newSelected.add(roomId);
                } else {
                    newSelected.delete(roomId);
                }
                setSelectedRooms(newSelected);
                setSelectAll(newSelected.size === rooms.length);
            };

            const handleBatchOperation = async (operation) => {
                if (selectedRooms.size === 0) {
                    alert('请先选择要操作的房间');
                    return;
                }

                const roomIds = Array.from(selectedRooms);
                let operationName = '';
                let apiEndpoint = '';
                let requestBody = {};

                switch (operation) {
                    case 'publish':
                        operationName = '批量发布';
                        apiEndpoint = '/api/admin/rooms/batch-publish';
                        break;
                    case 'unpublish':
                        operationName = '批量禁发';
                        apiEndpoint = '/api/admin/rooms/batch-unpublish';
                        break;
                    case 'share':
                        operationName = '批量共享';
                        apiEndpoint = '/api/admin/rooms/batch-share';
                        requestBody = { shared: true };
                        break;
                    case 'unshare':
                        operationName = '批量取消共享';
                        apiEndpoint = '/api/admin/rooms/batch-share';
                        requestBody = { shared: false };
                        break;
                    case 'plaza':
                        operationName = '批量广场';
                        apiEndpoint = '/api/admin/rooms/batch-plaza';
                        requestBody = { plaza: true };
                        break;
                    case 'unplaza':
                        operationName = '批量取消广场';
                        apiEndpoint = '/api/admin/rooms/batch-plaza';
                        requestBody = { plaza: false };
                        break;
                    case 'delete':
                        operationName = '批量删除';
                        apiEndpoint = '/api/admin/rooms/batch-delete';
                        break;
                    default:
                        alert('未知操作');
                        return;
                }

                const confirmMsg = '确定要' + operationName + ' ' + roomIds.length + ' 个房间吗？';
                if (!confirm(confirmMsg)) return;

                try {
                    const response = await fetch(apiEndpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Admin-Token': 'admin123'
                        },
                        body: JSON.stringify({ roomIds, ...requestBody })
                    });

                    if (!response.ok) {
                        throw new Error('API请求失败: ' + response.status);
                    }

                    const result = await response.json();

                    // 若是删除操作，直接从前端移除这些行，避免缓存导致的视觉残留
                    if (operation === 'delete' && Array.isArray(result.results)) {
                        const succeeded = new Set(result.results.filter(r => r.success).map(r => r.roomId));
                        if (succeeded.size > 0) {
                            setRooms(prev => prev.filter(r => !succeeded.has(r.id)));
                        }
                    } else {
                        await loadData();
                    }

                    setSelectedRooms(new Set());
                    setSelectAll(false);

                    if (result.summary) {
                        const { total, success, failed } = result.summary;
                        if (failed === 0) {
                            alert(operationName + '成功！处理了 ' + success + ' 个房间');
                        } else {
                            alert(operationName + '完成！成功: ' + success + '，失败: ' + failed);
                        }
                    } else {
                        alert(operationName + '完成');
                    }
                } catch (error) {
                    alert(operationName + '失败: ' + error.message);
                }
            };
            
            if (checking) {
                return (
                    <div className="container">
                        <div className="loading">正在验证身份...</div>
                    </div>
                );
            }

            if (!isAuthenticated) {
                return (
                    <div className="container">
                        <div className="loading">未授权访问，正在跳转...</div>
                    </div>
                );
            }

            return (
                <div className="container">
                    <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h1>🛠️ 流学 管理后台</h1>
                            <p>管理用户、房间和系统统计</p>
                        </div>
                        <button 
                            onClick={logout}
                            style={{
                                padding: '8px 16px',
                                background: '#dc2626',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            退出登录
                        </button>
                    </div>
                    
                    {stats && (
                        <div className="stats-grid">
                            <div className="stat-card">
                                <div className="stat-number">{stats.totalUsers}</div>
                                <div className="stat-label">总用户数</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-number">{stats.totalRooms}</div>
                                <div className="stat-label">总房间数</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-number">{stats.sharedRooms}</div>
                                <div className="stat-label">已共享房间</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-number">{stats.storageUsed}</div>
                                <div className="stat-label">存储使用</div>
                            </div>
                        </div>
                    )}
                    
                    <div className="tabs">
                        <div className="tab-buttons">
                            <button 
                                className={\`tab-button \${activeTab === 'overview' ? 'active' : ''}\`}
                                onClick={() => setActiveTab('overview')}
                            >
                                📊 概览
                            </button>
                            <button 
                                className={\`tab-button \${activeTab === 'rooms' ? 'active' : ''}\`}
                                onClick={() => setActiveTab('rooms')}
                            >
                                🏠 房间管理
                            </button>
                            <button 
                                className={\`tab-button \${activeTab === 'users' ? 'active' : ''}\`}
                                onClick={() => setActiveTab('users')}
                            >
                                👥 用户管理
                            </button>
                        </div>
                        
                        <div className="tab-content">
                            {loading && <div className="loading">加载中...</div>}
                            
                            {activeTab === 'overview' && (
                                <div>
                                    <h3>系统概览</h3>
                                    <p>系统运行正常，所有服务可用。</p>
                                </div>
                            )}
                            
                            {activeTab === 'rooms' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <h3>房间管理</h3>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '14px', color: '#666' }}>
                                                已选择: {selectedRooms.size} 个房间
                                            </span>
                                            {selectedRooms.size > 0 && (
                                                <>
                                                    <button 
                                                        className="btn"
                                                        style={{ background: '#28a745', color: 'white', padding: '6px 12px', fontSize: '12px' }}
                                                        onClick={() => handleBatchOperation('publish')}
                                                    >
                                                        批量发布
                                                    </button>
                                                    <button 
                                                        className="btn"
                                                        style={{ background: '#ffc107', color: 'white', padding: '6px 12px', fontSize: '12px' }}
                                                        onClick={() => handleBatchOperation('unpublish')}
                                                    >
                                                        批量禁发
                                                    </button>
                                                    <button 
                                                        className="btn"
                                                        style={{ background: '#6f42c1', color: 'white', padding: '6px 12px', fontSize: '12px' }}
                                                        onClick={() => handleBatchOperation('share')}
                                                    >
                                                        批量共享
                                                    </button>
                                                    <button 
                                                        className="btn"
                                                        style={{ background: '#17a2b8', color: 'white', padding: '6px 12px', fontSize: '12px' }}
                                                        onClick={() => handleBatchOperation('unshare')}
                                                    >
                                                        批量取消共享
                                                    </button>
                                                    <button 
                                                        className="btn"
                                                        style={{ background: '#dc3545', color: 'white', padding: '6px 12px', fontSize: '12px' }}
                                                        onClick={() => handleBatchOperation('delete')}
                                                    >
                                                        批量删除
                                                    </button>
                                                    <button 
                                                        className="btn"
                                                        style={{ background: '#007bff', color: 'white', padding: '6px 12px', fontSize: '12px' }}
                                                        onClick={() => handleBatchOperation('plaza')}
                                                    >
                                                        批量广场
                                                    </button>
                                                    <button 
                                                        className="btn"
                                                        style={{ background: '#6c757d', color: 'white', padding: '6px 12px', fontSize: '12px' }}
                                                        onClick={() => handleBatchOperation('unplaza')}
                                                    >
                                                        批量取消广场
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '40px' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectAll}
                                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                </th>
                                                <th>房间ID</th>
                                                <th>房间名称</th>
                                                <th>房主ID</th>
                                                <th>创建时间</th>
                                                <th>状态</th>
                                                <th>操作</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rooms.map(room => (
                                                <tr key={room.id}>
                                                    <td>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedRooms.has(room.id)}
                                                            onChange={(e) => handleRoomSelect(room.id, e.target.checked)}
                                                            style={{ cursor: 'pointer' }}
                                                        />
                                                    </td>
                                                    <td>{room.id}</td>
                                                    <td>{room.name || '未命名房间'}</td>
                                                    <td>{room.ownerId}</td>
                                                    <td>{new Date(room.createdAt).toLocaleDateString()}</td>
                                                    <td>
                                                        {(() => {
                                                            // 将共享、发布、广场分别显示为独立徽标；都无则显示“私有”
                                                            const badges = []
                                                            const badge = (text, bg, color) => (
                                                                <span key={text} style={{
                                                                    padding: '4px 8px',
                                                                    borderRadius: '12px',
                                                                    fontSize: '12px',
                                                                    background: bg,
                                                                    color,
                                                                    marginRight: '6px'
                                                                }}>{text}</span>
                                                            )
                                                            if (room.shared) badges.push(badge('共享', '#d4edda', '#155724'))
                                                            if (room.publish) badges.push(badge('发布', '#d1ecf1', '#0c5460'))
                                                            if (room.plaza) badges.push(badge('广场', '#fff3cd', '#856404'))
                                                            if (badges.length === 0) badges.push(badge('私有', '#f8d7da', '#721c24'))
                                                            return <div>{badges}</div>
                                                        })()}
                                                        {room.adminPublished === false && (
                                                            <span style={{ 
                                                                marginLeft: '8px',
                                                                padding: '4px 8px', 
                                                                borderRadius: '12px', 
                                                                fontSize: '12px', 
                                                                background: '#dc3545',
                                                                color: 'white'
                                                            }}>
                                                                禁止发布
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <button 
                                                            className="btn"
                                                            style={{ 
                                                                background: room.adminPublished ? '#ffc107' : '#28a745',
                                                                color: 'white',
                                                                marginRight: '4px'
                                                            }}
                                                            onClick={(e) => {
                                                                console.log('Publish button clicked for room:', room.id);
                                                                e.preventDefault();
                                                                togglePublish(room.id, room.adminPublished);
                                                            }}
                                                        >
                                                            {room.adminPublished ? '禁止发布' : '允许发布'}（admin）
                                                        </button>
                                                        <button 
                                                            className="btn btn-danger"
                                                            onClick={() => deleteRoom(room.id)}
                                                        >
                                                            删除
                                                        </button>
                                                    </td>
                                                    <td>
                                                        <button 
                                                            className="btn"
                                                            style={{ background: '#2563eb', color: 'white' }}
                                                            onClick={async () => {
                                                                const newOwnerId = prompt('输入新的房主用户ID：')
                                                                if (!newOwnerId) return
                                                                const url = '/api/admin/rooms/' + room.id + '/transfer-owner'
                                                                const res = await fetch(url, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'admin123' },
                                                                    body: JSON.stringify({ newOwnerId })
                                                                })
                                                                if (res.ok) {
                                                                    alert('所有权已转移')
                                                                    await loadData()
                                                                } else {
                                                                    const text = await res.text().catch(() => '')
                                                                    alert('转移失败：' + text)
                                                                }
                                                            }}
                                                        >
                                                            转移
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            
                            {activeTab === 'users' && (
                                <div>
                                    <h3>用户管理</h3>
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>用户ID</th>
                                                <th>用户名</th>
                                                <th>邮箱</th>
                                                <th>房间数</th>
                                                <th>状态</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map(user => (
                                                <tr key={user.userId}>
                                                    <td>{user.userId}</td>
                                                    <td>{user.userName}</td>
                                                    <td>{user.userEmail}</td>
                                                    <td>{user.roomCount}</td>
                                                    <td>{user.status}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            
                        </div>
                    </div>
                </div>
            );
        }
        
        // 等待依赖加载完成后渲染React组件
        function renderApp() {
            console.log('renderApp called, React:', !!window.React, 'ReactDOM:', !!window.ReactDOM);
            if (window.React && window.ReactDOM) {
                try {
                    ReactDOM.render(React.createElement(AdminDashboard), document.getElementById('root'));
                    console.log('✓ Admin dashboard rendered successfully');
                } catch (error) {
                    console.error('✗ Error rendering Admin dashboard:', error);
                    document.getElementById('root').innerHTML = '<div style="padding: 20px; background: #ffebee; border: 1px solid #f44336; border-radius: 4px;"><h2>Admin Dashboard</h2><p>Loading error: ' + error.message + '</p><p>Please refresh the page.</p></div>';
                }
            } else {
                console.error('✗ React dependencies not available for rendering');
                document.getElementById('root').innerHTML = '<div style="padding: 20px; background: #ffebee; border: 1px solid #f44336; border-radius: 4px;"><h2>Loading Error</h2><p>React dependencies not loaded</p></div>';
            }
        }
        
        // renderApp函数现在由initializeAdmin调用，无需事件监听
        console.log('✓ renderApp function defined and ready');
    </script>
</body>
</html>`
		
		return new Response(adminHtml, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
			},
		})
	})

	// requests to /connect are routed to the Durable Object, and handle realtime websocket syncing
	.get('/api/connect/:roomId', (request, env) => {
		const id = env.TLDRAW_DURABLE_OBJECT.idFromName(request.params.roomId)
		const room = env.TLDRAW_DURABLE_OBJECT.get(id)
		return room.fetch(request.url, { headers: request.headers, body: request.body })
	})

	// CORS Test endpoint
	.get('/test-cors', async (request, env) => {
		const origin = request.headers.get('Origin')
		console.log(`CORS Test - Origin: ${origin}`)
		
		const response = new Response('CORS test successful', { status: 200 })
		response.headers.set('Access-Control-Allow-Origin', origin || '*')
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
		response.headers.set('Content-Type', 'text/plain')
		
		return response
	})

	// 测试CORS的简单路由
	.get('/cors-test', async (request, env) => {
		const origin = request.headers.get('Origin')
		const response = Response.json({ message: 'CORS test working', origin: origin })
		response.headers.set('Access-Control-Allow-Origin', origin || '*')
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
		return response
	})

	// Test route to verify routing is working
	.get('/api/test', async (request, env) => {
		console.log('🧪 TEST ROUTE HIT!')
		return Response.json({ success: true, message: 'Test route works!' })
	})
	
	// Room management APIs
	.get('/api/users/:userId/recent-rooms', async (request, env) => {
		console.log('🎯 NEW API ROUTE HIT: /api/users/:userId/recent-rooms', request.params.userId)
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const url = new URL(request.url)
			const limit = parseInt(url.searchParams.get('limit') || '20')
			console.log('🔍 Fetching recent rooms for user:', request.params.userId, 'limit:', limit)
			const recentRooms = await roomService.getUserRecentRooms(request.params.userId, limit)
			console.log('✅ Found recent rooms:', recentRooms.length)
			return createCorsResponse(recentRooms, 200, origin, true)
		} catch (error: any) {
			console.error('❌ Error fetching user recent rooms:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	.get('/api/rooms', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const url = new URL(request.url)
		const shared = url.searchParams.get('shared')
		const owner = url.searchParams.get('owner')
		const plaza = url.searchParams.get('plaza')
		const origin = request.headers.get('Origin')

		console.log(`GET /api/rooms - Origin: ${origin}`)

		try {
			let rooms
			if (shared === 'true') {
				rooms = await roomService.getSharedRooms()
			} else if (owner) {
				rooms = await roomService.getRoomsByOwner(owner)
			} else if (plaza === 'true') {
				rooms = await roomService.getPlazaRooms()
			} else {
				rooms = await roomService.getAllRooms()
			}
			
			// 创建响应并强制添加CORS头与禁用缓存，避免删除后列表使用旧缓存
			const response = Response.json(rooms, { status: 200 })
			
			// 开发环境：允许任何localhost源，生产环境：使用特定域名
			response.headers.set('Access-Control-Allow-Origin', origin || '*')
			response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
			response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Email, X-User-ID, X-Admin-Token')
			response.headers.set('Access-Control-Max-Age', '86400')
			response.headers.set('Vary', 'Origin')
			response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
			
			console.log(`✅ CORS headers set for origin: ${origin}`)
			
			return response
		} catch (error: any) {
			const response = Response.json({ error: error.message }, { status: 500 })
			
			// 错误响应也需要CORS头
			response.headers.set('Access-Control-Allow-Origin', origin || '*')
			response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
			response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Email, X-User-ID, X-Admin-Token')
			response.headers.set('Access-Control-Max-Age', '86400')
			response.headers.set('Vary', 'Origin')
			
			return response
		}
	})

	.post('/api/interaction/events', async (request, env) => {
		const origin = request.headers.get('Origin')
		
		try {
			const event = await request.json() as {
				userId: string
				roomId: string
				interactionType: string
				userName: string
				timestamp: number
			}
			console.log('Recording interaction event:', event)
			
			// 记录用户活动到数据库
			await env.ROOM_DB.prepare(`
				INSERT OR REPLACE INTO user_activities 
				(user_id, room_id, activity_type, metadata, activity_timestamp)
				VALUES (?, ?, ?, ?, ?)
			`).bind(
				event.userId,
				event.roomId,
				event.interactionType,
				JSON.stringify({
					userName: event.userName,
					timestamp: event.timestamp
				}),
				Date.now()
			).run()
			
			return createCorsResponse({ success: true }, 200, origin, true)
		} catch (error) {
			console.error('Error recording interaction event:', error)
			return createCorsResponse({ error: 'Failed to record interaction' }, 500, origin, true)
		}
	})

	.get('/api/rooms/:roomId', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const room = await roomService.getRoom(request.params.roomId)
			
			if (!room) {
				return createCorsResponse({ error: 'Room not found' }, 404, origin, true)
			}
			
			return createCorsResponse(room, 200, origin, true)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})

	.post('/api/rooms', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const roomData = await request.json()
			const room = await roomService.createRoom(roomData as any)
			return createCorsResponse(room, 201, origin, true)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 400, origin, true)
		}
	})

	.put('/api/rooms/:roomId', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const updates = await request.json()
			const room = await roomService.updateRoom(request.params.roomId, updates as any)
			return createCorsResponse(room, 200, origin, true)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 400, origin, true)
		}
	})

	.delete('/api/rooms/:roomId', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			await roomService.deleteRoom(request.params.roomId)
			return createCorsResponse(null, 204, origin, true)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 400, origin, true)
		}
	})

	// Admin API endpoints
	.get('/api/admin/stats', async (request: AdminAuthRequest, env) => {
		// 管理员权限验证
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		
		try {
			const allRooms = await roomService.getAllRooms()
			const sharedRooms = allRooms.filter(room => room.shared)
			const uniqueOwners = new Set(allRooms.map(room => room.ownerId))
			
			const stats = {
				totalUsers: uniqueOwners.size,
				totalRooms: allRooms.length,
				sharedRooms: sharedRooms.length,
				activeUsers: Math.floor(uniqueOwners.size * 0.7), // Simulated active users
				storageUsed: `${(allRooms.length * 2.5).toFixed(1)} MB`
			}
			
			const origin = request.headers.get('Origin')
			return createCorsResponse(stats, 200, origin)
		} catch (error: any) {
			const origin = request.headers.get('Origin')
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	.get('/api/admin/users', async (request: AdminAuthRequest, env) => {
		// 管理员权限验证
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			let clerkUsers = []
			
			// 尝试从Clerk获取用户数据
			if (env.CLERK_SECRET_KEY) {
				try {
					const clerkResponse = await fetch('https://api.clerk.com/v1/users', {
						headers: {
							'Authorization': `Bearer ${env.CLERK_SECRET_KEY}`,
							'Content-Type': 'application/json'
						}
					})
					
					if (clerkResponse.ok) {
						const clerkData = await clerkResponse.json()
						clerkUsers = clerkData.data || clerkData
					} else {
						console.warn('Failed to fetch from Clerk API:', clerkResponse.status)
					}
				} catch (clerkError) {
					console.warn('Error fetching from Clerk:', clerkError)
				}
			}
			
			// 获取房间数据来统计每个用户的房间数量
			const allRooms = await roomService.getAllRooms()
			const roomCountMap = new Map()
			
			allRooms.forEach(room => {
				const userId = room.ownerId
				roomCountMap.set(userId, (roomCountMap.get(userId) || 0) + 1)
			})
			
			// 如果有Clerk用户数据，使用Clerk数据；否则从房间数据推导
			let users = []
			
			if (clerkUsers.length > 0) {
				// 使用Clerk用户数据
				users = clerkUsers.map(clerkUser => ({
					userId: clerkUser.id,
					userName: clerkUser.first_name && clerkUser.last_name 
						? `${clerkUser.first_name} ${clerkUser.last_name}`
						: clerkUser.username || clerkUser.id,
					userEmail: clerkUser.email_addresses?.[0]?.email_address || 'No email',
					role: 'user',
					status: clerkUser.banned ? 'banned' : 'active',
					createdAt: clerkUser.created_at,
					lastLogin: clerkUser.last_sign_in_at || clerkUser.updated_at,
					roomCount: roomCountMap.get(clerkUser.id) || 0,
					clerkData: {
						imageUrl: clerkUser.image_url,
						lastActiveAt: clerkUser.last_active_at,
						twoFactorEnabled: clerkUser.two_factor_enabled
					}
				}))
			} else {
				// 降级到房间数据推导用户
				const userMap = new Map()
				
				allRooms.forEach(room => {
					if (!userMap.has(room.ownerId)) {
						userMap.set(room.ownerId, {
							userId: room.ownerId,
							userName: room.ownerName || '未知用户',
							userEmail: 'N/A (请配置Clerk API)',
							role: 'user',
							status: 'active',
							createdAt: room.createdAt,
							lastLogin: room.lastModified,
							roomCount: 0
						})
					}
					
					const userProfile = userMap.get(room.ownerId)
					userProfile.roomCount++
				})
				
				users = Array.from(userMap.values())
			}
			
			await logAdminAction(env.ROOM_DB, request.adminUser?.id || 'admin', 'VIEW_USERS', `查看用户列表 (${users.length}个用户)`)
			
			return createCorsResponse({
				users,
				total: users.length,
				clerkEnabled: !!env.CLERK_SECRET_KEY,
				timestamp: new Date().toISOString()
			}, 200, origin)
			
		} catch (error: any) {
			console.error('Error in /api/admin/users:', error)
			return createCorsResponse({ 
				error: error.message,
				clerkEnabled: !!env.CLERK_SECRET_KEY 
			}, 500, origin)
		}
	})

	.get('/api/admin/logs', async (request: AdminAuthRequest, env) => {
		// 管理员权限验证
		const authError = requireAdmin(request)
		if (authError) return authError
		
		// For now, return mock data
		const mockLogs = [
			{
				id: '1',
				adminId: 'admin',
				adminName: 'Admin',
				action: 'DELETE_ROOM',
				targetType: 'room',
				targetId: 'room123',
				details: '删除了违规内容房间',
				timestamp: Date.now() - 3600000
			}
		]
		
		const origin = request.headers.get('Origin')
		return createCorsResponse(mockLogs, 200, origin)
	})

	.post('/api/admin/logs', async (request: AdminAuthRequest, env) => {
		// 管理员权限验证
		const authError = requireAdmin(request)
		if (authError) return authError
		
		// TODO: Implement log storage in D1 database
		const logData = await request.json()
		
		// For now, just return success
		const origin = request.headers.get('Origin')
		return createCorsResponse({ success: true }, 201, origin)
	})

	// Admin: Toggle room publish permission
	.post('/api/admin/rooms/:roomId/toggle-publish', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId } = request.params
			const { adminPublished, notes } = await request.json()
			const adminId = request.adminUser?.id || 'admin'
			
			const updatedRoom = await roomService.toggleAdminPublish(roomId, adminPublished, adminId, notes)
			
			await logAdminAction(env.ROOM_DB, adminId, 'TOGGLE_PUBLISH', 
				`${adminPublished ? '允许' : '禁止'}房间发布: ${roomId}`)
			
			return createCorsResponse(updatedRoom, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// Admin: Toggle room shared status
	.post('/api/admin/rooms/:roomId/toggle-shared', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		try {
			const { roomId } = request.params
			const { shared } = await request.json()
			const updated = await roomService.updateRoom(roomId, { shared })
			return createCorsResponse(updated, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// Admin: Toggle room plaza status
	.post('/api/admin/rooms/:roomId/toggle-plaza', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId } = request.params
			const { plaza } = await request.json()
			const adminId = request.adminUser?.id || 'admin'
			
			const updatedRoom = await roomService.updateRoomPlazaStatus(roomId, plaza)
			
			await logAdminAction(env.ROOM_DB, adminId, 'TOGGLE_PLAZA', 
                `${plaza ? '发布' : '取消发布'}: ${roomId}`)
			
			return createCorsResponse(updatedRoom, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// Admin: Toggle room share status
	.post('/api/admin/rooms/:roomId/toggle-share', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		const { roomId } = request.params
		
		try {
			const { shared } = await request.json()
			const adminId = request.adminUser?.id || 'admin'
			
			const updatedRoom = await roomService.updateRoomSharedStatus(roomId, shared)
			
			await logAdminAction(env.ROOM_DB, adminId, 'TOGGLE_SHARE', 
                `${shared ? '设为共享' : '取消共享'}: ${roomId}`)
			
			return createCorsResponse(updatedRoom, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// Admin: Transfer room owner
	.post('/api/admin/rooms/:roomId/transfer-owner', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		try {
			const { roomId } = request.params
			const { newOwnerId, newOwnerName } = await request.json()
			if (!newOwnerId) {
				return createCorsResponse({ error: 'newOwnerId is required' }, 400, origin)
			}
			const updated = await roomService.transferRoomOwner(roomId, newOwnerId, newOwnerName)
			await logAdminAction(env.ROOM_DB, request.adminUser?.id || 'admin', 'TRANSFER_OWNER', `room=${roomId} -> ${newOwnerId}`)
			return createCorsResponse(updated, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// Get publish requests
	.get('/api/admin/publish-requests', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const requests = await roomService.getPublishRequests()
			return createCorsResponse(requests, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})
	
	// TEST: Same endpoint as POST to see if routing works
	.post('/api/admin/publish-requests', async (request: AdminAuthRequest, env) => {
		console.log('🚀 TEST POST /api/admin/publish-requests route HIT!')
		return createCorsResponse({ message: 'POST test successful', timestamp: Date.now() }, 200, request.headers.get('Origin'))
	})

	// Handle publish request (approve/reject)
	.post('/api/admin/publish-requests/:requestId', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { requestId } = request.params
			const { status, notes } = await request.json()
			const adminId = request.adminUser?.id || 'admin'
			const adminName = request.adminUser?.email || 'Admin'
			
			const updatedRequest = await roomService.handlePublishRequest(requestId, status, adminId, adminName, notes)
			
			await logAdminAction(env.ROOM_DB, adminId, 'HANDLE_PUBLISH_REQUEST', 
				`${status === 'approved' ? '批准' : '拒绝'}发布申请: ${requestId}`)
			
			return createCorsResponse(updatedRequest, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})



	// Admin settings API
	.post('/api/admin/settings', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { defaultRoom, adminId } = await request.json()
			
			// Validate that the room exists and is published
			if (defaultRoom) {
				const room = await roomService.getRoom(defaultRoom)
				if (!room) {
					return createCorsResponse({ error: 'Default room not found' }, 400, origin)
				}
				if (!room.shared) {
					return createCorsResponse({ error: 'Default room must be published' }, 400, origin)
				}
			}
			
			// Store the default room setting
			// For now, we'll use a simple KV-like approach in the database
			await roomService.setAdminSetting('default_room', defaultRoom, adminId || 'admin')
			
			await logAdminAction(env.ROOM_DB, adminId || 'admin', 'SET_DEFAULT_ROOM', 
				`设置默认房间: ${defaultRoom || 'none'}`)
			
			return createCorsResponse({ 
				success: true, 
				defaultRoom,
				message: 'Default room setting saved successfully'
			}, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// Get admin settings
	.get('/api/admin/settings', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const defaultRoom = await roomService.getAdminSetting('default_room')
			
			return createCorsResponse({ 
				defaultRoom: defaultRoom || null,
				timestamp: new Date().toISOString()
			}, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// Update user review mode
	.patch('/api/admin/users/:userId/review-mode', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { userId } = request.params
			const { reviewMode } = await request.json()
			
			if (!['auto', 'manual'].includes(reviewMode)) {
				return createCorsResponse({ error: 'Invalid review mode. Must be "auto" or "manual"' }, 400, origin)
			}
			
			await roomService.updateUserReviewMode(userId, reviewMode)
			
			return createCorsResponse({ 
				success: true,
				userId,
				reviewMode,
				timestamp: new Date().toISOString()
			}, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// Approve publish request
	.post('/api/admin/publish-requests/:requestId/approve', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { requestId } = request.params
			const result = await roomService.handlePublishRequest(requestId, 'approved', 'admin')
			
			return createCorsResponse({ 
				success: true,
				result,
				timestamp: new Date().toISOString()
			}, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// Reject publish request
	.post('/api/admin/publish-requests/:requestId/reject', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { requestId } = request.params
			const result = await roomService.handlePublishRequest(requestId, 'rejected', 'admin')
			
			return createCorsResponse({ 
				success: true,
				result,
				timestamp: new Date().toISOString()
			}, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})


	// Batch operations for rooms
	.post('/api/admin/rooms/batch-publish', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomIds } = await request.json()
			const adminId = request.adminUser?.id || 'admin'
			
			if (!roomIds || !Array.isArray(roomIds)) {
				return createCorsResponse({ error: 'roomIds must be an array' }, 400, origin)
			}
			
			const results = []
			for (const roomId of roomIds) {
				try {
					const updatedRoom = await roomService.updateRoomPublishStatus(roomId, true)
					results.push({ roomId, success: true, data: updatedRoom })
				} catch (error: any) {
					results.push({ roomId, success: false, error: error.message })
				}
			}
			
			await logAdminAction(env.ROOM_DB, adminId, 'BATCH_PUBLISH', 
				`批量允许发布: ${roomIds.join(', ')}`)
			
			const successCount = results.filter(r => r.success).length
			return createCorsResponse({ 
				results, 
				summary: { total: roomIds.length, success: successCount, failed: roomIds.length - successCount }
			}, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	.post('/api/admin/rooms/batch-unpublish', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomIds } = await request.json()
			const adminId = request.adminUser?.id || 'admin'
			
			if (!roomIds || !Array.isArray(roomIds)) {
				return createCorsResponse({ error: 'roomIds must be an array' }, 400, origin)
			}
			
			const results = []
			for (const roomId of roomIds) {
				try {
					const updatedRoom = await roomService.updateRoomPublishStatus(roomId, false)
					results.push({ roomId, success: true, data: updatedRoom })
				} catch (error: any) {
					results.push({ roomId, success: false, error: error.message })
				}
			}
			
			await logAdminAction(env.ROOM_DB, adminId, 'BATCH_UNPUBLISH', 
				`批量禁止发布: ${roomIds.join(', ')}`)
			
			const successCount = results.filter(r => r.success).length
			return createCorsResponse({ 
				results, 
				summary: { total: roomIds.length, success: successCount, failed: roomIds.length - successCount }
			}, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	.post('/api/admin/rooms/batch-share', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomIds, shared } = await request.json()
			const adminId = request.adminUser?.id || 'admin'
			
			if (!roomIds || !Array.isArray(roomIds)) {
				return createCorsResponse({ error: 'roomIds must be an array' }, 400, origin)
			}
			
			const results = []
			for (const roomId of roomIds) {
				try {
					const updatedRoom = await roomService.updateRoom(roomId, { shared: shared })
					results.push({ roomId, success: true, data: updatedRoom })
				} catch (error: any) {
					results.push({ roomId, success: false, error: error.message })
				}
			}
			
			await logAdminAction(env.ROOM_DB, adminId, 'BATCH_SHARE', 
				`批量${shared ? '共享' : '取消共享'}: ${roomIds.join(', ')}`)
			
			const successCount = results.filter(r => r.success).length
			return createCorsResponse({ 
				results, 
				summary: { total: roomIds.length, success: successCount, failed: roomIds.length - successCount }
			}, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// Admin: Batch plaza operations
	.post('/api/admin/rooms/batch-plaza', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomIds, plaza } = await request.json()
			const adminId = request.adminUser?.id || 'admin'
			
			if (!roomIds || !Array.isArray(roomIds)) {
				return createCorsResponse({ error: 'roomIds must be an array' }, 400, origin)
			}
			
			if (typeof plaza !== 'boolean') {
				return createCorsResponse({ error: 'plaza must be a boolean' }, 400, origin)
			}
			
			const results = []
			for (const roomId of roomIds) {
				try {
					const updatedRoom = await roomService.updateRoomPlazaStatus(roomId, plaza)
					if (updatedRoom) {
						results.push({ roomId, success: true })
						
						// Log admin action
						await roomService.logAdminAction(
							adminId, 
							'admin',
							plaza ? 'batch_add_to_plaza' : 'batch_remove_from_plaza',
							'room',
							roomId,
							`${plaza ? '批量加入广场' : '批量移出广场'}: ${roomId}`
						)
					} else {
						results.push({ roomId, success: false, error: 'Room not found' })
					}
				} catch (error: any) {
					results.push({ roomId, success: false, error: error.message })
				}
			}
			
			const successCount = results.filter(r => r.success).length
			return createCorsResponse({ 
				results, 
				summary: { total: roomIds.length, success: successCount, failed: roomIds.length - successCount }
			}, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	.post('/api/admin/rooms/batch-delete', async (request: AdminAuthRequest, env) => {
		const authError = requireAdmin(request)
		if (authError) return authError
		
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomIds } = await request.json()
			const adminId = request.adminUser?.id || 'admin'
			
			if (!roomIds || !Array.isArray(roomIds)) {
				return createCorsResponse({ error: 'roomIds must be an array' }, 400, origin)
			}
			
			const results = []
            for (const roomId of roomIds) {
                try {
                    // 幂等删除：若房间不存在也视为成功
                    const existing = await roomService.getRoom(roomId)
                    if (!existing) {
                        results.push({ roomId, success: true, info: 'not found, treated as deleted' })
                        continue
                    }
                    await roomService.deleteRoom(roomId)
                    results.push({ roomId, success: true })
                } catch (error: any) {
                    results.push({ roomId, success: false, error: error.message })
                }
            }
			
			await logAdminAction(env.ROOM_DB, adminId, 'BATCH_DELETE', 
				`批量删除房间: ${roomIds.join(', ')}`)
			
            const successCount = results.filter(r => r.success).length
			return createCorsResponse({ 
				results, 
				summary: { total: roomIds.length, success: successCount, failed: roomIds.length - successCount }
			}, 200, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// User: Create publish request
	.post('/api/rooms/:roomId/request-publish', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId } = request.params
			const { userId, userName } = await request.json()
			
			// Check if room exists
			const room = await roomService.getRoom(roomId)
			if (!room) {
				return createCorsResponse({ error: 'Room not found' }, 404, origin)
			}
			
			// Check if user is owner
			if (room.ownerId !== userId) {
				return createCorsResponse({ error: 'Only room owner can request publish' }, 403, origin)
			}
			
			const publishRequest = await roomService.createPublishRequest(roomId, room?.name || '未命名房间', userId, userName, false)
			return createCorsResponse(publishRequest, 201, origin)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// Comments API
	.get('/api/rooms/:roomId/comments', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId } = request.params
			const comments = await roomService.getRoomComments(roomId)
			return createCorsResponse(comments, 200, origin, true)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	.post('/api/rooms/:roomId/comments', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId } = request.params
			const { userId, userName, userEmail, comment, parentCommentId } = await request.json()
			
			const newComment = await roomService.createComment(roomId, userId, userName, userEmail, comment, parentCommentId)
			return createCorsResponse(newComment, 201, origin, true)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	// 新的发布API - 发布到共享空间
	.post('/api/rooms/:roomId/publish-shared', async (request, env) => {
		console.log('🚀 POST /api/rooms/:roomId/publish-shared route HIT!')
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId } = request.params
			const { userId, userName } = await request.json()
			console.log('🤝 Publishing to shared space:', { roomId, userId, userName })
			await roomService.publishToShared(roomId, userId, userName)
			return createCorsResponse({ success: true, message: 'Published to shared space' }, 200, origin)
		} catch (error: any) {
			console.error('❌ Error publishing to shared space:', error)
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})
	
	// 取消共享空间共享
	.post('/api/rooms/:roomId/unshare-shared', async (request, env) => {
		console.log('🚀 POST /api/rooms/:roomId/unshare-shared route HIT!')
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId } = request.params
			console.log('🔒 Unsharing from shared space:', { roomId })
			await roomService.unshareFromShared(roomId)
			return createCorsResponse({ success: true, message: 'Unshared from shared space' }, 200, origin)
		} catch (error: any) {
			console.error('❌ Error unsharing from shared space:', error)
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})
	
        // 新的发布API - 发布
	.post('/api/rooms/:roomId/publish-plaza', async (request, env) => {
		console.log('🚀 POST /api/rooms/:roomId/publish-plaza route HIT!')
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId } = request.params
			const { userId, userName } = await request.json()
			console.log('🎨 Publishing to plaza:', { roomId, userId, userName })
			await roomService.publishToPlaza(roomId, userId, userName)
			return createCorsResponse({ success: true, message: 'Published to plaza' }, 200, origin)
		} catch (error: any) {
			console.error('❌ Error publishing to plaza:', error)
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})
	
        // 取消发布
	.post('/api/rooms/:roomId/unpublish-plaza', async (request, env) => {
		console.log('🚀 POST /api/rooms/:roomId/unpublish-plaza route HIT!')
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId } = request.params
			console.log('🏠 Unpublishing from plaza:', { roomId })
			await roomService.unpublishFromPlaza(roomId)
			return createCorsResponse({ success: true, message: 'Unpublished from plaza' }, 200, origin)
		} catch (error: any) {
			console.error('❌ Error unpublishing from plaza:', error)
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})
	
        // 同步房间的发布版本 - 发布更新时调用
	.post('/api/rooms/:roomId/sync-to-plaza', async (request, env) => {
		console.log('🚀 POST /api/rooms/:roomId/sync-to-plaza route HIT!')
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId } = request.params
			const body = await request.json()
			const { version, publishedBy, publishedAt } = body
			
			console.log('🔄 Syncing room to plaza:', { 
				roomId, 
				version, 
				sharedBy, 
				sharedAt 
			})
			
			// 更新房间的广场版本信息
			await roomService.syncRoomToPlaza(roomId, {
				version,
				sharedBy,
				sharedAt,
				lastSynced: Date.now()
			})
			
			return createCorsResponse({ 
				success: true, 
				message: 'Room synced to plaza',
				version 
			}, 200, origin)
		} catch (error: any) {
			console.error('❌ Error syncing room to plaza:', error)
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// Publish requests API - TEMPORARY PATH FOR TESTING
	// Create publish request (user submits)
	.post('/api/publish-requests', async (request, env) => {
		console.log('🚀 POST /api/publish-requests route HIT!')
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId, roomName, userId, userName, requestedPlaza, submittedAt } = await request.json()
			console.log('📝 Creating publish request:', { roomId, roomName, userId, userName, requestedPlaza })
			const publishRequest = await roomService.createPublishRequest(roomId, roomName, userId, userName, requestedPlaza, submittedAt)
			console.log('✅ Publish request created:', publishRequest)
			return createCorsResponse(publishRequest, 201, origin)
		} catch (error: any) {
			console.error('❌ Error creating publish request:', error)
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	.post('/api/test-publish-requests', async (request, env) => {
		console.log('🚀 POST /api/test-publish-requests route HIT!')
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId, roomName, userId, userName, requestedPlaza, submittedAt } = await request.json()
			console.log('📝 Creating publish request:', { roomId, roomName, userId, userName, requestedPlaza })
			const publishRequest = await roomService.createPublishRequest(roomId, roomName, userId, userName, requestedPlaza, submittedAt)
			console.log('✅ Publish request created:', publishRequest)
			return createCorsResponse(publishRequest, 201, origin)
		} catch (error: any) {
			console.error('❌ Error creating publish request:', error)
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})
	.get('/api/publish-requests/:roomId', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { roomId } = request.params
			const publishRequest = await roomService.getPublishRequestByRoom(roomId)
			if (publishRequest) {
				return createCorsResponse({ status: publishRequest.status }, 200, origin)
			} else {
				return createCorsResponse({ status: 'none' }, 200, origin)
			}
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 500, origin)
		}
	})

	// assets can be uploaded to the bucket under /uploads:
	.post('/api/uploads/:uploadId', handleAssetUpload)

	// they can be retrieved from the bucket too:
	.get('/api/uploads/:uploadId', handleAssetDownload)

	// bookmarks need to extract metadata from pasted URLs:
	.get('/api/unfurl', handleUnfurlRequest)

	// === 发布快照 API ===
	
	// 保存发布快照到R2
	.post('/api/publish-snapshots/:publishedSlug', async (request, env) => {
		const origin = request.headers.get('Origin')
		
		try {
			const { publishedSlug } = request.params
			const publishSnapshot = await request.json()
			
			// 检查R2绑定是否可用
			if (!env.TLDRAW_BUCKET) {
				console.log('⚠️ TLDRAW_BUCKET环境变量未配置，使用内存存储')
				// 在本地开发时，使用Durable Object存储
				const id = env.TLDRAW_DURABLE_OBJECT.idFromName('publish-snapshots')
				const durableObject = env.TLDRAW_DURABLE_OBJECT.get(id)
				
				const durableRequest = new Request(`https://fake-host/store-snapshot/${publishedSlug}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(publishSnapshot)
				})
				
				const durableResponse = await durableObject.fetch(durableRequest)
				if (durableResponse.ok) {
					console.log('✅ 发布快照已保存到Durable Object (开发模式)')
					return createCorsResponse({ success: true, publishedSlug }, 201, origin, true)
				} else {
					throw new Error('Durable Object存储失败')
				}
			}
			
			// 保存到R2存储
			const key = `publish-snapshots/${publishedSlug}.json`
			console.log('🔍 尝试保存到R2:', key)
			await env.TLDRAW_BUCKET.put(key, JSON.stringify(publishSnapshot), {
				httpMetadata: {
					contentType: 'application/json',
					cacheControl: 'public, max-age=31536000', // 1年缓存
				},
				customMetadata: {
					publishedAt: new Date().toISOString(),
					publishedBy: publishSnapshot.metadata?.publishedBy || 'Unknown'
				}
			})
			
			console.log('✅ 发布快照已保存到R2:', publishedSlug)
			return createCorsResponse({ success: true, publishedSlug }, 201, origin, true)
		} catch (error: any) {
			console.error('❌ 保存发布快照失败:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	
	// 从R2加载发布快照
	.get('/api/publish-snapshots/:publishedSlug', async (request, env) => {
		const origin = request.headers.get('Origin')
		
		try {
			const { publishedSlug } = request.params
			
			// 检查R2绑定是否可用
			if (!env.TLDRAW_BUCKET) {
				console.log('⚠️ TLDRAW_BUCKET环境变量未配置，使用内存存储')
				// 在本地开发时，从Durable Object加载
				const id = env.TLDRAW_DURABLE_OBJECT.idFromName('publish-snapshots')
				const durableObject = env.TLDRAW_DURABLE_OBJECT.get(id)
				
				const durableRequest = new Request(`https://fake-host/get-snapshot/${publishedSlug}`, {
					method: 'GET'
				})
				
				const durableResponse = await durableObject.fetch(durableRequest)
				if (durableResponse.ok) {
					const publishSnapshot = await durableResponse.json()
					console.log('✅ 从Durable Object加载发布快照成功 (开发模式)')
					return createCorsResponse(publishSnapshot, 200, origin, true)
				} else {
					console.log('⚠️ Durable Object中未找到发布快照:', publishedSlug)
					return createCorsResponse({ error: '发布快照未找到' }, 404, origin, true)
				}
			}
			
			// 从R2存储加载
			const key = `publish-snapshots/${publishedSlug}.json`
			console.log('🔍 尝试从R2加载:', key)
			const object = await env.TLDRAW_BUCKET.get(key)
			
			if (!object) {
				console.log('⚠️ 发布快照未找到:', publishedSlug)
				return createCorsResponse({ error: '发布快照未找到' }, 404, origin, true)
			}
			
			const publishSnapshot = await object.json()
			console.log('✅ 发布快照已从R2加载:', publishedSlug)
			return createCorsResponse(publishSnapshot, 200, origin, true)
		} catch (error: any) {
			console.error('❌ 加载发布快照失败:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})

	
	// === 用户行为记录 API ===
	
	// 记录用户活动
	.post('/api/activities', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const activity = await request.json()
			const result = await roomService.recordUserActivity(activity)
			return createCorsResponse(result, 201, origin, true)
		} catch (error: any) {
			console.error('Error recording user activity:', error)
			return createCorsResponse({ error: error.message }, 400, origin, true)
		}
	})
	
	// 获取用户最近访问的房间 (兼容旧路径)
	.get('/api/activities/recent/:userId', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const url = new URL(request.url)
			const limit = parseInt(url.searchParams.get('limit') || '20')
			const recentRooms = await roomService.getUserRecentRooms(request.params.userId, limit)
			return createCorsResponse(recentRooms, 200, origin, true)
		} catch (error: any) {
			console.error('Error fetching user recent rooms:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})

	
	// 获取用户在特定房间的活动历史
	.get('/api/activities/:userId/:roomId', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const url = new URL(request.url)
			const limit = parseInt(url.searchParams.get('limit') || '50')
			const activities = await roomService.getUserRoomActivities(request.params.userId, request.params.roomId, limit)
			return createCorsResponse(activities, 200, origin, true)
		} catch (error: any) {
			console.error('Error fetching user room activities:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	
	// 获取房间访问统计
	.get('/api/rooms/:roomId/stats', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const url = new URL(request.url)
			const limit = parseInt(url.searchParams.get('limit') || '100')
			const stats = await roomService.getRoomVisitStats(request.params.roomId, limit)
			return createCorsResponse(stats, 200, origin, true)
		} catch (error: any) {
			console.error('Error fetching room visit stats:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	
	// 更新用户活动
	.put('/api/activities/:activityId', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const updates = await request.json()
			const activityId = parseInt(request.params.activityId)
			const result = await roomService.updateUserActivity(activityId, updates)
			return createCorsResponse(result, 200, origin, true)
		} catch (error: any) {
			console.error('Error updating user activity:', error)
			return createCorsResponse({ error: error.message }, 400, origin, true)
		}
	})

	// === .tldr 文件管理 API ===
	
	// 上传保存 .tldr 文件
	.post('/api/tldr-files', async (request, env) => {
		const tldrManager = new TldrFileManager(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const fileData = await request.json()
			const savedFile = await tldrManager.saveTldrFile(fileData)
			return createCorsResponse(savedFile, 201, origin, true)
		} catch (error: any) {
			console.error('Error saving .tldr file:', error)
			return createCorsResponse({ error: error.message }, 400, origin, true)
		}
	})

	// 获取 .tldr 文件内容
	.get('/api/tldr-files/:fileId', async (request, env) => {
		const tldrManager = new TldrFileManager(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const content = await tldrManager.getTldrFileContent(request.params.fileId)
			if (!content) {
				return createCorsResponse({ error: 'File not found' }, 404, origin, true)
			}
			
			// 增加下载计数
			await tldrManager.incrementDownloadCount(request.params.fileId)
			
			return createCorsResponse(content, 200, origin, true)
		} catch (error: any) {
			console.error('Error fetching .tldr file:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})

	// 获取用户的 .tldr 文件列表
	.get('/api/users/:userId/tldr-files', async (request, env) => {
		const tldrManager = new TldrFileManager(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const url = new URL(request.url)
			const limit = parseInt(url.searchParams.get('limit') || '20')
			const files = await tldrManager.getUserTldrFiles(request.params.userId, limit)
			return createCorsResponse(files, 200, origin, true)
		} catch (error: any) {
			console.error('Error fetching user .tldr files:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	
	.put('/api/rooms/:roomId/plaza', async (request, env) => {
		const roomService = new RoomService(env.ROOM_DB)
		const origin = request.headers.get('Origin')
		
		try {
			const { plaza } = await request.json()
			const room = await roomService.updateRoomPlazaStatus(request.params.roomId, !!plaza)
			return createCorsResponse(room, 200, origin, true)
		} catch (error: any) {
			return createCorsResponse({ error: error.message }, 400, origin, true)
		}
	})

	// ===== 永久分享配置管理 API =====
	
	// 创建永久分享配置
	.post('/api/share-configs/create', async (request, env) => {
		const origin = request.headers.get('Origin')
		const authHeader = request.headers.get('Authorization')
		
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return createCorsResponse({ error: 'Authorization required' }, 401, origin, true)
		}
		
		try {
			const config = await request.json()
			const { roomId, pageId, permission, description } = config
			
			// 生成唯一的分享ID
			const shareId = crypto.randomUUID()
			const now = Date.now()
			
			// 从Authorization header获取用户信息（简化版本）
			const token = authHeader.substring(7)
			const createdBy = token || 'anonymous' // 实际应该解析JWT获取用户ID
			
			const shareConfig = {
				shareId,
				roomId,
				pageId: pageId || null,
				permission,
				isActive: true,
				createdBy,
				createdAt: now,
				description: description || null
			}
			
			// 保存到数据库
			await env.ROOM_DB.prepare(`
				INSERT INTO share_configs (shareId, roomId, pageId, permission, isActive, createdBy, createdAt, description)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
				shareConfig.shareId,
				shareConfig.roomId,
				shareConfig.pageId,
				shareConfig.permission,
				shareConfig.isActive ? 1 : 0,
				shareConfig.createdBy,
				shareConfig.createdAt,
				shareConfig.description
			).run()
			
			console.log(`Created permanent share: ${shareId} for room ${roomId}`)
			return createCorsResponse(shareConfig, 201, origin, true)
		} catch (error: any) {
			console.error('Error creating share config:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	
	// 获取分享配置（通过分享ID）
	.get('/api/share-configs/:shareId', async (request, env) => {
		const origin = request.headers.get('Origin')
		const shareId = request.params.shareId
		
		try {
			const result = await env.ROOM_DB.prepare(`
				SELECT * FROM share_configs WHERE shareId = ?
			`).bind(shareId).first()
			
			if (!result) {
				return createCorsResponse({ error: 'Share not found' }, 404, origin, true)
			}
			
			// 检查是否被停用
			if (!result.isActive) {
				return createCorsResponse({ error: 'Share has been disabled' }, 403, origin, true)
			}
			
			// 转换数据库格式到API格式
			const shareConfig = {
				shareId: result.shareId,
				roomId: result.roomId,
				pageId: result.pageId,
				permission: result.permission,
				isActive: !!result.isActive,
				createdBy: result.createdBy,
				createdAt: result.createdAt,
				description: result.description
			}
			
			return createCorsResponse(shareConfig, 200, origin, true)
		} catch (error: any) {
			console.error('Error getting share config:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	
	// 更新分享配置（仅房主）
	.patch('/api/share-configs/:shareId', async (request, env) => {
		const origin = request.headers.get('Origin')
		const authHeader = request.headers.get('Authorization')
		const shareId = request.params.shareId
		
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return createCorsResponse({ error: 'Authorization required' }, 401, origin, true)
		}
		
		try {
			const updates = await request.json()
			const { permission, isActive, description } = updates
			
			// 构建动态更新查询
			const setParts = []
			const bindValues = []
			
			if (permission !== undefined) {
				setParts.push('permission = ?')
				bindValues.push(permission)
			}
			if (isActive !== undefined) {
				setParts.push('isActive = ?')
				bindValues.push(isActive ? 1 : 0)
			}
			if (description !== undefined) {
				setParts.push('description = ?')
				bindValues.push(description)
			}
			
			if (setParts.length === 0) {
				return createCorsResponse({ error: 'No updates provided' }, 400, origin, true)
			}
			
			bindValues.push(shareId)
			
			await env.ROOM_DB.prepare(`
				UPDATE share_configs SET ${setParts.join(', ')} WHERE shareId = ?
			`).bind(...bindValues).run()
			
			// 返回更新后的配置
			const updatedResult = await env.ROOM_DB.prepare(`
				SELECT * FROM share_configs WHERE shareId = ?
			`).bind(shareId).first()
			
			if (!updatedResult) {
				return createCorsResponse({ error: 'Share not found' }, 404, origin, true)
			}
			
			const shareConfig = {
				shareId: updatedResult.shareId,
				roomId: updatedResult.roomId,
				pageId: updatedResult.pageId,
				permission: updatedResult.permission,
				isActive: !!updatedResult.isActive,
				createdBy: updatedResult.createdBy,
				createdAt: updatedResult.createdAt,
				description: updatedResult.description
			}
			
			console.log(`Updated share config: ${shareId}`, updates)
			return createCorsResponse(shareConfig, 200, origin, true)
		} catch (error: any) {
			console.error('Error updating share config:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	
	// 获取房间的所有分享配置
	.get('/api/share-configs/room/:roomId', async (request, env) => {
		const origin = request.headers.get('Origin')
		const authHeader = request.headers.get('Authorization')
		const roomId = request.params.roomId
		
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return createCorsResponse({ error: 'Authorization required' }, 401, origin, true)
		}
		
		try {
			const results = await env.ROOM_DB.prepare(`
				SELECT * FROM share_configs WHERE roomId = ? ORDER BY createdAt DESC
			`).bind(roomId).all()
			
			const shareConfigs = results.results.map((result: any) => ({
				shareId: result.shareId,
				roomId: result.roomId,
				pageId: result.pageId,
				permission: result.permission,
				isActive: !!result.isActive,
				createdBy: result.createdBy,
				createdAt: result.createdAt,
				description: result.description
			}))
			
			return createCorsResponse(shareConfigs, 200, origin, true)
		} catch (error: any) {
			console.error('Error getting room share configs:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	
	// 删除分享配置
	.delete('/api/share-configs/:shareId', async (request, env) => {
		const origin = request.headers.get('Origin')
		const authHeader = request.headers.get('Authorization')
		const shareId = request.params.shareId
		
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return createCorsResponse({ error: 'Authorization required' }, 401, origin, true)
		}
		
		try {
			const result = await env.ROOM_DB.prepare(`
				DELETE FROM share_configs WHERE shareId = ?
			`).bind(shareId).run()
			
			if (result.changes === 0) {
				return createCorsResponse({ error: 'Share not found' }, 404, origin, true)
			}
			
			console.log(`Deleted share config: ${shareId}`)
			return createCorsResponse({ success: true }, 200, origin, true)
		} catch (error: any) {
			console.error('Error deleting share config:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})

	// ===== 房间权限管理 API =====
	
	// 获取房间权限配置
	.get('/api/rooms/:roomId/permissions', async (request, env) => {
		const origin = request.headers.get('Origin')
		const roomId = request.params.roomId
		
		try {
			const room = await env.ROOM_DB.prepare(`
				SELECT 
					id as roomId,
					owner_id as ownerId,
					owner_name as ownerName,
					COALESCE(permission, 'editor') as permission
				FROM rooms WHERE id = ?
			`).bind(roomId).first()
			
			if (!room) {
				return createCorsResponse({ error: 'Room not found' }, 404, origin, true)
			}
			
			const permissions = {
				roomId: room.roomId,
				ownerId: room.ownerId,
				ownerName: room.ownerName,
				permission: room.permission
			}
			
			return createCorsResponse(permissions, 200, origin, true)
		} catch (error: any) {
			console.error('Error getting room permissions:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	
	// 更新房间权限配置（仅房主）
	.patch('/api/rooms/:roomId/permissions', async (request, env) => {
		const origin = request.headers.get('Origin')
		const roomId = request.params.roomId
		
		try {
			const updates = await request.json()
			const { permission } = updates
			
			if (!permission) {
				return createCorsResponse({ error: 'Permission field is required' }, 400, origin, true)
			}
			
			if (!['viewer', 'assist', 'editor'].includes(permission)) {
				return createCorsResponse({ error: 'Invalid permission value' }, 400, origin, true)
			}
			
			await env.ROOM_DB.prepare(`
				UPDATE rooms SET permission = ? WHERE id = ?
			`).bind(permission, roomId).run()
			
			// 返回更新后的权限配置
			const updatedRoom = await env.ROOM_DB.prepare(`
				SELECT 
					id as roomId,
					owner_id as ownerId,
					owner_name as ownerName,
					COALESCE(permission, 'editor') as permission
				FROM rooms WHERE id = ?
			`).bind(roomId).first()
			
			if (!updatedRoom) {
				return createCorsResponse({ error: 'Room not found' }, 404, origin, true)
			}
			
			const permissions = {
				roomId: updatedRoom.roomId,
				ownerId: updatedRoom.ownerId,
				ownerName: updatedRoom.ownerName,
				permission: updatedRoom.permission
			}
			
			console.log(`Updated room permissions: ${roomId}`, updates)
			return createCorsResponse(permissions, 200, origin, true)
		} catch (error: any) {
			console.error('Error updating room permissions:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})
	
	// 检查用户对房间的访问权限
	.get('/api/rooms/:roomId/access', async (request, env) => {
		const origin = request.headers.get('Origin')
		const roomId = request.params.roomId
		const url = new URL(request.url)
		const userId = url.searchParams.get('userId')
		const userName = url.searchParams.get('userName')
		
		try {
			// 获取房间信息和权限配置
			const room = await env.ROOM_DB.prepare(`
				SELECT 
					id,
					owner_id as ownerId,
					owner_name as ownerName,
					COALESCE(permission, 'editor') as permission
				FROM rooms WHERE id = ?
			`).bind(roomId).first()
			
			if (!room) {
				return createCorsResponse({ error: 'Room not found' }, 404, origin, true)
			}
			
			// 判断用户身份和权限
			let userAccess = {
				userId: userId || undefined,
				userName: userName || undefined,
				isOwner: false,
				isGuest: !userId,
				effectivePermission: 'viewer' as const,
				accessReason: 'denied' as const
			}
			
			// 简化权限逻辑：房主始终有editor权限，非房主使用房间设置的permission
			if (userId && userId === room.ownerId) {
				userAccess.isOwner = true
				userAccess.effectivePermission = 'editor'
				userAccess.accessReason = 'owner'
			} else {
				// 非房主使用房间的permission设置
				userAccess.effectivePermission = room.permission
				userAccess.accessReason = 'visitor'
			}
			
			return createCorsResponse(userAccess, 200, origin, true)
		} catch (error: any) {
			console.error('Error checking user access:', error)
			return createCorsResponse({ error: error.message }, 500, origin, true)
		}
	})

	// ===== Board URL 路由处理 =====
	
	// 处理board URL格式: /board/{roomid}[.{pageIndex}][.v{x}.{y}.{width}.{height}]
	.get('/board/:boardPath', async (request, env) => {
		const origin = request.headers.get('Origin')
		const boardPath = request.params.boardPath
		
		console.log(`🔍 Worker: Board request - boardPath: ${boardPath}`)
		
		// 解析board路径
		const parsedBoard = parseBoardPath(boardPath)
		console.log(`🔍 Worker: Parsed board:`, parsedBoard)
		
		if (!parsedBoard) {
			console.error(`❌ Worker: Invalid board URL format: ${boardPath}`)
			return new Response('Invalid board URL format', { status: 400 })
		}
		
		const { roomId, pageId, viewport } = parsedBoard
		console.log(`🔍 Worker: roomId=${roomId}, pageId=${pageId}, viewport=`, viewport)
		
		// 简化：直接返回SPA，不检查房间存在性（让前端处理）
		if (env.ASSETS) {
			try {
				// 获取根页面(index.html)
				const rootRequest = new Request(new URL('/', request.url).href, {
					method: 'GET',
					headers: request.headers
				})
				const response = await env.ASSETS.fetch(rootRequest)
				
				if (response.ok) {
					console.log(`✅ Worker: Successfully served SPA for board: ${roomId}`)
					return response
				} else {
					console.error(`❌ Worker: Failed to fetch index.html: ${response.status}`)
				}
			} catch (error) {
				console.error(`❌ Worker: Error fetching assets:`, error)
			}
		} else {
			console.error(`❌ Worker: ASSETS not available`)
		}
		
		console.error(`❌ Worker: Board application not available for: ${boardPath}`)
		return new Response('Board application not available', { status: 503 })
	})

	// 处理 /r/ 路由格式: /r/{roomId}[?p={pageId}&d=v{x}.{y}.{width}.{height}]
	.get('/r/:roomId', async (request, env) => {
		const roomId = request.params.roomId
		console.log(`🔍 Worker: /r/ route request - roomId: ${roomId}`)
		
		const html = await generateDynamicHTML(env, 'iFlowOne');
		
		console.log(`✅ Worker: Successfully served SPA for /r/ route: ${roomId}`)
		return new Response(html, {
			headers: {
				'Content-Type': 'text/html',
				'Cache-Control': 'no-cache'
			}
		})
	})

	// Catch-all route MUST be the last route defined
	.all('*', async (request, env) => {
		const url = new URL(request.url)
		console.log(`🔄 Catch-all route handling: ${request.method} ${url.pathname}`)
		
		// Don't handle API routes here - they should have been handled by specific routes
		if (url.pathname.startsWith('/api/')) {
			console.log(`❌ API route ${url.pathname} reached catch-all - this shouldn't happen!`)
			return new Response('API endpoint not found', { status: 404 })
		}
		
		// For static assets (js, css, images, etc.), serve them directly
		if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
			if (env.ASSETS) {
				// 先尝试获取请求的文件
				const response = await env.ASSETS.fetch(request)
				
				// 如果文件存在，直接返回
				if (response.ok) {
					// 添加缓存控制头
					const headers = new Headers(response.headers)
					
					// 设置正确的 MIME 类型
					if (url.pathname.endsWith('.js')) {
						headers.set('Content-Type', 'application/javascript; charset=utf-8')
					} else if (url.pathname.endsWith('.css')) {
						headers.set('Content-Type', 'text/css; charset=utf-8')
					}
					
					// 对于固定文件名的资源，使用较短的缓存时间
					if (url.pathname.match(/\/assets\/index\.(js|css)$/)) {
						headers.set('Cache-Control', 'public, max-age=300, must-revalidate') // 5分钟缓存
						headers.set('ETag', `"${Date.now()}"`) // 动态 ETag
					} else {
						// 其他静态资源使用长期缓存
						headers.set('Cache-Control', 'public, max-age=31536000, immutable') // 1年缓存
					}
					
					return new Response(response.body, {
						status: response.status,
						headers
					})
				}
				
				// 如果是 index-*.js 或 index-*.css 文件不存在，尝试返回最新版本
				if (url.pathname.match(/\/assets\/index-\d+\.(js|css)$/)) {
					console.log(`⚠️ Requested asset not found: ${url.pathname}, attempting fallback...`)
					
					try {
						// 获取最新的资源文件名
						const latestAssets = await getLatestAssets(env)
						const isJS = url.pathname.endsWith('.js')
						const latestFilename = isJS ? latestAssets.js : latestAssets.css
						
						// 构建最新文件的请求
						const fallbackUrl = new URL(request.url)
						fallbackUrl.pathname = `/assets/${latestFilename}`
						const fallbackRequest = new Request(fallbackUrl.toString(), {
							method: request.method,
							headers: request.headers
						})
						
						console.log(`🔄 Fallback to latest asset: ${fallbackUrl.pathname}`)
						const fallbackResponse = await env.ASSETS.fetch(fallbackRequest)
						
						if (fallbackResponse.ok) {
							// 返回最新文件，但添加缓存控制头以避免长期缓存
							const headers = new Headers(fallbackResponse.headers)
							headers.set('Cache-Control', 'no-cache, must-revalidate')
							headers.set('X-Asset-Fallback', 'true')
							headers.set('X-Original-Request', url.pathname)
							
							return new Response(fallbackResponse.body, {
								status: fallbackResponse.status,
								headers
							})
						}
					} catch (error) {
						console.error('❌ Asset fallback failed:', error)
					}
				}
				
				// 其他静态资源或回退失败，返回404
				return new Response('Static asset not found', { 
					status: 404,
					headers: {
						'Content-Type': 'text/plain',
						'Cache-Control': 'no-cache'
					}
				})
			}
			return new Response('Static asset not found', { status: 404 })
		}
		
		// Admin routes should have been handled above, if we get here it's an unknown admin route
		if (url.pathname.startsWith('/admin')) {
			return new Response('Admin page not found', { status: 404 })
		}
		
		// For all other routes (including semantic routing), serve the React SPA
		if (env.ASSETS) {
			try {
				// 直接返回 index.html，让前端路由处理
				const indexRequest = new Request(url.origin + '/index.html', {
					method: 'GET',
					headers: request.headers
				})
				const response = await env.ASSETS.fetch(indexRequest)
				
				if (response.ok) {
					console.log(`✅ Served index.html for route: ${url.pathname}`)
					return response
				} else {
					console.error('Failed to fetch index.html:', response.status, response.statusText)
				}
			} catch (error) {
				console.error('Error serving SPA:', error)
			}
		} else {
			console.error('ASSETS binding not available')
		}
		
		// 最后的回退：尝试动态HTML生成器，失败则返回基本HTML
		try {
			const html = await generateDynamicHTML(env, 'iFlowOne 共享白板');
			return new Response(html, {
				status: 200,
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					'Pragma': 'no-cache',
					'Expires': '0'
				}
			});
		} catch (error) {
			console.error('Dynamic HTML generation failed, returning basic HTML:', error);
			// 返回基本的HTML，让浏览器尝试加载最常见的资源文件
			const basicHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>iFlowOne 共享白板</title>
	<style>body{margin:0;font-family:system-ui}</style>
</head>
<body>
	<div id="root"></div>
	<script>
		// 动态加载最新的资源文件
		fetch('/index.html').then(r=>r.text()).then(html=>{
			const jsMatch = html.match(/src="[^"]*\\/assets\\/(index-\\d+\\.js)"/);
			const cssMatch = html.match(/href="[^"]*\\/assets\\/(index-\\d+\\.css)"/);
			if(jsMatch) {
				const script = document.createElement('script');
				script.type = 'module';
				script.crossOrigin = 'anonymous';
				script.src = '/assets/' + jsMatch[1];
				document.head.appendChild(script);
			}
			if(cssMatch) {
				const link = document.createElement('link');
				link.rel = 'stylesheet';
				link.crossOrigin = 'anonymous';
				link.href = '/assets/' + cssMatch[1];
				document.head.appendChild(link);
			}
		}).catch(e=>console.error('Failed to load assets dynamically:', e));
	</script>
</body>
</html>`;
			return new Response(basicHtml, {
				status: 200,
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					'Pragma': 'no-cache',
					'Expires': '0'
				}
			});
		}
	})

export default {
	fetch: router.fetch,
}
