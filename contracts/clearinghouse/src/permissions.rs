use super::*;
#[near]
impl Clearinghouse {
    #[payable]
    pub fn set_pauses(&mut self, pauses: Pauses) {
        let before = self.ledgers();
        self.one_yocto();
        require!(
            env::predecessor_account_id() == self.guardian,
            "guardian only"
        );
        self.pauses = pauses;
        self.finish("PAUSE_CHANGED", before, 1);
    }
}
