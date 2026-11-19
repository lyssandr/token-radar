// Token Radar, model radar-4.
//
// One sealed snapshot in, one ranked board out. The board ranks every protocol
// that records no token and can be ranked at all: the whole watchlist (the
// floor, never a ceiling) plus every other rankable pre-token protocol below
// the floor. Nothing rankable is left out, so the radar has no blind spot in
// the snapshot it was given. Live-token protocols are never ranked here; they
// live in a separate view and are shown at the market's own market cap.
//
// A protocol records no token when its snapshot entry carries no market cap,
// no CoinGecko id and no symbol. Say "records no token", never "has no token":
// the snapshot is DefiLlama's record, not proof.
//
// What counts as rankable, radar-3: the watchlist's own test, applied to
// every row, not just to the watchlist. The field guide says a wrapped,
// staked or bridged product of a token that already trades is not a token
// that does not exist yet, and the watchlist leaves those out by category
// (Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC,
// CEX), by name (a whole word wrapped, staked or staking; a name beginning
// with an exchange's name) and by version marker (V2, v2, 2.0, ...).
// radar-2 applied that test only above the floor, through the watchlist
// itself, so 48 wrapped, staked or bridged products below the floor slipped
// onto the board (liquid staking tokens, bridges, wTAO, "Wrapped", ...).
// radar-3 applies the same test below the floor too, so the board holds
// only protocols that could plausibly launch a token of their own.
// One limit is honest: the watchlist also leaves out protocols whose
// DefiLlama record names a parent protocol, and this snapshot does not
// carry parentProtocol, so above the floor the watchlist itself stays
// authoritative and those protocols stay out.
//
// Implied value, radar-5, from the snapshot's own figures only. No protocol
// name is ever special-cased; the same function scores every row. radar-5
// keeps the radar-4 formula and adds exactly two things, both measured on
// the snapshot before they were kept:
//   (1) category momentum: a protocol's 7-day growth minus its own
//       category's median 7-day growth, clamped to -10..+10 points and
//       weighted 1-for-1. Absolute growth mixes category beta with
//       protocol alpha: a DEX up 5% in a flat category is outperforming
//       its market, while a protocol up 5% in a category whose median is
//       +20% is lagging it. The median is taken over every protocol in
//       the category with a reported change, live-token ones included, so
//       it is the category's own market, not the board's. 162 of 178 rows
//       get a non-1.00 factor (102 up and 55 down by 0.1% or more; 5 more
//       move by less than 0.1%); 22 beat their category median by more
//       than 10 points. It moves 131 of 178 ranks against radar-4 and
//       none of the top 5.
//   (2) chain spread cap raised from 9 to 15 extra chains. 13 board rows
//       sit on more than 10 chains (up to 45) and were all capped at +9%,
//       so the factor could not tell a 10-chain protocol from a 45-chain
//       one. +15% still cannot outrank TVL. It moves 15 rows, 1 by 5 or
//       more places; the top 10 are unchanged.
// radar-4 added category lead: a protocol that holds a large share of
// its own category's TVL is that category's flagship, and a flagship is
// the most likely launch candidate in its category. The factor is
// deliberately small (up to +5%, only when the category holds 3 or more
// protocols in the snapshot, so a one-protocol category cannot
// manufacture a lead) and it moves 14 of 178 ranks, none of the top 5.
// The formula is unchanged from radar-2 in every other way: the snapshot
// shows it already moves the ranking well away from a TVL table (138 of
// 226 radar-2 rows sat 5 or more places from their TVL-only rank), so
// there was nothing to fix there.
//
//   base         = tvl_usd x 0.25
//   growth       = clamp(change_7d, -60, 120) per cent (0 when unreported)
//   growthMult   = 1 + (growth / 100) x 0.5
//   age          = days from listed_at to as_of (365 when listed_at is null)
//   maturityMult = 0.6 + min(age, 1095) / 1095 x 0.4
//   chainMult    = 1 + min(max(chains - 1, 0), 15) x 0.01   (1.00 to 1.15)
//   share        = tvl_usd / total TVL of the protocol's category
//   dominanceMult = 1 + min(share, 0.5) x 0.1 when the category holds
//                  3+ protocols, else 1.00                 (1.00 to 1.05)
//   catMedian    = median change_7d of the protocol's category (all
//                  protocols with a reported change, live ones included)
//   momentumMult = 1 + clamp(change_7d - catMedian, -10, +10) / 100
//                  when change_7d is reported and the category holds
//                  3+ protocols with a reported change, else 1.00
//                                                      (0.90 to 1.10)
//   implied      = max(1, round(base x growthMult x maturityMult
//                               x chainMult x dominanceMult x momentumMult))
//
// The first three factors are the starter's base model, kept unchanged so the
// value stays comparable: size (TVL), momentum (7-day growth) and survival
// (age with no token). radar-2 adds exactly one factor, chain diversity:
// a protocol live on more chains has wider distribution and more places a
// launch can land, so it earns up to +9%. The factor is deliberately small
// (1% per extra chain, capped at 15 extra chains) so it can break near-ties
// and reward genuinely multi-chain protocols, but can never outrank TVL.
// Ties that remain are broken by TVL, then by slug, so the order is fully
// deterministic and reproducible from the snapshot alone.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_extra: number;
  dominance_weight: number;
  dominance_cap: number;
  dominance_min_category: number;
  momentum_weight: number;
  momentum_cap: number;
  momentum_min_category: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.01,
  chain_max_extra: 15,
  dominance_weight: 0.1,
  dominance_cap: 0.5,
  dominance_min_category: 3,
  momentum_weight: 1,
  momentum_cap: 0.1,
  momentum_min_category: 3,
};

