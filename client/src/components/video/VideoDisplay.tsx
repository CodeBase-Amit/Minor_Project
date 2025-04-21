import { useEffect, useRef, useState } from 'react';
import { MdMic, MdMicOff, MdVideocam, MdVideocamOff, MdRefresh } from 'react-icons/md';

interface VideoDisplayProps {
  displayName: string;
  videoRef?: React.RefObject<HTMLVideoElement>;
  hasVideo?: boolean;
  hasAudio?: boolean;
  isLocal?: boolean;
  onToggleVideo?: () => void;
  onToggleAudio?: () => void;
}

const VideoDisplay = ({
  displayName,
  videoRef: propVideoRef,
  hasVideo = true,
  hasAudio = true,
  isLocal = false,
  onToggleVideo,
  onToggleAudio
}: VideoDisplayProps) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = propVideoRef || localVideoRef;
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [checkCount, setCheckCount] = useState(0);

  // Force a re-render of the video element
  const handleRefreshVideo = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      setRetryCount(prev => prev + 1);
      
      // Try re-attaching the stream
      videoRef.current.srcObject = null;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play()
            .then(() => {
              console.log(`Video refreshed and playing for ${displayName}`);
              setIsPlaying(true);
            })
            .catch(error => {
              console.error(`Failed to play video after refresh for ${displayName}:`, error);
              
              // Add click handler for browsers requiring user interaction
              if (videoRef.current) {
                videoRef.current.onclick = async () => {
                  try {
                    const videoElement = videoRef.current;
                    if (videoElement) {
                      await videoElement.play();
                      console.log(`Video playing after click for ${displayName}`);
                      setIsPlaying(true);
                      videoElement.onclick = null;
                    }
                  } catch (clickError) {
                    console.error(`Still failed after click for ${displayName}:`, clickError);
                  }
                };
              }
            });
        }
      }, 100);
    } else {
      console.warn(`Cannot refresh video for ${displayName}: No stream available`);
    }
  };

  // Check if we actually have video tracks
  useEffect(() => {
    const checkVideoTracks = () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        const videoTracks = stream.getVideoTracks();
        const hasTrack = videoTracks.length > 0;
        const areTracksEnabled = videoTracks.some(track => track.enabled && track.readyState === 'live');
        
        const hasTrackChanged = hasTrack && areTracksEnabled !== hasVideoTrack;
        if (hasTrackChanged) {
          console.log(`Video track state changed for ${displayName}: ${areTracksEnabled ? 'active' : 'inactive'}`);
          setHasVideoTrack(areTracksEnabled);
        }
        
        if (checkCount % 10 === 0 || hasTrackChanged) { // Log every 10 checks or on change
          console.log(`Video element for ${displayName}: has video tracks: ${hasTrack}, tracks:`, 
            stream.getTracks().map(t => ({
              kind: t.kind,
              label: t.label,
              enabled: t.enabled,
              readyState: t.readyState,
              id: t.id.substring(0, 8) // Short id for readability
            })));
        }
        
        // If we have video but it's not playing, try to refresh
        if (hasVideo && hasTrack && (!isPlaying || !areTracksEnabled) && checkCount % 5 === 0) {
          console.log(`Video should be playing for ${displayName} but isn't. Auto-refreshing.`);
          handleRefreshVideo();
        }
        
        setCheckCount(prev => prev + 1);
      }
    };
    
    // Check immediately
    checkVideoTracks();
    
    // Then set up interval for periodic checks
    const interval = setInterval(checkVideoTracks, 2000);
    
    return () => {
      clearInterval(interval);
    };
  }, [videoRef, displayName, retryCount, hasVideoTrack, hasVideo, isPlaying, checkCount]);

  // Handle video playback
  useEffect(() => {
    if (videoRef.current) {
      const videoElement = videoRef.current;
      
      // Set up play event handler
      const handleLoadedMetadata = () => {
        console.log(`Video loaded for ${displayName}`);
        
        videoElement.play()
          .then(() => {
            console.log(`Video playing for ${displayName}`);
            setIsPlaying(true);
          })
          .catch(e => {
            console.error(`Failed to play video for ${displayName}:`, e);
            setIsPlaying(false);
            
            // Add click-to-play functionality for browsers that require user interaction
            videoElement.onclick = async () => {
              try {
                await videoElement.play();
                console.log(`Video now playing for ${displayName} after user interaction`);
                setIsPlaying(true);
                videoElement.onclick = null; // Remove handler after successful play
              } catch (clickError) {
                console.error(`Still failed to play after click for ${displayName}:`, clickError);
              }
            };
          });
      };
      
      // Additional event listeners
      const handlePlaying = () => {
        console.log(`Video is now playing for ${displayName}`);
        setIsPlaying(true);
      };
      
      const handlePause = () => {
        console.log(`Video was paused for ${displayName}`);
        setIsPlaying(false);
      };
      
      const handleError = (e: Event) => {
        console.error(`Video error for ${displayName}:`, e);
        setIsPlaying(false);
      };
      
      const handleStalled = () => {
        console.warn(`Video stalled for ${displayName}`);
      };
      
      const handleWaiting = () => {
        console.warn(`Video waiting for ${displayName}`);
      };
      
      // If we already have a stream, try to play immediately
      if (videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        if (stream.getVideoTracks().length > 0) {
          videoElement.play()
            .then(() => {
              console.log(`Video playing immediately for ${displayName}`);
              setIsPlaying(true);
            })
            .catch(e => {
              console.warn(`Could not autoplay video for ${displayName}, waiting for user interaction:`, e);
            });
        }
      }
      
      videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.addEventListener('playing', handlePlaying);
      videoElement.addEventListener('pause', handlePause);
      videoElement.addEventListener('error', handleError);
      videoElement.addEventListener('stalled', handleStalled);
      videoElement.addEventListener('waiting', handleWaiting);

      // Ensure video is always visible and styled correctly
      videoElement.style.display = 'block';
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'cover';
      
      return () => {
        videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        videoElement.removeEventListener('playing', handlePlaying);
        videoElement.removeEventListener('pause', handlePause);
        videoElement.removeEventListener('error', handleError);
        videoElement.removeEventListener('stalled', handleStalled);
        videoElement.removeEventListener('waiting', handleWaiting);
      };
    }
  }, [videoRef, displayName, isLocal, retryCount]);

  // Check if video is actually visible and fix common display issues
  useEffect(() => {
    if (videoRef.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              console.log(`Video for ${displayName} is now visible in viewport`);
            }
          });
        },
        { threshold: 0.1 }
      );
      
      observer.observe(videoRef.current);
      
      return () => {
        observer.disconnect();
      };
    }
  }, [videoRef, displayName]);

  // Debug info
  console.log(`Rendering VideoDisplay for ${displayName}:`, {
    hasVideo, hasAudio, isLocal, isPlaying, hasVideoTrack
  });

  // Determine if we should actually show the video element
  const shouldShowVideo = hasVideo && (isPlaying || isLocal) && hasVideoTrack;

  return (
    <div className="relative flex flex-col items-center mb-4 w-full max-w-[320px] mx-auto">
      <div className="relative w-full aspect-video bg-dark rounded-md overflow-hidden border border-darkHover">
        {shouldShowVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-darkest">
            <div className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center text-2xl font-semibold">
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>
        )}

        {/* Debug overlay - only shown in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="absolute top-0 right-0 bg-black bg-opacity-70 px-2 py-1 text-xs text-white">
            {isPlaying ? 'Playing' : 'Not playing'} | {hasVideoTrack ? 'Has track' : 'No track'}
          </div>
        )}
        
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-black bg-opacity-60">
          <div className="flex items-center justify-between">
            <span className="truncate">{displayName}</span>
            <div className="flex space-x-2">
              {isLocal && onToggleVideo && (
                <button
                  onClick={onToggleVideo}
                  className="p-1 rounded hover:bg-darkHover"
                  title={hasVideo ? 'Turn off camera' : 'Turn on camera'}
                >
                  {hasVideo ? <MdVideocam size={20} /> : <MdVideocamOff size={20} />}
                </button>
              )}
              {isLocal && onToggleAudio && (
                <button
                  onClick={onToggleAudio}
                  className="p-1 rounded hover:bg-darkHover"
                  title={hasAudio ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {hasAudio ? <MdMic size={20} /> : <MdMicOff size={20} />}
                </button>
              )}
              {!isLocal && (
                <>
                  {hasVideo ? <MdVideocam size={20} /> : <MdVideocamOff size={20} />}
                  {hasAudio ? <MdMic size={20} /> : <MdMicOff size={20} />}
                </>
              )}
              
              {/* Add refresh button if video should be playing but isn't */}
              {hasVideo && (!isPlaying || !hasVideoTrack) && (
                <button
                  onClick={handleRefreshVideo}
                  className="p-1 rounded hover:bg-darkHover"
                  title="Refresh video"
                >
                  <MdRefresh size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoDisplay; 