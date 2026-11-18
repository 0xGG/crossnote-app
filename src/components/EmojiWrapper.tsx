import { shortNamePicture, transparentPixel } from "../render/emoji";

interface EmojiProps {
  size?: number;
  emoji?: string;
}

export function Emoji({ emoji = "", size = 16 }: EmojiProps) {
  const picture = shortNamePicture(emoji.replace(/^:|:$/g, ""));
  if (!picture) return null;
  return (
    <img
      className="emoji"
      src={transparentPixel}
      alt={picture.text}
      aria-label={picture.label}
      draggable={false}
      width={size}
      height={size}
      style={picture.style}
    />
  );
}
