import { Emoji as EmojiMarketEmoji } from "emoji-mart";

export const EmojiBackgroundImageFn = (set: string, sheetSize: number) => {
  return "/assets/emoji/twitter/64.png";
};

interface EmojiProps {
  size?: number;
  emoji?: string;
}
export function Emoji(props: EmojiProps) {
  return (
    <EmojiMarketEmoji
      set={"twitter"}
      size={props.size || 16}
      emoji={props.emoji}
      backgroundImageFn={EmojiBackgroundImageFn}
    ></EmojiMarketEmoji>
  );
}
