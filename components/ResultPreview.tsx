"use client";

import DOMPurify from "isomorphic-dompurify";

type Props = {
  result: string;
};

export default function ResultPreview({ result }: Props) {
  const cleanHtml = DOMPurify.sanitize(result, {
    USE_PROFILES: { html: true },
  });

  return (
    <div
      className="max-w-none"
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  );
}