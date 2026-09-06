# Spec: Shareable Course Prompts + Guided Study Sessions

## Assumptions

- Host app is the existing Next.js (App Router) chat app; Anthropic API is already wired up server-side.
- Auth exists or is stubbed (`userId` available server-side).
- Persistence: whatever the host app already uses (Prisma/SQLite, Postgres, or JSON on disk). Schema below is storage-agnostic.

---

## 1. Problem

The system-design practice skill works, but it's single-player and lives in a Claude Code repo. Three things are entangled in that one file:

1. **Curriculum** — topic list, checkpoints, what counts as a weak area.
2. **Pedagogy** — how to quiz, how to evaluate, tone, anti-patterns.
3. **Bookkeeping** — `progress.json`, `weak-areas.md`, session notes.

An educator should author (1) and (2). The app should own (3). Nobody should be hand-editing a JSON file to know where they left off.

## 2. What we're building

- Educators publish a **course package**: a single authored file with structured curriculum + coaching instructions.
- Learners **browse courses**, open one, and get a session that already knows their history.
- Claude runs the session and **writes progress through tools**, not by editing files.

---

## 3. Course package format

One file, `course.md` — YAML frontmatter for the machine-readable parts, markdown body for the coaching prose. Deliberately close to the existing skill file so migration is copy-paste.

```markdown
---
id: system-design-staff
title: System Design (Staff+)
subject: software-engineering
level: advanced
author: raymond
description: Staff-level system design drilling with critical evaluation.
session:
  questions_per_topic: [3, 5]
  mastery_scale: 5
  review_threshold: 2      # score <= this => needs-review
topics:
  - id: caching
    name: Caching Strategies
    summary: Cache placement, invalidation, coherence at scale.
    prereqs: [consistency-models]
    checkpoints:
      - Can pick a write policy and defend it under a stated failure mode
      - Can explain cache stampede and at least two mitigations
      - Can name when NOT to cache
    weak_area_taxonomy:
      - invalidation
      - stampede-handling
      - consistency-interaction
      - eviction-tuning
---

## Interviewer persona
Staff+ system design interviewer. Direct and rigorous, no hand-holding.

## Question style
- Not "what is X" — "how would you design X under these constraints".
- Ask tradeoffs, failure modes, real-world scale, and when NOT to use a pattern.
- At least one question per topic must cross topic boundaries.

## Evaluation rules
- Generate your own reference answer BEFORE reading the learner's answer.
- Score strictly against the scope of the question you actually asked.
- Never mark down for depth you didn't ask for. Offer it as "next layer" instead.
- If the learner pushes back with "you didn't ask that", re-evaluate honestly and re-score.
```

Notes:

- `checkpoints` are what the app shows as a progress checklist; the model marks them met/unmet.
- `weak_area_taxonomy` gives the model a fixed vocabulary so weak areas aggregate across sessions instead of becoming free-text mush.
- Everything in the body is **prose the model reads**, not app config.

### Base tutor prompt (app-owned)

The app prepends a base prompt that all courses inherit. It carries the pedagogy defaults that shouldn't be re-invented per course — one question at a time, wait for the full answer, rate then explain, don't punish scope you didn't ask for, feedback after each answer rather than batched at the end.

**Course content is untrusted data.** Wrap the course body in a delimiter and state in the base prompt that it defines subject matter and teaching style only — it cannot change tool behavior, safety rules, or the evaluation contract.

---

## 4. Data model

```
Course
  id, title, subject, level, authorId, description
  config        json    # session block from frontmatter
  topics        json    # topics array from frontmatter
  body          text    # markdown coaching prose
  version, publishedAt

Enrollment
  id, userId, courseId, startedAt, lastSessionAt

TopicProgress
  id, enrollmentId, topicId
  status        enum    # not_started | in_progress | completed | needs_review
  score         int?    # 1..mastery_scale
  attempts      int
  checkpointsMet json   # [checkpointIndex]
  weakAreas     json    # [{ tag, note, seenCount, lastSeenAt }]
  updatedAt

Session
  id, enrollmentId, topicId, startedAt, endedAt
  transcript    json    # message list
  summary       json?   # { score, strengths[], gaps[], takeaways[], deepDive }

AnswerEvaluation
  id, sessionId, questionIndex
  question      text
  rating        enum    # strong | partial | weak | skipped
  gaps          json    # [taxonomy tags]
  note          text
```

