import Anthropic from "@anthropic-ai/sdk";

export function errorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError)
    return "No valid Anthropic credentials — set ANTHROPIC_API_KEY or run `ant auth login`.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited. Try again in a moment.";
  if (err instanceof Anthropic.BadRequestError) return `Bad request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `API error ${err.status}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** True when the failure is just the browser hanging up (user hit "Just answer"). */
export function isAbort(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    err instanceof Anthropic.APIUserAbortError
  );
}

type Send = (event: unknown) => void;

/** Wraps a handler in a `text/event-stream` response. */
export function sse(handler: (send: Send) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send: Send = (event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false; // client went away
        }
      };
      try {
        await handler(send);
      } catch (err) {
        if (!isAbort(err)) {
          console.error(err);
          send({ type: "error", message: errorMessage(err) });
        }
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
