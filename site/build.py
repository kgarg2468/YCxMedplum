#!/usr/bin/env python3
"""
Rebrand the scraped marketing shell into the Deprescribe landing page.

What this keeps: layout, CSS, fonts, the hex-button and grid/dither/halftone
component classes, section rhythm.

What this removes, deliberately:
  - every Greptile brand asset (logo, wordmark, brand mark)
  - the customer logo wall (NVIDIA, Brex, Zapier, ...). Those are another
    company's customers; showing them here would be fabricated social proof.
  - named third-party testimonials, for the same reason
  - Greptile's analytics (OpenAI SDK, Gravity pixel) and the Next.js
    hydration chunks. Without hydration the inline `opacity:0` reveal styles
    would leave the page blank, so those are neutralised too.

Run:  python3 site/build.py
"""
import re
import pathlib

SRC = pathlib.Path(__file__).parent / "index.html"
html = SRC.read_text(encoding="utf8", errors="ignore")

# ── 1. Strip scripts: trackers + Next.js hydration ──────────────────────────
html = re.sub(r'<script[^>]*src="[^"]*(oaiq\.min|gr-pix)[^"]*"[^>]*>\s*</script>', "", html)
html = re.sub(r'<script[^>]*src="[^"]*_next/static/chunks[^"]*"[^>]*>\s*</script>', "", html)
html = re.sub(r"<script[^>]*>\s*self\.__next_f.*?</script>", "", html, flags=re.S)
html = re.sub(r"<script[^>]*>\s*\(self\.__next_f.*?</script>", "", html, flags=re.S)

# ── 2. Un-hide content that JS used to reveal ───────────────────────────────
html = re.sub(r'style="opacity:0;filter:blur\([^)]*\)"', 'style="opacity:1"', html)
html = html.replace('style="opacity:0"', 'style="opacity:1"')

# ── 3. Head ────────────────────────────────────────────────────────────────
html = re.sub(
    r"<title>[^<]*</title>",
    "<title>Deprescribe | Voice-first medication review on FHIR</title>",
    html,
)
html = re.sub(
    r'<meta name="description" content="[^"]*"',
    '<meta name="description" content="A phone call before the appointment finds prescribing '
    'cascades and inappropriate medications, then writes them to the chart as FHIR for a '
    'clinician to review. Detection is a citation-backed table lookup with zero LLM calls."',
    html,
)

# ── 4. Brand mark: swap the image logo for a text wordmark ──────────────────
WORDMARK = (
    '<span class="font-anybody font-extrabold tracking-tight text-slate '
    'text-xl 2xl:text-2xl">Deprescribe<span style="color:#d03b3b">&minus;</span></span>'
)
html = re.sub(r"<img[^>]*src=\"[^\"]*logo(-green)?\.svg\"[^>]*>", WORDMARK, html)
html = re.sub(r"<img[^>]*src=\"[^\"]*wordmark-logo\.svg\"[^>]*>", WORDMARK, html)

# ── 5. Remove the customer logo wall entirely ───────────────────────────────
html = re.sub(r"<img[^>]*src=\"[^\"]*logos/home/[^\"]*\"[^>]*>", "", html)

