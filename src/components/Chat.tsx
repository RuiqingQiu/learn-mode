"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Composer from "./Composer";
import ChallengeCard from "./ChallengeCard";
import ExchangeView from "./ExchangeView";
import Onboarding from "./Onboarding";
import TeachPanel from "./TeachPanel";
import { api, blankExchange, fromRecord, readSSE } from "@/lib/client";
import type { LiveExchange } from "@/lib/client";
import { DEFAULT_PREFERENCES } from "@/lib/types";
import type {
  Challenge,
  Confidence,
  Mode,
  PredictPrompt,
  Preferences,
  QuizKind,
  SectionName,
  ShadowSectionName,
  ThreadSummary,
  TriageResult,
} from "@/lib/types";

type Ev = Record<string, unknown>;

export default function Chat({ ephemeral = false }: { ephemeral?: boolean }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<LiveExchange[]>([]);
  const [mode, setMode] = useState<Mode>("answer");
  const [busy, setBusy] = useState(false);
  const [flipKey, setFlipKey] = useState(0);
  const [flipNote, setFlipNote] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [focusComposer, setFocusComposer] = useState(0);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengePending, setChallengePending] = useState(false);
  const [challengeResult, setChallengeResult] = useState<{
    correct: boolean | null;
    feedback: string;
  } | null>(null);
  const [challengeDismissed, setChallengeDismissed] = useState(false);

  /** The session currently floated to the end of the thread — see `floated`. */
  const [floatedKey, setFloatedKey] = useState<string | null>(null);

  const bottom = useRef<HTMLDivElement>(null);

  /** Always target by the stable `key`, never by the server id. */
  const patch = useCallback((key: string, fn: (e: LiveExchange) => LiveExchange) => {
    setExchanges((prev) => prev.map((e) => (e.key === key ? fn(e) : e)));
  }, []);

  // ── thread lifecycle ──────────────────────────────────────────────────────

  const openThread = useCallback(async (id: string) => {
    setThreadId(id);
    setFloatedKey(null);
    // §4.0 — the toggle resets on every session boundary. Never persisted.
    setMode("answer");
    setFlipNote(false);
    const { exchanges } = await api.getThread(id);
    setExchanges(exchanges.map(fromRecord));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { preferences } = await api.getPreferences();
        setPrefs(preferences);
        setPrefsLoaded(true);
        const { threads } = await api.listThreads();
        if (threads.length) {
          setThreads(threads);
          await openThread(threads[0].id);
        } else {
          const { thread } = await api.createThread();
          setThreads([thread]);
          await openThread(thread.id);
        }
      } catch (err) {
        setFatal(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [openThread]);

  useEffect(() => {
    // Follow the exchange that is actually streaming. Jumping to the absolute
    // bottom yanks the user off a live answer — and off the reply box they are
    // typing in, once the protégé panel is no longer the last thing on the page.
    const streaming = exchanges.find(
      (e) =>
        e.status === "answering" ||
        e.status === "revealing" ||
        e.status === "shadowing" ||
        e.status === "diffing",
    );
    const el = streaming?.id ? document.getElementById(`ex-${streaming.id}`) : null;
    (el ?? bottom.current)?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [exchanges]);

  const newThread = async () => {
    const { thread } = await api.createThread();
    setThreads((t) => [thread, ...t]);
    await openThread(thread.id);
  };

  const refreshThreads = async () => {
    const { threads } = await api.listThreads();
    setThreads(threads);
  };

  // ── ASK: triage race, then either a plain answer or a prediction ──────────

  const send = async (question: string, sendMode: Mode, contextExchangeId?: string) => {
    if (!threadId) return;
    const key = crypto.randomUUID();
    // Asking something new means moving on: a finished session stops floating and
    // settles back beside its own exchange. A live one re-floats immediately.
    setFloatedKey(null);
    setExchanges((prev) => [...prev, blankExchange(key, question, sendMode)]);
    setBusy(true);

    try {
      await readSSE("/api/ask", { threadId, question, mode: sendMode, contextExchangeId }, (ev: Ev) => {
        switch (ev.type) {
          case "exchange":
            patch(key, (e) => ({
              ...e,
              id: ev.exchangeId as string,
              context_exchange_id: contextExchangeId ?? null,
            }));
            break;
          case "triage":
            patch(key, (e) => ({ ...e, triage: ev.result as TriageResult }));
            break;
          case "text":
            patch(key, (e) => ({ ...e, answerText: e.answerText + (ev.delta as string) }));
            break;
          case "predict":
            patch(key, (e) => ({
              ...e,
              status: "predicting",
              predictionId: ev.predictionId as string,
              prompt: ev.prompt as PredictPrompt,
            }));
            break;
          case "shadow_commit":
            patch(key, (e) => ({ ...e, status: "shadowing", predictionId: ev.predictionId as string }));
            break;
          case "shadow_ready":
            // Claude has finished solving. The solution deliberately does not
            // ride this event — it is fetched from /api/shadow once the user has
            // committed, so it is never in the browser before then.
            patch(key, (e) => ({ ...e, shadow: { ...e.shadow, solving: false } }));
            break;
          case "done":
            patch(key, (e) => (e.status === "answering" ? { ...e, status: "done" } : e));
            break;
          case "error":
            patch(key, (e) => ({ ...e, status: "error", error: ev.message as string }));
            break;
        }
      });
    } catch (err) {
      patch(key, (e) => ({ ...e, status: "error", error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
      void refreshThreads();
    }
  };

  // ── REVEAL ────────────────────────────────────────────────────────────────

  const reveal = async (key: string, id: string) => {
    patch(key, (e) => ({ ...e, status: "revealing", revealStreaming: true, sections: {} }));
    setBusy(true);
    try {
      await readSSE("/api/reveal", { exchangeId: id }, (ev: Ev) => {
        if (ev.type === "section") {
          const name = ev.name as SectionName;
          patch(key, (e) => ({
            ...e,
            sections: { ...e.sections, [name]: (e.sections[name] ?? "") + (ev.delta as string) },
          }));
        } else if (ev.type === "meta") {
          patch(key, (e) => ({ ...e, correctOption: (ev.correctOption as string) ?? null }));
        } else if (ev.type === "error") {
          patch(key, (e) => ({ ...e, status: "error", error: ev.message as string }));
        }
      });
      // Only close out the reveal if nothing else moved on — the user can start
      // explaining back while `full` is still streaming.
      patch(key, (e) =>
        e.status === "revealing" ? { ...e, status: "revealed" } : e,
      );

      // §4.0 — auto-reset to Answer once the reveal completes, visibly.
      setMode("answer");
      setFlipKey((k) => k + 1);
      setFlipNote(true);
      setTimeout(() => setFlipNote(false), 6000);

      // Then whatever the user asked for after the answer.
      const choice = (prefs ?? DEFAULT_PREFERENCES).reinforcement;
      if (choice === "teach_back") await explainBack(key, id);
      else await startQuiz(key, id, choice === "transfer_probe" ? "transfer" : "recall");
    } catch (err) {
      patch(key, (e) => ({ ...e, status: "error", error: err instanceof Error ? err.message : String(err) }));
    } finally {
      patch(key, (e) => ({ ...e, revealStreaming: false }));
      setBusy(false);
    }
  };

  const submitPrediction = async (ex: LiveExchange, text: string, confidence: Confidence | null) => {
    if (!ex.predictionId) return;
    patch(ex.key, (e) => ({ ...e, submitted: { text, confidence, skipped: false } }));
    await api.submitPrediction(ex.predictionId, text, confidence);
    await reveal(ex.key, ex.id);
  };

  const skipPrediction = async (ex: LiveExchange) => {
    if (!ex.predictionId) return;
    patch(ex.key, (e) => ({ ...e, submitted: { text: "", confidence: null, skipped: true } }));
    await api.skipPrediction(ex.predictionId);
    await reveal(ex.key, ex.id);
  };

  const askHint = async (ex: LiveExchange) => {
    if (!ex.predictionId) return;
    patch(ex.key, (e) => ({ ...e, hintPending: true }));
    try {
      const { hint } = await api.hint(ex.id, ex.predictionId);
      patch(ex.key, (e) => ({ ...e, hint, hintPending: false }));
    } catch (err) {
      patch(ex.key, (e) => ({
        ...e,
        hintPending: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  };

  // ── SKILL SHADOW ──────────────────────────────────────────────────────────

  const runShadowDiff = useCallback(
    async (key: string, id: string, known: string | null) => {
      // Claude's solution is fetched, not pushed — see the shadow_ready handler.
      const solution = known ?? (await api.shadowSolution(id)).solution;
      patch(key, (e) => ({
        ...e,
        status: "diffing",
        shadow: {
          ...e.shadow,
          solution,
          solving: false,
          awaitingSolution: false,
          diffing: true,
          sections: {},
        },
      }));
      try {
        await readSSE("/api/shadow-diff", { exchangeId: id }, (ev: Ev) => {
          if (ev.type === "section") {
            const name = ev.name as ShadowSectionName;
            patch(key, (e) => ({
              ...e,
              shadow: {
                ...e.shadow,
                sections: {
                  ...e.shadow.sections,
                  [name]: (e.shadow.sections[name] ?? "") + (ev.delta as string),
                },
              },
            }));
          } else if (ev.type === "error") {
            patch(key, (e) => ({ ...e, status: "error", error: ev.message as string }));
          }
        });
      } finally {
        patch(key, (e) => ({
          ...e,
          status: e.status === "diffing" ? "done" : e.status,
          shadow: { ...e.shadow, diffing: false },
        }));
      }
    },
    [patch],
  );

  /**
   * Start the diff as soon as both halves exist. Declarative rather than chained
   * off the commit, because the two can land in either order: the user may commit
   * while Claude is still working, or Claude may finish while they are still
   * typing. The ref is the double-fire guard (effects run twice in dev).
   */
  const diffStarted = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const e of exchanges) {
      if (e.mode !== "shadow" || !e.id) continue;
      if (!e.shadow.committed || e.shadow.skipped) continue;
      if (e.shadow.solving || e.shadow.diffing) continue;
      // Already diffed — including a rehydrated one.
      if (e.shadow.sections.axes) continue;
      if (diffStarted.current.has(e.key)) continue;
      diffStarted.current.add(e.key);
      void runShadowDiff(e.key, e.id, e.shadow.solution);
    }
  }, [exchanges, runShadowDiff]);

  const commitShadow = async (
    key: string,
    id: string,
    predictionId: string,
    approach: string,
    confidence: Confidence | null,
  ) => {
    patch(key, (e) => ({
      ...e,
      submitted: { text: approach, confidence, skipped: false },
      shadow: { ...e.shadow, committed: true, awaitingSolution: e.shadow.solving },
    }));
    const { solution } = await api.commitShadow(id, predictionId, approach, confidence);
    if (solution) patch(key, (e) => ({ ...e, shadow: { ...e.shadow, solution } }));
  };

  /** §1's escape hatch: the solution, no diff, no probe, and no comment on it. */
  const skipShadow = async (key: string, id: string, predictionId: string) => {
    patch(key, (e) => ({
      ...e,
      status: "done",
      submitted: { text: "", confidence: null, skipped: true },
      shadow: { ...e.shadow, skipped: true },
    }));
    const { solution } = await api.skipShadow(id, predictionId);
    patch(key, (e) => ({ ...e, shadow: { ...e.shadow, solution, solving: false } }));
  };

  const answerProbe = async (key: string, id: string, predictionId: string, answer: string) => {
    patch(key, (e) => ({ ...e, shadow: { ...e.shadow, probePending: true } }));
    try {
      const { correct, feedback } = await api.answerProbe(id, predictionId, answer);
      patch(key, (e) => ({
        ...e,
        shadow: {
          ...e.shadow,
          probeAnswer: answer,
          probeFeedback: feedback,
          probeCorrect: correct,
          probePending: false,
        },
      }));
    } catch (err) {
      patch(key, (e) => ({
        ...e,
        shadow: { ...e.shadow, probePending: false },
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  };

  const probeHint = async (key: string, id: string, predictionId: string) => {
    patch(key, (e) => ({ ...e, shadow: { ...e.shadow, hintPending: true } }));
    try {
      const { hint } = await api.shadowHint(id, predictionId);
      patch(key, (e) => ({ ...e, shadow: { ...e.shadow, hint, hintPending: false } }));
    } catch {
      patch(key, (e) => ({ ...e, shadow: { ...e.shadow, hintPending: false } }));
    }
  };

  // ── DELAYED TRANSFER CHALLENGE ────────────────────────────────────────────

  /**
   * Looked for only in an empty thread. Generation stamps `challenged_at`, so a
   * belief is re-tested at most once ever — the ref stops React's dev double-run
   * from burning that one shot on a duplicate call.
   */
  const challengeAsked = useRef<string | null>(null);
  useEffect(() => {
    if (!threadId || exchanges.length > 0 || challenge || challengeDismissed) return;
    if (challengeAsked.current === threadId) return;
    challengeAsked.current = threadId;
    void api
      .peekChallenge()
      .then(({ challenge }) => setChallenge(challenge))
      .catch(() => {});
  }, [threadId, exchanges.length, challenge, challengeDismissed]);

  const answerChallenge = async (answer: string) => {
    if (!challenge) return;
    setChallengePending(true);
    try {
      const res = await api.answerChallenge(challenge.id, answer);
      setChallengeResult(res);
    } catch (err) {
      setChallengeResult({ correct: null, feedback: err instanceof Error ? err.message : String(err) });
    } finally {
      setChallengePending(false);
    }
  };

  // ── QUIZ / TRANSFER PROBE ─────────────────────────────────────────────────

  const startQuiz = async (key: string, id: string, kind: QuizKind) => {
    patch(key, (e) => ({ ...e, quizPending: true, quizDismissed: false }));
    try {
      const { questions } = await api.startQuiz(id, kind);
      patch(key, (e) => ({ ...e, quiz: questions, quizPending: false }));
    } catch (err) {
      patch(key, (e) => ({
        ...e,
        quizPending: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  };

  const answerQuiz = async (key: string, id: string, questionId: string, text: string) => {
    patch(key, (e) => ({ ...e, quizPending: true }));
    try {
      const { questions } = await api.answerQuiz(id, questionId, text);
      patch(key, (e) => ({ ...e, quiz: questions, quizPending: false }));
    } catch (err) {
      patch(key, (e) => ({
        ...e,
        quizPending: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  };

  // ── TEACHING ──────────────────────────────────────────────────────────────

  const runTeachTurn = async (key: string, id: string, userMsg?: string) => {
    // Deliberately does not set `busy`: the composer must stay usable so you can
    // pause and ask something else without waiting for the junior turn to finish.
    patch(key, (e) => ({ ...e, status: "teaching", teach: { ...e.teach, pending: true, streaming: "" } }));
    try {
      await readSSE("/api/teach", { exchangeId: id, userMsg }, (ev: Ev) => {
        if (ev.type === "text") {
          patch(key, (e) => ({ ...e, teach: { ...e.teach, streaming: e.teach.streaming + (ev.delta as string) } }));
        } else if (ev.type === "done") {
          const ended = ev.ended as boolean;
          // The server writes this turn *at* `idx`, replacing whatever was there:
          // re-entering an unanswered question regenerates that same row. Appending
          // blindly grows a second junior question the server does not have, and
          // the panel then shows two openers with no reply between them.
          const idx = ev.idx as number;
          patch(key, (e) => {
            // The user can pause while this turn is still streaming. Keep the
            // question — it is what they come back to — but do not un-pause them.
            const paused = e.teach.paused && !ended;
            return {
              ...e,
              status: ended || paused ? "done" : "teaching",
              teach: {
                turns: ended
                  ? e.teach.turns
                  : [...e.teach.turns.slice(0, idx), { junior: e.teach.streaming, user: null }],
                streaming: "",
                pending: false,
                closed: ended,
                paused,
                askingMainChat: e.teach.askingMainChat,
                summary: ended ? e.teach.streaming : null,
              },
            };
          });
        } else if (ev.type === "error") {
          patch(key, (e) => ({
            ...e,
            teach: { ...e.teach, pending: false, streaming: "" },
            error: ev.message as string,
          }));
        }
      });
    } catch (err) {
      patch(key, (e) => ({
        ...e,
        teach: { ...e.teach, pending: false, streaming: "" },
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  };

  /**
   * Exchanges whose explain-back session has already been launched. `Explain it
   * back` unlocks the moment `full` *starts* (§4.3), so the user can be two turns
   * into the session by the time the reveal finishes and auto-launches the
   * reinforcement phase. Without this the auto-launch starts a second opening
   * turn: the server regenerates its one row while the panel grows a second
   * junior question, and the reply box vanishes mid-sentence while it streams.
   */
  const teachStarted = useRef<Set<string>>(new Set());

  const explainBack = async (key: string, id: string) => {
    if (teachStarted.current.has(key)) return;
    teachStarted.current.add(key);
    // Claim the state first — otherwise the button is still live during the
    // round trip and a second click re-enters the same turn.
    patch(key, (e) => ({ ...e, status: "teaching", teach: { ...e.teach, pending: true } }));
    await api.startTeaching(id);
    await runTeachTurn(key, id);
  };

  const teachReply = async (key: string, id: string, text: string) => {
    patch(key, (e) => ({
      ...e,
      teach: {
        ...e.teach,
        turns: e.teach.turns.map((t, i) => (i === e.teach.turns.length - 1 ? { ...t, user: text } : t)),
      },
    }));
    await runTeachTurn(key, id, text);
  };

  /** Step out of protégé mode to ask something else. Resumable, not terminal. */
  const pauseTeaching = async (key: string, id: string) => {
    patch(key, (e) => ({ ...e, status: "done", teach: { ...e.teach, paused: true } }));
    setFocusComposer((n) => n + 1);
    await api.endExchange(id);
  };

  /**
   * Stuck mid-explanation: send the whole transcript to the main chat, get an
   * answer that targets the gap, then drop straight back into protégé mode.
   */
  const askMainChat = async (key: string, id: string, juniorQuestion: string) => {
    patch(key, (e) => ({
      ...e,
      status: "done",
      teach: { ...e.teach, paused: true, askingMainChat: true },
    }));
    await api.endExchange(id);
    try {
      await send(juniorQuestion, "answer", id);
    } finally {
      patch(key, (e) => ({ ...e, teach: { ...e.teach, askingMainChat: false } }));
    }
    await resumeTeaching(key, id, false);
  };

  const scrollToExchange = (targetId: string) =>
    document.getElementById(`ex-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  const clearTeaching = async (key: string, id: string) => {
    // Clearing is a reset, not a punishment — starting over has to be allowed.
    teachStarted.current.delete(key);
    setFloatedKey((k) => (k === key ? null : k));
    await api.clearTeaching(id);
    patch(key, (e) => ({
      ...e,
      status: "revealed",
      teach: { turns: [], streaming: "", pending: false, closed: false, paused: false, askingMainChat: false, summary: null },
    }));
  };

  const resumeTeaching = async (key: string, id: string, needsNewTurn: boolean) => {
    patch(key, (e) => ({ ...e, status: "teaching", teach: { ...e.teach, paused: false } }));
    await api.startTeaching(id);
    if (needsNewTurn) await runTeachTurn(key, id);
  };

  // ── render ────────────────────────────────────────────────────────────────

  const currentThread = threads.find((t) => t.id === threadId);

  // A session that is still open but no longer the last exchange floats to the end.
  const live = exchanges.find((e) => e.teach.turns.length > 0 && !e.teach.closed);
  /**
   * ...and it keeps that place once the exit summary closes it. `live` stops
   * matching a closed session, and letting the panel snap back to its own
   * exchange sends the wrap-up hundreds of pixels above the viewport, while the
   * page scrolls to the bottom of the main-chat answer instead. From the
   * composer that is indistinguishable from the reply having produced nothing —
   * which is exactly how it was reported.
   */
  const sticky =
    floatedKey && floatedKey !== live?.key
      ? exchanges.find((e) => e.key === floatedKey && e.teach.turns.length > 0)
      : undefined;
  const candidate = live ?? sticky;
  const floated =
    candidate && exchanges[exchanges.length - 1]?.key !== candidate.key ? candidate : null;

  const floatedNow = floated?.key ?? null;
  useEffect(() => {
    if (floatedNow) setFloatedKey(floatedNow);
  }, [floatedNow]);

  if (!fatal && prefsLoaded && (!prefs || editingPrefs)) {
    return (
      <Onboarding
        initial={prefs ?? DEFAULT_PREFERENCES}
        editing={!!prefs}
        onCancel={prefs ? () => setEditingPrefs(false) : undefined}
        onReset={
          prefs
            ? async () => {
                await api.resetPreferences();
                setPrefs(null);
                setEditingPrefs(false);
              }
            : undefined
        }
        onSave={async (next) => {
          const { preferences } = await api.savePreferences(next);
          setPrefs(preferences);
          setEditingPrefs(false);
        }}
      />
    );
  }

  if (fatal) {
    return (
      <div className="flex h-[calc(100vh-49px)] items-center justify-center p-8">
        <p className="max-w-md text-[14px] text-red-800">{fatal}</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-49px)]">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-stone-200 bg-stone-100/60 md:flex">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">threads</span>
          <button
            type="button"
            onClick={newThread}
            title="New thread"
            className="rounded-md px-2 py-1 text-[16px] leading-none text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
          >
            +
          </button>
        </div>
        {ephemeral && (
          <p className="mx-2 mb-2 rounded-md bg-stone-200/60 px-2 py-1.5 text-[11.5px] leading-[1.45] text-stone-500">
            Demo deployment — threads are not saved and will disappear.
          </p>
        )}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {threads
            .filter((t) => !t.is_example)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => openThread(t.id)}
                className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] transition ${
                  t.id === threadId ? "bg-stone-200/80 text-stone-900" : "text-stone-600 hover:bg-stone-200/50"
                }`}
              >
                {t.title}
              </button>
            ))}

          {/* Worked examples, so there is something to look at before you have
              asked anything. Kept visually separate from your own threads. */}
          {threads.some((t) => t.is_example) && (
            <div className="pt-4">
              <p className="px-2 pb-1 text-[10.5px] font-medium tracking-wide text-stone-400 uppercase">
                Examples — have a look first
              </p>
              {threads
                .filter((t) => t.is_example)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openThread(t.id)}
                    className={`block w-full rounded-md px-2 py-1.5 text-left transition ${
                      t.id === threadId
                        ? "bg-stone-200/80 text-stone-900"
                        : "text-stone-500 hover:bg-stone-200/50"
                    }`}
                  >
                    <span className="block truncate text-[13px] italic">{t.title}</span>
                    {t.example_note && (
                      <span className="mt-0.5 block truncate text-[10.5px] text-stone-400">
                        {t.example_note}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          )}
        </nav>
        <button
          type="button"
          onClick={() => setEditingPrefs(true)}
          className="flex items-center gap-2 border-t border-stone-200 px-4 py-3 text-left text-[12.5px] text-stone-600 transition hover:bg-stone-200/50 hover:text-stone-900"
        >
          <span aria-hidden>⚙</span> Preferences
          <span className="ml-auto font-mono text-[10.5px] text-stone-400">
            {(prefs ?? DEFAULT_PREFERENCES).density}
          </span>
        </button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-6">
          <div className="mx-auto max-w-3xl">
            {/* Viewing an example must not read as your own history, and must not
                imply your settings changed. */}
            {currentThread?.is_example && (
              <div className="mt-6 rounded-lg border border-stone-300 bg-stone-100/70 px-4 py-3">
                <p className="text-[13px] leading-[1.55] text-stone-600">
                  <span className="font-medium text-stone-800">Example.</span>{" "}
                  {currentThread.example_note
                    ? `This one was produced with “${currentThread.example_note}”.`
                    : "A worked example."}{" "}
                  Real output, not a mock-up — your own preferences are unchanged.
                </p>
              </div>
            )}
            {exchanges.length === 0 && (
              <div className="space-y-6 pt-32 pb-8">
                <p className="text-[15px] text-stone-500">
                  Ask anything. <span className="text-stone-800">Learn</span> makes you guess first;{" "}
                  <span className="text-stone-800">Shadow</span> has Claude solve it alongside you,
                  hidden, until you commit your own approach.
                </p>
                {/* A miss from an earlier session, re-tested cold. Only in an empty
                    thread — interrupting work in progress to quiz someone is the
                    fastest way to make this feel hostile. */}
                {challenge && !challengeDismissed && (
                  <ChallengeCard
                    challenge={challenge}
                    pending={challengePending}
                    correct={challengeResult?.correct ?? null}
                    feedback={challengeResult?.feedback ?? null}
                    onAnswer={(answer) => void answerChallenge(answer)}
                    onDismiss={() => setChallengeDismissed(true)}
                  />
                )}
              </div>
            )}
            {exchanges.map((ex) => (
              <ExchangeView
                key={ex.key}
                ex={ex}
                busy={busy}
                onSubmitPrediction={(text, confidence) => void submitPrediction(ex, text, confidence)}
                onHint={() => void askHint(ex)}
                onSkip={() => void skipPrediction(ex)}
                onExplainBack={() => void explainBack(ex.key, ex.id)}
                onTeachReply={(text) => void teachReply(ex.key, ex.id, text)}
                onPauseTeaching={() => void pauseTeaching(ex.key, ex.id)}
                onResumeTeaching={(needsNewTurn) => void resumeTeaching(ex.key, ex.id, needsNewTurn)}
                onAskMainChat={() =>
                  void askMainChat(ex.key, ex.id, ex.teach.turns[ex.teach.turns.length - 1]?.junior ?? "")
                }
                onClearTeaching={() => void clearTeaching(ex.key, ex.id)}
                onQuizAnswer={(qid: string, text: string) => void answerQuiz(ex.key, ex.id, qid, text)}
                onQuizDismiss={() => patch(ex.key, (e) => ({ ...e, quizDismissed: true }))}
                onCommitShadow={(approach, confidence) =>
                  void commitShadow(ex.key, ex.id, ex.predictionId ?? "", approach, confidence)
                }
                onSkipShadow={() => void skipShadow(ex.key, ex.id, ex.predictionId ?? "")}
                onProbe={(answer) => void answerProbe(ex.key, ex.id, ex.predictionId ?? "", answer)}
                onProbeHint={() => void probeHint(ex.key, ex.id, ex.predictionId ?? "")}
                quizKind={(prefs ?? DEFAULT_PREFERENCES).reinforcement === "transfer_probe" ? "transfer" : "recall"}
                expandFull={!!currentThread?.is_example}
                renderTeach={!floated || floated.key !== ex.key}
              />
            ))}

            {/* A live session belongs at the end of the thread — it is the thing
                you are actually doing. Anything you ask mid-session lands above
                it, which is the order it happened in. */}
            {floated && (
              <div className="pb-8">
                <p className="mb-2 text-[12.5px] text-stone-400">
                  Explaining back:{" "}
                  <button
                    type="button"
                    onClick={() => scrollToExchange(floated.id)}
                    className="underline underline-offset-2 transition hover:text-stone-700"
                  >
                    {floated.question}
                  </button>
                </p>
                <TeachPanel
                  turns={floated.teach.turns}
                  streaming={floated.teach.streaming}
                  pending={floated.teach.pending}
                  closed={floated.teach.closed}
                  paused={floated.teach.paused}
                  askingMainChat={floated.teach.askingMainChat}
                  summary={floated.teach.summary}
                  onSend={(text) => void teachReply(floated.key, floated.id, text)}
                  onPause={() => void pauseTeaching(floated.key, floated.id)}
                  onResume={() =>
                    void resumeTeaching(
                      floated.key,
                      floated.id,
                      floated.teach.turns[floated.teach.turns.length - 1]?.user !== null,
                    )
                  }
                  onAskMainChat={() =>
                    void askMainChat(
                      floated.key,
                      floated.id,
                      floated.teach.turns[floated.teach.turns.length - 1]?.junior ?? "",
                    )
                  }
                  onClear={() => void clearTeaching(floated.key, floated.id)}
                />
              </div>
            )}
            <div ref={bottom} className="h-4" />
          </div>
        </div>

        <Composer
          mode={mode}
          setMode={setMode}
          onSend={send}
          busy={busy}
          flipKey={flipKey}
          flipNote={flipNote}
          focusKey={focusComposer}
        />
      </main>
    </div>
  );
}
