'use client';

import { useState } from 'react';

interface Props {
  number: number;
  title: string;
  priceTag: string;
  description: string;
}

export default function StageCard({ number, title, priceTag, description }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`stage-card${open ? ' open' : ''}`}>
      <button className="stage-toggle" onClick={() => setOpen(o => !o)}>
        <div className="stage-number">{number}</div>
        <h4>{title}</h4>
        <div className="stage-price-tag">{priceTag}</div>
        <svg
          className="stage-chevron"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="stage-body">
        <p>{description}</p>
      </div>
    </div>
  );
}
