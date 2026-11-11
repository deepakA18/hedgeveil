import test from 'node:test';import assert from 'node:assert/strict';import {fundingBudget} from '../../services/testnet/bootstrap.mjs';import{ACCEPTED_POLICY}from'../../services/outlayer/sampler.mjs';
import {implicitAccount,transferFunding,walletFundingActions} from '../../services/testnet/funding.mjs';
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
