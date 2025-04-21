import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useSocket } from '@/context/SocketContext';
import { useAppContext } from '@/context/AppContext';
import { useMediasoup } from '@/hooks/useMediasoup';
import useConsumer from '@/hooks/useConsumer';
import { Button } from '@/components/ui/button';
import {
  Video as VideoIcon,
  X as XIcon,
  Mic as MicrophoneIcon,
  Phone as PhoneIcon,
  MicOff as MicrophoneOffIcon,
  VideoOff as VideoOffIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RemoteUser, User, USER_CONNECTION_STATUS } from '@/types/user';
import { UserAvatar } from '@/components/ui/user-avatar';
import { SocketEvent } from '@/types/socket';

// Create a separate component for remote peer to avoid hook rule violations
const RemotePeerVideo = ({ user, consumerTransport, socket }: { 
  user: RemoteUser, 
  consumerTransport: any, 
  socket: any 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!consumerTransport || !socket || !user.socketId) {
      return;
    }
    
    let mounted = true;
    let consumeTimeout: NodeJS.Timeout | null = null;
    let mediaStreams: MediaStream[] = []; // Track all created streams for cleanup
    
    // Clean up function
    const cleanup = () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          track.stop();
        });
        videoRef.current.srcObject = null;
      }
      
      // Also stop any other streams we created
      mediaStreams.forEach(stream => {
        stream.getTracks().forEach(track => {
          track.stop();
        });
      });
    };
    
    // Clean up first
    cleanup();
    
    const consumeFromPeer = async () => {
      try {
        console.log(`Consuming from peer: ${user.socketId}`);
        
        const response = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout requesting consumer details'));
          }, 10000);
          
          socket.emit(SocketEvent.CONSUME, { peerId: user.socketId }, (result: any) => {
            clearTimeout(timeout);
            if (result.error) {
              reject(new Error(result.error));
              return;
            }
            resolve(result);
          });
        });
        
        if (!response.consumerDetailsArray || response.consumerDetailsArray.length === 0) {
          console.warn(`No media available from peer: ${user.socketId}`);
          return;
        }
        
        // Create stream for the peer
        const stream = new MediaStream();
        mediaStreams.push(stream); // Keep track for cleanup
        let hasConsumers = false;
        
        // Process each consumer
        for (const details of response.consumerDetailsArray) {
          try {
            const consumer = await consumerTransport.consume({
              id: details.id,
              producerId: details.producerId,
              kind: details.kind,
              rtpParameters: details.rtpParameters
            });
            
            stream.addTrack(consumer.track);
            hasConsumers = true;
            
            // Resume video consumers (they start paused)
            if (details.kind === 'video') {
              socket.emit(SocketEvent.RESUME_CONSUMER, { consumerId: details.id });
            }
          } catch (err) {
            console.error(`Error consuming ${details.kind} from ${user.socketId}:`, err);
          }
        }
        
        // Attach stream to video element
        if (hasConsumers && videoRef.current) {
          videoRef.current.srcObject = stream;
          
          try {
            await videoRef.current.play();
            if (mounted) {
              setIsConnected(true);
            }
          } catch (playErr) {
            console.warn('Could not autoplay. May need user interaction');
            videoRef.current.onclick = async () => {
              try {
                await videoRef.current?.play();
                setIsConnected(true);
              } catch (e) {
                console.error('Still could not play after click');
              }
            };
          }
        }
      } catch (error) {
        console.error(`Error consuming from peer ${user.socketId}:`, error);
        if (mounted) {
          setError(error instanceof Error ? error.message : String(error));
          
          // Try again after delay
          consumeTimeout = setTimeout(() => {
            if (mounted) {
              console.log(`Retrying connection to peer: ${user.socketId}`);
              consumeFromPeer();
            }
          }, 5000);
        }
      }
    };
    
    // Start consuming
    consumeFromPeer();
    
    return () => {
      mounted = false;
      if (consumeTimeout) {
        clearTimeout(consumeTimeout);
      }
      cleanup();
    };
  }, [user.socketId, consumerTransport, socket]);
  
  return (
    <div className="relative w-full h-full min-h-[200px] bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className={cn(
          "w-full h-full object-cover",
          { "hidden": !isConnected || !user.hasVideo }
        )}
      />
      
      {(!isConnected || !user.hasVideo) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
          <UserAvatar user={user} className="w-20 h-20 mb-2" />
          <p className="text-sm font-medium">{user.username}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {error 
              ? "Connection error" 
              : !isConnected 
              ? "Connecting..." 
              : "Camera off"}
          </p>
        </div>
      )}
      
      <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
        {user.username}
        {!user.hasAudio && (
          <MicrophoneOffIcon className="h-3 w-3 ml-1 text-red-500" />
        )}
      </div>
    </div>
  );
};

