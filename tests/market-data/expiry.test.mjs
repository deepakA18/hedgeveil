import test from 'node:test';import assert from 'node:assert/strict';
import {quoteExpiry} from '../../services/maker/expiry.mjs';
const S=1000000000n;
test('public wallet review has a bounded 90-second offer; local fixtures keep 15 seconds',()=>{
 assert.equal(quoteExpiry(S,[1000n*S],'testnet'),91n*S);assert.equal(quoteExpiry(S,[1000n*S],'sandbox'),16n*S);
});
test('multi-series offer expires before the earliest maturity, including the final nanosecond',()=>{
 assert.equal(quoteExpiry(S,[40n*S,20n*S],'testnet'),20n*S-1n);
 assert.throws(()=>quoteExpiry(S,[S+1n],'testnet'),/SERIES_UNAVAILABLE/);
 assert.throws(()=>quoteExpiry(S,[S-1n],'testnet'),/SERIES_UNAVAILABLE/);
});
test('unknown network and absent maturities never yield an offer',()=>{
 assert.throws(()=>quoteExpiry(S,[],'testnet'));assert.throws(()=>quoteExpiry(S,[10n*S],'mainnet'));
});
