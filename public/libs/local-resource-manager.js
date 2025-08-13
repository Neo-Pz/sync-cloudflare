/**
 * 本地资源管理器 - 完全本地化的资源加载系统
 * 优先使用Cloudflare内部资源，最小化外部依赖
 */
class LocalResourceManager {
    constructor() {
        this.loadedResources = new Set();
        this.failedResources = new Set();
        this.loadingQueue = [];
        this.resourceMap = new Map();
        
        // 本地资源映射表
        this.initResourceMap();
    }

    initResourceMap() {
        // JavaScript库资源映射
        this.resourceMap.set('react', {
            local: '/libs/react.production.min.js',
            fallback: 'https://unpkg.com/react@18/umd/react.production.min.js',
            globalCheck: 'React'
        });
        
        this.resourceMap.set('react-dom', {
            local: '/libs/react-dom.production.min.js', 
            fallback: 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
            globalCheck: 'ReactDOM'
        });
        
        this.resourceMap.set('babel', {
            local: '/libs/babel.min.js',
            fallback: 'https://unpkg.com/@babel/standalone/babel.min.js',
            globalCheck: 'Babel'
        });

        // 字体资源映射
        this.resourceMap.set('shantell-regular', {
            local: '/fonts/Shantell_Sans-Informal_Regular.woff2',
            fallback: 'https://cdn.tldraw.com/3.14.2/fonts/Shantell_Sans-Informal_Regular.woff2',
            name: 'Shantell Sans',
            weight: '400',
            style: 'normal'
        });
        
        this.resourceMap.set('shantell-semibold', {
            local: '/fonts/Shantell_Sans-Normal-SemiBold.woff2',
            fallback: null, // 禁用fallback，仅使用本地版本
            name: 'Shantell Sans',
            weight: '600', 
            style: 'normal'
        });
        
        this.resourceMap.set('ibm-plex-mono', {
            local: '/fonts/IBMPlexMono-Medium.woff2',
            fallback: null, // 仅使用本地版本
            name: 'IBM Plex Mono',
            weight: '500',
            style: 'normal'
        });
        
        this.resourceMap.set('ibm-plex-sans', {
            local: '/fonts/IBMPlexSans-Medium.woff2',
            fallback: null, // 仅使用本地版本
            name: 'IBM Plex Sans',
            weight: '500',
            style: 'normal'
        });
        
        // 注释：Crimson字体可能不是TLDraw 2024的必需字体，仅使用本地版本
        this.resourceMap.set('crimson-roman', {
            local: '/fonts/Crimson-Roman.woff2',
            fallback: null, // 禁用fallback，仅使用本地版本
            name: 'Crimson Text',
            weight: '400',
            style: 'normal'
        });
    }

    /**
     * 检查资源是否已加载
     */
    isResourceLoaded(resourceId) {
        const resource = this.resourceMap.get(resourceId);
        if (resource && resource.globalCheck) {
            return window[resource.globalCheck] !== undefined;
        }
        return this.loadedResources.has(resourceId);
    }

    /**
     * 加载单个脚本资源
     */
    async loadScript(resourceId) {
        if (this.isResourceLoaded(resourceId)) {
            console.log(`✓ Resource already loaded: ${resourceId}`);
            return;
        }

        const resource = this.resourceMap.get(resourceId);
        if (!resource) {
            throw new Error(`Unknown resource: ${resourceId}`);
        }

        try {
            await this.loadScriptFromUrl(resource.local);
            this.loadedResources.add(resourceId);
            console.log(`✓ Loaded local resource: ${resourceId} from ${resource.local}`);
            return;
        } catch (error) {
            console.warn(`✗ Failed to load local resource: ${resourceId}`, error);
            this.failedResources.add(resource.local);
        }

        // Fallback to CDN
        try {
            await this.loadScriptFromUrl(resource.fallback);
            this.loadedResources.add(resourceId);
            console.log(`✓ Loaded fallback resource: ${resourceId} from ${resource.fallback}`);
        } catch (error) {
            console.error(`✗ Failed to load fallback resource: ${resourceId}`, error);
            throw new Error(`Failed to load resource: ${resourceId}`);
        }
    }

