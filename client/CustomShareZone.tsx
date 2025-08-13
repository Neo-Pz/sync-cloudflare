import { memo } from 'react'
import { CollaboratorsMenu } from './CollaboratorsMenu'
import { CollaborationToolbar } from './CollaborationToolbar'
import { DefaultSharePanel } from 'tldraw'

const styles = {
  customShareZone: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    height: '100%',
  } as React.CSSProperties,
  
  collaborationTools: {
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  
  collaboratorsContainer: {
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
}

interface CustomShareZoneProps {
  roomId?: string
}

export const CustomShareZone = memo(function CustomShareZone({ roomId }: CustomShareZoneProps) {
  
  return (
    <div style={styles.customShareZone}>
      {/* 完全移除所有自定义协作组件，只使用TLDraw原生协作功能 */}
    </div>
  )
})