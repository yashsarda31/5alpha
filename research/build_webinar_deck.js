// Alpha Nova — "Systematic Infrastructure" webinar deck
// Build: node build_webinar_deck.js   (outputs Alpha-Nova-Webinar.pptx in repo root)
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const SHOTS = path.join(__dirname, "webinar-shots");
const OUT = path.join(__dirname, "..", "Alpha-Nova-Webinar.pptx");

// ---- palette (Glass Terminal brand) ----
const BG = "0A0A0C";        // near-black dominant
const PANEL = "141419";     // card panel
const PANEL2 = "1B1B22";    // slightly lifted panel
const BORDER = "2E2E36";
const INK = "F5F5F7";
const DIM = "9A9AA3";
const FAINT = "6B6B75";
const GOLD = "E8C47C";
const GOLD_DEEP = "B98A3E";
const GREEN = "32D74B";
const RED = "FF453A";

const F = "Arial";
const SHOT_AR = 1440 / 860;   // capture aspect ratio

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";  // 13.3 x 7.5
pres.author = "Alpha Nova";
pres.title = "Alpha Nova — Systematic Trading Infrastructure";
const W = 13.3, H = 7.5;

const shadow = () => ({ type: "outer", color: "000000", blur: 14, offset: 5, angle: 90, opacity: 0.45 });

function baseSlide() {
  const s = pres.addSlide();
  s.background = { color: BG };
  return s;
}

// gold code chip + section kicker (the app's own page codes = brand motif)
function kicker(s, code, label, x = 0.6, y = 0.55) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w: 0.82, h: 0.34, rectRadius: 0.08,
    fill: { color: GOLD }, line: { type: "none" },
  });
  s.addText(code, {
    x, y: y - 0.015, w: 0.82, h: 0.37, align: "center", valign: "middle",
    fontFace: F, fontSize: 12, bold: true, color: "0A0A0C", charSpacing: 2, margin: 0,
  });
  s.addText(label.toUpperCase(), {
    x: x + 0.95, y: y - 0.015, w: 7.6, h: 0.37, valign: "middle",
    fontFace: F, fontSize: 12, bold: true, color: DIM, charSpacing: 4, margin: 0,
  });
}

function slideTitle(s, text, x = 0.6, y = 1.02, w = 7.4, size = 33) {
  s.addText(text, { x, y, w, h: 0.85, fontFace: F, fontSize: size, bold: true, color: INK, margin: 0 });
}

// framed screenshot card
function shot(s, img, x, y, w) {
  const h = w / SHOT_AR;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: x - 0.07, y: y - 0.07, w: w + 0.14, h: h + 0.14, rectRadius: 0.09,
    fill: { color: PANEL }, line: { color: BORDER, width: 1 }, shadow: shadow(),
  });
  s.addImage({ path: path.join(SHOTS, img), x, y, w, h, rounding: false });
  return h;
}

function pageNo(s, n) {
  s.addText(String(n).padStart(2, "0"), {
    x: W - 1.05, y: H - 0.52, w: 0.5, h: 0.3, align: "right",
    fontFace: F, fontSize: 10, color: FAINT, margin: 0,
  });
}

// bullet list with bold lead-ins
function walkthroughList(s, items, x, y, w, opts = {}) {
  const runs = [];
  items.forEach(([lead, rest], i) => {
    runs.push({ text: lead + " — ", options: { bold: true, color: INK } });
    runs.push({ text: rest, options: { color: DIM, breakLine: true } });
  });
  s.addText(runs, {
    x, y, w, h: opts.h || 3.1, fontFace: F, fontSize: opts.size || 13.5,
    paraSpaceAfter: opts.gap || 10, valign: "top", margin: 0, lineSpacingMultiple: 1.12,
  });
}

// gold "best practice" card
function practiceCard(s, text, x, y, w, h = 0.92) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.09,
    fill: { color: "241D10" }, line: { color: "5A4A28", width: 1 },
  });
  s.addText([
    { text: "BEST PRACTICE   ", options: { bold: true, color: GOLD, fontSize: 10.5, charSpacing: 3 } },
    { text: text, options: { color: "E9DFC8", fontSize: 12 } },
  ], { x: x + 0.22, y: y + 0.1, w: w - 0.44, h: h - 0.2, fontFace: F, valign: "middle", margin: 0 });
}

