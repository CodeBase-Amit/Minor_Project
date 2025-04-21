import { useAppContext } from "@/context/AppContext"
import { RemoteUser, USER_CONNECTION_STATUS } from "@/types/user"
import Avatar from "react-avatar"
import { BsCameraVideo, BsCameraVideoOff } from "react-icons/bs"
import { MicOff, Mic } from "lucide-react"

function Users() {
    const { users } = useAppContext()

    return (
        <div className="flex min-h-[200px] flex-grow justify-center overflow-y-auto py-2">
            <div className="flex h-full w-full flex-wrap items-start gap-x-2 gap-y-6">
                {users.map((user) => {
                    return <User key={user.socketId} user={user} />
                })}
            </div>
        </div>
    )
}

const User = ({ user }: { user: RemoteUser }) => {
    const { username, status, hasVideo, hasAudio } = user
    const title = `${username} - ${status === USER_CONNECTION_STATUS.ONLINE ? "online" : "offline"}`

    return (
        <div
            className="relative flex w-[100px] flex-col items-center gap-2"
            title={title}
        >
            <div className="relative">
                <Avatar name={username} size="50" round={"12px"} title={title} />
                
                {/* Online/Offline indicator */}
                <div
                    className={`absolute right-0 top-0 h-3 w-3 rounded-full ${
                        status === USER_CONNECTION_STATUS.ONLINE
                            ? "bg-green-500"
                            : "bg-danger"
                    }`}
                ></div>
                
                {/* Video/Audio indicators - only show if user is in a call */}
                {(hasVideo !== undefined || hasAudio !== undefined) && (
                    <div className="absolute -bottom-1 -right-1 flex items-center space-x-1 bg-black/50 rounded-full px-1 py-0.5">
                        {hasVideo !== undefined && (
                            <span className="text-xs" title={hasVideo ? "Camera on" : "Camera off"}>
                                {hasVideo ? (
                                    <BsCameraVideo size={12} className="text-green-400" />
                                ) : (
                                    <BsCameraVideoOff size={12} className="text-gray-400" />
                                )}
                            </span>
                        )}
                        
                        {hasAudio !== undefined && (
                            <span className="text-xs" title={hasAudio ? "Microphone on" : "Microphone off"}>
                                {hasAudio ? (
                                    <Mic size={12} className="text-green-400" />
                                ) : (
                                    <MicOff size={12} className="text-gray-400" />
                                )}
                            </span>
                        )}
                    </div>
                )}
            </div>
            
            <p className="line-clamp-2 max-w-full text-ellipsis break-words">
                {username}
            </p>
        </div>
    )
}

export default Users
