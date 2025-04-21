import React from 'react';
import { User } from '@/types/user';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  user: User;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ user, className }) => {
  // Get first letter of username for fallback avatar
  const firstLetter = user.username ? user.username.charAt(0).toUpperCase() : '?';
  
  return (
    <div 
      className={cn(
        'relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gray-300',
        className
      )}
    >
      <div className="flex h-full w-full items-center justify-center bg-primary text-sm font-medium text-primary-foreground">
        {firstLetter}
      </div>
    </div>
  );
};

export default UserAvatar; 