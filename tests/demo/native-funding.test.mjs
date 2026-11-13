import test from 'node:test';import assert from 'node:assert/strict';import {fundingBudget} from '../../services/testnet/bootstrap.mjs';import{ACCEPTED_POLICY}from'../../services/outlayer/sampler.mjs';
import {implicitAccount,transferFunding,walletFundingActions,expiryFunding} from '../../services/testnet/funding.mjs';
import {KeyPair} from '../../services/testnet/near.mjs';
const Q=10n**24n,p={kind:'hedgeveil-native-testnet',funding_amount:String(48n*Q),owner_minimum:String(49n*Q),oracle_version:'native-sampled-v1',policy_acceptance:ACCEPTED_POLICY,accounts:Array(5).fill({})};
test('native wallet funding is fixed to 48 test NEAR and reserves one for the owner',()=>{assert.deepEqual(fundingBudget(p),{amount:48n*Q,minimum:49n*Q});for(const patch of [{funding_amount:String(80n*Q)},{owner_minimum:String(48n*Q)},{oracle_version:'demo-v1'},{policy_acceptance:'unaccepted'},{accounts:[]}])assert.throws(()=>fundingBudget({...p,...patch}),/NATIVE_FUNDING_PROFILE/);});
test('single source probe stays bounded independently of protocol funding',()=>assert.deepEqual(fundingBudget({},true),{amount:Q/50n,minimum:Q/10n}));
test('transfer funding binds destination to public key, budget and implicit service accounts',()=>{
 const key=KeyPair.fromRandom('ed25519').getPublicKey().toString(),id=implicitAccount(key),root=id;
 const plan={...p,root_id:root,funding:{mode:'implicit-transfer-v1',receiver_id:id,public_key:key},accounts:[['administrator',48n*Q],['core',30n*Q],['oracle',8n*Q],['maker',45n*Q/10n],['maker',45n*Q/10n]].map(([role,b])=>{const pk=role==='administrator'?key:KeyPair.fromRandom('ed25519').getPublicKey().toString();return {role,id:implicitAccount(pk),initial_balance:String(b),public_key:pk};})};
 const f=transferFunding(plan);assert.equal(f.receiver_id,id);assert.deepEqual(walletFundingActions(f),[{type:'Transfer',params:{deposit:String(48n*Q)}}]);
 for(const mutate of [x=>x.funding.receiver_id='f'.repeat(64),x=>x.funding.public_key='ed25519:bad',x=>x.root_id='short',x=>x.accounts[0].public_key=x.accounts[1].public_key,x=>x.accounts[1].initial_balance='1',x=>x.accounts[4]=x.accounts[3],x=>x.funding_amount=String(80n*Q)]){const bad=structuredClone(plan);mutate(bad);assert.throws(()=>transferFunding(bad));}
 assert.throws(()=>walletFundingActions({label:'fund-demo-root',actions:[{type:'AddKey'}]}),/WALLET_ADD_KEY_UNSUPPORTED/);
 assert.throws(()=>walletFundingActions({...f,actions:[...f.actions,{type:'AddKey'}]}),/WALLET_ADD_KEY_UNSUPPORTED/);
 assert.equal(implicitAccount('ed25519:'+'1'.repeat(32)),'0'.repeat(64));
});

test('fresh demo series lead is bounded and unknown series cannot extend the budget',async()=>{
 const {deployNative}=await import('../../services/testnet/native.mjs');
 for(const leadSeconds of [0,179,3601,NaN,Infinity,180.5])await assert.rejects(deployNative({directory:'/nonexistent',plan:{}},{seriesId:'gamma',leadSeconds}),/SERIES_LEAD_TIME/);
 await assert.rejects(deployNative({directory:'/nonexistent',plan:{}},{seriesId:'unbounded'}),/DEMO_SERIES_LIMIT/);
});

test('new series cannot use slots shorter than the observed source cache plus safety margin',async()=>{
 const {deployNative}=await import('../../services/testnet/native.mjs');
 for(const slotSeconds of [180,300,359,3601,NaN])await assert.rejects(deployNative({directory:'/nonexistent',plan:{}},{seriesId:'epsilon',slotSeconds}),/SERIES_SLOT_TIME/);
});


test('new TWAP setup binds the fresh service, smaller reserves and limited maker inventory',()=>{
 const accounts=[['administrator',2n*Q],['core',21n*Q],['oracle',6n*Q],['maker',3n*Q/2n],['maker',3n*Q/2n]].map(([role,b])=>{const public_key=KeyPair.fromRandom('ed25519').getPublicKey().toString();return {role,id:implicitAccount(public_key),public_key,initial_balance:String(b)};});
 const plan={kind:'hedgeveil-expiry-testnet',network:'testnet',root_id:accounts[0].id,accounts,oracle_version:'native-trade-twap-v1',valuation_model:'ARITHMETIC_TWAP_NEAR_MOMENTS_V1',listing_policy:'DAILY_FRIDAY_0800_90_95_100_105_110_V1',vault_enabled:false,funding_amount:String(32n*Q),owner_minimum:String(33n*Q),funding:{mode:'implicit-transfer-v2',receiver_id:accounts[0].id,public_key:accounts[0].public_key},maker_initial_equity:String(11n*Q/10n),inventory_per_market:String(Q/10n)};
 assert.deepEqual(fundingBudget(plan),{amount:32n*Q,minimum:33n*Q});assert.deepEqual(walletFundingActions(expiryFunding(plan)),[{type:'Transfer',params:{deposit:String(32n*Q)}}]);
 for(const mutate of [p=>p.network='mainnet',p=>p.funding_amount='1',p=>p.owner_minimum='1',p=>p.funding.receiver_id=p.accounts[1].id,p=>p.inventory_per_market=String(Q),p=>p.maker_initial_equity=String(4n*Q),p=>p.valuation_model='terminal',p=>p.accounts[1].initial_balance='1',p=>p.accounts[4]=p.accounts[3],p=>p.vault_enabled=true]){const bad=structuredClone(plan);mutate(bad);assert.throws(()=>expiryFunding(bad),/EXPIRY_FUNDING_PROFILE/);}
});
