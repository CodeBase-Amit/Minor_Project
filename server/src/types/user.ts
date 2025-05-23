enum USER_CONNECTION_STATUS {
	OFFLINE = "offline",
	ONLINE = "online",
}

interface User {
	username: string
	roomId: string
	status: USER_CONNECTION_STATUS
	cursorPosition: number
	typing: boolean
	currentFile: string | null
	socketId: string
	// Video call related properties
	rtpCapabilities?: any
	producerTransport?: any
	consumerTransport?: any
	producers?: Map<string, any>
	consumers?: Map<string, any>
	hasVideo?: boolean
	hasAudio?: boolean
}

export { USER_CONNECTION_STATUS, User }