# ── 6. Copy ─────────────────────────────────────────────────────────────────
# Longest strings first so a short key never eats a longer one.
COPY = [
    # hero
    ("The AI Code<br>Reviewer.", "The pre-visit<br>medication review."),
    ("AI agents that review and test pull requests with full context of the codebase.",
     "A voice agent goes through the pill bag with an older adult before their appointment. "
     "A deterministic engine finds the prescribing cascades. Everything lands in the chart as FHIR."),
    ("Contact Sales", "Read the research"),
    ("Start now", "Hear a call"),
    ("Over 9,000+ teams use Greptile", "Every finding carries its citation"),
    ("Introducing TREX: Greptile Now Runs Your Code. TREX Runs Your Code.",
     "Built at the YC x Medplum Agentic Healthcare Hackathon"),

    # how it works
    ("Indexes your codebase", "Asks why each drug was started"),
    ("Builds a graph of your repo - files, functions, and dependencies.",
     "The one question no chart answers. A cascade is only visible if you know the reason "
     "behind each prescription, and that lives in the patient's kitchen."),
    ("Swarm of agents review the PR", "Resolves what was actually said"),
    ("Parallel agents review changes, assess their impact beyond the diff, and flag issues.",
     "Mumbled brand names resolve to RxNorm ingredients. Below the match threshold nothing is "
     "guessed: the patient's own words go to the clinician marked unresolved."),
    ("Greptile learns your codebase over time", "Detects cascades and inappropriate medications"),
    ("Reads other engineers' comments to understand your coding standards.",
     "A table lookup against AGS Beers 2023, STOPP/START v3 and the anticholinergic burden scale. "
     "Zero model calls, so it cannot invent a finding."),

    # sections
    ("Catch them all From style violations to security risks and multi-file logical bugs",
     "Cascades, anticholinergic burden, duplication, and drugs with no stated indication"),
    ("Your house, your rules", "Every finding shows its source"),
    ("Set your rules", "See the tables"),
    ("We're getting to know each other", "Nothing is final without a clinician"),
    ("Greptile learns your codebase and coding standards by reading your team' PR comments.",
     "Recommendations are written as preliminary, draft and proposed. A human confirms before "
     "anything becomes final."),
    ("The Central Validation Layer.", "It writes to the chart, not to a dashboard."),
    ("Designed to work seamlessly with every coding agent, Greptile serves as the unified "
     "validation agent for all code changes.",
     "MedicationStatement, Flag, RiskAssessment, DetectedIssue with implicated drugs in causal "
     "order, Goal, CarePlan and Task. Standard FHIR R4 on Medplum, readable by any system that "
     "speaks FHIR."),
    ("Ways Greptile plugs into your workflow", "What lands in the chart"),
    ("Autonomously Test Every PR", "The engine cannot hallucinate a finding"),
    ("TREX is a Greptile agent that writes and runs tests for every PR in a sandbox to catch "
     "bugs and missed edge cases.",
     "Detection is a hand-curated table lookup with no model calls anywhere in the path. Run it "
     "twice on the same input and the output is byte-identical."),
    ("Get early access", "Read the engine"),
    ("Security-First Design Built for enterprises across defense, healthcare, and financial services.",
     "Designed to the FDA Non-Device CDS criteria"),
    ("Self-Hosted Deployment", "Clinician in the loop"),
    ("Host Greptile in your own air-gapped environment.",
     "The agent never tells a patient to stop, start or change a dose. It gathers, a clinician decides."),
    ("SOC 2 Compliance", "Independently reviewable basis"),
    ("Independent audits, reports available on request.",
     "Every recommendation renders the guideline it came from, so a clinician can check the source "
     "rather than trust the output."),
    ("Enterprise Ready", "Synthetic data only"),
    ("SSO, audit logs, dedicated support.",
     "The demo patient is fictional and tagged synthetic-demo. No real patient data, ever."),
    ("See what our customers are saying", "Where the numbers come from"),
    ("Greptile is building the code validation layer so you can get back to shipping.",
     "Subtraction is the intervention nobody is staffed to do. We do the interview part."),
]
for old, new in sorted(COPY, key=lambda p: -len(p[0])):
    html = html.replace(old, new)

# ── 7. FAQ ─────────────────────────────────────────────────────────────────
FAQ = [
    ("How does Greptile pricing work?", "How do you know it is not hallucinating?"),
    ("Can Greptile be self-hosted?", "Can an 80-year-old really list their medications?"),
    ("Yes, you can self-host Greptile in your AWS environment and even use your own LLM "
     "providers for added flexibility.",
     "They read the labels, they do not recall them. The agent asks them to fetch their bottles "
     "and waits, which is the brown bag review clinics already do. In the SPPiRE trial that "
     "method ran on patients taking fifteen or more medicines, and the brown bag portion produced "
     "most of the deprescribing."),
    ("Are there free trials or discounts available for Greptile?", "Who is this for?"),
    ("What programming languages does Greptile support?", "What happens when a name is misheard?"),
    ("Is Greptile compatible with GitLab?", "Is this a regulated medical device?"),
    ("Can I use Greptile's API for my own product?", "What is a prescribing cascade?"),
    ("What is AI code review?", "Why voice instead of a form?"),
]
for old, new in FAQ:
    html = html.replace(old, new)

# ── 8. Remaining brand references ──────────────────────────────────────────
html = re.sub(r"\bGreptile\b", "Deprescribe", html)
html = html.replace("greptile-green", "brand-accent")
html = re.sub(r'href="https://app\.deprescribe\.com/signup"', 'href="#demo"', html)
html = re.sub(r'href="https://www\.greptile\.com[^"]*"', 'href="#"', html)

SRC.write_text(html, encoding="utf8")

remaining = len(re.findall(r"greptile", html, re.I))
print(f"wrote {SRC}  ({len(html)//1024}K)")
print(f"leftover 'greptile' mentions: {remaining}")
print(f"script tags remaining: {len(re.findall(r'<script', html))}")
