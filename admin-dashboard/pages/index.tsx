import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/nextjs'
import { useState, useEffect } from 'react'
import Head from 'next/head'
import AdminDashboard from '../components/AdminDashboard'

export default function Home() {
  const { user, isLoaded } = useUser()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (isLoaded && user) {
      const adminEmails = [
        '010.carpe.diem@gmail.com',
        'admin@example.com',
        'administrator@tldraw.com'
      ]
      
      const userEmail = user.emailAddresses?.[0]?.emailAddress || ''
      const hasAdminRole = user.publicMetadata?.role === 'admin'
      const hasAdminEmail = adminEmails.includes(userEmail)
      const hasAdminInEmail = userEmail.includes('admin')
      
      setIsAdmin(hasAdminRole || hasAdminEmail || hasAdminInEmail)
    }
  }, [isLoaded, user])

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>流学 管理后台</title>
        <meta name="description" content="流学 共享白板管理后台" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-semibold text-gray-900">
                  tldraw 管理后台
                </h1>
              </div>
              
              <div className="flex items-center space-x-4">
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
                      登录
                    </button>
                  </SignInButton>
                </SignedOut>
                
                <SignedIn>
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-700">
                      {user?.fullName || user?.firstName || 'User'}
                    </span>
                    <UserButton afterSignOutUrl="/" />
                  </div>
                </SignedIn>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <SignedOut>
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                请先登录
              </h2>
              <p className="text-gray-600 mb-8">
                您需要管理员权限才能访问此页面
              </p>
              <SignInButton mode="modal">
                <button className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700">
                  登录
                </button>
              </SignInButton>
            </div>
          </SignedOut>

          <SignedIn>
            {isAdmin ? (
              <AdminDashboard />
            ) : (
              <div className="text-center py-12">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  访问被拒绝
                </h2>
                <p className="text-gray-600">
                  您没有管理员权限访问此页面
                </p>
              </div>
            )}
          </SignedIn>
        </main>
      </div>
    </>
  )
}