// ============ 01 · TITLE ============
{
  const s = baseSlide();
  // AN mark
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.75, y: 1.5, w: 1.05, h: 1.05, rectRadius: 0.26,
    fill: { color: GOLD }, line: { type: "none" }, shadow: shadow(),
  });
  s.addText("AN", { x: 0.75, y: 1.5, w: 1.05, h: 1.05, align: "center", valign: "middle",
    fontFace: F, fontSize: 30, bold: true, color: "0A0A0C", margin: 0 });

  s.addText("Alpha Nova", { x: 0.72, y: 2.85, w: 6.6, h: 1.05, fontFace: F, fontSize: 54, bold: true, color: INK, margin: 0 });
  s.addText("Systematic Trading Infrastructure", {
    x: 0.75, y: 3.95, w: 6.4, h: 0.5, fontFace: F, fontSize: 21, color: GOLD, margin: 0 });
  s.addText("Platform Masterclass  ·  Live Webinar", {
    x: 0.75, y: 4.55, w: 6.2, h: 0.4, fontFace: F, fontSize: 14, color: DIM, margin: 0 });
  s.addText("5alphav2.vercel.app", {
    x: 0.75, y: 6.6, w: 4, h: 0.35, fontFace: F, fontSize: 12, color: FAINT, charSpacing: 1, margin: 0 });

  shot(s, "dashboard.png", 7.55, 1.72, 5.15);
  s.addNotes("Welcome everyone. Quick framing before we start: this is not a stock-tips session. Over the next 45 minutes I'll walk you through Alpha Nova as infrastructure — the same way an institutional desk thinks about its tooling. Everything you'll see is live production, not mockups.");
  pageNo(s, 1);
}

// ============ 02 · THE REFRAME ============
{
  const s = baseSlide();
  kicker(s, "WHY", "The reframe");
  slideTitle(s, "Tips expire. Systems compound.", 0.6, 1.02, 11, 36);

  const cardY = 2.2, cardH = 4.1, cardW = 5.85;
  // old way
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: cardY, w: cardW, h: cardH, rectRadius: 0.12,
    fill: { color: PANEL }, line: { color: BORDER, width: 1 } });
  s.addText("THE TIP-CHASING LOOP", { x: 0.95, y: cardY + 0.3, w: 5, h: 0.35,
    fontFace: F, fontSize: 13, bold: true, color: RED, charSpacing: 3, margin: 0 });
  s.addText([
    { text: "Someone else's conviction, borrowed for free", options: { bullet: true, breakLine: true } },
    { text: "No entry logic, no exit logic, no sizing logic", options: { bullet: true, breakLine: true } },
    { text: "“Black-box AI” claims you can't audit", options: { bullet: true, breakLine: true } },
    { text: "Unmeasurable — you can't improve what you can't replay", options: { bullet: true } },
  ], { x: 0.95, y: cardY + 0.8, w: 5.15, h: 3, fontFace: F, fontSize: 14, color: DIM, paraSpaceAfter: 14, margin: 0 });

  // new way
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 6.85, y: cardY, w: cardW, h: cardH, rectRadius: 0.12,
    fill: { color: "1D1910" }, line: { color: "5A4A28", width: 1 } });
  s.addText("THE SYSTEMATIC LOOP", { x: 7.2, y: cardY + 0.3, w: 5, h: 0.35,
    fontFace: F, fontSize: 13, bold: true, color: GOLD, charSpacing: 3, margin: 0 });
  s.addText([
    { text: "Documented factors — every score decomposes", options: { bullet: true, breakLine: true } },
    { text: "Entry, stop, target and size computed before you act", options: { bullet: true, breakLine: true } },
    { text: "Risk-adjusted lens: Sharpe / Sortino, not screenshots of wins", options: { bullet: true, breakLine: true } },
    { text: "Repeatable daily process — measured, journaled, improved", options: { bullet: true } },
  ], { x: 7.2, y: cardY + 0.8, w: 5.15, h: 3, fontFace: F, fontSize: 14, color: "E9DFC8", paraSpaceAfter: 14, margin: 0 });

  s.addText("Today: the platform as your analytical engine — data, models, and discipline in one loop.", {
    x: 0.6, y: 6.65, w: 12, h: 0.4, fontFace: F, fontSize: 13, italic: true, color: FAINT, margin: 0 });
  s.addNotes("Set the narrative here. The left card is how most retail participants operate — someone else's conviction with zero infrastructure. The right card is what we're building toward today. Emphasize: the difference isn't intelligence, it's process.");
  pageNo(s, 2);
}

