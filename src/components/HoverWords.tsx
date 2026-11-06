import { Fragment } from 'react';

/**
 * Splits a heading into words so each one can respond to the pointer (see `.hw` in theme.css).
 * Screen readers still get one plain sentence: the spans carry no extra semantics.
 */
export function HoverWords({ text }: { text: string }) {
  const words = text.split(' ');
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className="hw">{w}</span>
          {i < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </>
  );
}
