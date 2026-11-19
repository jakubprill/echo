import type { Card } from "../core/types";
import { picUrl } from "./pics";

type Props = { card: Pick<Card, "emoji" | "pic" | "en">; size?: number | string };

/**
 * A word's picture: the built-in picture when the card has one the app knows, otherwise its emoji.
 * It is 1.15em square, so it scales with the font size of the place it is shown in, like the emoji did.
 */
export function WordPic({ card, size }: Props) {
  const url = picUrl(card.pic);
  const style = size === undefined ? undefined : { fontSize: typeof size === "number" ? `${size}px` : size };
  return (
    <span className="wordpic" style={style} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} /> : card.emoji}
    </span>
  );
}
