// 简单的数据库迁移脚本
// 在浏览器控制台中运行，将plaza字段迁移到publish字段

async function migratePlazaToPublish() {
  console.log('🔄 开始迁移数据库：plaza → publish');
  
  try {
    // 1. 添加publish字段（如果不存在）
    const addColumnResponse = await fetch('/api/admin/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_column',
        sql: 'ALTER TABLE rooms ADD COLUMN publish INTEGER DEFAULT 0'
      })
    });
    
    if (addColumnResponse.ok) {
      console.log('✅ 添加publish字段成功');
    } else {
      console.log('⚠️ 添加字段可能已存在或失败');
    }
    
    // 2. 复制plaza数据到publish字段
    const migrateDataResponse = await fetch('/api/admin/migrate', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'migrate_data',
        sql: 'UPDATE rooms SET publish = plaza WHERE plaza IS NOT NULL'
      })
    });
    
    if (migrateDataResponse.ok) {
      console.log('✅ 数据迁移成功');
    }
    
    // 3. 验证迁移结果
    const verifyResponse = await fetch('/api/rooms');
    const rooms = await verifyResponse.json();
    const publishRooms = rooms.filter(r => r.publish);
    
    console.log(`✅ 迁移完成！发现 ${publishRooms.length} 个发布房间`);
    console.log('发布房间列表:', publishRooms.map(r => ({ id: r.id, name: r.name, publish: r.publish })));
    
  } catch (error) {
    console.error('❌ 迁移失败:', error);
  }
}

// 运行迁移
console.log('在浏览器控制台运行: migratePlazaToPublish()');