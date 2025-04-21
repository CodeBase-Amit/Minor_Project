import { useRef, useEffect, useState, useCallback } from 'react';
import { useSocket } from '@/context/SocketContext';
import useConsumer from '@/hooks/useConsumer';
import VideoDisplay from './VideoDisplay';
import { SocketEvent } from '@/types/socket';
import { MdRefresh, MdWarning } from 'react-icons/md';

interface RemotePeerProps {
  peerId: string;
  displayName: string;
  consumerTransport: any;
  hasVideo?: boolean;
  hasAudio?: boolean;
}

// Maximum reconnection attempts before giving up
const MAX_RECONNECT_ATTEMPTS = 3;

const RemotePeer = ({
  peerId,
  displayName,
  consumerTransport,
  hasVideo = false,
  hasAudio = false
}: RemotePeerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { socket } = useSocket();
  const [videoState, setVideoState] = useState<boolean>(hasVideo);
  const [audioState, setAudioState] = useState<boolean>(hasAudio);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isConnectionLimitReached, setIsConnectionLimitReached] = useState(false);

  // Listen for video/audio state changes for this specific peer
  useEffect(() => {
    const handleVideoStateChange = ({ socketId, hasVideo }: { socketId: string; hasVideo: boolean }) => {
      if (socketId === peerId) {
        console.log(`Remote peer ${displayName} (${peerId}) video state changed to: ${hasVideo}`);
        setVideoState(hasVideo);
      }
    };

    const handleAudioStateChange = ({ socketId, hasAudio }: { socketId: string; hasAudio: boolean }) => {
      if (socketId === peerId) {
        console.log(`Remote peer ${displayName} (${peerId}) audio state changed to: ${hasAudio}`);
        setAudioState(hasAudio);
      }
    };

    socket.on(SocketEvent.VIDEO_STATE_CHANGED, handleVideoStateChange);
    socket.on(SocketEvent.AUDIO_STATE_CHANGED, handleAudioStateChange);

    return () => {
      socket.off(SocketEvent.VIDEO_STATE_CHANGED, handleVideoStateChange);
      socket.off(SocketEvent.AUDIO_STATE_CHANGED, handleAudioStateChange);
    };
  }, [socket, peerId, displayName]);

  // Update state when props change
  useEffect(() => {
    setVideoState(hasVideo);
    setAudioState(hasAudio);
  }, [hasVideo, hasAudio]);

  // Setup consumer for this peer
  const { consumers, error, stream, retryConsume } = useConsumer({
    peerId,
    consumerTransport,
    socket,
    videoRef
  });

  // Check for connection limit errors
  useEffect(() => {
    if (error) {
      const isConnectionLimit = error.includes('PeerConnection') || 
                               error.includes('Too many') || 
                               error.includes('Connection limit');
                               
      if (isConnectionLimit) {
        console.log(`Detected connection limit error for peer ${displayName}`);
        setIsConnectionLimitReached(true);
      }
    }
  }, [error, displayName]);

  // Function to reconnect to peer
  const handleReconnect = useCallback(() => {
    // Don't attempt to reconnect if we've reached the connection limit
    if (isConnectionLimitReached) {
      console.log(`Cannot reconnect to peer ${displayName}: connection limit reached`);
      return;
    }
    
    // Don't attempt to reconnect if we've reached max attempts
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      console.log(`Cannot reconnect to peer ${displayName}: max reconnect attempts reached`);
      return;
    }
    
    console.log(`Manually attempting to reconnect to peer ${displayName} (${peerId})`);
    setIsReconnecting(true);
    setReconnectAttempt(prev => prev + 1);
    
    // Clean up existing video element
    if (videoRef.current) {
      const stream = videoRef.current.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      videoRef.current.srcObject = null;
    }
    
    // Use the retryConsume function from useConsumer
    retryConsume();
    
    // Reset reconnecting state after a short delay
    setTimeout(() => {
      setIsReconnecting(false);
    }, 3000);
  }, [displayName, peerId, reconnectAttempt, isConnectionLimitReached, retryConsume]);

  // Track connection status with peer
  const isConnected = consumers.length > 0 && !error;
  const hasStream = !!stream && stream.getTracks().length > 0;

  // Log active consumers
  useEffect(() => {
    if (consumers.length > 0) {
      console.log(`Remote peer ${displayName} has ${consumers.length} active consumers:`, 
        consumers.map(c => `${c.kind}:${c.id}`));
    }
  }, [consumers, displayName]);

  // Check if stream has active tracks periodically
  useEffect(() => {
    if (!stream) return;
    
    const interval = setInterval(() => {
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      const activeVideoTracks = videoTracks.filter(t => t.enabled && t.readyState === 'live').length;
      const activeAudioTracks = audioTracks.filter(t => t.enabled && t.readyState === 'live').length;
      
      const shouldLog = Math.random() < 0.2; // Only log 20% of the time to reduce noise
      if (shouldLog) {
        console.log(`Peer ${displayName} stream status:`, {
          videoTracks: videoTracks.length > 0 ? 
            `${activeVideoTracks}/${videoTracks.length} active` : 'none',
          audioTracks: audioTracks.length > 0 ? 
            `${activeAudioTracks}/${audioTracks.length} active` : 'none'
        });
      }
      
      // Auto-retry if we have tracks but they're not active
      if ((videoState && videoTracks.length > 0 && activeVideoTracks === 0) || 
          (audioState && audioTracks.length > 0 && activeAudioTracks === 0)) {
        console.log(`Tracks for peer ${displayName} are in bad state, attempting auto-reconnect`);
        
        // Only try to reconnect if we haven't hit limits
        if (!isReconnecting && !isConnectionLimitReached && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
          handleReconnect();
        }
      }
    }, 10000); // Check every 10 seconds
    
    return () => {
      clearInterval(interval);
    };
  }, [stream, displayName, videoState, audioState, isReconnecting, handleReconnect, isConnectionLimitReached, reconnectAttempt]);

  // Get custom error message based on the error type
  const getErrorMessage = () => {
    if (isConnectionLimitReached) {
      return "Connection limit reached. Try refreshing the page.";
    }
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      return "Maximum reconnection attempts reached.";
    }
    return error;
  };

  return (
    <div className="relative" key={`peer-${peerId}-${reconnectAttempt}`}>
      {error && (
        <div className="text-red-500 text-sm mb-2 p-2 bg-red-500 bg-opacity-10 rounded flex items-center justify-between">
          <span className="flex items-center">
            <MdWarning className="mr-1" /> {getErrorMessage()}
          </span>
          {!isConnectionLimitReached && reconnectAttempt < MAX_RECONNECT_ATTEMPTS && (
            <button 
              onClick={handleReconnect} 
              disabled={isReconnecting}
              className="ml-2 px-2 py-1 bg-red-500 text-white text-xs rounded flex items-center"
            >
              <MdRefresh className={`mr-1 ${isReconnecting ? 'animate-spin' : ''}`} />
              {isReconnecting ? 'Reconnecting...' : 'Reconnect'}
            </button>
          )}
        </div>
      )}
      
      {!isConnected && !error && reconnectAttempt === 0 && (
        <div className="text-yellow-500 text-sm mb-2 p-2 bg-yellow-500 bg-opacity-10 rounded">
          Connecting to {displayName}...
        </div>
      )}
      
      <VideoDisplay
        displayName={displayName}
        videoRef={videoRef}
        hasVideo={videoState && hasStream}
        hasAudio={audioState}
      />
    </div>
  );
};

export default RemotePeer; 