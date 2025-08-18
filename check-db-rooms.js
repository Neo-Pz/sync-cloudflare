// Script to check room data in database
// Run with: wrangler dev --local -c wrangler.toml --compatibility-date=2024-04-05

console.log('Checking room data in database...');

// This will be available in wrangler dev console
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (url.pathname === '/check-rooms') {
      try {
        // Get all rooms from database
        const result = await env.ROOM_DB.prepare('SELECT id, name, owner_name, created_at FROM rooms LIMIT 10').all();
        
        const roomData = result.results.map(row => ({
          id: row.id,
          name: row.name,
          ownerName: row.owner_name,
          hasName: !!row.name,
          nameLength: row.name ? row.name.length : 0,
          createdAt: new Date(row.created_at * 1000).toISOString()
        }));
        
        return new Response(JSON.stringify({
          totalRooms: result.results.length,
          rooms: roomData
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    return new Response('Visit /check-rooms to check database');
  }
};