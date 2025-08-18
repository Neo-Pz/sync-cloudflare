#!/usr/bin/env node

/**
 * 本地资源完整性验证脚本
 * 检查所有必需的本地资源是否存在且完整
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESOURCE_BASE = path.join(__dirname, '..', 'public');

// 必需的资源文件列表
const REQUIRED_RESOURCES = [
    // JavaScript 库
    'libs/react.production.min.js',
    'libs/react-dom.production.min.js', 
    'libs/babel.min.js',
    'libs/local-resource-manager.js',
    
    // 字体文件
    'fonts/Shantell_Sans-Informal_Regular.woff2',
    'fonts/Shantell_Sans-Normal-SemiBold.woff2',
    'fonts/IBMPlexMono-Medium.woff2',
    'fonts/IBMPlexSans-Medium.woff2',
    'fonts/Crimson-Roman.woff2',
    
    // CSS 样式
    'assets/tldraw-fonts.css'
];

// 文件大小阈值 (字节)
const MIN_FILE_SIZES = {
    'libs/react.production.min.js': 6000,        // React应该至少6KB
    'libs/react-dom.production.min.js': 100000,  // ReactDOM应该至少100KB
    'libs/babel.min.js': 2000000,                // Babel应该至少2MB
    'libs/local-resource-manager.js': 5000,      // 本地管理器应该至少5KB
    'fonts/Shantell_Sans-Informal_Regular.woff2': 100000,  // 字体应该至少100KB
    'assets/tldraw-fonts.css': 1000              // CSS应该至少1KB
};

function validateFile(relativePath) {
    const fullPath = path.join(RESOURCE_BASE, relativePath);
    const result = {
        path: relativePath,
        exists: false,
        size: 0,
        valid: false,
        error: null
    };
    
    try {
        if (!fs.existsSync(fullPath)) {
            result.error = 'File does not exist';
            return result;
        }
        
        result.exists = true;
        const stats = fs.statSync(fullPath);
        result.size = stats.size;
        
        // 检查最小文件大小
        const minSize = MIN_FILE_SIZES[relativePath];
        if (minSize && result.size < minSize) {
            result.error = `File too small (${result.size} < ${minSize} bytes)`;
            return result;
        }
        
        // 检查文件是否可读
        fs.accessSync(fullPath, fs.constants.R_OK);
        
        result.valid = true;
    } catch (error) {
        result.error = error.message;
    }
    
    return result;
}

function validateAllResources() {
    console.log('🔍 Validating local resources...\n');
    
    const results = REQUIRED_RESOURCES.map(validateFile);
    const valid = results.filter(r => r.valid);
    const invalid = results.filter(r => !r.valid);
    
    // 显示结果
    console.log('✅ Valid resources:');
    valid.forEach(r => {
        const sizeKB = (r.size / 1024).toFixed(2);
        console.log(`   ${r.path} (${sizeKB} KB)`);
    });
    
    if (invalid.length > 0) {
        console.log('\n❌ Invalid resources:');
        invalid.forEach(r => {
            console.log(`   ${r.path}: ${r.error}`);
        });
    }
    
    // 总结
    console.log(`\n📊 Summary:`);
    console.log(`   Total resources: ${REQUIRED_RESOURCES.length}`);
    console.log(`   Valid: ${valid.length}`);
    console.log(`   Invalid: ${invalid.length}`);
    
    const totalSize = valid.reduce((sum, r) => sum + r.size, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`   Total size: ${totalSizeMB} MB`);
    
    if (invalid.length === 0) {
        console.log('\n🎉 All resources are valid! Ready for deployment.');
        return true;
    } else {
        console.log('\n🚨 Some resources are missing or invalid. Please fix before deployment.');
        return false;
    }
}

function generateResourceManifest() {
    const results = REQUIRED_RESOURCES.map(validateFile);
    const validResources = results.filter(r => r.valid);
    
    const manifest = {
        generated: new Date().toISOString(),
        total: REQUIRED_RESOURCES.length,
        valid: validResources.length,
        resources: validResources.map(r => ({
            path: r.path,
            size: r.size,
            type: path.extname(r.path).substring(1)
        }))
    };
    
    const manifestPath = path.join(RESOURCE_BASE, 'resource-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`📋 Resource manifest saved to: ${manifestPath}`);
}

// 运行验证
if (import.meta.url === `file://${process.argv[1]}`) {
    const isValid = validateAllResources();
    if (isValid) {
        generateResourceManifest();
    }
    process.exit(isValid ? 0 : 1);
}

export { validateAllResources, validateFile };