    /**
     * 从URL加载脚本
     */
    loadScriptFromUrl(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = false; // 保证加载顺序
            script.crossOrigin = 'anonymous';
            
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
            
            document.head.appendChild(script);
        });
    }

    /**
     * 加载字体资源
     */
    async loadFont(resourceId) {
        if (this.isResourceLoaded(resourceId)) {
            return;
        }

        const resource = this.resourceMap.get(resourceId);
        if (!resource || !resource.name) {
            throw new Error(`Invalid font resource: ${resourceId}`);
        }

        try {
            const font = new FontFace(
                resource.name, 
                `url(${resource.local})`,
                {
                    weight: resource.weight || '400',
                    style: resource.style || 'normal'
                }
            );
            await font.load();
            document.fonts.add(font);
            this.loadedResources.add(resourceId);
            console.log(`✓ Loaded local font: ${resourceId} from ${resource.local}`);
        } catch (error) {
            console.warn(`✗ Failed to load local font: ${resourceId}`, error);
            
            // 如果有fallback URL，尝试加载fallback
            if (resource.fallback) {
                try {
                    const font = new FontFace(
                        resource.name,
                        `url(${resource.fallback})`,
                        {
                            weight: resource.weight || '400',
                            style: resource.style || 'normal'
                        }
                    );
                    await font.load();
                    document.fonts.add(font);
                    this.loadedResources.add(resourceId);
                    console.log(`✓ Loaded fallback font: ${resourceId} from ${resource.fallback}`);
                } catch (fallbackError) {
                    console.error(`✗ Failed to load fallback font: ${resourceId}`, fallbackError);
                    console.warn(`⚠️ Font ${resourceId} will use system fallback`);
                }
            } else {
                console.warn(`⚠️ No fallback for font ${resourceId}, using system fallback`);
            }
        }
    }

    /**
     * 批量加载核心依赖
     */
    async loadCoreResources() {
        const coreResources = ['react', 'react-dom', 'babel'];
        const promises = coreResources.map(id => this.loadScript(id));
        await Promise.all(promises);
        console.log('✓ All core resources loaded successfully');
    }

    /**
     * 批量加载所有字体
     */
    async loadAllFonts() {
        const fontResources = [
            'shantell-regular'  // 只加载基础字体，其他作为可选
            // 暂时禁用有问题的字体
            // 'shantell-semibold', 
            // 'ibm-plex-mono', 
            // 'ibm-plex-sans',
            // 'crimson-roman'
        ];
        
        const promises = fontResources.map(id => this.loadFont(id));
        await Promise.allSettled(promises); // 字体加载失败不应该阻塞应用
        console.log('✓ Font loading process completed');
    }

    /**
     * 加载所有资源
     */
    async loadAllResources() {
        try {
            await this.loadCoreResources();
            await this.loadAllFonts();
            console.log('✓ All resources loaded successfully');
            
            // 触发全局事件
            window.dispatchEvent(new CustomEvent('allResourcesLoaded', {
                detail: {
                    loaded: Array.from(this.loadedResources),
                    failed: Array.from(this.failedResources)
                }
            }));
        } catch (error) {
            console.error('✗ Failed to load some core resources:', error);
            throw error;
        }
    }

    /**
     * 获取加载统计
     */
    getStats() {
        return {
            loaded: Array.from(this.loadedResources),
            failed: Array.from(this.failedResources),
            total: this.resourceMap.size,
            loadedCount: this.loadedResources.size,
            failedCount: this.failedResources.size
        };
    }

    /**
     * 验证关键资源是否可用
     */
    validateCoreResources() {
        const coreChecks = [
            { name: 'React', check: () => typeof window.React !== 'undefined' },
            { name: 'ReactDOM', check: () => typeof window.ReactDOM !== 'undefined' },
            { name: 'Babel', check: () => typeof window.Babel !== 'undefined' }
        ];

        const results = coreChecks.map(item => ({
            name: item.name,
            available: item.check(),
            status: item.check() ? '✓' : '✗'
        }));

        console.table(results);
        return results.every(r => r.available);
    }
}

// 创建全局实例
window.localResourceManager = new LocalResourceManager();

// 导出用于其他脚本使用
window.LRM = window.localResourceManager;