import React, { useEffect, useState } from 'react';
import { useViews } from '@/context/ViewContext';
import { VIEWS } from '@/types/view';
import { BsCameraVideo } from 'react-icons/bs';
import { Button } from '@/components/ui/button';

interface VideoCallNotificationProps {
  username: string;
  roomId: string;
  onJoin: () => void;
  onDecline: () => void;
}

export const VideoCallNotification: React.FC<VideoCallNotificationProps> = ({
  username,
  roomId,
  onJoin,
  onDecline
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const { setActiveView, setIsSidebarOpen } = useViews();

  useEffect(() => {
    // Auto-hide after 15 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      onDecline();
    }, 15000);

    return () => {
      clearTimeout(timer);
    };
  }, [onDecline]);

  const handleJoin = () => {
    setActiveView(VIEWS.VIDEO_CALL);
    setIsSidebarOpen(true);
    onJoin();
    setIsVisible(false);
  };

  const handleDecline = () => {
    onDecline();
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-dark p-4 shadow-lg border border-primary animate-in slide-in-from-right">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
          <BsCameraVideo size={20} />
        </div>
        <div className="flex-1">
          <h3 className="font-medium">Video Call Started</h3>
          <p className="text-sm text-muted-foreground">
            {username} has started a video call in room {roomId}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={handleJoin}
              className="bg-primary text-white hover:bg-primary/90"
            >
              Join
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDecline}
            >
              Decline
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCallNotification; 