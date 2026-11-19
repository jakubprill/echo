import type { CSSProperties } from "react";
import type { Card } from "../core/types";

/** Number of visible symbols, so a picture made of two emoji can be drawn smaller. */
function symbols(s: string): number {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<unknown> } }).Segmenter;
  return Seg ? [...new Seg(undefined, { granularity: "grapheme" }).segment(s)].length : 1;
}

/** A word's picture: the card's image when it has one, otherwise its emoji. */
export function WordPic({ card, size }: { card: Pick<Card, "emoji" | "img" | "en">; size?: number | string }) {
  const style: CSSProperties | undefined = size === undefined ? undefined : { fontSize: size };
  if (card.img) return <img className="wordpic" src={card.img} alt={card.en} style={style} draggable={false} />;
  const e = card.emoji ?? "";
  return <span className="wordpic" style={style}>{symbols(e) > 1 ? <span className="wp-multi">{e}</span> : e}</span>;
}