/** radar-4's constants, for the honest vs-previous comparison in buildRadar:
 *  same formula, chain cap 9, no momentum factor. */
export const RADAR4_MODEL: ModelConstants = {
  ...MODEL,
  chain_max_extra: 9,
  momentum_weight: 0,
};

export const MODEL_VERSION = 'radar-5';

/** Live-token view: the largest live protocols by market cap. */
export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface ModelBreakdown {
  base_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  chain_count: number;
  age_days: number | null;
  dominance_multiplier: number;
  category_share: number;
  category_size: number;
  momentum_multiplier: number;
  category_median_change: number | null;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  model: ModelBreakdown;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  model_formula: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  protocols_total: number;
  /** Pre-token protocols left out by the snapshot-visible exclusion rule. */
  excluded_visible: number;
  /** Pre-token protocols left out only by the watchlist itself (the house sees parentProtocol; this snapshot does not). */
  excluded_house: number;
  /** Board rows whose rank sits 5+ places from their TVL-only rank: the model is not a TVL table. */
  rank_moved_5plus: number;
  /** Risk steps (farm step 5) that carry no figure from the protocol's own record: 0 in radar-4, every branch names its figures. */
  generic_risk_steps: number;
  /** Honest comparison against the radar-4 board, computed on every run
   *  from the same snapshot: rows whose rank differs, rows moved 5+ places,
   *  and whether the top 5 / top 10 keep their order. */
  vs_prev_moved: number;
  vs_prev_moved_5plus: number;
  vs_prev_top5_same: boolean;
  vs_prev_top10_same: boolean;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from listed_at to as_of, clamped at zero; null when unlisted. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Per-category totals from the snapshot, for the category-lead factor. */
export interface CategoryStats {
  total_tvl: number;
  count: number;
}

export function categoryStats(snapshot: Snapshot): Map<string, CategoryStats> {
  const stats = new Map<string, CategoryStats>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? '';
    const s = stats.get(key) ?? { total_tvl: 0, count: 0 };
    s.total_tvl += p.tvl_usd;
    s.count += 1;
    stats.set(key, s);
  }
  return stats;
}

/**
 * Per-category median 7-day change, for the category-momentum factor.
 * The median is taken over every protocol in the category with a reported
 * change_7d, live-token ones included: it is the category's own market
 * momentum, not the board's. The count is the number of protocols that
 * reported a change, since only those can anchor a median.
 */
