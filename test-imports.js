// 简单的模块导入测试
console.log('Testing module imports...');

try {
  // 测试基本导入
  import('./client/tldrFileHandler.ts')
    .then(() => {
      console.log('✅ tldrFileHandler.ts imports successfully');
    })
    .catch((error) => {
      console.error('❌ tldrFileHandler.ts import failed:', error.message);
    });

  import('./client/roomUtils.tsx')
    .then(() => {
      console.log('✅ roomUtils.tsx imports successfully');
    })
    .catch((error) => {
      console.error('❌ roomUtils.tsx import failed:', error.message);
    });

  import('./client/App.tsx')
    .then(() => {
      console.log('✅ App.tsx imports successfully');
    })
    .catch((error) => {
      console.error('❌ App.tsx import failed:', error.message);
    });

} catch (error) {
  console.error('Import test failed:', error);
}