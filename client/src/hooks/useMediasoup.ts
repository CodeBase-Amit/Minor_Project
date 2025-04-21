import { useCallback, useEffect, useState } from 'react';
import { Device } from 'mediasoup-client';
import { SocketEvent } from '@/types/socket';
import { Socket } from 'socket.io-client';

export const useMediasoup = (socket: Socket, videoRef: React.RefObject<HTMLVideoElement>) => {
  const [device, setDevice] = useState<Device | null>(null);
  const [producerTransport, setProducerTransport] = useState<any>(null);
  const [videoProducer, setVideoProducer] = useState<any>(null);
  const [audioProducer, setAudioProducer] = useState<any>(null);
  const [consumerTransport, setConsumerTransport] = useState<any>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (!videoProducer) {
      console.warn('Cannot toggle video: video producer not available');
      return;
    }

    try {
      console.log(`Toggling video from ${isVideoEnabled ? 'on' : 'off'} to ${!isVideoEnabled ? 'on' : 'off'}`);
      
      // First toggle the local track
      const videoTrack = stream?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        console.log(`Local video track ${videoTrack.label} enabled set to ${videoTrack.enabled}`);
      }

      // Then toggle on the server
      if (isVideoEnabled) {
        await videoProducer.pause();
        console.log('Video producer paused');
      } else {
        await videoProducer.resume();
        console.log('Video producer resumed');
      }

      // Tell the server about the video state change
      socket.emit(SocketEvent.TOGGLE_VIDEO, { enabled: !isVideoEnabled }, (response: any) => {
        if (response && response.error) {
          console.error('Failed to toggle video:', response.error);
          return;
        }
        console.log('Video state changed on server:', !isVideoEnabled);
        setIsVideoEnabled(!isVideoEnabled);
      });
      
      // Fallback in case server doesn't respond
      setTimeout(() => {
        setIsVideoEnabled(!isVideoEnabled);
      }, 500);
    } catch (error) {
      console.error('Failed to toggle video:', error);
      setError('Failed to toggle video');
    }
  }, [isVideoEnabled, socket, videoProducer, stream]);

  // Toggle audio
  const toggleAudio = useCallback(async () => {
    if (!audioProducer) {
      console.warn('Cannot toggle audio: audio producer not available');
      return;
    }

    try {
      console.log(`Toggling audio from ${isAudioEnabled ? 'on' : 'off'} to ${!isAudioEnabled ? 'on' : 'off'}`);
      
      // First toggle the local track
      const audioTrack = stream?.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        console.log(`Local audio track ${audioTrack.label} enabled set to ${audioTrack.enabled}`);
      }

      // Then toggle on the server
      if (isAudioEnabled) {
        await audioProducer.pause();
        console.log('Audio producer paused');
      } else {
        await audioProducer.resume();
        console.log('Audio producer resumed');
      }

      // Tell the server about the audio state change
      socket.emit(SocketEvent.TOGGLE_AUDIO, { enabled: !isAudioEnabled }, (response: any) => {
        if (response && response.error) {
          console.error('Failed to toggle audio:', response.error);
          return;
        }
        console.log('Audio state changed on server:', !isAudioEnabled);
        setIsAudioEnabled(!isAudioEnabled);
      });
      
      // Fallback in case server doesn't respond
      setTimeout(() => {
        setIsAudioEnabled(!isAudioEnabled);
      }, 500);
    } catch (error) {
      console.error('Failed to toggle audio:', error);
      setError('Failed to toggle audio');
    }
  }, [isAudioEnabled, socket, audioProducer, stream]);

  // Initialize everything
  useEffect(() => {
    let mounted = true;
    
    // Clean up any previous state
    const cleanup = () => {
      console.log('Cleaning up mediasoup resources...');
      
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
          console.log(`Stopped track: ${track.kind}`);
        });
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      if (videoProducer) {
        try {
          videoProducer.close();
        } catch (e) {}
      }
      
      if (audioProducer) {
        try {
          audioProducer.close();
        } catch (e) {}
      }
      
      if (producerTransport) {
        try {
          producerTransport.close();
        } catch (e) {}
      }
      
      if (consumerTransport) {
        try {
          consumerTransport.close();
        } catch (e) {}
      }
    };
    
    // Clean up first to ensure we start fresh
    cleanup();
    
    // Main initialization function following the simpler approach from the working example
    async function setupMediasoup() {
      try {
        console.log('Starting mediasoup setup...');
        setIsInitializing(true);
        setError(null);
        
        // Step 1: Get router RTP capabilities
        console.log('Getting router RTP capabilities...');
        const routerRtpCapabilities = await new Promise<any>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Timeout waiting for RTP capabilities'));
          }, 10000);
          
          socket.emit(SocketEvent.GET_ROUTER_RTP_CAPABILITIES, {}, (response: any) => {
            clearTimeout(timeoutId);
            if (response.error) {
              reject(new Error(response.error));
              return;
            }
            resolve(response);
          });
        });
        
        if (!routerRtpCapabilities) {
          throw new Error('Failed to get RTP capabilities');
        }
        
        console.log('Router RTP capabilities received');
        
        // Step 2: Load the device
        console.log('Loading mediasoup device...');
        const newDevice = new Device();
        await newDevice.load({ routerRtpCapabilities });
        
        if (!mounted) return;
        setDevice(newDevice);
        
        // Step 3: Join router with device RTP capabilities
        console.log('Joining router...');
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Timeout joining router'));
          }, 10000);
          
          socket.emit(SocketEvent.JOIN_ROUTER, { rtpCapabilities: newDevice.rtpCapabilities }, (response: any) => {
            clearTimeout(timeoutId);
            if (response.error) {
              reject(new Error(response.error));
              return;
            }
            resolve();
          });
        });
        
        console.log('Successfully joined router');
        
        // Step 4: Create producer transport
        console.log('Creating producer transport...');
        const producerTransportParams = await new Promise<any>((resolve, reject) => {
          socket.emit(SocketEvent.CREATE_PRODUCER_TRANSPORT, {}, (response: any) => {
            if (response.error) {
              reject(new Error(response.error));
              return;
            }
            resolve(response);
          });
        });
        
        const newProducerTransport = newDevice.createSendTransport(producerTransportParams);
        
        newProducerTransport.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
          try {
            await new Promise<void>((resolve, reject) => {
              socket.emit(SocketEvent.CONNECT_PRODUCER_TRANSPORT, { dtlsParameters }, (response: any) => {
                if (response.error) {
                  reject(new Error(response.error));
                  return;
                }
                resolve();
              });
            });
            callback();
          } catch (error) {
            errback(error as Error);
          }
        });
        
        newProducerTransport.on('produce', async ({ kind, rtpParameters }: any, callback: any, errback: any) => {
          try {
            const { id } = await new Promise<any>((resolve, reject) => {
              socket.emit(SocketEvent.PRODUCE, { 
                transportId: newProducerTransport.id, 
                kind, 
                rtpParameters 
              }, (response: any) => {
                if (response.error) {
                  reject(new Error(response.error));
                  return;
                }
                resolve(response);
              });
            });
            callback({ id });
          } catch (error) {
            errback(error as Error);
          }
        });
        
        newProducerTransport.on('connectionstatechange', (state: string) => {
          console.log(`Producer transport connection state: ${state}`);
          if (state === 'failed') {
            newProducerTransport.close();
            setError('Connection failed. Please check your internet connection.');
          }
        });
        
        if (!mounted) return;
        setProducerTransport(newProducerTransport);
        
        // Step 5: Create consumer transport
        console.log('Creating consumer transport...');
        const consumerTransportParams = await new Promise<any>((resolve, reject) => {
          socket.emit(SocketEvent.CREATE_CONSUMER_TRANSPORT, {}, (response: any) => {
            if (response.error) {
              reject(new Error(response.error));
              return;
            }
            resolve(response);
          });
        });
        
        const newConsumerTransport = newDevice.createRecvTransport(consumerTransportParams);
        
        newConsumerTransport.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
          try {
            await new Promise<void>((resolve, reject) => {
              socket.emit(SocketEvent.CONNECT_CONSUMER_TRANSPORT, { dtlsParameters }, (response: any) => {
                if (response.error) {
                  reject(new Error(response.error));
                  return;
                }
                resolve();
              });
            });
            callback();
          } catch (error) {
            errback(error as Error);
          }
        });
        
        newConsumerTransport.on('connectionstatechange', (state: string) => {
          console.log(`Consumer transport connection state: ${state}`);
          if (state === 'failed') {
            newConsumerTransport.close();
            setError('Connection failed for receiving video. Please check your internet connection.');
          }
        });
        
        if (!mounted) return;
        setConsumerTransport(newConsumerTransport);
        
        // Step 6: Get user media and start producing
        console.log('Getting user media...');
        let mediaStream: MediaStream;
        try {
          // First try with both video and audio
          mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30 }
            }
          });
          console.log('Successfully got user media with video and audio');
        } catch (initialErr) {
          console.warn('Failed to get video and audio, trying with audio only:', initialErr);
          
          try {
            // Fallback to just audio if video fails
            mediaStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false
            });
            console.log('Successfully got user media with audio only');
          } catch (audioErr) {
            console.error('Failed to get audio only:', audioErr);
            
            try {
              // Last resort - try with just video
              mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: true
              });
              console.log('Successfully got user media with video only');
            } catch (videoErr) {
              console.error('Failed to get any media:', videoErr);
              throw new Error('Could not access microphone or camera. Please check your browser permissions.');
            }
          }
        }
        
        if (!mounted) return;
        
        // Step 7: Show local video
        if (videoRef.current) {
          if (videoRef.current.srcObject) {
            const oldStream = videoRef.current.srcObject as MediaStream;
            oldStream.getTracks().forEach(t => t.stop());
          }
          
          videoRef.current.srcObject = mediaStream;
          videoRef.current.muted = true; // Mute local audio to prevent echo
          
          try {
            await videoRef.current.play();
            console.log('Local video playing');
          } catch (playErr) {
            console.warn('Could not autoplay video - may need user interaction');
            // Add click handler for user interaction
            videoRef.current.onclick = async () => {
              try {
                await videoRef.current?.play();
              } catch (e) {
                console.error('Still could not play video after click');
              }
            };
          }
        }
        
        setStream(mediaStream);
        
        // Step 8: Produce video if available
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          console.log('Producing video...');
          const producer = await newProducerTransport.produce({ track: videoTrack });
          
          if (!mounted) return;
          setVideoProducer(producer);
          setIsVideoEnabled(true);
          
          producer.on('transportclose', () => {
            console.log('Video producer transport closed');
          });
          
          producer.on('trackended', () => {
            console.log('Video track ended');
          });
        }
        
        // Step 9: Produce audio if available
        const audioTrack = mediaStream.getAudioTracks()[0];
        if (audioTrack) {
          console.log('Producing audio...');
          const producer = await newProducerTransport.produce({ track: audioTrack });
          
          if (!mounted) return;
          setAudioProducer(producer);
          setIsAudioEnabled(true);
          
          producer.on('transportclose', () => {
            console.log('Audio producer transport closed');
          });
          
          producer.on('trackended', () => {
            console.log('Audio track ended');
          });
        }
        
        console.log('Mediasoup setup complete!');
      } catch (error) {
        console.error('Error during mediasoup setup:', error);
        if (mounted) {
          setError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (mounted) {
          setIsInitializing(false);
        }
      }
    }
    
    // Start the setup with a small delay to ensure socket is ready
    const setupTimeout = setTimeout(() => {
      setupMediasoup().catch(error => {
        console.error('Failed to setup mediasoup:', error);
        if (mounted) {
          setError(`Failed to setup video call: ${error}`);
          setIsInitializing(false);
        }
      });
    }, 1000);
    
    return () => {
      mounted = false;
      clearTimeout(setupTimeout);
      cleanup();
    };
  }, [socket, videoRef]);

  return {
    device,
    producerTransport,
    consumerTransport,
    videoProducer,
    audioProducer,
    isVideoEnabled,
    isAudioEnabled,
    toggleVideo,
    toggleAudio,
    error,
    isInitializing
  };
};

export default useMediasoup; 