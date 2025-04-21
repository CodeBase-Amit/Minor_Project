import SplitterComponent from "@/components/SplitterComponent"
import ConnectionStatusPage from "@/components/connection/ConnectionStatusPage"
import Sidebar from "@/components/sidebar/Sidebar"
import WorkSpace from "@/components/workspace"
import { useAppContext } from "@/context/AppContext"
import { useSocket } from "@/context/SocketContext"
import useFullScreen from "@/hooks/useFullScreen"
import useUserActivity from "@/hooks/useUserActivity"
import { SocketEvent } from "@/types/socket"
import { USER_STATUS, User } from "@/types/user"
import { useEffect, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import VideoCallNotification from '@/components/video/VideoCallNotification'
import { useViews } from '@/context/ViewContext'
import { VIEWS } from '@/types/view'

function EditorPage() {
    // Listen user online/offline status
    useUserActivity()
    // Enable fullscreen mode
    useFullScreen()
    const navigate = useNavigate()
    const { roomId } = useParams()
    const { status, setCurrentUser, currentUser } = useAppContext()
    const { socket } = useSocket()
    const location = useLocation()
    const [videoCallNotification, setVideoCallNotification] = useState<{ username: string; roomId: string } | null>(null)
    const { setActiveView, setIsSidebarOpen } = useViews()

    useEffect(() => {
        if (currentUser.username.length > 0) return
        const username = location.state?.username
        if (username === undefined) {
            navigate("/", {
                state: { roomId },
            })
        } else if (roomId) {
            const user: User = { username, roomId }
            setCurrentUser(user)
            socket.emit(SocketEvent.JOIN_REQUEST, user)
        }
    }, [
        currentUser.username,
        location.state?.username,
        navigate,
        roomId,
        setCurrentUser,
        socket,
    ])

    useEffect(() => {
        if (!socket) return;
        
        const handleVideoCallStarted = (data: { username: string; roomId: string }) => {
            console.log('Video call started by:', data.username);
            
            // Don't show notification if this user started the call
            if (currentUser && data.username === currentUser.username) {
                return;
            }
            
            setVideoCallNotification(data);
        };
        
        socket.on("video-call-started", handleVideoCallStarted);
        
        return () => {
            socket.off("video-call-started", handleVideoCallStarted);
        };
    }, [socket, currentUser]);

    const handleJoinVideoCall = () => {
        setActiveView(VIEWS.VIDEO_CALL)
        setIsSidebarOpen(true)
    }

    const handleDeclineVideoCall = () => {
        setVideoCallNotification(null)
    }

    if (status === USER_STATUS.CONNECTION_FAILED) {
        return <ConnectionStatusPage />
    }

    return (
        <SplitterComponent>
            <Sidebar />
            <WorkSpace/>
            {videoCallNotification && (
                <VideoCallNotification
                    username={videoCallNotification.username}
                    roomId={videoCallNotification.roomId}
                    onJoin={handleJoinVideoCall}
                    onDecline={handleDeclineVideoCall}
                />
            )}
        </SplitterComponent>
    )
}

export default EditorPage
