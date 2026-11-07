"""Versioned, offline public-ledger review schemas; not a deployed contract ABI."""
import argparse
import json
from pathlib import Path

DESTINATION = Path(__file__).with_name('public-ledger.schema.json')


def ref(name):
    return {'$ref': '#/$defs/' + name}


def obj(properties):
    return {'type': 'object', 'additionalProperties': False,
            'required': list(properties), 'properties': properties}


def const(value):
    return {'const': value}


def array(items, maximum=8, minimum=1):
    return {'type': 'array', 'items': items, 'minItems': minimum, 'maxItems': maximum}


def build():
    # Negative lookahead rejects the trailing-newline case accepted by `$`.
    end = r'(?![\s\S])'
    uint = {'type': 'string', 'maxLength': 39, 'pattern': r'^(0|[1-9][0-9]{0,38})' + end}
    positive = {**uint, 'pattern': r'^[1-9][0-9]{0,38}' + end}
    account = {'type': 'string', 'minLength': 2, 'maxLength': 64,
               'pattern': r'^[a-z0-9]+(?:[._-][a-z0-9]+)*' + end}
    identifier = {'type': 'string', 'minLength': 1, 'maxLength': 64,
                  'pattern': r'^[a-z0-9]+(?:[-_][a-z0-9]+)*' + end}
    hash256 = {'type': 'string', 'minLength': 64, 'maxLength': 64,
               'pattern': r'^[0-9a-f]{64}' + end}
    domain = obj({'protocol_version': const('1'), 'network': {'enum': ['sandbox', 'testnet']},
                  'contract_id': ref('account')})
    asset = {'oneOf': [obj({'kind': const('COLLATERAL')}),
                       obj({'kind': {'enum': ['P', 'N']}, 'series_id': ref('id')}),
                       obj({'kind': const('VAULT_SHARE'), 'vault_id': ref('id')})]}
    leg = obj({'asset': ref('asset'), 'amount': ref('positive')})
    # Exit minima may be zero; quantities being transferred or supplied must be positive.
    limit = obj({'asset': ref('asset'), 'amount': ref('uint128')})
    quote = obj({'kind': const('quote'), 'schema_version': const('0.2.0'), 'domain': ref('domain'),
                 'maker': ref('account'), 'taker': {'anyOf': [ref('account'), {'type': 'null'}]},
                 'maker_gives': array(ref('leg')), 'taker_gives': array(ref('leg')),
                 'fee': obj({'asset': const('NATIVE_NEAR'), 'amount': ref('uint128'), 'receiver': ref('account')}),
                 'fill_rule': const('ALL_OR_NOTHING'), 'rounding': const('EXACT_AMOUNTS'),
                 'nonce': ref('uint64'), 'cancellation_epoch': ref('uint64'), 'expiry_ns': ref('uint64'),
                 'signing_key_id': ref('id'), 'signature_scheme': const('ed25519'),
                 'signature': {'type': 'string', 'minLength': 128, 'maxLength': 128,
                               'pattern': r'^[0-9a-f]{128}' + end}})
    pair_quote = obj({**{k: v for k, v in quote['properties'].items() if k not in ('maker_gives', 'taker_gives')},
                      'kind': const('pair_quote'), 'series_id': ref('id'), 'pair_amount': ref('positive'),
                      'maker_leg': {'enum': ['P', 'N']}, 'maker_collateral': ref('positive')})
    terms = obj({'series_id': ref('id'), 'version': const('1'), 'collateral_kind': const('NATIVE_NEAR'),
                 'index_definition_hash': ref('hash256'), 'payoff_kind': const('CAPPED_USD_COMPLEMENT'),
                 'strike': ref('positive'), 'price_scale': const('1000000000000'),
                 'maturity_ns': ref('uint64'), 'mint_cutoff_ns': ref('uint64'),
                 'observation_window': obj({'start_ns': ref('uint64'), 'end_ns': ref('uint64')}),
                 'oracle_account_id': ref('account'), 'oracle_version': ref('id'),
                 'oracle_config_hash': ref('hash256'), 'finalization_policy_hash': ref('hash256'),
                 'max_supply': ref('positive')})
    series_amount = obj({'series_id': ref('id'), 'amount': ref('positive')})
    methods = {
        'deposit_collateral': obj({}),
        'storage_deposit': obj({}),
        'release_storage_excess': obj({'amount': ref('positive')}),
        'unregister': obj({}),
        'close_ticket': obj({'ticket_id': ref('uint64')}),
        'release_dust': obj({'series_id': ref('id')}),
        'set_pauses': obj({'pauses': obj({'deposits': {'type': 'boolean'}, 'series': {'type': 'boolean'}, 'splits': {'type': 'boolean'}})}),
        'create_series': obj({'config': ref('series_terms')}),
        'split': series_amount,
        'merge': series_amount,
        'transfer': obj({'asset': ref('asset'), 'amount': ref('positive'), 'receiver': ref('account')}),
        'redeem': obj({'series_id': ref('id'), 'leg': {'enum': ['P', 'N']}, 'amount': ref('positive')}),
        'fill_quote': obj({'quote': ref('quote')}),
        'match_pair': obj({'quote': ref('pair_quote')}),
        'register_signing_key': obj({'key_id': ref('id'), 'public_key': ref('hash256')}),
        'revoke_signing_key': obj({'key_id': ref('id')}),
        'advance_quote_epoch': obj({'epoch': ref('uint64')}),
        'set_market_pause': obj({'paused': {'type': 'boolean'}}),
        'cancel_quote': obj({'nonce': ref('uint64')}),
        'request_resolution': obj({'series_id': ref('id')}),
        'request_withdrawal': obj({'amount': ref('positive'), 'receiver': ref('account')}),
        'create_vault': obj({'vault_id': ref('id'), 'seed': array(ref('leg'), 9), 'initial_shares': ref('positive')}),
        'set_vault_mint_pause': obj({'paused': {'type': 'boolean'}}),
        'transfer_vault_shares': obj({'vault_id': ref('id'), 'shares': ref('positive'), 'receiver': ref('account')}),
        'vault_mint_basket': obj({'vault_id': ref('id'), 'shares': ref('positive'), 'max_inputs': array(ref('leg'), 9)}),
        'vault_redeem_in_kind': obj({'vault_id': ref('id'), 'shares': ref('positive'), 'min_outputs': array(ref('limit'), 9)}),
    }
    transaction = obj({'kind': const('transaction'), 'schema_version': const('0.2.0'), 'domain': ref('domain'),
                       'operation_id': ref('hash256'), 'attached_deposit': ref('uint128'),
                       'method': {'enum': list(methods)}, 'args': {'type': 'object'}})
    transaction['oneOf'] = [{'properties': {'method': const(method), 'args': args}}
                            for method, args in methods.items()]
    event = obj({'kind': const('event'), 'schema_version': const('0.2.0'), 'domain': ref('domain'),
                 'operation_id': ref('hash256'), 'actor': ref('account'),
                 'event': {'enum': ['DEPOSIT', 'SERIES_CREATED', 'SPLIT', 'TRANSFER', 'MERGE', 'QUOTE_FILLED',
                                    'QUOTE_CANCELLED', 'SIGNING_KEY_REGISTERED', 'SIGNING_KEY_REVOKED', 'QUOTE_EPOCH_ADVANCED', 'MARKET_PAUSE_CHANGED', 'PAIR_MATCHED', 'FINALIZED', 'REDEEMED', 'VAULT_MINTED', 'VAULT_EXITED', 'VAULT_CREATED', 'VAULT_PAUSE_CHANGED', 'VAULT_SHARES_TRANSFERRED',
                                    'ROLL_EXECUTED', 'ROLL_DEFERRED', 'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_SUCCEEDED',
                                    'WITHDRAWAL_FAILED_CONFIRMED', 'WITHDRAWAL_UNKNOWN', 'DUST_RELEASED', 'INITIALIZED', 'STORAGE_DEPOSIT', 'STORAGE_RELEASED', 'STORAGE_REFUND_REQUESTED', 'TICKET_CLOSED', 'PAUSE_CHANGED', 'RESOLUTION_REQUESTED', 'RESOLUTION_REJECTED']},
                 'deltas': array(obj({'account_id': ref('account'),
                                     'bucket': {'enum': ['FREE', 'ORDER_RESERVED', 'SERIES_RESERVE', 'VAULT', 'FEE', 'BOND', 'STORAGE', 'WITHDRAWAL', 'SUPPLY', 'OPERATING']},
                                     'ledger_id': ref('id'),
                                     'asset': ref('asset'), 'direction': {'enum': ['CREDIT', 'DEBIT']},
                                     'amount': ref('uint128')}), 32, 0),
                 'fee_amount': ref('uint128'), 'state_references': array(ref('hash256'), 16, 0)})
    withdrawal = obj({'kind': const('withdrawal'), 'schema_version': const('0.2.0'), 'domain': ref('domain'),
                      'ticket_id': ref('id'), 'owner': ref('account'), 'receiver': ref('account'),
                      'amount': ref('positive'), 'state': {'enum': ['PENDING', 'SUCCEEDED', 'FAILED_CONFIRMED', 'UNKNOWN']},
                      'receipt_id': {'anyOf': [ref('receipt_id'), {'type': 'null'}]},
                      'balance_restored': {'type': 'boolean'}})
    return {'$schema': 'https://json-schema.org/draft/2020-12/schema',
            '$id': 'https://hedgeveil.invalid/schemas/public-ledger/0.2.0',
            'title': 'Open Innovation public-ledger draft (not deployed ABI)',
            'oneOf': [ref('transaction'), ref('quote'), ref('pair_quote'), ref('event'), ref('withdrawal')],
            '$defs': {'uint128': uint, 'positive': positive,
                      'uint64': {**uint, 'maxLength': 20, 'pattern': r'^(0|[1-9][0-9]{0,19})' + end},
                      'account': account, 'id': identifier, 'hash256': hash256,
                      'receipt_id': {'type': 'string', 'minLength': 32, 'maxLength': 44,
                                     'pattern': r'^[1-9A-HJ-NP-Za-km-z]{32,44}' + end},
                      'domain': domain, 'asset': asset, 'leg': leg, 'limit': limit, 'series_terms': terms,
                      'quote': quote, 'pair_quote': pair_quote, 'transaction': transaction, 'event': event, 'withdrawal': withdrawal,
                      'series_state': {'enum': ['OPEN', 'MATURED_PENDING', 'PROPOSED', 'DISPUTED', 'RESOLUTION_DELAYED', 'FINALIZED', 'CLOSED']},
                      'vault_risk_state': {'enum': ['ACTIVE', 'ROLL_DEFERRED']}}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    content = json.dumps(build(), indent=2) + '\n'
    if args.check:
        if not DESTINATION.exists() or DESTINATION.read_text() != content:
            raise SystemExit('Public-ledger schema differs; regenerate and review.')
        print('Public-ledger schema is reproducible.')
    else:
        DESTINATION.write_text(content)
    from build_oracle_schema import write as write_oracle
    write_oracle(args.check)
