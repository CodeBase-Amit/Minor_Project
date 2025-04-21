import { SocketId } from "./socket"

interface ActiveEditorData {
  roomId: string
  fileId: string
  cursor?: number
}

// Function to track active editor state per user
const activeEditorMap = new Map<string, Map<SocketId, { fileId: string, cursor?: number }>>()

// Get the active editor for a specific user in a room
const getActiveEditor = (roomId: string, socketId: SocketId) => {
  const roomEditors = activeEditorMap.get(roomId)
  if (!roomEditors) return null
  return roomEditors.get(socketId) || null
}

// Set the active editor for a user in a room
const setActiveEditor = (roomId: string, socketId: SocketId, fileId: string, cursor?: number) => {
  if (!activeEditorMap.has(roomId)) {
    activeEditorMap.set(roomId, new Map())
  }
  
  const roomEditors = activeEditorMap.get(roomId)!
  roomEditors.set(socketId, { fileId, cursor })

  // Update currentFile in userSocketMap if needed
  // This would be imported from another file in a real implementation
}

// Clear active editor data when a user leaves
const clearActiveEditor = (roomId: string, socketId: SocketId) => {
  const roomEditors = activeEditorMap.get(roomId)
  if (roomEditors) {
    roomEditors.delete(socketId)
    if (roomEditors.size === 0) {
      activeEditorMap.delete(roomId)
    }
  }
}

export { 
  ActiveEditorData, 
  getActiveEditor, 
  setActiveEditor, 
  clearActiveEditor 
} 