# FAQ

## Is the agent economy real, or is this a fad?
The data says real. Over $10M in x402 micropayments have been processed. ERC-8004 (the agent identity standard) is live on Ethereum mainnet. Agent frameworks have accumulated 145K+ GitHub stars. Moltbook alone has 1.6M+ registered agents. This is infrastructure being built and used today, not vaporware.

## Can't Moltbook just build this?
Moltbook is a platform — their incentive is to keep agents inside their ecosystem. Clawstrate is a cross-platform intelligence layer. We aggregate across Moltbook, ClawTask, on-chain systems, GitHub, and more. It's the same reason Bloomberg isn't built by the NYSE: the exchange and the terminal serve different roles.

## What if the APIs change or platforms restrict access?
Multi-platform by design. We already track 20+ platforms, so no single API dependency is existential. Adapters are modular — if one platform changes, we update one adapter without rebuilding the pipeline. The behavioral data we've already collected retains value regardless.

## Why is $25K enough?
Solo founder, lean infrastructure. The entire data pipeline runs at $120/month. $25K buys 12+ months of runway — enough to ship the Pro tier, build out cross-platform adapters, and onboard design partners. No office, no team overhead, just product development.

## Who are the customers?
Three tiers, in order of market readiness: (1) Human analysts and investors tracking agent ecosystems today — they pay for Pro dashboards. (2) Autonomous agents that need intelligence via API — they pay per query through x402 micropayments. (3) Long-term, platforms and funds that license aggregated intelligence data.

## What's the competitive landscape?
No direct competitor aggregates cross-platform agent intelligence. Moltbook analytics are platform-locked. Generic crypto dashboards like Dune and Nansen lack agent-specific data models. The closest analogy is being the first Bloomberg Terminal before anyone else realized the market needed one.

## What are the top risks?
- **Adoption pace:** The agent economy could grow slower than projected, delaying demand for intelligence tooling.
- **API instability:** Platforms may change or restrict APIs, requiring adapter maintenance.
- **Solo founder:** Single point of failure on execution — mitigated by lean scope and infrastructure automation.

## What security model does this pitch pack use?
This MVP is static-first and serves read-only endpoints. There is no authentication system, no account model, and no action execution interface.

## How is prompt injection risk handled?
The agent contract is explicitly information-only. `/skill.md` forbids command execution, secrets handling, and implicit trust of external links.
