import { Tldraw } from 'tldraw'
import { useMemo, useState } from 'react'

// 最简版本 - 仅测试基本Tldraw是否能加载
export function App() {
	console.log('🚀 App-minimal 启动')
	
	const [roomId] = useState('default-room')
	
	// 创建一个基本的store
	const store = useMemo(() => {
		console.log('📦 创建基本store')
		return null // 让Tldraw使用默认store
	}, [])
	
	console.log('🎨 渲染Tldraw组件')
	
	return (
		<div style={{ position: 'fixed', inset: 0 }}>
			<div style={{ 
				position: 'absolute', 
				top: 10, 
				left: 10, 
				zIndex: 1000, 
				background: 'white', 
				padding: '5px 10px',
				borderRadius: '5px',
				fontSize: '12px'
			}}>
				Room: {roomId} | 最简版本测试
			</div>
			<Tldraw 
				onMount={(editor) => {
					console.log('✅ Tldraw 成功挂载', editor)
				}}
			/>
		</div>
	)
}