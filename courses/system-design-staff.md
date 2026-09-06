---
id: system-design-staff
title: System Design (Staff+)
subject: software-engineering
level: advanced
author: raymond
description: Staff-level system design drilling with critical evaluation. Not "what is X" — "how would you design X under these constraints, and what breaks first".
session:
  questions_per_topic: [3, 5]
  mastery_scale: 5
  review_threshold: 2
topics:
  - id: scaling-fundamentals
    name: Scaling Fundamentals
    summary: Vertical vs horizontal, stateless boundaries, and where the first bottleneck actually shows up.
    prereqs: [back-of-envelope-estimation]
    checkpoints:
      - Can pick vertical or horizontal for a stated workload and name the number that decides it
      - Can locate the first bottleneck in a described system and say how it would be detected
      - Can name what has to become stateless first, and what it costs to get there
    weak_area_taxonomy:
      - vertical-vs-horizontal-framework
      - concrete-numbers-and-tools
      - failure-timeline-specificity
      - naming-the-pattern
      - stateless-vs-stateful-boundary
      - premature-distribution

  - id: load-balancing
    name: Load Balancing
    summary: L4 vs L7, health checks, affinity, and the request path from client DNS to backend socket.
    prereqs: [proxies-reverse-proxies, dns-networking]
    checkpoints:
      - Can trace a request end to end and name what terminates TLS and where
      - Can choose an algorithm for a stated traffic shape and defend it against least-connections
      - Can explain what a failing health check does to in-flight requests
    weak_area_taxonomy:
      - request-path-mechanics
      - l4-vs-l7-tradeoffs
      - health-check-semantics
      - sticky-sessions-and-affinity
      - dns-anycast-vrrp-bgp
      - production-tooling
      - connection-draining

  - id: caching
    name: Caching Strategies
    summary: Cache placement, write policy, invalidation, and coherence at scale.
    prereqs: [scaling-fundamentals]
    checkpoints:
      - Can pick a write policy and defend it under a stated failure mode
      - Can explain cache stampede and at least two mitigations
      - Can name when NOT to cache
    weak_area_taxonomy:
      - write-policy-and-ownership
      - invalidation
      - stampede-handling
      - degradation-on-cache-failure
      - display-vs-transactional-consistency
      - redis-internals
      - eviction-tuning
      - when-not-to-cache

  - id: database-design
    name: Database Design
    summary: Schema, transactions, isolation, and migrating a table nobody is allowed to stop writing to.
    prereqs: []
    checkpoints:
      - Can pick an isolation level for a stated anomaly and say what it still permits
      - Can do an atomic conditional update instead of read-modify-write, and say why
      - Can describe expand/contract for a column rename under live traffic
    weak_area_taxonomy:
      - write-ordering-and-fk-constraints
      - atomic-conditional-update-vs-locking
      - isolation-levels
      - expand-contract-migration
      - temporal-modeling
      - cdc-and-derived-stores
      - polyglot-persistence
      - naming-mechanisms-and-tools
      - index-design

  - id: sql-vs-nosql
    name: SQL vs NoSQL
    summary: Access patterns as the deciding input, and the myths that survive because nobody measures.
    prereqs: [database-design]
    checkpoints:
      - Can derive the store choice from the access patterns rather than from schema flexibility
      - Can say where authority for a contended value lives and why it is not the catalog
      - Can pick fanout-on-write or merge-on-read against a stated latency budget
    weak_area_taxonomy:
      - access-patterns-drive-the-choice
      - nosql-is-not-faster-myth
      - authority-boundary-placement
      - idempotency-mechanism-specificity
      - fanout-read-vs-write
      - celebrity-threshold-tuning
      - single-table-design-tradeoffs

  - id: database-sharding-partitioning
    name: Sharding and Partitioning
    summary: Shard keys, resharding under load, and what a cross-shard transaction really costs.
    prereqs: [database-design, consistent-hashing]
    checkpoints:
      - Can choose a shard key and name the query it makes expensive
      - Can describe a cutover that does not require a write freeze
      - Can question a requirement that forces a cross-shard transaction
    weak_area_taxonomy:
      - shard-key-selection
      - resharding-and-cutover
      - cross-shard-transactions
      - range-vs-hash-partitioning
      - hot-shard-and-cardinality-traps
      - saga-compensating-actions
      - question-the-requirement

  - id: database-replication
    name: Replication
    summary: HA, DR, read scaling and geo are four different problems that share one mechanism.
    prereqs: [database-design]
    checkpoints:
      - Can distinguish HA from DR from read scaling and pick the topology for one of them
      - Can state RPO and RTO for sync vs async with a number attached
      - Can describe fencing and how clients discover the new leader
    weak_area_taxonomy:
      - ha-vs-dr-vs-read-scaling
      - sync-vs-async-and-rpo-rto
      - wal-and-lsn-mechanics
      - physical-vs-logical-replication
      - split-brain-fencing
      - failover-and-client-rediscovery
      - multi-region-conflict-resolution
      - connection-storms
      - build-vs-buy

  - id: cap-theorem-consistency-models
    name: CAP and Consistency Models
    summary: The spectrum from linearizable to eventual, and why CA is not a thing you can buy.
    prereqs: [database-replication]
    checkpoints:
      - Can state CAP precisely and distinguish its C from ACID's C
      - Can apply PACELC to a system that is not currently partitioned
      - Can pick a consistency level per operation rather than per system
    weak_area_taxonomy:
      - precise-cap-definitions
      - ca-is-not-a-category
      - pacelc
      - tunable-consistency-per-operation
      - quorum-formula-and-tradeoffs
      - bounded-staleness
      - strong-eventual-consistency-crdt
      - do-not-relax-consistency-for-sla

  - id: consistent-hashing
    name: Consistent Hashing
    summary: Keeping key movement proportional to the change in node count, and why virtual nodes exist.
    prereqs: [scaling-fundamentals]
    checkpoints:
      - Can say how many keys move when one node of N leaves, and why
      - Can explain what virtual nodes fix that a plain ring does not
      - Can name a case where range partitioning beats the ring
    weak_area_taxonomy:
      - key-movement-math
      - virtual-nodes-and-balance
      - ring-vs-range-partitioning
      - replication-factor-on-the-ring
      - rebalancing-during-failure

  - id: message-queues-event-driven
    name: Queues and Event-Driven Systems
    summary: Delivery semantics, ordering, backpressure, and what a consumer does when it falls behind.
    prereqs: [scaling-fundamentals]
    checkpoints:
      - Can state the delivery guarantee a design actually needs and what it costs
      - Can explain what preserves ordering and what that does to parallelism
      - Can describe the behaviour when consumers cannot keep up
    weak_area_taxonomy:
      - delivery-semantics
      - ordering-and-partition-keys
      - backpressure-and-lag
      - dead-letter-and-poison-messages
      - queue-vs-log-choice
      - consumer-rebalancing

  - id: microservices-vs-monolith
    name: Microservices vs Monolith
    summary: Where a service boundary should fall, and the coordination cost of getting it wrong.
    prereqs: [api-design]
    checkpoints:
      - Can place a boundary on data ownership rather than on team structure alone
      - Can name the failure mode a split introduces that the monolith did not have
      - Can argue for not splitting, with a concrete trigger for when to revisit
    weak_area_taxonomy:
      - boundary-on-data-ownership
      - distributed-monolith-smell
      - coordination-and-deploy-cost
      - shared-database-antipattern
      - when-not-to-split

  - id: api-design
    name: API Design
    summary: Contracts, versioning, pagination and errors that a client can actually act on.
    prereqs: []
    checkpoints:
      - Can design pagination that survives concurrent inserts
      - Can evolve a contract without a breaking version bump
      - Can specify an error a client can branch on rather than log
    weak_area_taxonomy:
      - pagination-under-mutation
      - versioning-and-evolution
      - error-contract-design
      - idempotent-verbs-and-keys
      - resource-vs-rpc-modelling
      - partial-response-and-overfetch

  - id: rate-limiting-throttling
    name: Rate Limiting and Throttling
    summary: Choosing an algorithm at the actual traffic scale, and where the counter lives.
    prereqs: [api-design, caching]
    checkpoints:
      - Can pick an algorithm for a stated burst profile and defend it at that scale
      - Can say where the counter lives in a multi-node deployment and what that costs
      - Can describe what the client sees and how it is supposed to behave
    weak_area_taxonomy:
      - algorithm-choice-at-scale
      - distributed-counter-placement
      - boundary-burst-in-fixed-windows
      - client-contract-and-retry-after
      - fail-open-vs-fail-closed
      - detection-and-observability
      - overengineering-for-the-load

  - id: cdn-edge-computing
    name: CDN and Edge
    summary: What is cacheable at the edge, how it gets invalidated, and what should not run there.
    prereqs: [caching, dns-networking]
    checkpoints:
      - Can design a cache key that does not fragment the hit rate
      - Can describe purge propagation and what users see during it
      - Can name work that belongs at the edge and work that does not
    weak_area_taxonomy:
      - cache-key-and-vary-fragmentation
      - purge-and-propagation-delay
      - origin-shielding
      - dynamic-vs-static-at-the-edge
      - edge-compute-limits

  - id: dns-networking
    name: DNS and Networking
    summary: Resolution, TTLs, anycast, and the parts of the request path that are not HTTP.
    prereqs: []
    checkpoints:
      - Can explain what a TTL change does and how long it actually takes to take effect
      - Can describe anycast routing and its failure mode during a withdrawal
      - Can name what happens between TCP connect and the first byte of a response
    weak_area_taxonomy:
      - resolution-path-and-caching
      - ttl-semantics-and-propagation
      - anycast-and-bgp
      - tls-handshake-cost
      - dns-based-failover-limits

  - id: proxies-reverse-proxies
    name: Proxies and Reverse Proxies
    summary: Termination, buffering, connection reuse, and what a proxy hides from the backend.
    prereqs: [dns-networking]
    checkpoints:
      - Can say what a reverse proxy buffers and what that protects
      - Can describe connection pooling to the backend and its failure under a slow origin
      - Can name what the backend loses visibility of, and how it is restored
    weak_area_taxonomy:
      - buffering-and-slow-clients
      - connection-reuse-and-pooling
      - header-propagation-and-client-identity
      - forward-vs-reverse-role
      - sidecar-and-service-mesh-placement

  - id: blob-object-storage
    name: Blob and Object Storage
    summary: Large-object paths, presigned access, durability claims and lifecycle.
    prereqs: []
    checkpoints:
      - Can design an upload path that does not stream bytes through the app tier
      - Can state the consistency and durability the store actually gives
      - Can describe lifecycle and access tiers against a stated read profile
    weak_area_taxonomy:
      - upload-path-and-presigned-urls
      - multipart-and-resumable-uploads
      - durability-vs-availability-claims
      - lifecycle-and-storage-tiers
      - metadata-store-separation

  - id: search-systems
    name: Search Systems
    summary: Inverted indexes, ranking, and keeping the index honest against the source of truth.
    prereqs: [database-design]
    checkpoints:
      - Can explain the index structure that makes the query fast and what it costs to write
      - Can describe indexing lag and what a user sees during it
      - Can name how the index is reconciled with the primary store
    weak_area_taxonomy:
      - inverted-index-mechanics
      - indexing-lag-and-freshness
      - ranking-and-relevance-tuning
      - reindexing-without-downtime
      - source-of-truth-reconciliation

  - id: distributed-consensus
    name: Distributed Consensus
    summary: What Raft actually guarantees, what it costs per write, and when you do not need it.
    prereqs: [cap-theorem-consistency-models]
    checkpoints:
      - Can state what consensus guarantees and what it explicitly does not
      - Can say what a write costs in round trips and why the cluster is small
      - Can name a problem that looks like consensus but is not
    weak_area_taxonomy:
      - safety-vs-liveness
      - quorum-size-and-write-cost
      - log-replication-and-commit-index
      - membership-changes
      - when-consensus-is-overkill

  - id: leader-election
    name: Leader Election
    summary: Leases, fencing tokens, and the window where two nodes both believe they lead.
    prereqs: [distributed-consensus]
    checkpoints:
      - Can describe a lease and what happens when the holder pauses past its expiry
      - Can explain why a fencing token is needed even with a correct lease
      - Can name what the system does while there is no leader
    weak_area_taxonomy:
      - lease-expiry-and-clock-assumptions
      - fencing-tokens
      - split-brain-window
      - unavailability-during-election
      - external-coordinator-dependency

  - id: distributed-transactions
    name: Distributed Transactions
    summary: Two-phase commit, sagas, and designing so the question does not come up.
    prereqs: [cap-theorem-consistency-models, message-queues-event-driven]
    checkpoints:
      - Can name what 2PC blocks on and why that is usually disqualifying
      - Can write the compensating action for a stated saga step, not just the happy path
      - Can restructure a requirement so the transaction is no longer distributed
    weak_area_taxonomy:
      - 2pc-blocking-coordinator
      - saga-compensating-actions
      - outbox-pattern
      - isolation-loss-in-sagas
      - avoiding-the-distributed-transaction

  - id: idempotency-deduplication
    name: Idempotency and Deduplication
    summary: Making a retry safe, and where the dedup record lives and for how long.
    prereqs: [message-queues-event-driven]
    checkpoints:
      - Can pick a key that is stable across the retries that actually happen
      - Can say where the dedup record is stored and what its retention is
      - Can describe the race between two concurrent identical requests
    weak_area_taxonomy:
      - key-derivation-and-stability
      - dedup-store-and-retention
      - concurrent-duplicate-race
      - natural-vs-synthetic-idempotency
      - exactly-once-is-a-marketing-claim

  - id: logging-monitoring-observability
    name: Observability
    summary: Metrics, traces and logs as three different tools, and knowing which one answers the question.
    prereqs: []
    checkpoints:
      - Can pick the signal that answers a stated question and say why the other two do not
      - Can define an SLO and the alert that follows from it rather than from a threshold
      - Can describe cardinality cost and what it does to the metrics bill
    weak_area_taxonomy:
      - signal-selection
      - slo-and-error-budget-alerting
      - metric-cardinality-cost
      - trace-context-propagation
      - alert-fatigue-and-symptom-vs-cause

  - id: security-auth
    name: Security and Auth
    summary: Authentication, authorization, token lifetimes and the blast radius of a leak.
    prereqs: [api-design]
    checkpoints:
      - Can separate authentication from authorization in a stated design
      - Can justify a token lifetime and describe revocation before it expires
      - Can state the blast radius when one credential leaks
    weak_area_taxonomy:
      - authn-vs-authz-separation
      - token-lifetime-and-revocation
      - secret-storage-and-rotation
      - authorization-model-choice
      - blast-radius-and-least-privilege

  - id: data-pipelines-batch-stream
    name: Data Pipelines
    summary: Batch and stream as different latency and correctness contracts over the same data.
    prereqs: [message-queues-event-driven]
    checkpoints:
      - Can pick batch or stream from a stated freshness requirement
      - Can explain watermarks and what happens to a late event
      - Can describe how a bad day of data gets reprocessed
    weak_area_taxonomy:
      - batch-vs-stream-selection
      - watermarks-and-late-data
      - backfill-and-reprocessing
      - schema-evolution-in-pipelines
      - lambda-vs-kappa-tradeoffs

  - id: geospatial-proximity
    name: Geospatial and Proximity
    summary: Indexing a sphere so "nearest N" is a range scan instead of a table scan.
    prereqs: [database-sharding-partitioning]
    checkpoints:
      - Can explain how a geohash or cell id turns proximity into a range query
      - Can describe the boundary problem and how the query works around it
      - Can handle a moving object without rewriting the index on every update
    weak_area_taxonomy:
      - geohash-and-cell-indexing
      - boundary-and-neighbour-cells
      - moving-object-updates
      - density-skew-and-hot-cells
      - distance-accuracy-vs-cost

  - id: conflict-resolution-crdt
    name: Conflict Resolution and CRDTs
    summary: Merging concurrent writes without a coordinator, and what last-write-wins silently drops.
    prereqs: [cap-theorem-consistency-models]
    checkpoints:
      - Can say what last-write-wins loses and when that is acceptable
      - Can pick a CRDT for a stated data shape and describe its merge
      - Can name a conflict that no CRDT resolves and must go to the user
    weak_area_taxonomy:
      - lww-data-loss
      - crdt-selection-by-data-shape
      - merge-commutativity-requirement
      - vector-clocks-and-causality
      - conflicts-that-need-a-human

  - id: back-of-envelope-estimation
    name: Back-of-the-Envelope Estimation
    summary: Turning a product requirement into numbers that decide the architecture.
    prereqs: []
    checkpoints:
      - Can get from a user count to a peak request rate with stated assumptions
      - Can size storage and bandwidth for a stated retention window
      - Can name which estimate the design is actually sensitive to
    weak_area_taxonomy:
      - assumption-visibility
      - peak-vs-average-traffic
      - storage-and-bandwidth-sizing
      - latency-number-fluency
      - sensitivity-to-the-estimate