// ============ 03 · PLATFORM MAP ============
{
  const s = baseSlide();
  kicker(s, "MAP", "Platform architecture");
  slideTitle(s, "Three layers. One loop.", 0.6, 1.02, 11);

  const layers = [
    ["DATA LAYER", GOLD, [
      "NSE option chains (live)", "Delivery % + CLV (daily EOD)", "FII / DII institutional flow",
      "Fundamentals & price history", "News + sentiment scoring"]],
    ["MODEL LAYER", GOLD, [
      "Conviction score 0–100 (7 factors)", "Alpha Nova Score v2 (4 pillars)",
      "Market regime engine", "SARIMAX trajectory bands", "Keyless news sentiment"]],
    ["DISCIPLINE LAYER", GOLD, [
      "Position sizing (1% rule)", "Focus List (signal aggregation)",
      "In-app signal alerts", "Discipline Arena journaling", "Regime-scaled exposure"]],
  ];
  const cw = 3.7, gap = 0.45, y0 = 2.15, ch = 4.0;
  layers.forEach((L, i) => {
    const x = 0.6 + i * (cw + gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: y0, w: cw, h: ch, rectRadius: 0.12,
      fill: { color: i === 1 ? PANEL2 : PANEL }, line: { color: BORDER, width: 1 }, shadow: shadow() });
    s.addText(`0${i + 1}`, { x: x + 0.3, y: y0 + 0.26, w: 0.8, h: 0.5, fontFace: F, fontSize: 24, bold: true, color: GOLD, margin: 0 });
    s.addText(L[0], { x: x + 0.3, y: y0 + 0.82, w: cw - 0.6, h: 0.35, fontFace: F, fontSize: 15, bold: true, color: INK, charSpacing: 2, margin: 0 });
    s.addText(L[2].map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < L[2].length - 1 } })),
      { x: x + 0.3, y: y0 + 1.32, w: cw - 0.6, h: 2.5, fontFace: F, fontSize: 12.5, color: DIM, paraSpaceAfter: 9, margin: 0 });
    if (i < 2) s.addText("→", { x: x + cw + 0.02, y: y0 + 1.7, w: gap, h: 0.6, align: "center",
      fontFace: F, fontSize: 22, bold: true, color: GOLD_DEEP, margin: 0 });
  });
  s.addText("Data feeds models. Models feed discipline. Discipline feeds back into what you watch next.", {
    x: 0.6, y: 6.55, w: 12, h: 0.4, fontFace: F, fontSize: 13, italic: true, color: FAINT, margin: 0 });
  s.addNotes("Orient the audience: every screen they'll see today lives in one of these three layers. Data is sourced from NSE and public feeds; models turn it into scores with documented weights; discipline turns scores into sized, journaled decisions. The loop is the product.");
  pageNo(s, 3);
}

// ============ 04 · DASHBOARD ============
{
  const s = baseSlide();
  kicker(s, "DASH", "Walkthrough 01");
  slideTitle(s, "Start where the market is.", 0.6, 1.02, 5.95, 28);
  walkthroughList(s, [
    ["Top Movers", "the day's heavyweight action. Every tile is clickable — it opens the full chart instantly."],
    ["Macro strip", "NIFTY, BANKNIFTY, VIX, USD/INR. Ten seconds tells you the day's temperature."],
    ["Module grid", "every engine is one click away. This is your command surface, not a feed to scroll."],
  ], 0.6, 2.35, 5.9);
  practiceCard(s, "Dashboard first, opinions second. Two minutes here before any trade decision.", 0.6, 5.7, 5.9);
  shot(s, "dashboard.png", 6.9, 1.55, 5.8);
  s.addNotes("Live walkthrough moment #1 — switch to the browser if bandwidth allows. Show the mover click-through into Chart Analyser. Key message: the dashboard is a command surface. You leave it with a hypothesis, not a headline.");
  pageNo(s, 4);
}

