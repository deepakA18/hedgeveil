import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startBootstrap} from '../testnet/bootstrap.mjs';
const pins=JSON.parse(await readFile('deploy/testnet/outlayer-observation-pins.json','utf8')).testnet;
const plan={kind:'hedgeveil-oracle-probe',network:'testnet',owner:'0xdeepak18.testnet',root_id:'price-oracle.testnet',
    rpc_url:'https://rpc.testnet.near.org/',genesis_hash:pins.expected_genesis_hash,oracle_code_hash:pins.expected_code_hash,
    funding_amount:'20000000000000000000000',accounts:[]};
const directory=resolve('.local/outlayer-testnet-probe');await mkdir(directory,{recursive:true,mode:0o700});
try{
    const service=await startBootstrap({directory,plan,port:8792,oracleProbe:true});
    console.log(`External oracle testnet request: ${service.url}\nWallet approval required for one 0.02 test NEAR deposit plus gas; no paid API key. No automatic retry. Protocol deployment remains held.`);
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await service.stop();process.exit(0);});
}catch{console.error('ORACLE_PROBE_UNAVAILABLE: check public RPC/code identity, pinned wallet assets and port 8792. No transaction sent.');process.exitCode=1;}
