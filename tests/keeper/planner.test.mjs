import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {chooseRoll} from '../../services/keeper/planner.mjs';
import {Q,baseQuote,signQuote} from '../../packages/rfq/codec.mjs';
function fixture(){
 const key=generateKeyPairSync('ed25519'),public_key=key.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
 const policy={old_series_id:'old',new_series_id:'new',fee_receiver:'fees.sandbox',max_reference_age_ns:'100',quote_horizon_ns:'50',max_notional:String(2n*Q),max_cash_input:String(Q/10n),max_fee:String(Q/100n),total_fee_budget:String(Q/100n),total_loss_budget:String(Q/100n),max_loss_bps:200,min_receive:String(Q)};
 const input={policy,reference:{observed_ns:'100',old_price:String(Q/2n),new_price:String(Q/2n)},now_ns:'110',core:'core.sandbox',holdings:[{asset:{kind:'P',series_id:'old'},amount:String(Q)}],candidates:[]};
 const candidate=(maker,output)=>{const q=baseQuote({contract:input.core,maker,taker:input.core,keyId:'k',nonce:0,epoch:0,expiry:140,feeReceiver:policy.fee_receiver});q.maker_gives=[{asset:{kind:'P',series_id:'new'},amount:String(output)}];q.taker_gives=input.holdings;q.fee.amount='0';return {quote:signQuote(q,key.privateKey),registry:{keys:{k:{public_key,revoked:false}},epoch:'0',consumed:Array(32).fill(0),cancelled:Array(32).fill(0)},available_new_p:String(2n*Q)};};
 return {input,candidate};
}
test('competing verified funded candidates select greatest net reference output',()=>{const {input,candidate}=fixture();input.candidates=[candidate('a.sandbox',Q),candidate('b.sandbox',Q+2n)];const chosen=chooseRoll(input);assert.equal(chosen.eligible_count,2);assert.equal(chosen.quote.maker,'b.sandbox');});
test('forgeries, revoked/used nonces and depleted inventory cannot be selected',()=>{const {input,candidate}=fixture();const bad=[candidate('a.sandbox',Q),candidate('b.sandbox',Q),candidate('c.sandbox',Q),candidate('d.sandbox',Q)];bad[0].quote.signature='0'.repeat(128);bad[1].registry.keys.k.revoked=true;bad[2].registry.consumed[0]=1;bad[3].available_new_p='0';input.candidates=bad;assert.equal(chooseRoll(input).quote,null);});
test('missing or stale references never create a quote',()=>{const {input,candidate}=fixture();input.candidates=[candidate('a.sandbox',Q)];input.now_ns='201';assert.equal(chooseRoll(input).reason,'STALE_REFERENCE');input.reference=null;assert.equal(chooseRoll(input).quote,null);});
