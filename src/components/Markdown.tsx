"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "./CodeBlock";

/** Markdown for `full` and for plain answers. Deliberately small. */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[15px] leading-[1.7] text-stone-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          h1: ({ children }) => <h3 className="mt-5 mb-2 font-semibold text-stone-900">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-5 mb-2 font-semibold text-stone-900">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-4 mb-2 font-semibold text-stone-900">{children}</h4>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-stone-900 underline underline-offset-2">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-stone-300 pl-3 text-stone-600">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-stone-300 px-2 py-1 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border-b border-stone-200 px-2 py-1 align-top">{children}</td>,
          code: ({ className, children, ...props }) => {
            const text = String(children).replace(/\n$/, "");
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            if (!lang && !text.includes("\n")) {
              return (
                <code
                  className="rounded bg-stone-200/70 px-[0.35em] py-[0.1em] font-mono text-[0.88em] text-stone-800"
                  {...props}
                >
                  {text}
                </code>
              );
            }
            return (
              <div className="mb-3 rounded-lg border border-stone-200 bg-white p-3">
                <CodeBlock code={text} language={lang ?? "text"} />
              </div>
            );
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
