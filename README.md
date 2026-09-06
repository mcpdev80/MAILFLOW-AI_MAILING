# MailFlow

**Open source AI email assistant. Use any LLM. Your inbox, your rules, your privacy.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

MailFlow automatically classifies incoming emails, supports AI-assisted mail workflows, and can run with local or hosted LLMs.

## Quick Start (Self-hosted)

```bash
git clone https://github.com/mcpdev80/MAILFLOW-AI_MAILING.git
cd MAILFLOW-AI_MAILING
cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up -d --build
```

This brings up the application stack. See the documentation under [`docs/`](docs/) for configuration, deployment, and operational details.

## Current capabilities

MailFlow has evolved substantially beyond the original upstream baseline. Current development includes, among other things:

- multi-mailbox and multi-user workflows
- AI-assisted classification and writing
- DecisionMemory-based learning from confirmed corrections
- review inbox, notifications, and daily summaries
- safe historical bulk review/apply workflows
- mailbox ownership and access controls
- composer, drafts, SMTP/XOAuth2 sending, and attachments
- unified inbox and core mail client actions
- TLS edge, custom certificate support, and network isolation
- localization support for German, English, and Spanish
- operational dashboard and search

## Development

See [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for development setup and contribution guidance.

## License

This repository is distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See [`LICENSE`](LICENSE).

The AGPL permits commercial use, modification, distribution, and operation of the software subject to its license conditions, including the source-code obligations that apply to modified versions offered to users over a network.

There is **no separate commercial-license requirement provided by this repository**.

## Provenance and copyright

This repository is derived from the original MailFlow project created by **Jonatan Garcia / JonatanGhub** and retains the upstream AGPL-3.0 licensing history.

Substantial later modifications and additions in this fork were created by **Marcel Pfingstgräf** and contributors. Copyright remains with the respective authors of their contributions unless explicitly stated otherwise.

For attribution and provenance details, see [`NOTICE.md`](NOTICE.md).
