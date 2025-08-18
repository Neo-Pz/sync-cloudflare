import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取构建生成的 index.html 来获取实际的文件名
const indexHtmlPath = path.join(__dirname, 'dist/index.html');
const workerPath = path.join(__dirname, 'worker/worker.ts');

if (!fs.existsSync(indexHtmlPath)) {
  console.error('❌ index.html not found. Please run "npm run build" first.');
  process.exit(1);
}

// 从 HTML 中提取资源文件名
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const jsMatch = indexHtml.match(/src="\/assets\/(index\.js)"/);
const cssMatch = indexHtml.match(/href="\/assets\/(index\.css)"/);

if (!jsMatch || !cssMatch) {
  console.error('❌ Could not extract asset filenames from index.html');
  process.exit(1);
}

const jsFileName = jsMatch[1];
const cssFileName = cssMatch[1];

console.log('📦 Found asset files:');
console.log('  JS:', jsFileName);
console.log('  CSS:', cssFileName);

// 读取 Worker 文件
if (!fs.existsSync(workerPath)) {
  console.error('❌ worker.ts not found');
  process.exit(1);
}

let workerContent = fs.readFileSync(workerPath, 'utf8');

// 替换 JS 文件引用 - 使用固定文件名
workerContent = workerContent.replace(
  /script\.src = '\/assets\/index-\d+\.js'/g,
  `script.src = '/assets/${jsFileName}'`
);

workerContent = workerContent.replace(
  /src="\/assets\/index-\d+\.js"/g,
  `src="/assets/${jsFileName}"`
);

// 替换 CSS 文件引用 - 使用固定文件名
workerContent = workerContent.replace(
  /link\.href = '\/assets\/index-\d+\.css'/g,
  `link.href = '/assets/${cssFileName}'`
);

workerContent = workerContent.replace(
  /href="\/assets\/index-\d+\.css"/g,
  `href="/assets/${cssFileName}"`
);

// 更新 getLatestAssets 函数的回退值 - 使用固定文件名
workerContent = workerContent.replace(
  /js: 'index-\d+\.js',\s*css: 'index-\d+\.css'/g,
  `js: '${jsFileName}',\n\t\tcss: '${cssFileName}'`
);

// 写回 Worker 文件
fs.writeFileSync(workerPath, workerContent);

console.log('✅ Updated worker.ts with fixed asset filenames');
console.log('📄 JS files updated');
console.log('🎨 CSS files updated');
console.log('🔄 Fallback values updated');

// 不再需要创建旧文件名的副本，因为使用固定文件名
console.log('🎯 Using fixed filenames - no fallback copies needed');

console.log('');
console.log('🚀 Ready for deployment!');