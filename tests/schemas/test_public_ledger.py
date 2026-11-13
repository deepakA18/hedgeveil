import copy
import sys
import unittest
from pathlib import Path
from jsonschema import Draft202012Validator, ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'packages/shared-schemas'))
from validate import SCHEMA, loads_strict, validate
from build_schema import build


def domain():
    return dict(protocol_version='1', network='testnet', contract_id='core.testnet')


def leg(kind='COLLATERAL', series='s1', amount='100'):
    asset = dict(kind=kind)
    if kind in ('P', 'N'):
        asset['series_id'] = series
    if kind == 'VAULT_SHARE':
        asset['vault_id'] = 'v1'
    return dict(asset=asset, amount=amount)


def quote():
    return dict(kind='quote', schema_version='0.2.0', domain=domain(), maker='maker.testnet',
                taker=None, maker_gives=[leg('P')], taker_gives=[leg()],
                fee=dict(asset='NATIVE_NEAR', amount='0', receiver='fees.testnet'),
                fill_rule='ALL_OR_NOTHING', rounding='EXACT_AMOUNTS', nonce='1',
                cancellation_epoch='0', expiry_ns='1000', signing_key_id='key1',
                signature_scheme='ed25519', signature='11'*64)


def terms():
    return dict(series_id='s1', version='1', collateral_kind='NATIVE_NEAR',
                index_definition_hash='11'*32, payoff_kind='CAPPED_USD_COMPLEMENT',
                strike='2000000000000', price_scale='1000000000000', maturity_ns='200',
                mint_cutoff_ns='150', observation_window=dict(start_ns='100', end_ns='200'),
                oracle_account_id='oracle.testnet', oracle_version='demo-v1',
                oracle_config_hash='22'*32, finalization_policy_hash='33'*32, max_supply=str(10**30))


def transaction(method='transfer'):
    args = {
        'configure_vault_roll': {'policy': dict(version='roll-demo-v1', keeper='keeper.testnet', reference_publisher='reference.testnet', fee_receiver='fees.testnet', old_series_id='old', new_series_id='new', not_before_ns='1', deadline_ns='100', min_remaining_ns='1', max_remaining_ns='100', max_reference_age_ns='50', quote_horizon_ns='30', max_notional='100', max_cash_input='1', max_fee='1', total_fee_budget='2', total_loss_budget='1', min_receive='1', max_loss_bps=100)},
        'publish_vault_reference': {'reference':dict(sequence='1', observed_ns='1', old_price='100', new_price='100')},
        'execute_vault_roll': {'quote':None, 'reference_sequence':'1'},
        'deposit_collateral': {}, 'create_series': {'config': terms()},
        'storage_deposit': {}, 'release_storage_excess': {'amount': '100'}, 'unregister': {},
        'close_ticket': {'ticket_id': '0'}, 'release_dust': {'series_id': 's1'},
        'archive_series': {'series_id': 's1'},
        'set_pauses': {'pauses': {'deposits': True, 'series': False, 'splits': False}},
        'split': dict(series_id='s1', amount='100'), 'merge': dict(series_id='s1', amount='100'),
        'transfer': dict(asset=leg()['asset'], amount='100', receiver='alice.testnet'),
        'redeem': dict(series_id='s1', leg='P', amount='100'), 'fill_quote': {'quote': quote()},
        'match_pair': {'quote': {**{k:v for k,v in quote().items() if k not in ('maker_gives','taker_gives')}, 'kind':'pair_quote','series_id':'s1','pair_amount':'100','maker_leg':'N','maker_collateral':'40'}},
        'register_signing_key': {'key_id':'key-1','public_key':'a'*64},
        'revoke_signing_key': {'key_id':'key-1'}, 'advance_quote_epoch': {'epoch':'1'},
        'set_market_pause': {'paused':True},
        'cancel_quote': {'nonce': '1'}, 'request_resolution': {'series_id': 's1'},
        'request_withdrawal': dict(amount='100', receiver='alice.testnet'),
        'create_vault': dict(vault_id='v1', seed=[leg('P')], initial_shares='100'),
        'set_vault_mint_pause': {'paused': True},
        'transfer_vault_shares': dict(vault_id='v1', shares='10', receiver='bob.testnet'),
        'vault_mint_basket': dict(vault_id='v1', shares='100', max_inputs=[leg(), leg('P')]),
        'vault_redeem_in_kind': dict(vault_id='v1', shares='100', min_outputs=[leg(amount='0'), leg('P')]),
    }
    return dict(kind='transaction', schema_version='0.2.0', domain=domain(), operation_id='aa'*32,
                attached_deposit='100' if method == 'deposit_collateral' else '1', method=method, args=args[method])


