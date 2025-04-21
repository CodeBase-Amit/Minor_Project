declare module 'mediasoup-client' {
  export class Device {
    constructor();
    load(options: { routerRtpCapabilities: any }): Promise<void>;
    rtpCapabilities: any;
    canProduce(kind: string): boolean;
    createSendTransport(options: any): any;
    createRecvTransport(options: any): any;
  }
} 