// Publish only the manifest's schema/mapping assets. Never publish repository
// directories or print CLI diagnostics that could contain authentication data.
const {readFileSync,writeFileSync,existsSync}=require('node:fs');
const {resolve,join}=require('node:path');
const {spawnSync}=require('node:child_process');
const {parseEnv}=require('node:util');
const {createHash}=require('node:crypto');
const directory=resolve(__dirname,'..'),root=resolve(directory,'../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const report=JSON.parse(readFileSync(join(root,'research/reports/inf02-subquery-replay.json')));
if(!report.passed||report.cutover_allowed!==false)throw Error('REPLAY_REQUIRED');
for(const [file,hash]of Object.entries(report.sources))if(sha(readFileSync(join(directory,file)))!==hash)throw Error('REPLAY_SOURCE_CHANGED');
const values=existsSync(join(root,'.env'))?parseEnv(readFileSync(join(root,'.env'),'utf8')):{};
const token=values.SUBQL_ACCESS_TOKEN||process.env.SUBQL_ACCESS_TOKEN;
if(!token||token==='replace-me')throw Error('SUBQL_ACCESS_TOKEN_REQUIRED');
const env={PATH:process.env.PATH,HOME:process.env.HOME,SUBQL_ACCESS_TOKEN:token,NO_UPDATE_NOTIFIER:'1'};
const child=spawnSync(join(directory,'node_modules/.bin/subql'),['publish','--silent'],{cwd:directory,env,encoding:'utf8',timeout:180000,maxBuffer:2000000});
if(child.status!==0){console.error(JSON.stringify({published:false,exit_code:child.status,error:child.error?.code??'PUBLISH_FAILED',unauthorized:/401|403|unauthorized/i.test(child.stderr??'')}));process.exit(1);}
const cid=readFileSync(join(directory,'.project-cid'),'utf8').trim();
if(!/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)||!child.stdout.includes(cid))throw Error('CID_INVALID');
const sources={};for(const file of ['project.yaml','schema.graphql','dist/index.js','package-lock.json'])sources[file]=sha(readFileSync(join(directory,file)));
const result={scope:'Published SubQuery testnet evidence archive, not hosted deployment or cutover approval',cid,network:'testnet',project:'hedgeveil-testnet',sources,pin_warning:/Failed to pin/i.test(child.stderr+child.stdout),hosted_deployment_verified:false,cutover_allowed:false};
writeFileSync(join(root,'research/reports/inf02-subquery-publication.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