def ticket():
    return dict(kind='withdrawal', schema_version='0.2.0', domain=domain(), ticket_id='w1',
                owner='alice.testnet', receiver='bob.testnet', amount='100', state='PENDING',
                receipt_id=None, balance_restored=False)


class PublicLedgerTests(unittest.TestCase):
    def reject(self, value):
        with self.assertRaises((ValidationError, ValueError)):
            validate(value)

    def test_first_deposit_batch(self):
        good = transaction('deposit_collateral')
        good['attached_deposit'] = '110'
        good['storage_deposit'] = '10'
        validate(good)
        for amount in ['0', '110', '111']:
            bad = copy.deepcopy(good); bad['storage_deposit'] = amount; self.reject(bad)
        bad = copy.deepcopy(good); bad['method'] = 'storage_deposit'; self.reject(bad)

    def test_schema_reproducible_and_all_client_intents(self):
        Draft202012Validator.check_schema(SCHEMA)
        self.assertEqual(SCHEMA, build())
        methods = SCHEMA['$defs']['transaction']['properties']['method']['enum']
        for method in methods:
            with self.subTest(method=method):
                validate(transaction(method))
        validate(quote())
        validate(ticket())

    def test_public_amounts_accounts_and_events_are_explicit(self):
        event = dict(kind='event', schema_version='0.2.0', domain=domain(), operation_id='aa'*32,
                     actor='alice.testnet', event='TRANSFER', fee_amount='0', state_references=[],
                     deltas=[dict(account_id='alice.testnet', bucket='FREE', ledger_id='account', asset=leg()['asset'], direction='DEBIT', amount='100'),
                             dict(account_id='bob.testnet', bucket='FREE', ledger_id='account', asset=leg()['asset'], direction='CREDIT', amount='100')])
        validate(event)
        for field in ('actor', 'deltas', 'fee_amount', 'operation_id'):
            bad = copy.deepcopy(event); del bad[field]; self.reject(bad)
        bad = copy.deepcopy(event); bad['deltas'][0]['amount'] = '-100'; self.reject(bad)

    def test_old_schema_private_fields_and_unauthorized_callbacks_rejected(self):
        for field in ('proof', 'nullifiers', 'root', 'spend_key', 'ciphertext', 'verifier_key_hash', 'owner'):
            bad = transaction(); bad['args'][field] = '123'; self.reject(bad)
        bad = transaction(); bad['schema_version'] = '0.1.0'; self.reject(bad)
        for method in ('on_withdrawal_result', 'accept_final_resolution', 'transact'):
            bad = transaction(); bad['method'] = method; self.reject(bad)

    def test_integer_encoding_limits_and_zero_deposit(self):
        for value in (1, 1.5, True, '-1', '01', '1e2', ' 1', '1.0', '1\n', str(2**128), '0'):
            bad = transaction('request_withdrawal'); bad['args']['amount'] = value; self.reject(bad)
        valid = transaction(); valid['args']['amount'] = str(2**128-1); validate(valid)
        bad = transaction('deposit_collateral'); bad['attached_deposit'] = '0'; self.reject(bad)
        bad = quote(); bad['expiry_ns'] = str(2**64); self.reject(bad)
        valid = quote(); valid['expiry_ns'] = str(2**64-1); validate(valid)

    def test_quotes_require_domain_funding_terms_and_single_fill_shape(self):
        for field in ('maker', 'domain', 'nonce', 'cancellation_epoch', 'fee', 'signing_key_id', 'signature', 'expiry_ns'):
            bad = quote(); del bad[field]; self.reject(bad)
        bad = quote(); bad['fill_rule'] = 'PARTIAL'; self.reject(bad)
        bad = quote(); bad['maker_gives'].append(copy.deepcopy(bad['maker_gives'][0])); self.reject(bad)
        bad = transaction('fill_quote'); bad['args']['quote']['domain']['contract_id'] = 'other.testnet'; self.reject(bad)
        bad = transaction('fill_quote'); bad['args']['quote']['expiry_ns'] = '0'; self.reject(bad)
        bad = transaction(); bad['domain']['network'] = 'mainnet'; self.reject(bad)

    def test_basket_duplicates_four_series_and_share_recursion(self):
        bad = transaction('vault_mint_basket'); bad['args']['max_inputs'] *= 2; self.reject(bad)
        bad = transaction('vault_mint_basket'); bad['args']['max_inputs'] = [leg('P', 's'+str(i)) for i in range(5)]; self.reject(bad)
        bad = transaction('vault_mint_basket'); bad['args']['max_inputs'] = [leg('VAULT_SHARE')]; self.reject(bad)
        valid = transaction('vault_mint_basket')
        valid['args']['max_inputs'] = [leg()] + [leg(k, 's'+str(i)) for i in range(4) for k in ('P','N')]
        validate(valid)

    def test_unknown_or_successful_withdrawal_never_restores_balance(self):
        for state in ('PENDING', 'UNKNOWN', 'SUCCEEDED'):
            bad = ticket(); bad.update(state=state, balance_restored=True, receipt_id='B'*44); self.reject(bad)
        valid = ticket(); valid.update(state='FAILED_CONFIRMED', balance_restored=True, receipt_id='B'*44); validate(valid)
        bad = copy.deepcopy(valid); bad['receipt_id'] = None; self.reject(bad)

    def test_vault_seed_and_share_bounds(self):
        for seed in ([leg()], [leg('P'), leg('P')], [leg('VAULT_SHARE')],
                     [leg('P', 's'+str(i)) for i in range(5)]):
            bad = transaction('create_vault'); bad['args']['seed'] = seed; self.reject(bad)
        for shares in ('0', str(2**128)):
            bad = transaction('create_vault'); bad['args']['initial_shares'] = shares; self.reject(bad)

    def test_immutable_terms_units_and_window_shape(self):
        for field, value in (('strike', '0'), ('price_scale', '100'), ('collateral_kind', 'ETH'), ('mint_cutoff_ns', '201')):
            bad = transaction('create_series'); bad['args']['config'][field] = value; self.reject(bad)
        bad = transaction('create_series'); bad['args']['config']['observation_window']['end_ns'] = '201'; self.reject(bad)
        bad = transaction('create_series'); bad['args']['config']['observation_window']['start_ns'] = '200'; self.reject(bad)

    def test_keeper_intents_remain_bounded_and_domain_bound(self):
        bad = transaction('publish_vault_reference'); bad['args']['reference']['sequence'] = str(2**64); self.reject(bad)
        bad = transaction('configure_vault_roll'); bad['args']['policy']['total_loss_budget'] = str(2**128); self.reject(bad)
        bad = transaction('configure_vault_roll'); bad['args']['policy']['max_loss_bps'] = 1001; self.reject(bad)
        bad = transaction('execute_vault_roll'); bad['args']['quote'] = quote(); bad['args']['quote']['domain']['contract_id'] = 'other.testnet'; self.reject(bad)

    def test_strict_json(self):
        for raw in ('{"amount":"1","amount":"2"}', '{"value":NaN}'):
            with self.assertRaises(ValueError): loads_strict(raw)


if __name__ == '__main__':
    unittest.main()
