# research/aayu

Aayusha's research and planning docs, moved here from the repo root.

| File | Written | What it is |
|---|---|---|
| [EXECUTE.md](EXECUTE.md) | 10:53 | The war plan — four failure modes, hour-by-hour clock to 17:00 |
| [DOSSIER.md](DOSSIER.md) | 10:59 | Judge-by-judge intelligence, sponsor docs, three conversion commits |
| [VERDICT.md](VERDICT.md) | 11:05 | Adversarial review of the pitch — killed the "no incumbents" overclaim |
| [RESEARCH.md](RESEARCH.md) | 11:24 | Clinical evidence base from PubMed primaries, with a corrections log |

`docs/EVIDENCE.bib` stays in `docs/` — it's the machine-readable companion to `RESEARCH.md`, and
the two links inside `RESEARCH.md` were repointed when it moved.

`VERDICT.md` and `DOSSIER.md` refer to `EXECUTE.md` by name in prose. Those are mentions, not
links, so nothing is broken — but the path in your head is now `research/aayu/`.

---

A diagnosis of these documents — what holds up, what breaks, and the one scheduling error worth
fixing before anything else — is at
[../krish/04-DIAGNOSIS-aayu-docs.md](../krish/04-DIAGNOSIS-aayu-docs.md).

Short version: `RESEARCH.md`'s corrections log and `VERDICT.md`'s Arine/MTM reframe are the two
best pieces of thinking in the repo — both found a fatal overclaim and replaced it with a
*stronger sourced* claim. The gap is that all four documents audit the **pitch**, and none audits
the **system**: the code still renders two claims it contradicts three files away, and every live
caller gets the demo patient's conditions. And `DOSSIER.md` Commit B routes Stedi through a
Medplum Bot — which is paid-tier — in the first slot on the clock.
