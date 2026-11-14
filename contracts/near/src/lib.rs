//! ENTX on NEAR
//!
//! - Market registry: every ENTX movie/show asset and prediction market has an on-chain record.
//! - EPI oracle: Entertainment Popularity Index updates are published on-chain with the reporter account.
//!   Reports from allow-listed oracle accounts are `trusted` and move the canonical EPI; anyone else may
//!   file an untrusted report but must pay for the storage it uses.
//! - Trade receipts: simulated ENTX spot trades are notarised on-chain (caller pays storage), optionally
//!   cross-referencing the Solana devnet signature of the same trade (`chain_ref`).
//! - Prediction markets: real parimutuel YES/NO staking with attached NEAR, resolution by an oracle,
//!   and pro-rata claims.
//!
//! Storage safety: every user-writable record is paid for by the caller (deposit, excess refunded), and
//! history is indexed per market / per account so views never scan unbounded global lists.

use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

pub const MIN_STAKE: NearToken = NearToken::from_millinear(10); // 0.01 NEAR
const MAX_STR: usize = 96;
const MAX_REF: usize = 128;
const MAX_PAGE: u32 = 50;

uint::construct_uint! {
    pub struct U256(4);
}

fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    (U256::from(a) * U256::from(b) / U256::from(c)).as_u128()
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum MarketKind {
    Asset,
    Prediction,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum MarketStatus {
    Open,
    Resolved { outcome: bool },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Market {
    pub id: String,
    pub kind: MarketKind,
    pub title: String,
    pub ticker: String,
    /// EPI * 10 (e.g. 843 = 84.3)
    pub epi_x10: u32,
    pub status: MarketStatus,
    pub created_at_ms: u64,
    pub trades: u64,
    /// Notional of notarised trades, in micro-USD (simulated).
    pub volume_micro_usd: u64,
    pub oracle_updates: u32,
    /// Parimutuel pools (prediction markets only).
    pub yes_pool: NearToken,
    pub no_pool: NearToken,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct MarketInput {
    pub id: String,
    pub kind: MarketKind,
    pub title: String,
    pub ticker: String,
    pub epi_x10: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Receipt {
    pub id: u64,
    pub account: AccountId,
    pub market_id: String,
    /// BUY | SELL | YES | NO
    pub side: String,
    /// quantity * 1e6
    pub qty_micro: u64,
    /// price in micro-USD
    pub price_micro: u64,
    pub ts_ms: u64,
    /// Optional cross-chain reference, e.g. "solana:devnet:<signature>"
    pub chain_ref: Option<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct EpiReport {
    pub market_id: String,
    pub reporter: AccountId,
    pub trusted: bool,
    pub epi_x10: u32,
    pub note: String,
    pub ts_ms: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct Stake {
    pub yes: NearToken,
    pub no: NearToken,
    pub claimed: bool,
}

#[near(serializers = [json])]
pub struct Stats {
    pub owner: AccountId,
    pub markets: u32,
    pub receipts: u64,
    pub epi_reports: u64,
    pub total_staked: NearToken,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Entx {
    owner: AccountId,
    oracles: Vec<AccountId>,
    markets: IterableMap<String, Market>,
    /// Global append-only receipt log (O(1) push, paginated reads from the tail).
    receipts: Vector<Receipt>,
    /// Per-account receipt index: count + "{account}#{i}" -> receipt id.
    account_receipt_count: LookupMap<AccountId, u32>,
    account_receipts: LookupMap<String, u64>,
    /// Per-market EPI report index: count + "{market}#{i}" -> report.
    market_report_count: LookupMap<String, u32>,
    market_reports: LookupMap<String, EpiReport>,
    epi_report_total: u64,
    stakes: LookupMap<String, Stake>,
    total_staked: NearToken,
}

fn stake_key(market_id: &str, account: &AccountId) -> String {
    format!("{market_id}:{account}")
}

fn idx_key(scope: &str, i: u32) -> String {
    format!("{scope}#{i}")
}

fn emit(event: &str, data: String) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"entx","version":"1.0.0","event":"{event}","data":[{data}]}}"#
    ));
}

/// Strips JSON-breaking characters and truncates on a char boundary.
fn clean(s: String, max: usize) -> String {
    s.chars().filter(|c| *c != '"' && *c != '\\' && !c.is_control()).take(max).collect()
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

#[near]
impl Entx {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner: owner_id.clone(),
            oracles: vec![owner_id],
            markets: IterableMap::new(b"m"),
            receipts: Vector::new(b"r"),
            account_receipt_count: LookupMap::new(b"c"),
            account_receipts: LookupMap::new(b"a"),
            market_report_count: LookupMap::new(b"n"),
            market_reports: LookupMap::new(b"e"),
            epi_report_total: 0,
            stakes: LookupMap::new(b"s"),
            total_staked: NearToken::from_yoctonear(0),
        }
    }

    // ---------- internal ----------

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "Only owner");
    }

    fn is_oracle(&self, a: &AccountId) -> bool {
        self.oracles.contains(a)
    }

    /// Writes pending collection changes so `env::storage_usage()` reflects them.
    fn flush_all(&mut self) {
        self.markets.flush();
        self.receipts.flush();
        self.account_receipt_count.flush();
        self.account_receipts.flush();
        self.market_report_count.flush();
        self.market_reports.flush();
        self.stakes.flush();
    }

    /// Charges the caller for storage added since `before`; refunds any excess deposit.
    fn charge_storage(&mut self, before: u64) {
        self.flush_all();
        let used = env::storage_usage().saturating_sub(before) as u128;
        let cost = env::storage_byte_cost().saturating_mul(used);
        let attached = env::attached_deposit();
        require!(
            attached >= cost,
            format!("Attach at least {} yoctoNEAR to cover storage", cost.as_yoctonear())
        );
        let refund = attached.saturating_sub(cost);
        if !refund.is_zero() {
            Promise::new(env::predecessor_account_id()).transfer(refund).detach();
        }
    }

    // ---------- admin ----------

    pub fn add_oracle(&mut self, account_id: AccountId) {
        self.assert_owner();
        if !self.is_oracle(&account_id) {
            self.oracles.push(account_id);
        }
    }

    pub fn register_markets(&mut self, markets: Vec<MarketInput>) -> u32 {
        self.assert_owner();
        let mut n = 0;
        for m in markets {
            require!(valid_id(&m.id), "Market id must be [a-z0-9-], max 64 chars");
            if self.markets.contains_key(&m.id) {
                continue;
            }
            let market = Market {
                id: m.id,
                kind: m.kind,
                title: clean(m.title, MAX_STR),
                ticker: clean(m.ticker, 12),
                epi_x10: m.epi_x10.min(1000),
                status: MarketStatus::Open,
                created_at_ms: env::block_timestamp_ms(),
                trades: 0,
                volume_micro_usd: 0,
                oracle_updates: 0,
                yes_pool: NearToken::from_yoctonear(0),
                no_pool: NearToken::from_yoctonear(0),
            };
            emit(
                "market_registered",
                format!(r#"{{"id":"{}","ticker":"{}"}}"#, market.id, market.ticker),
            );
            self.markets.insert(market.id.clone(), market);
            n += 1;
        }
        n
    }

    // ---------- oracle ----------

    /// Publish an EPI update. Allow-listed oracles move the canonical EPI (contract pays their storage).
    /// Anyone else may file an untrusted report, but must attach a deposit covering its storage.
    #[payable]
    pub fn report_epi(&mut self, market_id: String, epi_x10: u32, note: String) -> bool {
        let before = env::storage_usage();
        let reporter = env::predecessor_account_id();
        let trusted = self.is_oracle(&reporter);
        let epi_x10 = epi_x10.min(1000);
        let market = self.markets.get_mut(&market_id).unwrap_or_else(|| env::panic_str("Unknown market"));
        if trusted {
            market.epi_x10 = epi_x10;
        }
        market.oracle_updates += 1;
        let note = clean(note, MAX_STR);
        emit(
            "epi_report",
            format!(
                r#"{{"market_id":"{market_id}","reporter":"{reporter}","trusted":{trusted},"epi_x10":{epi_x10},"note":"{note}"}}"#
            ),
        );
        let i = self.market_report_count.get(&market_id).copied().unwrap_or(0);
        self.market_reports.insert(
            idx_key(&market_id, i),
            EpiReport {
                market_id: market_id.clone(),
                reporter,
                trusted,
                epi_x10,
                note,
                ts_ms: env::block_timestamp_ms(),
            },
        );
        self.market_report_count.insert(market_id, i + 1);
        self.epi_report_total += 1;

        if !trusted {
            self.charge_storage(before);
        }
        trusted
    }

    // ---------- trade receipts ----------

    /// Notarise a trade. The caller pays for the storage it adds (attach 0.01 NEAR; excess is refunded).
    #[payable]
    pub fn record_trade(
        &mut self,
        market_id: String,
        side: String,
        qty_micro: u64,
        price_micro: u64,
        chain_ref: Option<String>,
    ) -> u64 {
        let before = env::storage_usage();
        require!(
            matches!(side.as_str(), "BUY" | "SELL" | "YES" | "NO"),
            "side must be BUY, SELL, YES or NO"
        );
        require!(qty_micro > 0, "qty must be positive");
        let account = env::predecessor_account_id();
        let market = self.markets.get_mut(&market_id).unwrap_or_else(|| env::panic_str("Unknown market"));
        market.trades += 1;
        let notional = (qty_micro as u128 * price_micro as u128 / 1_000_000).min(u64::MAX as u128) as u64;
        market.volume_micro_usd = market.volume_micro_usd.saturating_add(notional);

        let id = self.receipts.len() as u64;
        let chain_ref = chain_ref.map(|c| clean(c, MAX_REF));
        emit(
            "trade",
            format!(
                r#"{{"id":{id},"account":"{account}","market_id":"{market_id}","side":"{side}","qty_micro":{qty_micro},"price_micro":{price_micro}}}"#
            ),
        );
        self.receipts.push(Receipt {
            id,
            account: account.clone(),
            market_id,
            side,
            qty_micro,
            price_micro,
            ts_ms: env::block_timestamp_ms(),
            chain_ref,
        });
        let n = self.account_receipt_count.get(&account).copied().unwrap_or(0);
        self.account_receipts.insert(idx_key(account.as_str(), n), id);
        self.account_receipt_count.insert(account, n + 1);

        self.charge_storage(before);
        id
    }

    // ---------- prediction markets (parimutuel, real NEAR) ----------

    #[payable]
    pub fn stake(&mut self, market_id: String, outcome: bool) -> Stake {
        let amount = env::attached_deposit();
        require!(amount >= MIN_STAKE, "Minimum stake is 0.01 NEAR");
        let account = env::predecessor_account_id();
        let market = self.markets.get_mut(&market_id).unwrap_or_else(|| env::panic_str("Unknown market"));
        require!(market.kind == MarketKind::Prediction, "Not a prediction market");
        require!(market.status == MarketStatus::Open, "Market resolved");
        if outcome {
            market.yes_pool = market.yes_pool.saturating_add(amount);
        } else {
            market.no_pool = market.no_pool.saturating_add(amount);
        }
        let key = stake_key(&market_id, &account);
        let mut s = self.stakes.get(&key).cloned().unwrap_or_default();
        if outcome {
            s.yes = s.yes.saturating_add(amount);
        } else {
            s.no = s.no.saturating_add(amount);
        }
        self.stakes.insert(key, s.clone());
        self.total_staked = self.total_staked.saturating_add(amount);
        emit(
            "stake",
            format!(
                r#"{{"market_id":"{market_id}","account":"{account}","outcome":{outcome},"amount":"{}"}}"#,
                amount.as_yoctonear()
            ),
        );
        s
    }

    pub fn resolve(&mut self, market_id: String, outcome: bool) {
        let caller = env::predecessor_account_id();
        require!(self.is_oracle(&caller), "Only owner or oracle");
        let market = self.markets.get_mut(&market_id).unwrap_or_else(|| env::panic_str("Unknown market"));
        require!(market.kind == MarketKind::Prediction, "Not a prediction market");
        require!(market.status == MarketStatus::Open, "Already resolved");
        market.status = MarketStatus::Resolved { outcome };
        emit(
            "resolve",
            format!(r#"{{"market_id":"{market_id}","outcome":{outcome},"by":"{caller}"}}"#),
        );
    }

    /// Payout = stake_on_winning_side * total_pool / winning_pool.
    /// If nobody backed the winning side, stakers are refunded.
    pub fn claim(&mut self, market_id: String) -> Promise {
        let account = env::predecessor_account_id();
        let market = self.markets.get(&market_id).unwrap_or_else(|| env::panic_str("Unknown market"));
        let outcome = match market.status {
            MarketStatus::Resolved { outcome } => outcome,
            MarketStatus::Open => env::panic_str("Market not resolved"),
        };
        let key = stake_key(&market_id, &account);
        let mut s = self.stakes.get(&key).cloned().unwrap_or_else(|| env::panic_str("No stake"));
        require!(!s.claimed, "Already claimed");

        let (yes, no) = (market.yes_pool.as_yoctonear(), market.no_pool.as_yoctonear());
        let total = yes + no;
        let win_pool = if outcome { yes } else { no };
        let mine = if outcome { s.yes.as_yoctonear() } else { s.no.as_yoctonear() };
        let payout = if win_pool == 0 {
            s.yes.as_yoctonear() + s.no.as_yoctonear()
        } else {
            mul_div(mine, total, win_pool)
        };
        require!(payout > 0, "Nothing to claim");

        s.claimed = true;
        self.stakes.insert(key, s);
        self.total_staked = self.total_staked.saturating_sub(NearToken::from_yoctonear(payout));
        emit(
            "claim",
            format!(r#"{{"market_id":"{market_id}","account":"{account}","amount":"{payout}"}}"#),
        );
        Promise::new(account).transfer(NearToken::from_yoctonear(payout))
    }

    // ---------- views (all bounded) ----------

    pub fn get_stats(&self) -> Stats {
        Stats {
            owner: self.owner.clone(),
            markets: self.markets.len(),
            receipts: self.receipts.len() as u64,
            epi_reports: self.epi_report_total,
            total_staked: self.total_staked,
        }
    }

    pub fn get_oracles(&self) -> Vec<AccountId> {
        self.oracles.clone()
    }

    pub fn get_market(&self, market_id: String) -> Option<Market> {
        self.markets.get(&market_id).cloned()
    }

    pub fn get_markets(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Market> {
        self.markets
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(MAX_PAGE).min(100) as usize)
            .cloned()
            .collect()
    }

    /// Newest-first receipts for one account. `before` is an exclusive per-account index for paging.
    pub fn get_receipts_for(&self, account_id: AccountId, limit: Option<u32>, before: Option<u32>) -> Vec<Receipt> {
        let n = self.account_receipt_count.get(&account_id).copied().unwrap_or(0);
        let end = before.unwrap_or(n).min(n);
        let take = limit.unwrap_or(25).min(MAX_PAGE).min(end);
        (end - take..end)
            .rev()
            .filter_map(|i| self.account_receipts.get(&idx_key(account_id.as_str(), i)))
            .filter_map(|id| self.receipts.get(*id as u32).cloned())
            .collect()
    }

    pub fn get_recent_receipts(&self, limit: Option<u32>) -> Vec<Receipt> {
        let n = self.receipts.len();
        let take = limit.unwrap_or(25).min(MAX_PAGE).min(n);
        (n - take..n).rev().filter_map(|i| self.receipts.get(i).cloned()).collect()
    }

    /// Newest-first EPI reports for one market. `before` is an exclusive per-market index for paging.
    pub fn get_epi_reports(&self, market_id: String, limit: Option<u32>, before: Option<u32>) -> Vec<EpiReport> {
        let n = self.market_report_count.get(&market_id).copied().unwrap_or(0);
        let end = before.unwrap_or(n).min(n);
        let take = limit.unwrap_or(20).min(MAX_PAGE).min(end);
        (end - take..end)
            .rev()
            .filter_map(|i| self.market_reports.get(&idx_key(&market_id, i)).cloned())
            .collect()
    }

    pub fn get_stake(&self, market_id: String, account_id: AccountId) -> Option<Stake> {
        self.stakes.get(&stake_key(&market_id, &account_id)).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, get_created_receipts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(who: usize, deposit: NearToken) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(accounts(who)).attached_deposit(deposit);
        testing_env!(b.build());
    }

    const RECEIPT_DEPOSIT: NearToken = NearToken::from_millinear(10);

    fn setup() -> Entx {
        ctx(0, NearToken::from_yoctonear(0));
        let mut c = Entx::new(accounts(0));
        c.register_markets(vec![
            MarketInput {
                id: "dune-drift".into(),
                kind: MarketKind::Asset,
                title: "Dune Drift: Part Three".into(),
                ticker: "DRIFT".into(),
                epi_x10: 843,
            },
            MarketInput {
                id: "drift-opening-250".into(),
                kind: MarketKind::Prediction,
                title: "Will Dune Drift open above $250M?".into(),
                ticker: "DRIFT".into(),
                epi_x10: 0,
            },
        ]);
        c
    }

    #[test]
    fn registers_and_records_trades() {
        let mut c = setup();
        ctx(1, RECEIPT_DEPOSIT);
        let id = c.record_trade(
            "dune-drift".into(),
            "BUY".into(),
            10_000_000,
            12_400_000,
            Some("solana:devnet:abc".into()),
        );
        assert_eq!(id, 0);
        ctx(1, RECEIPT_DEPOSIT);
        c.record_trade("dune-drift".into(), "SELL".into(), 5_000_000, 13_000_000, None);
        let m = c.get_market("dune-drift".into()).unwrap();
        assert_eq!(m.trades, 2);
        let mine = c.get_receipts_for(accounts(1), None, None);
        assert_eq!(mine.len(), 2);
        assert_eq!(mine[0].side, "SELL"); // newest first
        assert_eq!(c.get_receipts_for(accounts(1), Some(1), Some(1))[0].side, "BUY"); // paging
        assert_eq!(c.get_recent_receipts(None)[1].chain_ref.as_deref(), Some("solana:devnet:abc"));
    }

    #[test]
    fn record_trade_refunds_excess_deposit() {
        let mut c = setup();
        ctx(1, RECEIPT_DEPOSIT);
        c.record_trade("dune-drift".into(), "BUY".into(), 1, 1, None);
        // one refund transfer back to the caller
        assert_eq!(get_created_receipts().len(), 1);
    }

    #[test]
    #[should_panic(expected = "to cover storage")]
    fn record_trade_requires_storage_deposit() {
        let mut c = setup();
        ctx(1, NearToken::from_yoctonear(0));
        c.record_trade("dune-drift".into(), "BUY".into(), 1, 1, None);
    }

    #[test]
    #[should_panic(expected = "to cover storage")]
    fn untrusted_report_requires_storage_deposit() {
        let mut c = setup();
        ctx(2, NearToken::from_yoctonear(0));
        c.report_epi("dune-drift".into(), 906, "rumour".into());
    }

    #[test]
    fn only_trusted_oracle_moves_epi() {
        let mut c = setup();
        ctx(2, RECEIPT_DEPOSIT);
        assert!(!c.report_epi("dune-drift".into(), 906, "rumour".into()));
        assert_eq!(c.get_market("dune-drift".into()).unwrap().epi_x10, 843);
        ctx(0, NearToken::from_yoctonear(0)); // trusted oracle: contract pays storage
        assert!(c.report_epi("dune-drift".into(), 906, "box office beat".into()));
        assert_eq!(c.get_market("dune-drift".into()).unwrap().epi_x10, 906);
        let reports = c.get_epi_reports("dune-drift".into(), None, None);
        assert_eq!(reports.len(), 2);
        assert!(reports[0].trusted); // newest first
        assert_eq!(c.get_epi_reports("drift-opening-250".into(), None, None).len(), 0);
        assert_eq!(c.get_stats().epi_reports, 2);
    }

    #[test]
    fn notes_truncate_on_char_boundary() {
        let mut c = setup();
        ctx(0, NearToken::from_yoctonear(0));
        c.report_epi("dune-drift".into(), 900, "🎬".repeat(200));
        let r = &c.get_epi_reports("dune-drift".into(), None, None)[0];
        assert_eq!(r.note.chars().count(), MAX_STR);
    }

    #[test]
    fn parimutuel_settlement() {
        let mut c = setup();
        ctx(1, NearToken::from_near(3));
        c.stake("drift-opening-250".into(), true);
        ctx(2, NearToken::from_near(1));
        c.stake("drift-opening-250".into(), false);
        ctx(0, NearToken::from_yoctonear(0));
        c.resolve("drift-opening-250".into(), true);
        ctx(1, NearToken::from_yoctonear(0));
        let _ = c.claim("drift-opening-250".into());
        let s = c.get_stake("drift-opening-250".into(), accounts(1)).unwrap();
        assert!(s.claimed);
        // winner takes the whole 4 NEAR pool
        assert_eq!(c.get_stats().total_staked, NearToken::from_near(0));
    }

    #[test]
    #[should_panic(expected = "Only owner or oracle")]
    fn resolve_is_permissioned() {
        let mut c = setup();
        ctx(3, NearToken::from_yoctonear(0));
        c.resolve("drift-opening-250".into(), true);
    }

    #[test]
    #[should_panic(expected = "Not a prediction market")]
    fn cannot_stake_on_asset() {
        let mut c = setup();
        ctx(1, NearToken::from_near(1));
        c.stake("dune-drift".into(), true);
    }

    #[test]
    #[should_panic(expected = "Market id must be")]
    fn rejects_bad_market_ids() {
        let mut c = setup();
        ctx(0, NearToken::from_yoctonear(0));
        c.register_markets(vec![MarketInput {
            id: "bad#id".into(),
            kind: MarketKind::Asset,
            title: "x".into(),
            ticker: "X".into(),
            epi_x10: 0,
        }]);
    }
}