export interface CategoryMedian {
  median_change: number;
  reported: number;
}

export function categoryMedians(snapshot: Snapshot): Map<string, CategoryMedian> {
  const byCat = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.change_7d === null) continue;
    const key = p.category ?? '';
    const arr = byCat.get(key) ?? [];
    arr.push(p.change_7d);
    byCat.set(key, arr);
  }
  const out = new Map<string, CategoryMedian>();
  for (const [key, arr] of byCat) {
    arr.sort((a, b) => a - b);
    out.set(key, { median_change: arr[Math.floor(arr.length / 2)]!, reported: arr.length });
  }
  return out;
}

/** radar-5 scoring of one protocol, with every factor exposed for the detail view. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
  cats: Map<string, CategoryStats> | null = null,
  medians: Map<string, CategoryMedian> | null = null,
): { implied: number; breakdown: ModelBreakdown } {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainCount = Array.isArray(p.chains) ? p.chains.length : 0;
  const chainMult = 1 + Math.min(Math.max(chainCount - 1, 0), model.chain_max_extra) * model.chain_step;
  // Category lead, radar-4: the protocol's share of its own category's TVL.
  // Only when the category holds 3+ protocols in the snapshot, so a
  // one-protocol category cannot manufacture a lead out of nothing.
  const stat = cats?.get(p.category ?? '');
  const categorySize = stat?.count ?? 0;
  const categoryShare = stat && stat.total_tvl > 0 ? p.tvl_usd / stat.total_tvl : 0;
  const dominanceMult =
    categorySize >= model.dominance_min_category
      ? 1 + Math.min(categoryShare, model.dominance_cap) * model.dominance_weight
      : 1;
  // Category momentum, radar-5: the protocol's 7-day growth minus its own
  // category's median 7-day growth. Only when the change is reported and
  // the category holds 3+ protocols with a reported change, so a thin
  // category cannot manufacture momentum out of one peer. The adjustment
  // is capped at -10..+10 points, so it rewards real outperformance
  // without letting one week rewrite the board.
  const med = medians?.get(p.category ?? '');
  const categoryMedianChange =
    p.change_7d !== null && med !== undefined && med.reported >= model.momentum_min_category
      ? round4(med.median_change)
      : null;
  const momentumMult =
    categoryMedianChange !== null
      ? 1 + Math.min(model.momentum_cap, Math.max(-model.momentum_cap, (p.change_7d! - categoryMedianChange) / 100)) * model.momentum_weight
      : 1;
  const base = p.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult * dominanceMult * momentumMult));
  return {
    implied,
    breakdown: {
      base_usd: Math.round(base),
      growth_pct: growthPct,
      growth_multiplier: round4(growthMult),
      maturity_multiplier: round4(maturityMult),
      chain_multiplier: round4(chainMult),
      chain_count: chainCount,
      age_days: age,
      dominance_multiplier: round4(dominanceMult),
      category_share: round4(categoryShare),
      category_size: categorySize,
      momentum_multiplier: round4(momentumMult),
      category_median_change: categoryMedianChange,
    },
  };
}

/** A name ending in a version marker (V2, v2, 2.0, ...) is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name carrying a whole word wrapped, staked or staking names a product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name is that exchange's product, not a protocol of its own. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Categories the field guide's watchlist rule leaves out: a wrapped, staked
 * or bridged product of a token that already trades, plus centralised
 * exchanges. Exactly the list the field guide states — no more: the
 * watchlist itself carries a Stablecoin Wrapper (Saturn), so that category
 * is not excluded.
 */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Why this protocol fails the watchlist's own test, or null when it passes it. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `category ${p.category}`;
  if (VERSIONED.test(p.name)) return 'versioned name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped/staked name';
  if (EXCHANGES.some((e) => p.name === e || p.name.startsWith(`${e} `))) return 'exchange product';
  return null;
}

