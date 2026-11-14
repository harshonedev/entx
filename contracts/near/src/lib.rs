//! ENTX on NEAR
//!
//! - Market registry: every ENTX movie/show asset and prediction market has an on-chain record.
//! - EPI oracle: Entertainment Popularity Index updates are published on-chain with the reporter account.
//!   Reports from allow-listed oracle accounts are marked `trusted`.
//! - Trade receipts: simulated ENTX spot trades are notarised on-chain, optionally cross-referencing the
//!   Solana devnet signature of the same trade (`chain_ref`).
//! - Prediction markets: real parimutuel YES/NO staking with attached NEAR, resolution by the owner or an
//!   oracle, and pro-rata claims. Funds are held by the contract only until a market resolves.

use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

pub const MIN_STAKE: NearToken = NearToken::from_millinear(10); // 0.01 NEAR
const MAX_STR: usize = 96;

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
    /// Parimutuel pools in yoctoNEAR (prediction markets only), as strings for JSON safety.
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
    receipts: Vector<Receipt>,
    receipts_by_account: LookupMap<AccountId, Vec<u64>>,
    epi_reports: Vector<EpiReport>,
    stakes: LookupMap<String, Stake>,
    total_staked: NearToken,
}

fn stake_key(market_id: &str, account: &AccountId) -> String {
    format!("{market_id}:{account}")
}

fn emit(event: &str, data: String) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"entx","version":"1.0.0","event":"{event}","data":[{data}]}}"#
    ));
}