// ============ 05 · MARKET SIGNALS ============
{
  const s = baseSlide();
  kicker(s, "SIG", "Walkthrough 02");
  slideTitle(s, "Signals with a spine: 0–100.", 0.6, 1.02, 5.95, 28);
  walkthroughList(s, [
    ["Regime context", "risk-on / risk-off, trend, volatility percentile. Sizing multiplier comes from here."],
    ["Options intelligence", "PCR, max pain, IV, OI buildups — what the derivatives market is actually positioned for."],
    ["Scored setups", "each carries conviction 0–100 with entry, stop, target and quantity pre-computed."],
    ["Pop-up alerts", "new setups notify you anywhere in the app — enable the bell for background notifications."],
  ], 0.6, 2.35, 5.9, { size: 13, gap: 8 });
  practiceCard(s, "Pick your conviction floor (e.g. 60) and never negotiate with it mid-session.", 0.6, 5.7, 5.9);
  shot(s, "signals.png", 6.9, 1.55, 5.8);
  s.addNotes("This is the heart of the platform. Walk the page top to bottom in the live app: regime first, then options intelligence, then setups. Stress that a 48-score setup and a 75-score setup are different animals, and the engine refuses to show anything below 45.");
  pageNo(s, 5);
}

// ============ 06 · FACTOR TRANSPARENCY (narrative centerpiece) ============
{
  const s = baseSlide();
  kicker(s, "DOC", "Factor transparency");
  slideTitle(s, "No black boxes. Every point documented.", 0.6, 1.02, 12, 32);

  const rows = [
    ["OI intensity", "Fresh open-interest thrust in the future", 22],
    ["Price momentum", "Day's directional push", 18],
    ["Options-flow agreement", "Aggressive option buying confirms direction", 15],
    ["Liquidity", "Trade count — can you actually get in and out", 10],
    ["Index day-bias", "NIFTY PCR alignment", 10],
    ["Intraday trend", "Close location in the day's range (CLV)", 10],
    ["Delivery conviction", "Delivery spurt into a directional close", 10],
    ["Regime direction", "Multi-week trend agreement", 5],
  ];
  const y0 = 2.1, rh = 0.485, barMaxW = 3.4, xBar = 8.15, xW = 12.15;
  rows.forEach((r, i) => {
    const y = y0 + i * rh;
    if (i % 2 === 0) s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: y - 0.045, w: 12.1, h: rh, fill: { color: "101014" }, line: { type: "none" } });
    s.addText(r[0], { x: 0.85, y, w: 2.9, h: 0.4, fontFace: F, fontSize: 13.5, bold: true, color: INK, valign: "middle", margin: 0 });
    s.addText(r[1], { x: 3.85, y, w: 4.2, h: 0.4, fontFace: F, fontSize: 11.5, color: DIM, valign: "middle", margin: 0 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: xBar, y: y + 0.1, w: barMaxW * (r[2] / 22), h: 0.17, rectRadius: 0.04,
      fill: { color: GOLD }, line: { type: "none" } });
    s.addText(String(r[2]), { x: xW, y, w: 0.55, h: 0.4, align: "right", fontFace: F, fontSize: 13.5, bold: true, color: GOLD, valign: "middle", margin: 0 });
  });
  s.addText("Total = 100. The same breakdown ships in the product and the docs — audit any signal, any day.", {
    x: 0.6, y: 6.35, w: 12, h: 0.4, fontFace: F, fontSize: 13, italic: true, color: FAINT, margin: 0 });
  s.addNotes("Slow down here — this slide IS the anti-black-box argument. Read two or three factors aloud. The point isn't the specific weights; it's that they exist, they're documented, and they're stable. Contrast with 'proprietary AI secret sauce' marketing.");
  pageNo(s, 6);
}

