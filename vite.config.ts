import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

// 自定义SPA fallback插件 - 支持语义化路由
function spaFallback() {
	return {
		name: 'spa-fallback',
		configureServer(server: any) {
			server.middlewares.use((req: any, res: any, next: any) => {
				// 支持的SPA路由模式:
				// - /r/* 或 /ro/* (legacy)
				// - /p/* (快照模式)
				// - /galleries/*/rooms/*
				// - /users/*/rooms/*
				// - /plaza/*
				// - /workspace/*
				// - /rooms/*
				// - /board/* (新的board URL格式)
				const spaRoutePatterns = [
					/^\/r\//,
					/^\/ro\//,
					/^\/p\//,
					/^\/galleries\/[^/]+\/rooms\/[^/]+/,
					/^\/users\/[^/]+\/rooms\/[^/]+/,
					/^\/plaza\/[^/]+/,
					/^\/workspace\/[^/]+/,
					/^\/rooms\/[^/]+/,
					/^\/board\//
				]
				
				if (req.url && 
					!req.url.startsWith('/api/') && 
					!req.url.startsWith('/admin') &&
					!req.url.startsWith('/client/') &&
					!req.url.startsWith('/@') &&
					!req.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/) &&
					req.method === 'GET') {
					// 检查是否匹配任何SPA路由模式
					const cleanUrl = req.url.split('?')[0]
					const isSpaRoute = spaRoutePatterns.some(pattern => pattern.test(cleanUrl))
					
					// 防止根路径的无限重定向循环
					if (isSpaRoute && cleanUrl !== '/') {
						console.log(`[SPA] Rewriting ${req.url} -> /`)
						req.url = '/'
					}
				}
				next()
			})
		}
	}
}

// https://vitejs.dev/config/
export default defineConfig(() => {
	return {
		plugins: [
			// 临时禁用 cloudflare 插件来解决启动问题
			// cloudflare({
			// 	miniflare: {
			// 		inspectorPort: 0,
			// 	}
			// }),
			react(
				/* EXCLUDE_FROM_TEMPLATE_EXPORT_START */
				{ tsDecorators: true }
				/* EXCLUDE_FROM_TEMPLATE_EXPORT_END */
			),
			spaFallback(), // 重新启用修复后的SPA fallback
		],
		server: {
			// 配置代理解决CORS问题
			proxy: {
				// 代理API请求到Worker
				'/api': {
					target: 'http://localhost:8787',
					changeOrigin: true,
					secure: false,
					ws: true,
					configure: (proxy, options) => {
						proxy.on('proxyReq', (proxyReq, req, res) => {
							console.log('[PROXY] API request:', req.method, req.url);
						});
					}
				},
				// 代理本地静态资源 (开发时的fallback)
				'/libs': {
					target: 'http://localhost:3000',
					changeOrigin: true,
					rewrite: (path) => `/public${path}`
				},
				'/fonts': {
					target: 'http://localhost:3000',
					changeOrigin: true,
					rewrite: (path) => `/public${path}`
				},
				// 本地资源优先，减少外部依赖
				'/tldraw-assets': {
					target: 'http://localhost:3000',
					changeOrigin: true,
					rewrite: (path) => `/public/assets${path.replace(/^\/tldraw-assets/, '')}`
				}
			},
			// 禁用CORS检查（仅开发环境）
			cors: false,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': '*',
			}
		},
		// 配置构建选项
		build: {
			// Safari 兼容性配置
			target: ['es2015', 'safari11'],
			rollupOptions: {
				input: 'index.html',
				output: {
					// 使用固定文件名，便于动态更新
					entryFileNames: 'assets/index.js',
					chunkFileNames: 'assets/chunk.js',
					assetFileNames: 'assets/[name].[ext]'
				}
			}
		},
		// 防止Node.js built-ins进入worker构建
		define: {
			'process.getBuiltinModule': 'undefined',
			'globalThis.process': 'undefined'
		},
		// 浏览器兼容性配置
		esbuild: {
			target: ['es2015', 'safari11']
		}
	}
})