fn clean(s: String) -> String {
    let mut s: String = s.chars().filter(|c| *c != '"' && *c != '\\').collect();
    s.truncate(MAX_STR);
    s
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
            receipts_by_account: LookupMap::new(b"a"),
            epi_reports: Vector::new(b"e"),
            stakes: LookupMap::new(b"s"),
            total_staked: NearToken::from_yoctonear(0),
        }
    }

    // ---------- admin ----------

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "Only owner");
    }

    fn is_oracle(&self, a: &AccountId) -> bool {
        self.oracles.contains(a)
    }

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
            if self.markets.contains_key(&m.id) {
                continue;
            }
            let market = Market {
                id: clean(m.id),
                kind: m.kind,
                title: clean(m.title),
                ticker: clean(m.ticker),
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

    /// Publish an EPI update. Anyone may report (demo), but only allow-listed oracles move the
    /// market's canonical EPI; other reports are stored as untrusted signals.
    pub fn report_epi(&mut self, market_id: String, epi_x10: u32, note: String) -> bool {
        let reporter = env::predecessor_account_id();
        let trusted = self.is_oracle(&reporter);
        let epi_x10 = epi_x10.min(1000);
        let market = self.markets.get_mut(&market_id).unwrap_or_else(|| env::panic_str("Unknown market"));
        if trusted {
            market.epi_x10 = epi_x10;
        }
        market.oracle_updates += 1;
        let note = clean(note);
        emit(
            "epi_report",
            format!(
                r#"{{"market_id":"{market_id}","reporter":"{reporter}","trusted":{trusted},"epi_x10":{epi_x10},"note":"{note}"}}"#
            ),
        );
        self.epi_reports.push(EpiReport {
            market_id,
            reporter,
            trusted,
            epi_x10,
            note,
            ts_ms: env::block_timestamp_ms(),
        });
        trusted
    }

    // ---------- trade receipts ----------

    pub fn record_trade(
        &mut self,
        market_id: String,
        side: String,
        qty_micro: u64,
        price_micro: u64,
        chain_ref: Option<String>,
    ) -> u64 {
        require!(
            matches!(side.as_str(), "BUY" | "SELL" | "YES" | "NO"),
            "side must be BUY, SELL, YES or NO"
        );
        require!(qty_micro > 0, "qty must be positive");
        let account = env::predecessor_account_id();
        let market = self.markets.get_mut(&market_id).unwrap_or_else(|| env::panic_str("Unknown market"));
        market.trades += 1;
        let notional = (qty_micro as u128 * price_micro as u128 / 1_000_000) as u64;
        market.volume_micro_usd = market.volume_micro_usd.saturating_add(notional);

        let id = self.receipts.len() as u64;
        let chain_ref = chain_ref.map(|c| {
            let mut c = clean(c);
            c.truncate(128);
            c
        });
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
        let mut ids = self.receipts_by_account.get(&account).cloned().unwrap_or_default();
        ids.push(id);
        self.receipts_by_account.insert(account, ids);
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

    // ---------- views ----------

    pub fn get_stats(&self) -> Stats {
        Stats {
            owner: self.owner.clone(),
            markets: self.markets.len(),
            receipts: self.receipts.len() as u64,
            epi_reports: self.epi_reports.len() as u64,
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
            .take(limit.unwrap_or(50).min(100) as usize)
            .cloned()
            .collect()
    }

    pub fn get_receipts_for(&self, account_id: AccountId, limit: Option<u32>) -> Vec<Receipt> {
        let ids = self.receipts_by_account.get(&account_id).cloned().unwrap_or_default();
        ids.iter()
            .rev()
            .take(limit.unwrap_or(25).min(100) as usize)
            .filter_map(|i| self.receipts.get(*i as u32).cloned())
            .collect()
    }

    pub fn get_recent_receipts(&self, limit: Option<u32>) -> Vec<Receipt> {
        let n = self.receipts.len();
        let take = limit.unwrap_or(25).min(100).min(n);
        (n - take..n).rev().filter_map(|i| self.receipts.get(i).cloned()).collect()
    }

    pub fn get_epi_reports(&self, market_id: String, limit: Option<u32>) -> Vec<EpiReport> {
        let n = self.epi_reports.len();
        let limit = limit.unwrap_or(20).min(100) as usize;
        let mut out = Vec::new();
        let mut i = n;
        while i > 0 && out.len() < limit {
            i -= 1;
            if let Some(r) = self.epi_reports.get(i) {
                if r.market_id == market_id {
                    out.push(r.clone());
                }
            }
        }
        out
    }

    pub fn get_stake(&self, market_id: String, account_id: AccountId) -> Option<Stake> {
        self.stakes.get(&stake_key(&market_id, &account_id)).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(who: usize, deposit: NearToken) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(accounts(who)).attached_deposit(deposit);
        testing_env!(b.build());
    }

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
        ctx(1, NearToken::from_yoctonear(0));
        let id = c.record_trade(
            "dune-drift".into(),
            "BUY".into(),
            10_000_000,
            12_400_000,
            Some("solana:devnet:abc".into()),
        );
        assert_eq!(id, 0);
        let m = c.get_market("dune-drift".into()).unwrap();
        assert_eq!(m.trades, 1);
        assert_eq!(m.volume_micro_usd, 124_000_000);
        assert_eq!(c.get_receipts_for(accounts(1), None).len(), 1);
        assert_eq!(c.get_recent_receipts(None)[0].chain_ref.as_deref(), Some("solana:devnet:abc"));
    }

    #[test]
    fn only_trusted_oracle_moves_epi() {
        let mut c = setup();
        ctx(2, NearToken::from_yoctonear(0));
        assert!(!c.report_epi("dune-drift".into(), 906, "rumour".into()));
        assert_eq!(c.get_market("dune-drift".into()).unwrap().epi_x10, 843);
        ctx(0, NearToken::from_yoctonear(0));
        assert!(c.report_epi("dune-drift".into(), 906, "box office beat".into()));
        assert_eq!(c.get_market("dune-drift".into()).unwrap().epi_x10, 906);
        assert_eq!(c.get_epi_reports("dune-drift".into(), None).len(), 2);
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
        c.claim("drift-opening-250".into());
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
}