// ============ 07 · OPTION CHAIN ============
{
  const s = baseSlide();
  kicker(s, "OCHN", "Walkthrough 03");
  slideTitle(s, "Read positioning, not predictions.", 0.6, 1.02, 5.95, 28);
  walkthroughList(s, [
    ["PCR & max pain", "where option writers expect the index to pin — the market's own consensus."],
    ["Support / resistance", "the strikes with the heaviest OI walls, refreshed live."],
    ["IV context", "cheap IV favours buying options; rich IV favours structures that sell premium."],
  ], 0.6, 2.35, 5.9);
  practiceCard(s, "Trade structures, not directions: range days → condors; walls → spreads against them.", 0.6, 5.7, 5.9);
  shot(s, "option_chain.png", 6.9, 1.55, 5.8);
  s.addNotes("Show NIFTY live: point at max pain vs spot, then the support/resistance strikes. The mental shift: the chain is a positioning map, not a crystal ball. The Signals tab already distills this — the chain is where you verify.");
  pageNo(s, 7);
}

// ============ 08 · FOCUS LIST ============
{
  const s = baseSlide();
  kicker(s, "FCS", "Walkthrough 04");
  slideTitle(s, "One list. Every engine's vote.", 0.6, 1.02, 5.95, 28);
  walkthroughList(s, [
    ["Focus weight", "setups, momentum rank, options flow, delivery spurts and heavyweight moves all add votes."],
    ["Side & reasons", "each name shows LONG/SHORT and exactly why it was flagged — no mystery entries."],
    ["Day context", "regime, VIX, index S/R at the top so the list reads with the backdrop, never in isolation."],
  ], 0.6, 2.35, 5.9);
  practiceCard(s, "Your watchlist is built for you by 6 engines. Curate down, don't add up.", 0.6, 5.7, 5.9);
  shot(s, "focus.png", 6.9, 1.55, 5.8);
  s.addNotes("Explain aggregation: a name that's #2 in momentum AND has a delivery spurt AND a fresh long buildup outranks any single-engine flag. This kills the 'what should I watch today' question systematically.");
  pageNo(s, 8);
}

// ============ 09 · SCREENER + ALPHA SCORE ============
{
  const s = baseSlide();
  kicker(s, "EQS", "Walkthrough 05");
  slideTitle(s, "Screen like the greats — scored.", 0.6, 1.02, 5.95, 28);
  walkthroughList(s, [
    ["Guru presets", "Buffett, Minervini, Greenblatt — one click applies the filter set."],
    ["Universes", "Nifty 100/200, S&P 100, Nasdaq 100, or your custom tickers."],
    ["Alpha Nova Score", "four pillars: Value 30 · Quality 30 · Growth 25 · Yield 15. Missing data renormalizes — a non-payer isn't punished for skipping dividends."],
  ], 0.6, 2.35, 5.9, { size: 13 });
  practiceCard(s, "Sort by Alpha Score, then read the raw columns. The score ranks; the columns explain.", 0.6, 5.7, 5.9);
  shot(s, "screener.png", 6.9, 1.55, 5.8);
  s.addNotes("Run the default screen live. Point at NVDA vs a value trap: the old world scores cheapness; the pillar model scores the whole business. Mention the pillars are documented — same transparency story as the conviction score.");
  pageNo(s, 9);
}

// ============ 10 · CHART ANALYSER ============
{
  const s = baseSlide();
  kicker(s, "GP", "Walkthrough 06");
  slideTitle(s, "Technicals with a checklist.", 0.6, 1.02, 5.95, 28);
  walkthroughList(s, [
    ["One search", "price, candles, SMA-20, RSI-14 and fundamentals in a single view. ₹ and $ handled automatically."],
    ["VCP rating", "Minervini's volatility-contraction pattern scored 0–5 stars — a setup-quality shortcut."],
    ["Pro dash", "P/E vs forward, EPS growth, ROE, debt — pass/fail ticks against institutional thresholds."],
  ], 0.6, 2.35, 5.9);
  practiceCard(s, "Arrive here FROM a signal (or a dashboard click) — charts confirm ideas, they don't generate them.", 0.6, 5.7, 5.9);
  shot(s, "chart.png", 6.9, 1.55, 5.8);
  s.addNotes("Demo the dashboard mover click-through landing here pre-loaded. The checklist framing matters: VCP stars and the pass/fail ticks turn 'vibes' chart-reading into a repeatable gate.");
  pageNo(s, 10);
}

