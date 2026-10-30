import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  printer: (
    <>
      <path d="M4 3h16v18H4zM7 3v5h10V3M7 17h10M12 8v4" />
      <path d="m10 12 2 2 2-2" />
    </>
  ),
  stl: (
    <>
      <path d="m12 3 9 16H3L12 3Z" />
      <path d="m12 3 1 10 8 6m-8-6L3 19" />
    </>
  ),
  zip: (
    <>
      <path d="M6 3h9l4 4v14H5V3h1Zm8 0v5h5M10 3v2m0 2v2m0 2v2" />
      <rect x="9" y="15" width="3" height="4" rx="1" />
    </>
  ),
  '3mf': (
    <>
      <path d="m12 2 9 5v10l-9 5-9-5V7l9-5ZM3 7l9 5 9-5m-9 5v10" />
    </>
  ),
  sheet: (
    <>
      <path d="M6 3h9l4 4v14H5V3h1Zm8 0v5h5M8 12h8m-8 4h6" />
    </>
  ),
};

export function DialogGlyph({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
