import { useEffect, useState } from 'react';
import { SocketEvent } from '@/types/socket';
import { Socket } from 'socket.io-client';

interface ConsumerProps {
  peerId: string;
  consumerTransport: any;
  socket: Socket;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export const useConsumer = ({ peerId, consumerTransport, socket, videoRef }: ConsumerProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Set up consumer
  useEffect(() => {
    let mounted = true;
    let retryTimeout: NodeJS.Timeout | null = null;
    
    // Clean up any existing stream
    const cleanupVideo = () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          track.stop();
        });
        videoRef.current.srcObject = null;
      }
    };
    
    // Clean up first
    cleanupVideo();
    
    // Only proceed if we have the necessary components
    if (!consumerTransport || !peerId) {
      console.log(`Cannot consume: ${!consumerTransport ? 'no consumer transport' : 'no peer ID'}`);
      return;
    }
    
    async function consumeFromPeer() {
      try {
        setError(null);
        
        console.log(`Consuming media from peer: ${peerId}`);
        
        // Request to consume from the peer
        console.log(`Requesting to consume from peer: ${peerId} with consumer transport ID: ${consumerTransport.id}`);
        
        const { consumerDetailsArray } = await new Promise<{ consumerDetailsArray: any[] }>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout requesting consumer details'));
          }, 10000);
          
          socket.emit(SocketEvent.CONSUME, { peerId }, (response: any) => {
            clearTimeout(timeout);
            console.log("Consume response:", response);
            if (response.error) {
              reject(new Error(response.error));
              return;
            }
            resolve(response);
          });
        });
        
        if (!consumerDetailsArray || consumerDetailsArray.length === 0) {
          console.warn(`No consumer details returned for peer: ${peerId}`);
          setIsConnected(false);
          return;
        }
        
        console.log(`Received ${consumerDetailsArray.length} consumers to process`);
        
        // Create a single stream for all tracks
        const mediaStream = new MediaStream();
        
        // Process each consumer
        for (const consumerDetails of consumerDetailsArray) {
          try {
            const { id, producerId, kind, rtpParameters } = consumerDetails;
            
            console.log(`Creating consumer for ${kind} with ID: ${id}`);
            
            const consumer = await consumerTransport.consume({
              id,
              producerId,
              kind,
              rtpParameters
            });
            
            // Add the track to our stream
            mediaStream.addTrack(consumer.track);
            
            // Resume video consumers (they start paused)
            if (kind === 'video') {
              socket.emit(SocketEvent.RESUME_CONSUMER, { consumerId: id });
            }
            
            // Set up event handlers
            consumer.on('trackended', () => {
              console.log(`Remote ${kind} track ended`);
            });
            
            consumer.on('transportclose', () => {
              console.log(`Transport closed for ${kind} consumer`);
            });
          } catch (consumerError) {
            console.error(`Error creating consumer for peer ${peerId}:`, consumerError);
            // Continue with other consumers instead of failing completely
          }
        }
        
        // Attach to video element if we have tracks
        if (mediaStream.getTracks().length > 0) {
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
            
            try {
              await videoRef.current.play();
              console.log(`Playing remote media from peer: ${peerId}`);
              if (mounted) {
                setIsConnected(true);
              }
            } catch (error) {
              console.error('Error playing remote video:', error);
              
              // Set up click to play for browsers requiring user interaction
              videoRef.current.onclick = async () => {
                try {
                  await videoRef.current?.play();
                  console.log(`Playing after user interaction for peer: ${peerId}`);
                  setIsConnected(true);
                } catch (e) {
                  console.error('Still failed to play after user interaction:', e);
                }
              };
            }
          } else {
            console.error('No video element available for remote media');
          }
        } else {
          console.warn('No tracks available in the remote stream');
          setIsConnected(false);
        }
      } catch (error) {
        console.error(`Error consuming from peer ${peerId}:`, error);
        if (mounted) {
          setError(error instanceof Error ? error.message : String(error));
          setIsConnected(false);
          
          // Try again once after a short delay
          retryTimeout = setTimeout(() => {
            if (mounted) {
              console.log(`Retrying connection to peer: ${peerId}`);
              consumeFromPeer();
            }
          }, 5000);
        }
      }
    }
    
    // Start consuming
    consumeFromPeer();
    
    // Clean up
    return () => {
      mounted = false;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      cleanupVideo();
    };
  }, [peerId, consumerTransport, socket, videoRef]);
  
  return {
    error,
    isConnected,
    retry: () => {
      // Force remount of component by changing key
      if (videoRef.current) {
        if (videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
        }
      }
      setIsConnected(false);
      setError(null);
    }
  };
};

export default useConsumer; 