/** Records no token: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Rankable: pre-token and passing the watchlist's own test. The test is the
 * same above and below the floor: a wrapped, staked or bridged product is
 * not a protocol still waiting on a launch of its own, at any TVL.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && exclusionReason(p) === null;
}

/** The board: every watchlist slug, then every other rankable pre-token protocol. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchSet = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Early radar: every rankable pre-token protocol below the floor, by TVL.
  // No cap is applied: this snapshot has 186 of them, and leaving any out
  // would hide a protocol the radar exists to find.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const cats = categoryStats(snapshot);
  const medians = categoryMedians(snapshot);
  const scored = [...chosen.values()].map((p) => {
    const { implied, breakdown } = impliedValue(p, snapshot.as_of, model, cats, medians);
    return { p, implied, breakdown };
  });
  // Rank by implied value; exact ties break by TVL, then slug: deterministic.
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: watchSet.has(s.p.slug),
    age_days: s.breakdown.age_days,
    implied_value_usd: s.implied,
    model: s.breakdown,
    farm_steps: farmSteps(s.p, s.breakdown.age_days, medians).map(stepText),
  }));
}

/** One step as a single string: action, then its cost and time. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function chainList(p: SnapshotProtocol): string {
  return p.chains.length > 1 ? `${p.chains[0]} and ${p.chains[1]}` : chainOf(p);
}

/** Farm capital tier, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** Hold window: younger protocols need a longer qualifying history. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's opening move: what to actually do with the capital. */
function openAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${n} on ${chain} as a lender, then borrow $20 of USDC against it so the position shows both sides.`;
  if (c.includes('dex') || c.includes('liquidity manager')) return `Add $${capital} of liquidity to ${n}'s largest pool on ${chain} in a tight range, and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} through ${n}, then use the bridged funds inside its app instead of bridging straight back.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${n} on ${chain} and keep the receipt token in the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${n}, open one small hedged perpetual position, and close it the same week.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('leveraged')) return `Deposit $${capital} of USDC into ${n}'s highest-TVL vault on ${chain} and let the yield compound in the vault.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${n} vault on ${chain} and keep the vault shares; curators reward depositors who stay through a full cycle.`;
  if (c.includes('stable') || c.includes('algo')) return `Mint or deposit $${capital} of the stable asset through ${n} on ${chain} and hold it in the wallet that minted it.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset on ${n} (${chain}) and hold it; RWA points usually track holding time, not trading.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} for a protocol you already use, and keep the policy active.`;
  if (c.includes('launchpad')) return `Stake $${capital} of the launchpad asset on ${n} to qualify for allocations, and join one sale when it opens.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${n} and place one small prediction-market position, then settle it instead of leaving it open.`;
  if (c.includes('payment') || c.includes('card')) return `Load $${capital} onto ${n} and spend at least $10 through it each week, so the account shows real usage.`;
  if (c.includes('synthetic') || c.includes('basis')) return `Open a $${capital} delta-neutral position on ${n} (${chain}) and hold it through one funding cycle.`;
  if (c.includes('index')) return `Buy $${capital} of the ${n} index token on ${chain} and hold it; index points track holders, not traders.`;
  if (c.includes('nft')) return `List or buy one item on ${n} for about $${capital} and keep the wallet active for a month.`;
  if (c.includes('governance')) return `Lock $${capital} of the governance asset on ${n} and vote on one live proposal.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${n}'s chain and use it in one native app there each week.`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open.`;
}

