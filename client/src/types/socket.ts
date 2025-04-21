import { Socket } from "socket.io-client"

type SocketId = string

enum SocketEvent {
    JOIN_REQUEST = "join-request",
    JOIN_ACCEPTED = "join-accepted",
    USER_JOINED = "user-joined",
    USER_DISCONNECTED = "user-disconnected",
    SYNC_FILE_STRUCTURE = "sync-file-structure",
    DIRECTORY_CREATED = "directory-created",
    DIRECTORY_UPDATED = "directory-updated",
    DIRECTORY_RENAMED = "directory-renamed",
    DIRECTORY_DELETED = "directory-deleted",
    FILE_CREATED = "file-created",
    FILE_UPDATED = "file-updated",
    FILE_RENAMED = "file-renamed",
    FILE_DELETED = "file-deleted",
    USER_OFFLINE = "offline",
    USER_ONLINE = "online",
    SEND_MESSAGE = "send-message",
    RECEIVE_MESSAGE = "receive-message",
    TYPING_START = "typing-start",
    TYPING_PAUSE = "typing-pause",
    USERNAME_EXISTS = "username-exists",
    REQUEST_DRAWING = "request-drawing",
    SYNC_DRAWING = "sync-drawing",
    DRAWING_UPDATE = "drawing-update",
    // Video call events
    GET_ROUTER_RTP_CAPABILITIES = "getRouterRtpCapabilities",
    JOIN_ROUTER = "join-router",
    CREATE_PRODUCER_TRANSPORT = "createProducerTransport",
    CONNECT_PRODUCER_TRANSPORT = "connectProducerTransport",
    PRODUCE = "produce",
    CREATE_CONSUMER_TRANSPORT = "createConsumerTransport",
    CONNECT_CONSUMER_TRANSPORT = "connectConsumerTransport",
    CONSUME = "consume",
    RESUME_CONSUMER = "resumeConsumer",
    TOGGLE_VIDEO = "toggle-video",
    TOGGLE_AUDIO = "toggle-audio",
    VIDEO_STATE_CHANGED = "video-state-changed",
    AUDIO_STATE_CHANGED = "audio-state-changed",
    VIDEO_CALL_STARTED = "video-call-started",
    GET_USERS_IN_ROOM = "get-users-in-room",
    USERS_IN_ROOM = "users-in-room",
    ACTIVE_EDITOR_CHANGED = "active-editor-changed",
}

interface SocketContext {
    socket: Socket
}

export { SocketEvent, SocketContext, SocketId }
