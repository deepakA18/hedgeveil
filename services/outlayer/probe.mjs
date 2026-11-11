import {parseArgs} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {inspectOracle,SOURCE_COMMIT} from './reader.mjs';
const {values:v}=parseArgs({options:{network:{type:'string',default:'testnet'},report:{type:'string',default:'target/outlayer-probe.json'},pins:{type:'string'}}});
if(!['testnet','mainnet','both'].includes(v.network))throw Error('ORACLE_NETWORK');
const pins=v.pins?JSON.parse(await readFile(v.pins)):{};
const report={version:1,scope:'Read-only Outlayer NEAR/USD feasibility; no paid calls or contract integration',source_commit:SOURCE_COMMIT,networks:{},sources:{}};
for(const network of v.network==='both'?['testnet','mainnet']:[v.network]){
    const c={network,rpc_url:`https://rpc.${network}.near.org/`,contract_id:network==='testnet'?'price-oracle.testnet':'price-oracle.near',...pins[network]};
    if(c.network!==network)throw Error('ORACLE_PIN_NETWORK');
    report.networks[network]=await inspectOracle(c);
    const r=report.networks[network];console.log(JSON.stringify({network,identity:r.identity,state:r.error??r.assessment?.state,settlement_eligible:false}));
}
for(const f of ['services/outlayer/reader.mjs','services/outlayer/probe.mjs'])report.sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
await mkdir(dirname(v.report),{recursive:true});await writeFile(v.report,JSON.stringify(report,null,2)+'\n');
if(Object.values(report.networks).some(r=>r.error))process.exitCode=1;