/** The category's weekly habit: the repeat action that keeps the wallet counted. */
function weeklyAction(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'repay $5 of the borrow and borrow it back, so the position shows fresh activity';
  if (c.includes('dex') || c.includes('liquidity manager')) return 'swap $10 through the pool and re-balance the range if it drifted out';
  if (c.includes('bridge')) return 'bridge $10 in one direction and use it on the destination chain';
  if (c.includes('restak') || c.includes('staking')) return 'restake the rewards that accrued, even if they are only a few dollars';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'open and close one small trade, keeping total volume under $50';
  if (c.includes('yield') || c.includes('farm') || c.includes('leveraged')) return 'claim the vault yield and redeposit it into the same vault';
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return 'check the vault allocation and move $10 between vaults only if the curator rebalanced';
  if (c.includes('stable') || c.includes('algo')) return 'mint $10 more of the stable asset and hold it in the same wallet';
  if (c.includes('rwa')) return 'check the asset yield and reinvest any distribution into the same position';
  if (c.includes('insurance')) return 'review the cover and extend it by one week if it is close to expiring';
  if (c.includes('launchpad')) return 'check for a new sale and complete the allocation task if one is live';
  if (c.includes('prediction')) return 'settle one position and open one new small position';
  if (c.includes('payment') || c.includes('card')) return 'spend $10 through the card on an ordinary purchase';
  if (c.includes('synthetic') || c.includes('basis')) return 'rebalance the hedge so the position stays delta-neutral';
  if (c.includes('index')) return 'check the index rebalance and add $10 if a new asset entered';
  if (c.includes('governance')) return 'vote on any proposal that opened since last week';
  return 'make one real transaction in the app, such as a deposit, a swap or a vote';
}

/** Short dollar figure for a risk step, e.g. $2.75B, $150.2M, $8,400. */
function moneyShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

/**
 * The risk check, radar-5: one step that only this protocol's own figures
 * can write. radar-4 reads every figure the snapshot carries, in priority
 * order, so each row gets the risk that actually applies to it: a sharp
 * fall, a steady fall, a surge, a long wait, a young protocol, a slow TVL
 * drift, a single-chain position, a thin TVL, missing momentum data, or a
 * wide chain spread. The last branch is the steady state, and it still
 * names the row's own figures (its 7-day change, its age, its chain
 * count), so no row ends on a generic step. radar-5 adds one more figure
 * to every momentum branch (sharp fall, fall, surge, drift, steady): the
 * protocol's own category's median 7-day change, so the step says whether
 * the move is the category's move or this protocol's own. A protocol
 * falling while its category rises is a different risk from a protocol
 * falling with its category.
 */