// ============ 11 · INSTITUTIONAL FLOWS ============
{
  const s = baseSlide();
  kicker(s, "FLOW", "Walkthrough 07");
  slideTitle(s, "Follow the money that settles.", 0.6, 1.02, 5.95, 28);
  walkthroughList(s, [
    ["FII / DII cash flows", "daily institutional buy/sell with NIFTY context — who is really moving the tape."],
    ["Delivery %", "auto-fetched from NSE daily. Delivered volume = conviction; intraday churn = noise."],
    ["The rule the engine uses", "delivery spurt ≥1.3× the stock's own 20-day average INTO a strong close = accumulation. Into a weak close = distribution."],
  ], 0.6, 2.35, 5.9, { size: 13 });
  practiceCard(s, "Never read delivery % raw — always vs the stock's own baseline. The engine does this for you.", 0.6, 5.7, 5.9);
  shot(s, "fiidii.png", 6.9, 1.55, 5.8);
  s.addNotes("This data updates itself daily at ~7:30pm IST via cron — infrastructure, not homework. The CLV+delivery rule is the same one wired into the conviction score's 10 delivery points. One model, everywhere.");
  pageNo(s, 11);
}

// ============ 12 · VALUATION + FORECASTING ============
{
  const s = baseSlide();
  kicker(s, "DCF", "Walkthrough 08");
  slideTitle(s, "Value the business. Band the path.", 0.6, 1.02, 5.95, 28);
  walkthroughList(s, [
    ["DCF calculator", "auto-populated EPS/FCF/dividend bases, two-stage growth, margin-of-safety gauge."],
    ["Alpha Score in context", "the same 4-pillar score appears here — valuation never floats free of quality."],
    ["SARIMAX forecaster", "a statistical trajectory with a 95% band. It frames uncertainty — it does not predict."],
  ], 0.6, 2.35, 5.9);
  practiceCard(s, "Demand a margin of safety before the story. If MoS is deeply negative, the burden of proof flips.", 0.6, 5.7, 5.9);
  shot(s, "dcf.png", 6.9, 1.55, 5.8);
  s.addNotes("Position SARIMAX carefully for this audience: it's a banding tool, not a prophecy machine. The honest framing builds more trust than any accuracy claim — that's the systematic-infrastructure brand.");
  pageNo(s, 12);
}

// ============ 13 · RISK DISCIPLINE ============
{
  const s = baseSlide();
  kicker(s, "SIZE", "Risk discipline");
  slideTitle(s, "Size first. Enter second.", 0.6, 1.02, 5.95, 28);
  walkthroughList(s, [
    ["The 1% rule", "risk per trade ≤ 1% of capital. The calculator turns entry + stop into an exact quantity."],
    ["Regime scaling", "elevated volatility automatically scales suggested size down. Respect it."],
    ["1.5R minimum", "engine targets are set at 1.5× risk — skip anything that can't pay that."],
    ["Discipline Arena", "journal every trade, tick the discipline quests. The XP is fake; the habit is real."],
  ], 0.6, 2.35, 5.9, { size: 13, gap: 8 });
  practiceCard(s, "Your edge is the process surviving 100 trades — sizing is what keeps you in the game that long.", 0.6, 5.7, 5.9);
  shot(s, "position_sizing.png", 6.9, 1.55, 5.8);
  s.addNotes("This is where most retail journeys fail. The platform computes quantity from risk, not from confidence. Tell the story: a 60% hit-rate system with bad sizing still blows up. Arena gamification exists because journaling is the least fun, highest-value habit.");
  pageNo(s, 13);
}