---

## Interviewer persona

Staff+ system design interviewer. Direct and rigorous, no hand-holding. Treat the
learner as a senior engineer being evaluated for staff promotion.

## Question style

- Not "what is X" — "how would you design X under these constraints".
- Ask tradeoffs, failure modes, real-world scale, and when NOT to use a pattern.
- At least one question per topic must cross topic boundaries.
- Push back on vague answers. "Can you be more specific about how you'd handle X?"

Cover these dimensions where they apply to the topic:

- **What** — core mechanism and data structures involved
- **Why** — when and why you'd choose this over the alternatives
- **How** — implementation details at scale
- **Failure** — what breaks, and how you detect and recover
- **Ops** — how you monitor, debug and evolve it in production
- **Tradeoffs** — what you sacrifice, and when that sacrifice is unacceptable

## Evaluation rules

- Generate your own reference answer BEFORE reading the learner's answer.
- Score strictly against the scope of the question you actually asked.
- Never mark down for depth you didn't ask for. Offer it as "next layer" instead.
- If the learner pushes back with "you didn't ask that", re-evaluate honestly and
  re-score.
- Acknowledge good answers genuinely and specifically — name the part that was
  strong. Do not manufacture praise for an answer that did not earn it.

## Scale discipline

Design to the scale in the question, not to the most impressive scale you can
imagine. A fixed-window limiter is the correct answer at 40 rps, and proposing a
token bucket with a Lua script and a circuit breaker for an internal API at that
rate is a wrong answer, not a thorough one. If the learner's simpler design is
right for the stated load, say so.
