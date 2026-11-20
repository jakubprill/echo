import type { CSSProperties } from "react";
import type { Card } from "../core/types";
import { picUrl } from "./pics";

type Props = { card: Pick<Card, "emoji" | "pic" | "img" | "en">; size?: number | string };

/** Number of visible symbols, so a picture made of two emoji can be drawn smaller. */
function symbols(s: string): number {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<unknown> } }).Segmenter;
  return Seg ? [...new Seg(undefined, { granularity: "grapheme" }).segment(s)].length : 1;
}

/**
 * A word's picture: the built-in picture (`pic`) when the app has it, then the card's image URL (`img`),
 * otherwise its emoji. It scales with the font size of the place it is shown in, like the emoji did.
 */
export function WordPic({ card, size }: Props) {
  const style: CSSProperties | undefined = size === undefined ? undefined : { fontSize: size };
  const url = picUrl(card.pic) ?? card.img;
  if (url) return <span className="wordpic" style={style}><img src={url} alt={card.en} draggable={false} /></span>;
  const e = card.emoji ?? "";
  return <span className="wordpic" style={style}>{symbols(e) > 1 ? <span className="wp-multi">{e}</span> : e}</span>;
}
