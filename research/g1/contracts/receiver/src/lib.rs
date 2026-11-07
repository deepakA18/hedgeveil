//! Adversarial receiver used only by local tests.
use near_sdk::{
    env,
    json_types::U128,
    near, require,
    serde_json::{json, Value},
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Receiver {
    token: AccountId,
    sink: AccountId,
}
#[near]
impl Receiver {
    #[init]
    pub fn new(token: AccountId, sink: AccountId) -> Self {
        Self { token, sink }
    }
    pub fn ft_on_transfer(
        &self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<Value> {
        let _ = sender_id;
        self.receive(None, amount, msg)
    }
    pub fn mt_on_transfer(
        &self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) -> PromiseOrValue<Value> {
        require!(
            previous_owner_ids == vec![sender_id] && token_ids.len() == 1 && amounts.len() == 1,
            "bad fixture input"
        );
        self.receive(Some(token_ids[0].clone()), amounts[0], msg)
    }
    pub fn report(&self) -> String {
        "invalid oracle report fixture".into()
    }
    #[private]
    pub fn return_unused(&self, value: Value) -> Value {
        value
    }
}
impl Receiver {
    fn receive(
        &self,
        token_id: Option<String>,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<Value> {
        require!(env::predecessor_account_id() == self.token, "token only");
        let wrap = |v: U128| {
            if token_id.is_some() {
                json!([v])
            } else {
                json!(v)
            }
        };
        match msg.as_str() {
            "panic" => env::panic_str("receiver failure"),
            "malformed" => PromiseOrValue::Value(json!({"invalid":"return"})),
            "accept" => PromiseOrValue::Value(wrap(U128(0))),
            "partial" => PromiseOrValue::Value(wrap(U128(amount.0 / 2))),
            "over" => PromiseOrValue::Value(wrap(U128(u128::MAX))),
            "burn" | "spend" => {
                let spent = U128(amount.0 * 2 / 5);
                let (method, args) = match (&token_id, msg.as_str()) {
                    (Some(id), "burn") => {
                        ("fixture_burn_mt", json!({"token_id":id,"amount":spent}))
                    }
                    (None, "burn") => ("fixture_burn_ft", json!({"amount":spent})),
                    (Some(id), _) => (
                        "mt_transfer",
                        json!({"receiver_id":self.sink,"token_id":id,"amount":spent}),
                    ),
                    (None, _) => (
                        "ft_transfer",
                        json!({"receiver_id":self.sink,"amount":spent}),
                    ),
                };
                PromiseOrValue::Promise(
                    Promise::new(self.token.clone())
                        .function_call(
                            method,
                            args.to_string().into_bytes(),
                            NearToken::from_yoctonear(1),
                            Gas::from_tgas(15),
                        )
                        .then(Promise::new(env::current_account_id()).function_call(
                            "return_unused",
                            json!({"value":wrap(amount)}).to_string().into_bytes(),
                            NearToken::from_yoctonear(0),
                            Gas::from_tgas(5),
                        )),
                )
            }
            _ => env::panic_str("unknown mode"),
        }
    }
}
