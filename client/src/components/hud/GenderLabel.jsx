import React from 'react';

// U+FE0E asks for the plain-text glyph, so phones don't swap in a fixed-colour emoji
export const GENDER_META = {
  female: { symbol: '♀︎', label: 'Woman', plural: 'Women', color: '#FF2A7A' },
  male: { symbol: '♂︎', label: 'Man', plural: 'Men', color: '#00F0FF' },
  other: { symbol: '⚧︎', label: 'Other', plural: 'Others', color: '#B57BFF' }
};

/**
 * Plain-text form ("♀ Woman"), for places that can't hold markup such as <option>
 */
export function genderText(gender, { plural = false } = {}) {
  const meta = GENDER_META[gender] || GENDER_META.other;
  return `${meta.symbol} ${plural ? meta.plural : meta.label}`;
}

/**
 * Coloured gender symbol, followed by the word unless `symbolOnly`
 */
export default function GenderLabel({ gender, plural = false, symbolOnly = false, className = '' }) {
  const meta = GENDER_META[gender] || GENDER_META.other;
  const word = plural ? meta.plural : meta.label;

  if (symbolOnly) {
    return (
      <span role="img" aria-label={word} title={word} className={className} style={{ color: meta.color }}>
        {meta.symbol}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span aria-hidden="true" style={{ color: meta.color }}>{meta.symbol}</span>
      {word}
    </span>
  );
}