function riskStep(p: SnapshotProtocol, age: number | null, capital: number, catMedian: number | null): FarmStep {
  const change = p.change_7d;
  const chains = Array.isArray(p.chains) ? p.chains.length : 0;
  /** The category context clause, or '' when the category has no median. */
  const medianClause = (dir: 'fall' | 'rise'): string => {
    if (catMedian === null || change === null) return '';
    const m = `${catMedian >= 0 ? '+' : ''}${catMedian.toFixed(1)}%`;
    if (dir === 'fall') {
      const sharper = change <= catMedian - 10;
      return ` Its category's median moved ${m} in the same week, so this fall is ${sharper ? 'sharper than its category' : 'in line with its category'}.`;
    }
    const ahead = change >= catMedian + 10;
    return ` Its category's median moved ${m} in the same week, so this rise is ${ahead ? 'ahead of its category' : 'in line with its category'}.`;
  };
  if (change !== null && change <= -25) {
    return {
      text: `TVL fell sharply, ${Math.abs(change).toFixed(1)}% in the last 7 days: stop adding capital, keep only the $${capital} already in, and do not top it up until two snapshots in a row show the fall stopping.${medianClause('fall')}`,
      cost: 'no new capital; about $2 of gas to check',
      time: '10 minutes a week until the fall stops',
    };
  }
  if (change !== null && change <= -10) {
    return {
      text: `TVL fell ${Math.abs(change).toFixed(1)}% in the last 7 days, so do not add more capital yet: keep the $${capital} position, check the protocol's own announcements for the cause, and only top it up if the next snapshot shows the fall reversing.${medianClause('fall')}`,
      cost: 'no new capital; about $2 of gas to check',
      time: '10 minutes a week until the fall reverses',
    };
  }
  if (change !== null && change >= 20) {
    return {
      text: `TVL rose ${change.toFixed(1)}% in 7 days, so momentum is strong, but do not chase it with more than the planned $${capital}: a fast rise can reverse before the next snapshot, so keep the position as planned and re-check in a week.${medianClause('rise')}`,
      cost: `no new capital beyond the planned $${capital}`,
      time: '10 minutes a week',
    };
  }
  if (age !== null && age > 1095) {
    return {
      text: `Listed ${(age / 365).toFixed(1)} years ago with no token yet, so a launch may be slow or never come: farm only with capital you can leave untouched for months, and do not count on a quick payout.`,
      cost: `the $${capital} stays locked; nothing extra to pay`,
      time: 'no extra time, but no quick exit either',
    };
  }
  if (age !== null && age < 180) {
    return {
      text: `Listed only ${age} days ago with no token yet, so the record is short and the farm is unproven: keep to the planned $${capital}, expect a snapshot to miss a week, and do not judge the farm by its first month.`,
      cost: `the $${capital} stays locked; nothing extra to pay`,
      time: '10 minutes a week',
    };
  }
  if (change !== null && change < 0) {
    return {
      text: `TVL drifted down ${Math.abs(change).toFixed(1)}% in the last 7 days: not a crash, but a slow bleed, so hold the $${capital} position, add nothing, and check again next week; two more down weeks in a row means the protocol is cooling off.${medianClause('fall')}`,
      cost: 'no new capital; about $2 of gas to check',
      time: '10 minutes a week',
    };
  }
  if (chains === 1) {
    return {
      text: `Live on only one chain (${chainOf(p)}), so the whole position depends on that chain staying usable: keep the $${capital} modest, and if the chain has an outage, do not move the position until it is back.`,
      cost: `the $${capital} stays in one place; nothing extra to pay`,
      time: 'no extra time',
    };
  }
  if (p.tvl_usd < 10_000_000) {
    return {
      text: `TVL is only ${moneyShort(p.tvl_usd)}, so the pool is thin: one large withdrawal can move the price against you, so enter and exit in two parts and never put the whole $${capital} in at once.`,
      cost: 'about $2 of extra gas for the split entry',
      time: '15 minutes to split the entry',
    };
  }
  if (change === null) {
    return {
      text: `No 7-day change is recorded for this protocol, so momentum is unknown: farm the planned $${capital}, but treat the first two snapshots as the real test and be ready to stop if TVL turns down.`,
      cost: `the $${capital} stays locked; nothing extra to pay`,
      time: '10 minutes a week',
    };
  }
  if (chains >= 10) {
    return {
      text: `Live on ${chains} chains, so repeat the core action once on a second chain (${p.chains[1]}), keeping the same wallet for both, so the wallet is counted on more than one chain.`,
      cost: 'about $4 of gas for the second-chain action',
      time: '15 minutes, once',
    };
  }
  const ageText = age === null ? 'listed at an unknown date' : `listed ${age} days ago`;
  const changeText = change === null ? 'unreported' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
  return {
    text: `No warning in the snapshot: TVL moved ${changeText} in 7 days, ${ageText} with no token, and live on ${chains} chains. The risk is a quiet wind-down, so check the protocol's own announcements once a week; a slow protocol can stop without a visible TVL fall.${medianClause('rise')}`,
    cost: 'nothing to check',
    time: '5 minutes a week',
  };
}