// ============ 14 · THE DAILY ROUTINE ============
{
  const s = baseSlide();
  kicker(s, "LOOP", "Best practice");
  slideTitle(s, "The systematic daily routine.", 0.6, 1.02, 11);

  const steps = [
    ["09:00", "REGIME", "Dashboard + Signals regime block. Risk-on or risk-off decides your sizing multiplier for the day."],
    ["09:10", "FOCUS", "Read the Focus List with its reasons. Curate to 3–5 names max. Set your conviction floor."],
    ["In-session", "EXECUTE", "Act only on alerted setups above your floor. Size from the calculator. Structures over directions on indices."],
    ["15:35", "FLOWS", "FII/DII + delivery prints after close — did institutions confirm your names?"],
    ["Evening", "JOURNAL", "Arena: log the trades, tick the quests. Review what the system said vs what you did."],
  ];
  const y0 = 2.15, rh = 0.85;
  steps.forEach((st, i) => {
    const y = y0 + i * rh;
    s.addShape(pres.shapes.OVAL, { x: 0.75, y: y + 0.06, w: 0.52, h: 0.52, fill: { color: GOLD }, line: { type: "none" } });
    s.addText(String(i + 1), { x: 0.75, y: y + 0.05, w: 0.52, h: 0.52, align: "center", valign: "middle",
      fontFace: F, fontSize: 18, bold: true, color: "0A0A0C", margin: 0 });
    if (i < steps.length - 1) s.addShape(pres.shapes.LINE, { x: 1.01, y: y + 0.62, w: 0, h: rh - 0.6,
      line: { color: "3A3A44", width: 1.5 } });
    s.addText(st[0].toUpperCase(), { x: 1.55, y: y + 0.02, w: 1.55, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: GOLD, charSpacing: 2, valign: "middle", margin: 0 });
    s.addText(st[1], { x: 1.55, y: y + 0.3, w: 1.55, h: 0.3, fontFace: F, fontSize: 14, bold: true, color: INK, valign: "middle", margin: 0 });
    s.addText(st[2], { x: 3.35, y: y - 0.02, w: 9.2, h: 0.72, fontFace: F, fontSize: 12.5, color: DIM, valign: "middle", margin: 0, lineSpacingMultiple: 1.1 });
  });
  s.addNotes("The single most actionable slide — encourage screenshots. Five touchpoints, maybe 40 minutes of total attention per day. The platform automates everything between the touchpoints, including the delivery data refresh and the signal alerts.");
  pageNo(s, 14);
}

// ============ 15 · CLOSE ============
{
  const s = baseSlide();
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: W / 2 - 0.55, y: 1.15, w: 1.1, h: 1.1, rectRadius: 0.27,
    fill: { color: GOLD }, line: { type: "none" }, shadow: shadow(),
  });
  s.addText("AN", { x: W / 2 - 0.55, y: 1.15, w: 1.1, h: 1.1, align: "center", valign: "middle",
    fontFace: F, fontSize: 32, bold: true, color: "0A0A0C", margin: 0 });
  s.addText("Trade the process.", { x: 0, y: 2.6, w: W, h: 0.95, align: "center",
    fontFace: F, fontSize: 44, bold: true, color: INK, margin: 0 });
  s.addText("Systematic infrastructure — auditable factors, risk-adjusted thinking, daily discipline.", {
    x: 0, y: 3.65, w: W, h: 0.45, align: "center", fontFace: F, fontSize: 16, color: DIM, margin: 0 });
  s.addText("5alphav2.vercel.app", { x: 0, y: 4.5, w: W, h: 0.5, align: "center",
    fontFace: F, fontSize: 20, bold: true, color: GOLD, margin: 0 });
  s.addText("Q & A", { x: 0, y: 5.25, w: W, h: 0.4, align: "center", fontFace: F, fontSize: 14, color: DIM, charSpacing: 6, margin: 0 });
  s.addText("Alpha Nova provides analytics for educational purposes only. Nothing on the platform or in this presentation is investment advice, a recommendation, or an offer to buy or sell securities. Data may be delayed or inaccurate. Backtested and illustrative figures do not guarantee future results. Consult a registered adviser before investing.", {
    x: 1.3, y: 6.35, w: 10.7, h: 0.8, align: "center", fontFace: F, fontSize: 9.5, color: FAINT, margin: 0, lineSpacingMultiple: 1.15 });
  s.addNotes("Close on the narrative, not on features. One sentence: 'Everything you saw is documented, risk-adjusted, and repeatable — that's the whole pitch.' Then open Q&A. Common questions: data sources (NSE + public feeds), AI usage (user-keyed Gemini, optional), pricing/access.");
  pageNo(s, 15);
}

pres.writeFile({ fileName: OUT }).then(() => console.log("WROTE " + OUT));

