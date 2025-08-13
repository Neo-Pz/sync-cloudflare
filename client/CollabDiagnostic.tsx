import { useEditor, usePeerIds } from 'tldraw'
import { useEffect } from 'react'

export function CollabDiagnostic() {
  const editor = useEditor()
  const peerIds = usePeerIds()

  useEffect(() => {
    if (!editor) {
      console.log('❌ 协作诊断: Editor未加载')
      return
    }

    console.log('=== 🔍 协作诊断信息 ===')
    console.log('编辑器状态:', !!editor)
    console.log('PeerIds数量:', peerIds.length)
    console.log('PeerIds内容:', peerIds)
    console.log('Store连接状态:', !!editor.store)
    console.log('协作者数量:', editor.getCollaborators().length)
    console.log('协作者详情:', editor.getCollaborators())
    
    // 检查store中的presence记录
    const allRecords = editor.store.allRecords()
    const presenceRecords = allRecords.filter(r => r.typeName === 'instance_presence')
    console.log('Presence记录数量:', presenceRecords.length)
    console.log('Presence记录:', presenceRecords)

    // 检查当前用户信息
    const currentUserId = editor.user.getId()
    const currentUserName = editor.user.getName()
    console.log('当前用户ID:', currentUserId)
    console.log('当前用户名:', currentUserName)

    // 检查WebSocket连接状态
    console.log('Store状态:', editor.store.isMerging ? '合并中' : '正常')
    
    console.log('========================')
  }, [editor, peerIds])

  if (!editor) {
    return (
      <div style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        background: 'red',
        color: 'white',
        padding: '8px',
        borderRadius: '4px',
        zIndex: 9999
      }}>
        Editor未加载
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      top: '50px',
      right: '10px',
      background: 'rgba(0,0,0,0.9)',
      color: 'white',
      padding: '12px',
      borderRadius: '8px',
      fontSize: '11px',
      zIndex: 9999,
      fontFamily: 'monospace',
      maxWidth: '300px',
      wordBreak: 'break-all'
    }}>
      <div><strong>协作诊断</strong></div>
      <div>Peers: {peerIds.length}</div>
      <div>Collaborators: {editor.getCollaborators().length}</div>
      <div>Store Connected: {editor.store ? '✅' : '❌'}</div>
      <div>Current User: {editor.user.getName()}</div>
      <div>User ID: {editor.user.getId()}</div>
      
      {peerIds.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <strong>协作者列表:</strong>
          {editor.getCollaborators().map(c => (
            <div key={c.userId} style={{ marginLeft: '8px', fontSize: '10px' }}>
              {c.userName} ({c.userId.slice(0,8)}...)
            </div>
          ))}
        </div>
      )}
    </div>
  )
}