/**
 * Seven concrete farm steps, derived from the protocol's own record (category,
 * chains, TVL, age, 7-day change). Never per-name: two protocols in one category with
 * the same figures get the same plan shape, differing only in name, chain and size.
 * radar-5: steps 1, 6 and 7 were identical across all 178 rows in radar-4
 * (step 6 and step 7 literally one text each), so a reader opening two
 * detail views saw the same words twice. They now name the protocol's own
 * chain, capital and hold window, so every step carries a figure from the
 * row it belongs to.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, medians: Map<string, CategoryMedian> | null = null): FarmStep[] {
  const chain = chainOf(p);
  const chains = chainList(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  const med = medians?.get(p.category ?? '');
  const catMedian =
    p.change_7d !== null && med !== undefined && med.reported >= MODEL.momentum_min_category
      ? round4(med.median_change)
      : null;
  return [
    {
      text: `Use a fresh wallet on ${chain} that holds only the $${capital} you plan to farm, and write its seed phrase on paper and store it offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: openAction(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Once a week, ${weeklyAction(p)} on ${chains}. Do this every week without a gap, because gaps break streak-based snapshots.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and do not withdraw early to chase another farm.`,
      cost: `the $${capital} stays locked in the position`,
      time: `${hold} days`,
    },
    riskStep(p, age, capital, catMedian),
    {
      text: `Before you withdraw the $${capital} from ${chain}, open the protocol's own points or rewards page and claim only from the link it publishes; never pay a fee to claim and never trust a link from a direct message.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the deposit date and every transaction hash in a farm log, then plan the exit: after the ${hold}-day hold, withdraw the $${capital} in two parts a week apart so a late snapshot still catches the position on ${chain}.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** Live-token protocols by market cap: the market's own values, never a model value. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    watchlist: row.watchlist,
    model: row.model,
    farm_steps: row.farm_steps,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const boardSlugs = new Set(board.map((r) => r.slug));
  // Honest comparison against the radar-4 board, from the same snapshot:
  // score the same rows with radar-4's constants and count rank moves.
  const prev = buildBoard(snapshot, RADAR4_MODEL);
  const prevRank = new Map(prev.map((r) => [r.slug, r.rank]));
  let vsPrevMoved = 0;
  let vsPrevMoved5plus = 0;
  for (const r of board) {
    const d = Math.abs(r.rank - (prevRank.get(r.slug) ?? r.rank));
    if (d > 0) vsPrevMoved++;
    if (d >= 5) vsPrevMoved5plus++;
  }
  const top5 = (rows: BoardRow[]): string => rows.slice(0, 5).map((r) => r.slug).join(',');
  const top10 = (rows: BoardRow[]): string => rows.slice(0, 10).map((r) => r.slug).join(',');
  const vsPrevTop5Same = top5(board) === top5(prev);
  const vsPrevTop10Same = top10(board) === top10(prev);
  // Coverage accounting, for the model tab: every pre-token protocol the
  // board leaves out, split by whether this snapshot can explain why.
  let excludedVisible = 0;
  let excludedHouse = 0;
  for (const p of snapshot.protocols) {
    if (!isPreToken(p) || boardSlugs.has(p.slug)) continue;
    if (exclusionReason(p) !== null) excludedVisible++;
    else excludedHouse++;
  }
  // How far the model moves the ranking from a TVL table: rows whose rank
  // sits 5 or more places from their TVL-only rank.
  const tvlOrder = [...board].sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const tvlRank = new Map(tvlOrder.map((r, i) => [r.slug, i + 1]));
  const rankMoved5plus = board.filter((r) => Math.abs(r.rank - (tvlRank.get(r.slug) ?? r.rank)) >= 5).length;
  // A risk step is generic when it carries no figure from the protocol's
  // own record (no number at all in the step). radar-4's ladder names a
  // figure in every branch, so this is 0; the self-checker asserts it.
  const genericRiskSteps = board.filter((r) => !/\d/.test(r.farm_steps[4] ?? '')).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    model_formula: 'implied = TVL x 0.25 x (1 + clamp(change_7d, -60, 120) / 100 x 0.5) x (0.6 + min(age, 1095) / 1095 x 0.4) x (1 + min(chains - 1, 15) x 0.01) x (1 + min(category share, 0.5) x 0.1, only when the category holds 3+ protocols) x (1 + clamp(change_7d - category median change, -10, +10) / 100, category momentum, only when change is reported and the category holds 3+ protocols with a reported change)',
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    protocols_total: snapshot.protocols.length,
    excluded_visible: excludedVisible,
    excluded_house: excludedHouse,
    rank_moved_5plus: rankMoved5plus,
    generic_risk_steps: genericRiskSteps,
    vs_prev_moved: vsPrevMoved,
    vs_prev_moved_5plus: vsPrevMoved5plus,
    vs_prev_top5_same: vsPrevTop5Same,
    vs_prev_top10_same: vsPrevTop10Same,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!r.name) return `${r.slug} has no name`;
  }
  return null;
}

/** data.js: the dashboard's whole dataset as one script, no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
