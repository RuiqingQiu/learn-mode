"use client";

import { Highlight, themes } from "prism-react-renderer";

export default function CodeBlock({
  code,
  language = "tsx",
  className = "",
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  return (
    <Highlight code={code.replace(/\n$/, "")} language={language} theme={themes.github}>
      {({ style, tokens, getLineProps, getTokenProps }) => (
        <pre
          style={{ ...style, background: "transparent" }}
          className={`overflow-x-auto font-mono text-[12.5px] leading-[1.65] ${className}`}
        >
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, j) => (
                <span key={j} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}
