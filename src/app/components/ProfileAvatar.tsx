import Image from 'next/image';
import { getProfileAvatarImageStyle } from '@/lib/profileAvatarCrop';
import { getProfileAvatarPublicUrl } from '@/lib/supabase/profileAvatars';

type Props = {
  avatarPath: string | null | undefined;
  displayName: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  focusX?: number;
  focusY?: number;
  zoom?: number;
};

function getInitial(displayName: string): string {
  const firstCharacter = Array.from(displayName.trim())[0];

  return firstCharacter ? firstCharacter.toLocaleUpperCase() : '?';
}

export default function ProfileAvatar({
  avatarPath,
  displayName,
  size = 'medium',
  className = '',
  focusX = 50,
  focusY = 50,
  zoom = 100,
}: Props) {
  const classes = ['profile-avatar', `profile-avatar--${size}`, className]
    .filter(Boolean)
    .join(' ');

  if (avatarPath) {
    const avatarKey = [
      avatarPath,
      focusX,
      focusY,
      zoom,
      size,
    ].join(':');

    return (
      <span key={avatarKey} className={classes}>
        <Image
          src={getProfileAvatarPublicUrl(avatarPath)}
          alt={`${displayName} profile photo`}
          fill
          sizes={
            size === 'large'
              ? '80px'
              : size === 'small'
                ? '44px'
                : '64px'
          }
          style={getProfileAvatarImageStyle(focusX, focusY, zoom)}
        />
      </span>
    );
  }

  return (
    <span className={`${classes} profile-avatar--fallback`} aria-hidden="true">
      {getInitial(displayName)}
    </span>
  );
}
