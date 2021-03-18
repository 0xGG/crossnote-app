import {
  Emoji as EmojiMarketEmoji,
  EmojiData,
  Picker as EmojiMarketPicker,
} from "emoji-mart";

export const EmojiBackgroundImageFn = (set: string, sheetSize: number) => {
  return `${
    window.location.origin.match(/0xgg\./i) ? "/crossnote" : ""
  }/assets/emoji/twitter/64.png`;
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

interface EmojiPickerProps {
  showSkinTones?: boolean;
  onSelect?: (data: EmojiData) => void;
}
export function EmojiPicker(props: EmojiPickerProps) {
  return (
    <EmojiMarketPicker
      set={"twitter"}
      showSkinTones={props.showSkinTones}
      onSelect={props.onSelect}
      backgroundImageFn={EmojiBackgroundImageFn}
    ></EmojiMarketPicker>
  );
}
