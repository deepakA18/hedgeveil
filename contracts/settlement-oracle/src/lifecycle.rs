use super::*;
#[near]
impl SettlementOracle {
    #[payable]
    pub fn propose(
        &mut self,
        series_id: String,
        route: Route,
        price: Amount,
        evidence_hash: String,
    ) {
        let mut c = self.case(&series_id);
        c.live();
        let now = env::block_timestamp();
        let (primary, fallback, arbitration) = c.deadlines();
        require!(
            now >= c.config.maturity_ns.0 && now < fallback && c.proposal.is_none(),
            "proposal window or duplicate"
        );
        require!(
            route
                == if now < primary {
                    Route::Primary
                } else {
                    Route::Fallback
                },
            "wrong evidence stage"
        );
        let observation = c.observation(route).expect("incomplete committed sources");
        require!(
            evidence_hash == observation.evidence_hash,
            "proposal evidence root"
        );
        require!(
            price.0 >= c.observation.min_price.0 && price.0 <= c.observation.max_price.0,
            "proposal bounds"
        );
        let owner = env::predecessor_account_id();
        require!(self.accounts.contains_key(&owner), "register bond account");
        require!(
            env::attached_deposit().as_yoctonear() == c.policy.proposal_bond.0,
            "exact proposal bond"
        );
        let end = now
            .checked_add(c.policy.challenge_ns.0)
            .expect("deadline overflow");
        require!(end <= arbitration, "challenge beyond arbitration");
        self.received = self
            .received
            .checked_add(c.policy.proposal_bond.0)
            .expect("bond overflow");
        c.proposal = Some(Proposal {
            claim: Claim {
                owner,
                price,
                evidence_hash,
                bond: c.policy.proposal_bond,
            },
            route,
            challenge_end: Num64(end),
        });
        c.state = "PROPOSED".into();
        self.cases.insert(series_id.clone(), c);
        self.finish("PROPOSED", Some(series_id));
    }
    #[payable]
    pub fn challenge(&mut self, series_id: String, price: Amount, evidence_hash: String) {
        let mut c = self.case(&series_id);
        c.live();
        let p = c.proposal.as_ref().expect("proposal required");
        require!(
            env::block_timestamp() < p.challenge_end.0 && c.challenge.is_none(),
            "challenge closed or duplicate"
        );
        require!(
            valid_hash(&evidence_hash)
                && price.0 >= c.observation.min_price.0
                && price.0 <= c.observation.max_price.0,
            "challenge evidence/bounds"
        );
        require!(
            price != p.claim.price || evidence_hash != p.claim.evidence_hash,
            "no conflict"
        );
        let owner = env::predecessor_account_id();
        require!(
            owner != p.claim.owner && self.accounts.contains_key(&owner),
            "registered other challenger"
        );
        require!(
            env::attached_deposit().as_yoctonear() == c.policy.challenge_bond.0,
            "exact challenge bond"
        );
        self.received = self
            .received
            .checked_add(c.policy.challenge_bond.0)
            .expect("bond overflow");
        c.challenge = Some(Claim {
            owner,
            price,
            evidence_hash,
            bond: c.policy.challenge_bond,
        });
        c.state = "DISPUTED".into();
        self.cases.insert(series_id.clone(), c);
        self.finish("DISPUTED", Some(series_id));
    }
    pub fn finalize(&mut self, series_id: String) -> bool {
        let c = self.case(&series_id);
        if c.state == "FINALIZED" {
            return true;
        }
        c.live();
        require!(c.challenge.is_none(), "dispute requires arbitration");
        let p = c.proposal.as_ref().expect("proposal required");
        require!(
            env::block_timestamp() >= p.challenge_end.0,
            "challenge period active"
        );
        let result = c
            .valid_proposal()
            .expect("proposal disagrees with committed evidence");
        self.complete(series_id, c, result);
        true
    }
    #[payable]
    pub fn adjudicate(&mut self, series_id: String, route: Route) {
        self.one();
        let c = self.case(&series_id);
        c.live();
        require!(
            env::predecessor_account_id() == c.policy.arbitrator,
            "precommitted arbitrator only"
        );
        let now = env::block_timestamp();
        let (_, fallback, arbitration) = c.deadlines();
        require!(
            now >= c.config.maturity_ns.0 && now < arbitration,
            "arbitration deadline"
        );
        require!(
            c.challenge.is_some() || (now >= fallback && c.valid_proposal().is_none()),
            "not arbitrable"
        );
        let result = c
            .observation(route)
            .expect("no committed historical evidence");
        self.complete(series_id, c, result);
    }
    pub fn mark_delayed(&mut self, series_id: String) {
        let mut c = self.case(&series_id);
        if c.state == "RESOLUTION_DELAYED" {
            return;
        }
        c.live();
        require!(
            env::block_timestamp() >= c.deadlines().2,
            "arbitration still open"
        );
        require!(
            c.challenge.is_some() || c.valid_proposal().is_none(),
            "valid proposal can finalize"
        );
        if let Some(p) = &c.proposal {
            self.credit(&p.claim.owner, p.claim.bond.0);
        }
        if let Some(p) = &c.challenge {
            self.credit(&p.owner, p.bond.0);
        }
        c.bonds_released = true;
        c.state = "RESOLUTION_DELAYED".into();
        self.cases.insert(series_id.clone(), c);
        self.finish("RESOLUTION_DELAYED", Some(series_id));
    }
}
impl SettlementOracle {
    fn complete(&mut self, id: String, mut c: Case, result: Observation) {
        let winner = c
            .proposal
            .as_ref()
            .map(|p| &p.claim)
            .into_iter()
            .chain(c.challenge.as_ref())
            .find(|p| p.price == result.price && p.evidence_hash == result.evidence_hash)
            .map(|p| p.owner.clone())
            .unwrap_or(self.treasury.clone());
        self.credit(&winner, c.locked());
        c.bonds_released = true;
        c.state = "FINALIZED".into();
        c.price = Some(result.price);
        c.final_evidence_hash = Some(result.evidence_hash);
        self.cases.insert(id.clone(), c);
        self.finish("FINALIZED", Some(id));
    }
}
