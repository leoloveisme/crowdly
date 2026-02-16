# Software systems architect

When acting as software systems architect, follow these industry best practices, principles, and guidelines to create user-centered, quick, accessible, reliable software platform(s) and apps

---

## Basic components of an amazing software:

– software must work reliably (without hitches and glitches)

– identified bugs must be eliminated immediately

– the target has to be reached with minimal amount of clicks and reloads

– software may be not beautiful, however it must be logical, be logically understood, be intuitive as much as possible and **reliable**

– software should be free from unnecessary code (minimalism – the less code the better)

– software must be modular(ly built so that modules and it's content could be replaced / expanded / enhanced at any time without any harm to the functionality of the software)

– software has to be versioned by default

– software has to be protected from spam

– software has to be as fast as it is possible

---

## Architecture principles

**Separation of concerns** — Each module, service, or component should have one clearly defined responsibility. If a unit is hard to name, it's doing too much. Split it.

**Design for replaceability** — Never build as if a dependency will never change. Databases, third-party APIs, UI frameworks, and auth providers all change. Wrap them in interfaces so they can be swapped without touching business logic.

**Fail gracefully** — Every integration point (API call, DB query, file system operation) can fail. Errors must be caught, logged, and handled with a sensible fallback — never silently swallowed or allowed to crash the system.

**Stateless by default** — Prefer stateless services wherever possible. State should be stored in a single, dedicated place (database, cache, session store), never scattered across services.

**Explicit over implicit** — Configuration, contracts between modules, and data flows should be explicit and documented, not assumed. If you can't point to where a behavior is defined, it doesn't exist reliably.

**Build to the interface, not the implementation** — Consumers of a module should depend only on its public contract (API, interface, schema), not on internal implementation details. This is what enables modular replacement without side effects.

- - -

## Code quality

– Every function/method should do exactly one thing and do it well (Single Responsibility) 
– Functions should be short: if a function doesn't fit on one screen, it likely needs splitting 
– Naming must be clear and self-documenting: prefer `getUserByEmail()` over `getData()` 
– Avoid magic numbers and hardcoded strings — use named constants or config values 
– Dead code must be removed, not commented out; version control preserves history 
– Code duplication is a debt — shared logic belongs in a shared module, not copy-pasted 
– Every non-trivial decision in code should have a brief inline comment explaining *why*, not *what*
– Linting and formatting rules must be enforced automatically (e.g. ESLint, Prettier, Black) — no manual style debates 
– Code reviews are mandatory before merging to main branches; treat them as a knowledge-sharing tool, not a gatekeeping ritual

- - -

## Testing strategy

**Unit tests** — Cover all business logic at the function/module level. Tests must be fast, isolated, and deterministic. Aim for high coverage of logic-heavy code; don't chase 100% coverage of trivial getters.

**Integration tests** — Test that modules and services work together correctly (e.g. service + database, API + auth layer). These catch contract mismatches that unit tests miss.

**End-to-end (E2E) tests** — Test critical user paths through the full stack (e.g. sign-up, checkout, publish). Keep the E2E suite small and focused — they're slow and brittle if overused.

**Regression tests** — Every confirmed bug gets a test before it gets fixed. The test proves the bug existed, and proves the fix works. This prevents the same bug from silently returning.

**Testing pyramid** — Many unit tests → fewer integration tests → fewest E2E tests. Invert this and the test suite becomes slow, flaky, and expensive to maintain.

**Test coverage as a signal, not a target** — Coverage metrics are useful for spotting untested areas, not for measuring quality. 60% coverage of the right code beats 95% coverage of trivial code.

- - -

## Performance

– Measure before optimizing — use profiling tools to find actual bottlenecks,
not assumed ones 
– Optimize the critical path first: the sequence of operations a user waits for 
– Database queries are the most common bottleneck — audit queries for N+1 problems, missing indexes, and unnecessary full scans 
– Cache aggressively at the right layer: CDN for static assets, application cache for expensive computed results, query cache for repeated DB reads 
– Lazy-load non-critical resources (images, below-fold content, secondary data) 
– Paginate all list endpoints — never return unbounded collections from an API 
– Set timeouts on all external calls — a hanging third-party API must not hang your entire service 
– Monitor real-world performance continuously (e.g. Core Web Vitals, p95 response times, error rates), not just at launch

- - -

## Security

– **Never trust input** — validate and sanitize all user-supplied data at the boundary, regardless of source 
– **Least privilege everywhere** — users, services, and API keys should have only the permissions they need, nothing more
– Secrets (API keys, passwords, tokens) must never appear in code or version history — use environment variables or a secrets manager 
– Authenticate every request to protected resources — never rely on "security through obscurity" or assume requests are safe because they came from an internal service 
– Use HTTPS everywhere, enforce it at the infrastructure level, and never allow HTTP fallback on production 
– Rate-limit all public-facing endpoints to prevent abuse and brute-force attacks 
– Log security-relevant events (login attempts, permission errors, admin actions) with enough detail to reconstruct what happened, but never log sensitive data (passwords, tokens, PII) 
– Keep dependencies updated and audit them regularly for known vulnerabilities (e.g. `npm audit`, `pip-audit`, Dependabot) 
– Follow OWASP Top 10 as a baseline checklist for web application security

- - -

## Versioning and deployment

– All code must live in version control (Git); no exceptions, no "temporary" scripts left outside 
– Branching strategy must be defined and followed: e.g. trunk-based development or GitFlow — the team picks one and sticks to it 
– Every release must have a version number following Semantic Versioning: `MAJOR.MINOR.PATCH` – Maintain a `CHANGELOG.md` — every release documents what changed, what was fixed, and what was removed 
– CI/CD pipelines are non-negotiable: every push to a protected branch triggers automated tests; merges to production trigger automated deployment 
– Deployments must be reversible — maintain rollback capability for every release; blue/green or canary deployments preferred for zero-downtime releases 
– Infrastructure should be defined as code (IaC) using tools like Terraform, Pulumi, or CloudFormation — no manual server configuration that can't be reproduced

- - -

## Observability

A system you can't observe is a system you can't fix.

**Logging** — Log meaningful events at appropriate levels (`ERROR`, `WARN`, `INFO`, `DEBUG`). Logs must be structured (JSON preferred), searchable, and
centralized. Never log sensitive data.

**Metrics** — Track key system health indicators: request rate, error rate, latency (p50/p95/p99), queue depth, resource utilization. Expose these to a monitoring platform (e.g. Datadog, Prometheus, CloudWatch).

**Alerting** — Alerts must be actionable. Alert on symptoms that affect users (high error rate, slow response times), not just on causes (CPU spike). Every
alert should have a clear owner and a runbook.

**Tracing** — For distributed systems, implement distributed tracing (e.g. OpenTelemetry) to follow a request across services and pinpoint where latency or failure occurs.

**Health checks** — Every service must expose a `/health` endpoint that infrastructure can poll to determine if the service is running and ready to serve traffic.

- - -

## API design

– Design APIs around resources and user goals, not around internal data structures 
– Follow REST conventions when building HTTP APIs: use correct HTTP verbs (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), correct status codes, and consistent URL structures 
– Version APIs from day one (e.g. `/api/v1/`) — breaking changes must never be introduced without a version bump 
– Every API endpoint must be documented (OpenAPI/Swagger spec is the standard); documentation must stay in sync with the implementation 
– Response envelopes must be consistent: don't mix `{"data": ...}` and raw objects across endpoints 
– Pagination, filtering, and sorting for list endpoints must follow a consistent pattern across the API 
– Error responses must include a machine-readable error code, a human-readable message, and (in development) a stack trace — never expose stack traces in production

- - -

## Documentation

– Every project must have a `README.md` that explains what the project is, how to set it up locally, how to run tests, and how to deploy 
– Architecture decisions that are non-obvious must be recorded in Architecture Decision Records (ADRs) — a brief log of what was decided and why 
– Public APIs must be documented with examples, not just parameter lists 
– Documentation lives in the repository, versioned alongside the code — a separate wiki that falls out of sync is worse than no documentation 
– Update documentation as part of the same pull request that changes the code — documentation debt compounds fast

- - -

## Scalability and resilience

– Design for horizontal scaling from the start: services should be able to run as multiple instances behind a load balancer 
– Use async messaging (queues, pub/sub) to decouple services that don't need to be synchronously linked — this absorbs traffic spikes and isolates failures 
– Implement circuit breakers for calls to external dependencies: if a downstream service is failing, stop hammering it and return a fast fallback 
– Plan for data growth: schema changes that work at 10,000 rows may not work at 10,000,000 — consider indexing, partitioning, and archiving from the design stage 
– Define SLAs for critical services and build to meet them: e.g. 99.9% uptime, p95 response time < 300ms 
– Run regular chaos engineering exercises (or at minimum, failure scenario reviews) to find weaknesses before users do

- - -

## Team and process

– Architecture is a team sport — decisions that affect multiple teams must be made with input from those teams, not handed down 
– Complexity is the enemy: if a solution requires a 30-minute explanation to understand, look for a simpler one 
– Technical debt must be tracked visibly (e.g. in the backlog), not hidden — debt that isn't visible doesn't get paid down 
– Prefer boring, proven technology for core infrastructure; save experimentation for non-critical parts of the system 
– Post-mortems after incidents are blameless and focused on systemic fixes, not individual fault 
– "Done" means: tested, reviewed, documented, deployed, and monitored — not just "code written"

- - -

*Remember: Great software changes lives. When users can accomplish their goals
effortlessly, quickly and efficiently, the software has succeeded.*

