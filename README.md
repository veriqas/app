# SENQOR — Quantum Risk & Compliance Platform

SENQOR is an enterprise-grade Quantum Risk, Compliance and Governance (QRC) platform built for Chief Risk Officers, CISOs, CIOs and Board Risk Committees.

## Platform Purpose

SENQOR answers the critical questions facing organisations in the post-quantum transition:

1. Are we quantum ready?
2. What is our current quantum exposure?
3. What requirements apply to us?
4. How aligned are we to those requirements?
5. What prevents us from being aligned?
6. What exactly must we do next?
7. Who owns each action?
8. What evidence proves the action was completed?
9. Which business services create the greatest quantum risk?
10. Are we improving or deteriorating?

## Technology Stack

- **Frontend**: Next.js 16 · TypeScript · Tailwind CSS
- **Database**: PostgreSQL · Prisma ORM v7 · pg adapter
- **Authentication**: NextAuth v5
- **Runtime**: Node.js 20+

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+

### Setup

```bash
npm install
cp .env.example .env
# Edit DATABASE_URL in .env

npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo Login

```
Email:    admin@northstar.com
Password: senqor-demo
Tenant:   Northstar Financial Group
```

## Modules

| Module | Route | Status |
|--------|-------|--------|
| Executive Posture | /dashboard | Phase 1 |
| Quantum Risk Register | /risks | Phase 1 |
| Business Services | /business-services | Phase 1 |
| Cryptographic Inventory | /crypto-inventory | Phase 1 |
| Compliance Posture | /compliance | Phase 1 |
| Control Library (SQCF) | /controls | Phase 1 |
| Actions | /actions | Phase 1 |
| Evidence | /evidence | Phase 1 |
| My Work | /my-work | Phase 1 |
| Suppliers | /suppliers | Phase 1 |
| Information Assets | /information-assets | Phase 2 |
| Programmes | /programmes | Phase 2 |
| Assessments | /assessments | Phase 2 |
| Sensors / Discovery | /sensors | Phase 3 |
| Board Reporting | /reporting/board | Phase 7 |

## Quantum Readiness Score

7-dimension weighted score (0–100):

| Dimension | Weight |
|-----------|--------|
| Cryptographic Visibility | 20% |
| Quantum Exposure | 20% |
| Data Longevity Risk | 15% |
| Migration Preparedness | 15% |
| Third-Party Readiness | 10% |
| Governance Maturity | 10% |
| Cryptographic Agility | 10% |

Every score is explainable — no black-box calculations.

## SQCF

SQCF (SENQOR Quantum Control Framework) is SENQOR's internal control normalization framework.
**Not a government standard.**

Domains: GV · ID · DC · RA · CR · CA · MG · SC · EV · AU

## Sensor Integrations (Phase 3)

CryptoScan · CryptoDeps · SSLyze · ssh-audit · Zeek · ZGrab2 · Semgrep

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Multi-Tenancy

Every record is tenant-scoped. Isolation enforced server-side via Prisma + RLS.
