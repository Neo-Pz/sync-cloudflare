import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App.tsx'
import './index.css'
// 不再引入强制 Clerk 表单样式，保持官方多步注册流程

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY || !PUBLISHABLE_KEY.startsWith('pk_')) {
	throw new Error('Missing Clerk Publishable Key')
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<ClerkProvider 
			publishableKey={PUBLISHABLE_KEY}
		>
			<App />
		</ClerkProvider>
	</React.StrictMode>
)
