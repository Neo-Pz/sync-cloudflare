/**
 * 资源加载器 - 支持fallback机制
 * 优先加载本地资源，失败时回退到CDN
 */
class ResourceLoader {
    constructor() {
        this.loadedResources = new Set();
        this.failedResources = new Set();
    }

    /**
     * 加载脚本资源with fallback
     * @param {string} localUrl - 本地资源URL
     * @param {string} fallbackUrl - 回退CDN URL
     * @param {Object} options - 加载选项
     */
    async loadScript(localUrl, fallbackUrl, options = {}) {
        const id = options.id || localUrl;
        
        if (this.loadedResources.has(id)) {
            return Promise.resolve();
        }

        try {
            await this.loadScriptFromUrl(localUrl, options);
            this.loadedResources.add(id);
            console.log(`✓ Loaded local resource: ${localUrl}`);
            return;
        } catch (error) {
            console.warn(`✗ Failed to load local resource: ${localUrl}`, error);
            this.failedResources.add(localUrl);
        }

        try {
            await this.loadScriptFromUrl(fallbackUrl, options);
            this.loadedResources.add(id);
            console.log(`✓ Loaded fallback resource: ${fallbackUrl}`);
        } catch (error) {
            console.error(`✗ Failed to load fallback resource: ${fallbackUrl}`, error);
            throw new Error(`Failed to load resource: ${id}`);
        }
    }

    /**
     * 从指定URL加载脚本
     */
    loadScriptFromUrl(url, options = {}) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = options.async !== false;
            
            if (options.crossorigin) {
                script.crossOrigin = options.crossorigin;
            }

            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${url}`));

            document.head.appendChild(script);
        });
    }

    /**
     * 加载字体资源with fallback
     */
    async loadFont(localUrl, fallbackUrl, fontName) {
        try {
            const font = new FontFace(fontName, `url(${localUrl})`);
            await font.load();
            document.fonts.add(font);
            console.log(`✓ Loaded local font: ${localUrl}`);
        } catch (error) {
            console.warn(`✗ Failed to load local font: ${localUrl}`, error);
            try {
                const font = new FontFace(fontName, `url(${fallbackUrl})`);
                await font.load();
                document.fonts.add(font);
                console.log(`✓ Loaded fallback font: ${fallbackUrl}`);
            } catch (fallbackError) {
                console.error(`✗ Failed to load fallback font: ${fallbackUrl}`, fallbackError);
            }
        }
    }

    /**
     * 批量加载资源配置
     */
    async loadResources(resourceConfig) {
        const promises = resourceConfig.map(config => {
            if (config.type === 'script') {
                return this.loadScript(config.local, config.fallback, config.options || {});
            } else if (config.type === 'font') {
                return this.loadFont(config.local, config.fallback, config.name);
            }
        });

        await Promise.all(promises);
    }

    /**
     * 获取加载统计
     */
    getStats() {
        return {
            loaded: Array.from(this.loadedResources),
            failed: Array.from(this.failedResources)
        };
    }
}

// 全局资源加载器实例
window.resourceLoader = new ResourceLoader();

// 预定义的资源配置
window.RESOURCE_CONFIG = [
    {
        type: 'script',
        local: '/libs/react.production.min.js',
        fallback: 'https://unpkg.com/react@18/umd/react.production.min.js',
        options: { crossorigin: 'anonymous', id: 'react' }
    },
    {
        type: 'script',
        local: '/libs/react-dom.production.min.js',
        fallback: 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
        options: { crossorigin: 'anonymous', id: 'react-dom' }
    },
    {
        type: 'script',
        local: '/libs/babel.min.js',
        fallback: 'https://unpkg.com/@babel/standalone/babel.min.js',
        options: { id: 'babel' }
    },
    {
        type: 'font',
        local: '/fonts/Shantell_Sans-Informal_Regular.woff2',
        fallback: 'https://cdn.tldraw.com/3.14.2/fonts/Shantell_Sans-Informal_Regular.woff2',
        name: 'Shantell Sans'
    }
];