export const VideoCallView = () => {
  const { socket } = useSocket();
  const { currentUser, remoteUsers: contextRemoteUsers, users: allUsers } = useAppContext();
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for media elements
  const localVideoRef = useRef<HTMLVideoElement>(null);
  
  // Set up mediasoup
  const {
    device: deviceLoaded,
    producerTransport,
    consumerTransport,
    toggleVideo,
    toggleAudio,
    isVideoEnabled,
    isAudioEnabled,
    error: connectionError,
    isInitializing,
  } = useMediasoup(socket, localVideoRef);
  
  // Create helper functions
  const leaveRoom = () => {
    // Close all media connections
    if (socket) {
      // Notify server we're leaving video call but staying in room
      socket.emit(SocketEvent.TOGGLE_VIDEO, { enabled: false });
      socket.emit(SocketEvent.TOGGLE_AUDIO, { enabled: false });
      
      // Stop all local media tracks
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        const mediaStream = localVideoRef.current.srcObject as MediaStream;
        mediaStream.getTracks().forEach(track => {
          track.stop();
          console.log(`Stopped track: ${track.kind}`);
        });
        localVideoRef.current.srcObject = null;
      }
    }
    
    console.log('Leaving video call');
  };
  
  const joinMediaRoom = () => {
    // This is handled by the useMediasoup hook initializer
    console.log('Joining video call');
  };
  
  // Update local state based on mediasoup state
  useEffect(() => {
    setVideoEnabled(isVideoEnabled);
    setAudioEnabled(isAudioEnabled);
  }, [isVideoEnabled, isAudioEnabled]);
  
  // Set up error handling
  useEffect(() => {
    if (connectionError) {
      setError(connectionError);
    }
  }, [connectionError]);
  
  // Join the media room when component mounts
  useEffect(() => {
    if (socket && currentUser.roomId) {
      joinMediaRoom();
    }
    
    return () => {
      leaveRoom();
    };
  }, [socket, currentUser.roomId]);
  
  // Handle remote users
  useEffect(() => {
    if (!socket || !currentUser.roomId) return;
    
    console.log('Current socket ID:', socket.id);
    console.log('Available users:', allUsers);
    
    // Update remote users when allUsers changes
    setRemoteUsers(
      allUsers.filter(user => 
        user.socketId !== socket.id && 
        user.status === USER_CONNECTION_STATUS.ONLINE
      )
    );

    // Handle user join/leave events
    const handleUserJoin = (data: { user: RemoteUser }) => {
      console.log('User joined video call:', data.user);
      setRemoteUsers(prevUsers => {
        // Check if user already exists
        if (prevUsers.find(u => u.socketId === data.user.socketId)) {
          return prevUsers;
        }
        // Only add if not the current user
        if (data.user.socketId !== socket.id) {
          return [...prevUsers, data.user];
        }
        return prevUsers;
      });
    };

    const handleUserDisconnect = (data: { user: RemoteUser }) => {
      console.log('User left video call:', data.user);
      setRemoteUsers(prevUsers => 
        prevUsers.filter(user => user.socketId !== data.user.socketId)
      );
    };

    // Handle video/audio state changes
    const handleVideoStateChange = (data: { socketId: string, hasVideo: boolean }) => {
      console.log('Video state changed for user:', data);
      setRemoteUsers(prevUsers => 
        prevUsers.map(user => 
          user.socketId === data.socketId 
            ? { ...user, hasVideo: data.hasVideo } 
            : user
        )
      );
    };

    const handleAudioStateChange = (data: { socketId: string, hasAudio: boolean }) => {
      console.log('Audio state changed for user:', data);
      setRemoteUsers(prevUsers => 
        prevUsers.map(user => 
          user.socketId === data.socketId 
            ? { ...user, hasAudio: data.hasAudio } 
            : user
        )
      );
    };
    
    socket.on(SocketEvent.USER_JOINED, handleUserJoin);
    socket.on(SocketEvent.USER_DISCONNECTED, handleUserDisconnect);
    socket.on(SocketEvent.VIDEO_STATE_CHANGED, handleVideoStateChange);
    socket.on(SocketEvent.AUDIO_STATE_CHANGED, handleAudioStateChange);
    
    // Request current users in room every 5 seconds to ensure we have the latest
    const getUsersInterval = setInterval(() => {
      console.log('Requesting users in room...');
      socket.emit(SocketEvent.GET_USERS_IN_ROOM, {}, (response: any) => {
        if (response && response.users) {
          const otherUsers = response.users.filter((user: RemoteUser) => user.socketId !== socket.id);
          console.log('Got users in room:', otherUsers);
          
          if (otherUsers.length > 0) {
            setRemoteUsers(otherUsers);
          }
        }
      });
    }, 5000);
    
    // Initial request for users
    socket.emit(SocketEvent.GET_USERS_IN_ROOM, {}, (response: any) => {
      if (response && response.users) {
        const otherUsers = response.users.filter((user: RemoteUser) => user.socketId !== socket.id);
        console.log('Initial users in room:', otherUsers);
        setRemoteUsers(otherUsers);
      }
    });
    
    return () => {
      socket.off(SocketEvent.USER_JOINED, handleUserJoin);
      socket.off(SocketEvent.USER_DISCONNECTED, handleUserDisconnect);
      socket.off(SocketEvent.VIDEO_STATE_CHANGED, handleVideoStateChange);
      socket.off(SocketEvent.AUDIO_STATE_CHANGED, handleAudioStateChange);
      clearInterval(getUsersInterval);
    };
  }, [socket, currentUser.roomId, allUsers]);
  
  // Render the remote peer video elements
  const renderRemotePeers = () => {
    if (remoteUsers.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
          <p className="text-muted-foreground mb-2">No one else is in the call</p>
          <p className="text-xs text-muted-foreground">Share the room link to invite others</p>
        </div>
      );
    }
    
    return remoteUsers.map(user => (
      <RemotePeerVideo 
        key={user.socketId}
        user={user}
        consumerTransport={consumerTransport}
        socket={socket}
      />
    ));
  };
  
  const handleEndCall = () => {
    leaveRoom();
    // Also close the sidebar or navigate away as needed
  };
  
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Video Call</h2>
        <Button variant="ghost" size="icon" onClick={handleEndCall}>
          <XIcon className="h-4 w-4" />
        </Button>
      </div>
      
      {error ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-destructive mb-2">Connection Error</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button 
              variant="outline" 
              onClick={() => {
                setError(null);
                joinMediaRoom();
              }}
            >
              Retry Connection
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Local video preview */}
          <div className="relative w-full h-48 bg-black rounded-lg overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "w-full h-full object-cover",
                { "hidden": !videoEnabled }
              )}
            />
            
            {!videoEnabled && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
                {currentUser && (
                  <>
                    <UserAvatar user={currentUser} className="w-16 h-16 mb-2" />
                    <p className="text-sm font-medium">{currentUser.username}</p>
                    <p className="text-xs text-muted-foreground mt-1">Camera off</p>
                  </>
                )}
              </div>
            )}
            
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs text-white flex items-center">
              You {!deviceLoaded && "(Loading...)"}
              {!audioEnabled && (
                <MicrophoneOffIcon className="h-3 w-3 ml-1 text-red-500" />
              )}
            </div>
          </div>
          
          {/* Remote videos */}
          <div className={cn(
            "grid gap-4 auto-rows-fr",
            remoteUsers.length === 1 ? "grid-cols-1" :
            remoteUsers.length === 2 ? "grid-cols-2" :
            remoteUsers.length >= 3 ? "grid-cols-2 md:grid-cols-3" : ""
          )}>
            {renderRemotePeers()}
          </div>
        </div>
      )}
      
      {/* Call controls */}
      <div className="flex items-center justify-center p-4 border-t gap-2">
        <Button
          variant={audioEnabled ? "default" : "destructive"}
          size="icon"
          onClick={() => toggleAudio()}
          disabled={!deviceLoaded || isInitializing}
          className="h-10 w-10 rounded-full"
        >
          {audioEnabled ? (
            <MicrophoneIcon className="h-5 w-5" />
          ) : (
            <MicrophoneOffIcon className="h-5 w-5" />
          )}
        </Button>
        
        <Button
          variant={videoEnabled ? "default" : "destructive"}
          size="icon"
          onClick={() => toggleVideo()}
          disabled={!deviceLoaded || isInitializing}
          className="h-10 w-10 rounded-full"
        >
          {videoEnabled ? (
            <VideoIcon className="h-5 w-5" />
          ) : (
            <VideoOffIcon className="h-5 w-5" />
          )}
        </Button>
        
        <Button
          variant="destructive"
          size="icon"
          onClick={handleEndCall}
          className="h-10 w-10 rounded-full"
        >
          <PhoneIcon className="h-5 w-5 transform rotate-135" />
        </Button>
      </div>
    </div>
  );
};

export default VideoCallView; 