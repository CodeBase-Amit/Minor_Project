import Users from "@/components/common/Users"
import { useAppContext } from "@/context/AppContext"
import { useSocket } from "@/context/SocketContext"
import { useViews } from "@/context/ViewContext"
import useResponsive from "@/hooks/useResponsive"
import { USER_CONNECTION_STATUS, USER_STATUS } from "@/types/user"
import { VIEWS } from "@/types/view"
import toast from "react-hot-toast"
import { GoSignOut } from "react-icons/go"
import { IoShareOutline } from "react-icons/io5"
import { LuCopy } from "react-icons/lu"
import { BsCameraVideo } from "react-icons/bs"
import { useNavigate } from "react-router-dom"
import { SocketEvent } from "@/types/socket"

function UsersView() {
    const navigate = useNavigate()
    const { viewHeight } = useResponsive()
    const { setStatus, remoteUsers, currentUser } = useAppContext()
    const { socket } = useSocket()
    const { setActiveView, setIsSidebarOpen } = useViews();

    const copyURL = async () => {
        const url = window.location.href
        try {
            await navigator.clipboard.writeText(url)
            toast.success("URL copied to clipboard")
        } catch (error) {
            toast.error("Unable to copy URL to clipboard")
            console.log(error)
        }
    }

    const shareURL = async () => {
        const url = window.location.href
        try {
            await navigator.share({ url })
        } catch (error) {
            toast.error("Unable to share URL")
            console.log(error)
        }
    }

    const leaveRoom = () => {
        socket.disconnect()
        setStatus(USER_STATUS.DISCONNECTED)
        navigate("/", {
            replace: true,
        })
    }

    const startVideoCall = () => {
        // Switch to video call view
        setActiveView(VIEWS.VIDEO_CALL);
        setIsSidebarOpen(true);
        
        // Notify other users that a video call has started
        if (socket && currentUser.roomId) {
            socket.emit("video-call-started", {
                username: currentUser.username,
                roomId: currentUser.roomId
            });
        }
        
        // Show notification to users
        const onlineUsers = remoteUsers.filter(user => user.status === USER_CONNECTION_STATUS.ONLINE);
        if (onlineUsers.length > 0) {
            toast.success(`Starting video call with ${onlineUsers.length} user${onlineUsers.length > 1 ? 's' : ''}`);
        } else {
            toast.success("No other users are online. Share the room link to invite others.");
        }
    }

    return (
        <div className="flex flex-col p-4" style={{ height: viewHeight }}>
            <h1 className="view-title">Users</h1>
            {/* List of connected users */}
            <Users />
            <div className="flex flex-col items-center gap-4 pt-4">
                {/* Start Video Call button */}
                <button
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-primary p-3 text-black font-medium"
                    onClick={startVideoCall}
                >
                    <BsCameraVideo size={22} />
                    <span>Start Video Call</span>
                </button>
                
                <div className="flex w-full gap-4">
                    {/* Share URL button */}
                    <button
                        className="flex flex-grow items-center justify-center rounded-md bg-white p-3 text-black"
                        onClick={shareURL}
                        title="Share Link"
                    >
                        <IoShareOutline size={26} />
                    </button>
                    {/* Copy URL button */}
                    <button
                        className="flex flex-grow items-center justify-center rounded-md bg-white p-3 text-black"
                        onClick={copyURL}
                        title="Copy Link"
                    >
                        <LuCopy size={22} />
                    </button>
                    {/* Leave room button */}
                    <button
                        className="flex flex-grow items-center justify-center rounded-md bg-primary p-3 text-black"
                        onClick={leaveRoom}
                        title="Leave room"
                    >
                        <GoSignOut size={22} />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default UsersView
