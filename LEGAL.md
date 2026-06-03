# License Agreement & Legal Framework
> **⚠️ This document provides legally binding terms for using, forking, and building upon Gistory.**
> **Last Updated: 2026-06-02** | **Version: 1.1** | **[Gistory](https://github.com/dhaupin/gistory)**

---

## PART 1: CORE LEGAL FRAMEWORK

### §1. License Grant (Fair-Code / Source-Available Model)

**Gistory** is provided under a **Fair-CODE / Source-Available license model.**

**This is NOT a pure MIT License** - Gistory includes supplemental terms (especially §8, §15) that restrict commercial exploitation. These terms are explicit and disclosed.

**Grant:** Permission is granted, free of charge, to use, copy, modify, merge, distribute, sublicense, and/or sell copies of Gistory, subject to the following conditions:

1. **Attribution** - Modified or unmodified versions must retain LEGAL.md and cite Gistory as originating work
2. **No Gistory Branding** - Derivatives may NOT use "Gistory" name in product/project names without written permission
3. **No Commercial Service** - Gistory may NOT be used to provide commercial SAAS/platform services to third parties (see §15)

Gistory may serve as: front-end UI, orchestrator, prompt keeper, chat logger, audit trail, annotation tool, or similar AI workflow companion.

---

### §2. Copyright & Ownership

**© 2026 Creadev.org** and **The Contributors.**

Gistory is an open-source project with copyright held by the maintainer and contributors collectively.

- **Maintainer:** **Creadev.org** (independent open-source maintainer)
- **Contributor License:** **CLA-C** (Contributor License Agreement - Copyright) - By submitting PRs, contributors agree to license contributions under this document's terms

**No IP Transfer Required:** Contributors retain copyright to their contributions. License is non-exclusive, worldwide, royalty-free.

---

### §3. Disclaimer of Warranty

**GISTORY IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.**

Specifically:

- **NO FITNESS FOR A PARTICULAR PURPOSE** - Gistory may not be suitable for any specific use case
- **NO SECURITY GUARANTEES** - Despite best efforts, no guarantee security vulnerabilities don't exist (encryption is client-side)
- **NO AVAILABILITY** - No SLA for uptime, updates, or support
- **NO SYNC RELIABILITY** - Gistory syncs between devices but doesn't guarantee conflict-free merging

---

### §4. Limitation of Liability

**TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL GISTORY CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES.**

This includes, but is not limited to:

- Data loss or corruption
- Sync conflicts causing data loss
- Security breaches via Gistory
- Passphrase loss (no recovery possible)
- Business interruption
- Lost profits

---

### §5. Patent Defense & Termination

If any party brings a patent infringement claim against Gistory, Contributors may defend but are **NOT obligated** to do so.

**Defensive Termination:** If a user files patent litigation claiming Gistory infringes their patents, their license to use Gistory terminates immediately. They may not receive a license back unless Contributors grant it.

---

## PART 2: TRADEMARK & BRANDING

### §6. Trademark & Naming Convention

**"Gistory"** is used as a descriptive **compound term** for this project's technical purpose: **gi**st + **history** (keeping track of AI prompting history).

**™ Status:** This document establishes **common-law trademark** protection through consistent use in the open-source community. We have NOT filed a formal USPTO registration.

**Nomenclature Rationale:**

The term "Gistory" was chosen as a descriptive technical designation:

- **Gi** - Short for "gift" or "given" (receiving from AI)
- **Gist** - The essence or main point of something (a summary, core idea)
- **History** - Tracking conversation/computation history

This naming is a descriptive technical designation, NOT a commercial brand attempt, and is explicitly **separate** from any registered corporate trademarks.

---

### §7. Non-Affiliation (Competitive Separation)

Gistory is **INDEPENDENT** from all commercial entities. Specifically:

| Entity | Relationship |
|--------|-------------|
| **ChatGPT/OpenAI** | Not affiliated, but designed for use with |
| **Claude/Anthropic** | Not affiliated, but designed for use with |
| **Cloudflare** | Not affiliated, but deployed on Workers |
| **Any prompt SaaS** | Not affiliated, completely independent |

Using Gistory does not imply endorsement by any entity.

---

### §8. Project Name Protection (Anti-Confusion)

Gistory is a distinct project. To avoid confusion with similarly-named projects:

**This is NOT GitHub History:**

- **GitHub** is a hosting platform with commit history features
- Gistory is a standalone prompt keeper app for AI workflows
- Do not confuse Gistory with GitHub

**This is NOT Generic AI Tools:**

- Many "AI history" or "prompt keeper" tools exist
- Gistory is the specific project name, not a generic term

**Naming Collision Prevention:** Derivatives must NOT use "Gistory" in:

- Repository names
- Package names (npm, pip, etc.)
- Product names
- Company/project names

Acceptable: "Built with Gistory" (with attribution)
Forbidden: "GistoryFlow", "GistoryCloud", "MyGistory", "Gistoryfy"

---

## PART 3: DERIVATIVE WORKS

### §9. Fork Rules ("Cantrell Clause")

Derivatives of Gistory must adhere to the following to remain compliant:

**Permitted:**

- Private forks for internal use
- Open-source forks that clearly distinguish from Gistory
- Educational use and research
- Building tools that USE Gistory
- Personal prompt keeper applications

**Prohibited:**

- Commercial SAAS platforms built ON Gistory (offering Gistory as a service)
- Re-branding derivatives as "Gistory" products
- Using Gistory to provide paid prompt management services to customers
- Creating "Gistory-as-a-Service" offerings

**Naming Convention:** Derivatives must NOT use "Gistory" in:

- Repository names
- Package names (npm, pip, etc.)
- Product names
- Company/project names

Acceptable: "Built with Gistory framework" (with attribution)
Forbidden: "GistoryFlow", "GistoryCloud", "MyGistory"

---

### §10. Attribution Requirements

All distributions (binary, source, documentation) must include:

1. **Notice:** "This project uses Gistory ([URL]/[version])"
2. **License:** Include COPY OF MIT License or link to LICENSE file
3. **Copyright:** Credit "Copyright (c) The Gistory Contributors"
4. **Source:** For source distributions, link to original Gistory source

**Minimum Attribution Language:**

> "This software includes Gistory, an open-source prompt keeper with encrypted sync. Gistory is copyright The Contributors and licensed under MIT. See LICENSE file."

---

### §11. Citation for Academic Work

If Gistory contributes to academic research, please cite:

```
Gistory (Version [x.y.z]). Encrypted prompt keeper with multi-device sync.
Available at: https://github.com/dhaupin/gistory
```

---

## PART 4: SECURITY & COMPLIANCE

### §12. Security Responsibilities

**Gistory is a CLIENT-SIDE ENCRYPTED application, not a security product.**

- Users are SOLELY responsible for securing their passphrases
- **No passphrase recovery exists** - lost passphrase = lost data permanently
- Encryption happens in-browser using Web Crypto API
- Server never sees unencrypted data
- Audit your security practices before production use

---

### §13. Data Handling

If you build products that process user data using Gistory:

- You're solely responsible for GDPR, CCPA, and other compliance
- Gistory encrypts data client-side but doesn't inherently protect PII/PHI
- Implement your own encryption, access controls
- Gistory contributors assume NO data protection obligations
- Sync data passes through Cloudflare Workers (logged for debugging)

---

### §14. Export Compliance

Gistory is developed in the **United States.**

- Users are responsible for ITAR, EAR, and sanctions compliance
- Some jurisdictions may restrict use of encryption
- Verify your use complies with local laws

---

### §15. Termination Provisions

License terminates IMMEDIATELY upon:

1. Breaching §9 (Fork Rules)
2. Bringing patent litigation (Defensive Termination §5)
3. Misusing trademark (§6 violations)
4. Using Gistory in ways that harm Contributors' reputation

**Effect of Termination:** Must cease all use and destroy all copies.

**Survival:** §§3, 4, 12 (Disclaimer, Liability, Security) survive termination.

---

## PART 5: ANTI-COMPETITION CLAUSE

### §16. Commercial Use Restrictions

**Specific restrictions** to prevent Gistory from being exploited commercially by others:

**YOU MAY NOT:**

- Offer Gistory as a managed/hosted service (SAAS/PAAS)
- Charge for access to Gistory (directly or indirectly)
- Bundle Gistory in commercial products sold for profit
- Use Gistory to power paid prompt management services for customers
- Create marketplaces selling Gistory-based solutions

**YOU MAY:**

- Build personal productivity tools FOR yourself using Gistory
- Sell products that USE Gistory (but not Gistory itself)
- Offer Gistory consulting/support services
- Create educational content about Gistory

---

## PART 6: PROJECT TECHNICAL CLASSIFICATION

### §17. What Gistory Is (and Isn't)

| Category | Classification |
|----------|----------------|
| **Type** | AI workflow companion - prompt history, logging, orchestration, auditing |
| **Variants** | May serve as front-end, orchestrator, audit logger, annotation tool |
| **License** | MIT + supplemental terms |
| **Commercial Use** | Restricted (§16) |
| **Target Users** | Developers and power users managing AI interactions |
| **Production Ready** | Yes (see README for caveats) |

Gistory is NOT:

- A cloud-hosted service
- A specific AI model or provider
- A security product (encryption tool)
- A SAAS platform
- A managed service
- An enterprise compliance tool (though may assist with auditing)

---

### §18. Badges & Endorsements

**Official Badges (when granted):**

- Gistory-Verified: Packages tested against Gistory standards
- Gistory-Compatible: Works with Gistory sync protocol

**Endorsements:**

- No companies are endorsed
- No commercial partnerships exist
- Listings in README are community-curated

---

## ENFORCEMENT & DISPUTES

### §19. Enforcement

Violation may result in:

- DMCA takedown requests
- Trademark enforcement
- License termination

**Contact:** For licensing questions: Open an issue on GitHub.

### §20. Governing Law

This document is governed by **United States federal law** and **California state law**, excluding conflict of law provisions.

### §21. Severability

If any provision is held unenforceable, the remainder continues in effect.

---

## QUICK REFERENCE

| Action | Allowed? |
|--------|----------|
| Use Gistory in open source | ✅ Yes |
| Use Gistory in closed source | ✅ Yes |
| Fork privately | ✅ Yes |
| Fork publicly (rebranded) | ❌ No |
| Call it "Gistory" in name | ❌ No |
| SAAS offering | ❌ No |
| Sell Gistory directly | ❌ No |
| Use "Built with Gistory" | ✅ Yes |
| Reasonable attribution | ✅ Required |

**By using Gistory, you agree to these terms.**