import React from 'react'
import { useUser, SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'

export function Account() {
  const { user } = useUser()

  return (
    <div style={{
      position: 'fixed',
      top: '8px',
      right: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      zIndex: 2147483647,
      pointerEvents: 'auto'
    }}>
      <SignedOut>
        <SignInButton mode="modal">
          <button
            style={{
              background: 'var(--color-background)',
              border: '1px solid var(--color-divider)',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              color: 'var(--color-text)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-background)'
            }}
            title="登录"
          >
            👤 登录
          </button>
        </SignInButton>
      </SignedOut>

      <SignedIn>
        {/* 管理员链接 */}
        {(user?.publicMetadata?.role === 'admin' ||
          user?.emailAddresses?.[0]?.emailAddress?.includes('admin') ||
          ['010.carpe.diem@gmail.com', '1903399675@qq.com', 'admin@example.com', 'administrator@tldraw.com'].includes(user?.emailAddresses?.[0]?.emailAddress || '')) && (
          <button
            onClick={() => {
              window.open(
                typeof window !== 'undefined' && window.location.hostname === 'localhost'
                  ? 'http://localhost:8787/admin'
                  : '/admin',
                '_blank'
              )
            }}
            style={{
              background: '#f8f9fa',
              border: '1px solid #e9ecef',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              color: '#6b7280'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e9ecef'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f8f9fa'
            }}
            title="后台管理"
          >
            ⚙️ 后台
          </button>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <UserButton afterSignOutUrl="/" />
        </div>
      </SignedIn>
    </div>
  )
} 