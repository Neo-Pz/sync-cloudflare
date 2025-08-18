// 在浏览器控制台中执行此脚本，用于检查和设置 plaza 房间

// 检查房间状态
function checkRooms() {
  const rooms = JSON.parse(localStorage.getItem('tldraw-rooms') || '[]');
  console.log(`总共有 ${rooms.length} 个房间`);
  
  const publishedRooms = rooms.filter(room => room.published);
  console.log(`其中 ${publishedRooms.length} 个房间已发布`);
  
  const plazaRooms = rooms.filter(room => room.plaza && room.published);
  console.log(`其中 ${plazaRooms.length} 个房间是广场房间`);
  
  console.log('所有房间:', rooms.map(r => ({
    id: r.id,
    name: r.name,
    published: r.published,
    plaza: r.plaza
  })));
  
  return { rooms, publishedRooms, plazaRooms };
}

// 设置广场房间
function setPlazaRooms() {
  const { rooms, publishedRooms } = checkRooms();
  
  if (publishedRooms.length === 0) {
    console.log('没有已发布的房间，将第一个房间设置为已发布');
    if (rooms.length > 0) {
      rooms[0].published = true;
      rooms[0].publishStatus = 'published';
      publishedRooms.push(rooms[0]);
    } else {
      console.log('没有任何房间，请先创建房间');
      return;
    }
  }
  
  // 将已发布房间的前两个设置为广场房间
  let count = 0;
  for (const room of publishedRooms) {
    if (count >= 2) break;
    room.plaza = true;
    room.lastModified = Date.now();
    count++;
    console.log(`将房间 "${room.name}" (${room.id}) 设置为广场房间`);
  }
  
  // 保存更改
  localStorage.setItem('tldraw-rooms', JSON.stringify(rooms));
  console.log(`成功设置 ${count} 个广场房间`);
  
  // 尝试同步到云端
  console.log('尝试同步到云端...');
  const plazaRooms = rooms.filter(room => room.plaza);
  for (const room of plazaRooms) {
    fetch(`/api/rooms/${room.id}/plaza`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plaza: true })
    })
    .then(response => {
      if (response.ok) {
        console.log(`成功同步房间 "${room.name}" (${room.id}) 到云端`);
      } else {
        console.error(`同步房间 "${room.name}" (${room.id}) 失败:`, response.statusText);
      }
    })
    .catch(error => {
      console.error(`同步房间 "${room.name}" (${room.id}) 出错:`, error);
    });
    
    // 同时确保房间已发布
    if (room.published) {
      fetch(`/api/rooms/${room.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: true, publishStatus: 'published' })
      })
      .then(response => {
        if (response.ok) {
          console.log(`成功更新房间 "${room.name}" (${room.id}) 的发布状态`);
        }
      })
      .catch(error => {
        console.error(`更新房间 "${room.name}" (${room.id}) 的发布状态出错:`, error);
      });
    }
  }
  
  return plazaRooms;
}

// 执行检查
console.log('=== 检查房间状态 ===');
checkRooms();

// 提示用户执行设置
console.log('\n=== 如需设置广场房间，请执行以下命令 ===');
console.log('setPlazaRooms()');

// 导出函数到全局作用域
window.checkRooms = checkRooms;
window.setPlazaRooms = setPlazaRooms; 