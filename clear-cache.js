// Cloudflare缓存清理脚本
// 手动在Cloudflare Dashboard中执行

console.log('请在Cloudflare Dashboard中执行以下操作:');
console.log('1. 登录 https://dash.cloudflare.com/');
console.log('2. 选择域名 iflowone.com');
console.log('3. 前往 "缓存" -> "配置"');
console.log('4. 点击 "清除所有内容" 按钮');
console.log('5. 等待缓存清理完成（通常需要30秒）');
console.log('');
console.log('或者清理特定文件:');
console.log('- URL: https://iflowone.com/assets/index-Dp24z6Jj.js');
console.log('- URL: https://iflowone.com/assets/index-VNPXMyJj.js');
console.log('- URL: https://iflowone.com/index.html');

// 也可以尝试通过API清理 (需要API密钥)
const clearCache = async () => {
  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/zones/{zone-id}/purge_cache', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer YOUR_API_TOKEN',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: [
          'https://iflowone.com/',
          'https://iflowone.com/index.html',
          'https://iflowone.com/assets/index-Dp24z6Jj.js',
          'https://iflowone.com/assets/index-VNPXMyJj.js'
        ]
      })
    });
    
    const result = await response.json();
    console.log('Cache clear result:', result);
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
};

// clearCache(); // 取消注释并配置API密钥后执行