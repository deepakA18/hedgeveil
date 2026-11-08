"""Offline public-ledger schema validation; never transaction authorization."""
import json
from pathlib import Path
from jsonschema import Draft202012Validator

SCHEMA = json.loads(Path(__file__).with_name('public-ledger.schema.json').read_text())
MAX_U128 = 2**128 - 1
MAX_U64 = 2**64 - 1
UINT128_FIELDS = {'amount', 'attached_deposit', 'shares', 'strike', 'max_supply', 'fee_amount', 'pair_amount', 'maker_collateral', 'initial_shares', 'max_notional', 'max_cash_input', 'max_fee', 'total_fee_budget', 'total_loss_budget', 'min_receive', 'old_price', 'new_price'}
UINT64_FIELDS = {'ticket_id', 'nonce', 'cancellation_epoch', 'expiry_ns', 'maturity_ns', 'mint_cutoff_ns', 'start_ns', 'end_ns', 'epoch', 'not_before_ns', 'deadline_ns', 'min_remaining_ns', 'max_remaining_ns', 'max_reference_age_ns', 'quote_horizon_ns', 'reference_sequence', 'sequence', 'observed_ns'}


def loads_strict(raw):
    def reject_constant(_):
        raise ValueError('non-finite JSON')

    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('duplicate JSON key')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique, parse_constant=reject_constant)


def asset_key(asset):
    return (asset['kind'], asset.get('series_id'), asset.get('vault_id'))


def validate(data):
    Draft202012Validator(SCHEMA).validate(data)

    def walk(value):
        if isinstance(value, dict):
            if value.get('kind') in ('quote', 'pair_quote') and int(value['expiry_ns']) == 0:
                raise ValueError('quote expiry must be positive')
            for key, child in value.items():
                if key in UINT128_FIELDS and int(child) > MAX_U128:
                    raise ValueError('u128 overflow')
                if key in UINT64_FIELDS and not (key == 'ticket_id' and value.get('kind') == 'withdrawal') and int(child) > MAX_U64:
                    raise ValueError('u64 overflow')
                if key in ('maker_gives', 'taker_gives', 'max_inputs', 'min_outputs', 'seed'):
                    identities = [asset_key(leg['asset']) for leg in child]
                    if len(set(identities)) != len(identities):
                        raise ValueError('duplicate asset ID')
                    if key in ('max_inputs', 'min_outputs', 'seed'):
                        if any(leg['asset']['kind'] == 'VAULT_SHARE' for leg in child):
                            raise ValueError('vault cannot hold its own or other vault shares')
                        series = {leg['asset']['series_id'] for leg in child if 'series_id' in leg['asset']}
                        if len(series) > 4:
                            raise ValueError('vault exceeds four series')
                        if key == 'seed' and not series:
                            raise ValueError('vault seed needs at least one claim series')
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    walk(data)
    pair = data if data.get('kind') == 'pair_quote' else (data.get('args', {}).get('quote') if data.get('method') == 'match_pair' else None)
    if pair and int(pair['maker_collateral']) >= int(pair['pair_amount']):
        raise ValueError('pair contributions must both be positive')

    if data['kind'] == 'transaction':
        method, args = data['method'], data['args']
        if method == 'deposit_collateral' and int(data['attached_deposit']) == 0:
            raise ValueError('collateral deposit must be positive')
        if method in ('fill_quote', 'match_pair', 'execute_vault_roll') and args['quote'] is not None and args['quote']['domain'] != data['domain']:
            raise ValueError('quote transaction domain mismatch')
        if method == 'create_series':
            config = args['config']
            start, end = (int(config['observation_window'][key]) for key in ('start_ns', 'end_ns'))
            if not start < end == int(config['maturity_ns']):
                raise ValueError('observation window must end at maturity')
            if int(config['mint_cutoff_ns']) > int(config['maturity_ns']):
                raise ValueError('mint cutoff after maturity')
    elif data['kind'] == 'withdrawal':
        if data['balance_restored'] and data['state'] != 'FAILED_CONFIRMED':
            raise ValueError('only a confirmed failure permits balance restoration')
        if data['state'] in ('SUCCEEDED', 'FAILED_CONFIRMED') and data['receipt_id'] is None:
            raise ValueError('confirmed result requires receipt correlation')