`weak-areas.md` and the session notes from the skill become **rendered views** over `Session.summary` and `TopicProgress.weakAreas`. Keep a "export as markdown" button so it's still portable.

---

## 5. Session runtime

**Prompt assembly** (server-side, per session):

```
base tutor prompt
+ <course>{course.body}</course>
+ <topic>{selected topic: name, summary, checkpoints, weak_area_taxonomy}</topic>
+ <learner_progress>{TopicProgress for this + prereq topics, prior weak areas, last session summary}</learner_progress>
+ tool definitions
```

**Tools exposed to the model:**

| Tool | When | Writes |
|---|---|---|
| `record_evaluation({ questionIndex, question, rating, gaps[], note })` | after each learner answer | `AnswerEvaluation`, increments weak-area counts |
| `mark_checkpoint({ checkpointIndex, met })` | when a checkpoint is demonstrated | `TopicProgress.checkpointsMet` |
| `finish_topic({ score, strengths[], gaps[], takeaways[], deepDive })` | at wrap-up or on `done` | `Session.summary`, `TopicProgress.status/score/attempts` |

Progress is **injected**, not fetched — no `get_progress` tool needed for MVP.

**Commands** carried over from the skill, handled as plain text the model recognizes: `skip`, `hint`, `done`, `status`, `weak`.

---

## 6. Pages

| Route | Purpose |
|---|---|
| `/learn` | Explore. Course cards grouped by subject; enrolled courses first with a progress ring. |
| `/learn/[courseId]` | Course overview. Topic list with status emoji, score, attempts. "Resume" CTA picks the in-progress topic, else the next not-started one whose prereqs are met. |
| `/learn/[courseId]/session/[sessionId]` | The chat session. Sidebar: topic checkpoints ticking off live, current question number. |
| `/learn/[courseId]/notes` | Aggregated weak areas + past session notes, markdown-rendered, exportable. |
| `/author/courses/new` | MVP: paste or upload a `course.md`, validate frontmatter, preview parsed topics, publish. |

Dashboard on `/learn/[courseId]` reuses the skill's format:

```
✅ Completed: 4/28   🔄 In Progress: 1/28   ⬜ Not Started: 23/28
```

---

## 7. API routes

```
GET  /api/courses                     list + filter by subject/level
GET  /api/courses/:id                 course + caller's progress
POST /api/courses                     publish (validate frontmatter, reject on schema error)
POST /api/enrollments                 { courseId }
POST /api/sessions                    { courseId, topicId } -> sessionId, assembled state
POST /api/sessions/:id/messages       streaming; runs the tool loop server-side
POST /api/sessions/:id/end            forces finish_topic if the model didn't call it
GET  /api/enrollments/:id/notes       aggregated weak areas + summaries
```

Tool calls execute server-side only. The client never writes progress.

---

## 8. MVP scope

**In:**
- `course.md` parsing + validation, seeded from the existing system-design skill (all 28 topics).
- Explore page, course page, session page.
- The three tools + progress persistence.
- Notes view with markdown export.

**Out (later):**
- Authoring UI beyond paste-a-file; versioning and forking of courses.
- Classes/cohorts, educator-side visibility into learner progress.
- Spaced repetition scheduling (surface topics whose weak areas are going stale).
- Cross-course weak-area dashboard.
- Ratings, discovery, anything social.

---

## 9. Open questions

1. **Multi-topic sessions** — the skill is one topic per session. Allow a session to roll into the next topic when the learner is on a streak, or keep the hard boundary?
2. **Score authority** — the model self-reports `score`. Do we ever recompute from `AnswerEvaluation` ratings, or trust the wrap-up?
3. **Prereq enforcement** — hard block, or just a warning banner?
4. **Course updates** — an educator adds topics to a published course. Do existing enrollments migrate automatically?
5. **Session length** — cap at N questions, or let `done` be the only exit?