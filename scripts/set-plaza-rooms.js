// 设置广场房间脚本
// 此脚本用于在本地环境中设置一些房间为广场房间，方便测试

async function setPlazaRooms() {
  console.log('开始设置广场房间...');
  
  try {
    // 从 localStorage 获取房间列表
    const savedRooms = localStorage.getItem('tldraw-rooms');
    if (!savedRooms) {
      console.error('没有找到房间数据');
      return;
    }
    
    let rooms = JSON.parse(savedRooms);
    console.log(`找到 ${rooms.length} 个房间`);
    
    // 获取已发布的房间
    const publishedRooms = rooms.filter(room => room.published === true);
    console.log(`其中 ${publishedRooms.length} 个房间已发布`);
    
    if (publishedRooms.length === 0) {
      console.log('没有已发布的房间可以设置为广场房间');
      
      // 如果没有已发布的房间，将第一个房间设置为已发布并标记为广场房间
      if (rooms.length > 0) {
        console.log('将第一个房间设置为已发布并标记为广场房间');
        rooms[0].published = true;
        rooms[0].plaza = true;
        rooms[0].publishStatus = 'published';
        rooms[0].lastModified = Date.now();
        
        localStorage.setItem('tldraw-rooms', JSON.stringify(rooms));
        console.log('设置成功');
      }
      
      return;
    }
    
    // 将已发布房间的前两个设置为广场房间
    const plazaCount = Math.min(publishedRooms.length, 2);
    let plazaSet = 0;
    
    rooms = rooms.map(room => {
      if (room.published && plazaSet < plazaCount) {
        room.plaza = true;
        room.lastModified = Date.now();
        plazaSet++;
        console.log(`将房间 "${room.name}" (${room.id}) 设置为广场房间`);
      }
      return room;
    });
    
    // 保存更新后的房间列表
    localStorage.setItem('tldraw-rooms', JSON.stringify(rooms));
    console.log(`成功设置 ${plazaSet} 个广场房间`);
    
    // 尝试调用云端 API 更新房间
    console.log('尝试更新云端数据...');
    const plazaRooms = rooms.filter(room => room.plaza === true);
    
    for (const room of plazaRooms) {
      try {
        const response = await fetch(`/api/rooms/${room.id}/plaza`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ plaza: true })
        });
        
        if (response.ok) {
          console.log(`成功更新云端房间 "${room.name}" (${room.id})`);
        } else {
          console.error(`更新云端房间 "${room.name}" (${room.id}) 失败:`, await response.text());
        }
      } catch (error) {
        console.error(`更新云端房间 "${room.name}" (${room.id}) 时出错:`, error);
      }
    }
    
  } catch (error) {
    console.error('设置广场房间时出错:', error);
  }
  
  console.log('广场房间设置完成');
}

// 执行脚本
setPlazaRooms().catch(console.error);

// 使用说明：
// 1. 在浏览器控制台中运行此脚本
// 2. 或将此脚本添加到 HTML 页面中
// 3. 刷新页面查看效果 