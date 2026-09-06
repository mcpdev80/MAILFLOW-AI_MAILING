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

## Support MailFlow

MailFlow is developed independently in spare time and remains open source under AGPL-3.0 regardless of sponsorship.

If MailFlow saves you time, you use it regularly, or your organization depends on it, you can support continued development through GitHub Sponsors. Sponsorship helps fund development time, CI and test infrastructure, compatibility testing with local and hosted LLMs, security work, documentation, localization, and project infrastructure.

Sponsorship is completely optional and does **not** buy proprietary features, guaranteed feature delivery, priority support, an SLA, or a different software license.

See [`SPONSORS.md`](SPONSORS.md) for the sponsorship policy and suggested support levels.

## Development

See [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for development setup and contribution guidance.

## AI-assisted development

Development of this fork has included assistance from **ChatGPT by OpenAI** for planning, implementation support, testing, debugging, analysis, and documentation.

AI is used as a development tool, not identified as a legal author or copyright holder. The human maintainer directs, reviews, tests, selects, and integrates changes and assumes responsibility for those decisions.

For the detailed transparency and provenance statement, see [`AI_ASSISTANCE.md`](AI_ASSISTANCE.md).

## License

This repository is distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See [`LICENSE`](LICENSE).

The AGPL permits commercial use, modification, distribution, and paid operation of the software, provided its conditions are met. In particular, a party that modifies a covered version and lets users interact with it remotely through a computer network must provide those users an opportunity to receive the Corresponding Source of that modified version as required by AGPL section 13.

When distributing modified source versions, the AGPL also requires preservation of applicable notices and prominent notices that the work was modified, including a relevant date.

There is **no separate commercial-license requirement provided by this repository**. No proprietary license to third-party upstream code is granted here.

## Provenance and copyright

This repository is derived from the original **MailFlow** project created by **Jonatan Garcia / JonatanGhub** and retains the upstream AGPL-3.0 licensing history.

**Modification notice:** this fork contains substantial modifications and new functionality made from **September 2026 onward**, including work authored by **Marcel Pfingstgräf** and other contributors.

Copyright in the original upstream portions remains with the respective upstream author(s). Copyright in later modifications and new contributions remains with the respective human author(s), where copyright subsists, unless explicitly assigned otherwise.

For detailed provenance and copyright scope, see [`NOTICE.md`](NOTICE.md), [`COPYRIGHT.md`](COPYRIGHT.md), and [`AI_ASSISTANCE.md`](AI_ASSISTANCE.md).

## For forks and derivative works

If you copy, fork, modify, redistribute, or operate a modified covered version of this project, review the full AGPL-3.0 terms in [`LICENSE`](LICENSE). Among other things, do not remove applicable copyright, license, warranty, provenance, or modification notices that the license requires to remain intact.

The project name and upstream branding are not claimed here as exclusive trademarks of this fork.
