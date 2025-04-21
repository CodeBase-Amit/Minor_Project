import os from 'os';
import { types as mediasoupTypes } from 'mediasoup';

// Get local IP address
function getLocalIp() {
  const ifaces = os.networkInterfaces();
  let localIp = '127.0.0.1';
  
  Object.keys(ifaces).forEach((ifname) => {
    const iface = ifaces[ifname];
    if (!iface) return;
    
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) {
        localIp = info.address;
        return;
      }
    }
  });
  
  console.log("Detected local IP:", localIp);
  return localIp;
}

const config = {
  server: {
    http: {
      port: process.env.PORT || 3001
    },
    wrtc: {
      ip: process.env.WRTC_IP || getLocalIp(),
      announcedIp: process.env.ANNOUNCED_IP || getLocalIp()
    },
    mediasoup: {
      // Worker settings
      worker: {
        rtcMinPort: 10000,
        rtcMaxPort: 10100,
        logLevel: 'debug',
        logTags: [
          'info',
          'ice',
          'dtls',
          'rtp',
          'srtp',
          'rtcp',
          'rtx',
          'bwe',
          'score',
          'simulcast',
          'svc',
          'sctp'
        ],
      },
      // Router settings
      router: {
        mediaCodecs: [
          {
            kind: 'audio' as mediasoupTypes.MediaKind,
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2
          },
          {
            kind: 'video' as mediasoupTypes.MediaKind,
            mimeType: 'video/VP8',
            clockRate: 90000,
            parameters: {
              'x-google-start-bitrate': 1000
            }
          },
          {
            kind: 'video' as mediasoupTypes.MediaKind,
            mimeType: 'video/VP9',
            clockRate: 90000,
            parameters: {
              'profile-id': 2,
              'x-google-start-bitrate': 1000
            }
          },
          {
            kind: 'video' as mediasoupTypes.MediaKind,
            mimeType: 'video/h264',
            clockRate: 90000,
            parameters: {
              'packetization-mode': 1,
              'profile-level-id': '4d0032',
              'level-asymmetry-allowed': 1,
              'x-google-start-bitrate': 1000
            }
          },
          {
            kind: 'video' as mediasoupTypes.MediaKind,
            mimeType: 'video/h264',
            clockRate: 90000,
            parameters: {
              'packetization-mode': 1,
              'profile-level-id': '42e01f',
              'level-asymmetry-allowed': 1,
              'x-google-start-bitrate': 1000
            }
          }
        ] as mediasoupTypes.RtpCodecCapability[]
      },
      // WebRtcTransport settings
      webRtcTransport: {
        listenIps: [
          {
            ip: process.env.LISTEN_IP || '0.0.0.0',
            announcedIp: process.env.ANNOUNCED_IP || getLocalIp()
          }
        ],
        maxIncomingBitrate: 1500000,
        initialAvailableOutgoingBitrate: 1000000,
        iceServers: [
          {
            urls: [
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302',
              'stun:stun2.l.google.com:19302',
              'stun:stun3.l.google.com:19302',
              'stun:stun4.l.google.com:19302'
            ]
          }
        ]
      }
    }
  }
};

export default config; 