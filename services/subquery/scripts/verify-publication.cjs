// Fetch the published manifest and every executable/schema asset without a token.
const {readFileSync,writeFileSync}=require('node:fs');
const {resolve,join}=require('node:path');
const {createHash}=require('node:crypto');
const yaml=require('js-yaml');
const root=resolve(__dirname,'../../..'),project=resolve(__dirname,'..');
const path=join(root,'research/reports/inf02-subquery-publication.json');
const report=JSON.parse(readFileSync(path));
const sha=b=>createHash('sha256').update(b).digest('hex');
async function cat(cid){
 if(!/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid))throw Error('CID_FORMAT');
 const r=await fetch('https://unauthipfs.subquery.network/ipfs/api/v0/cat?arg='+cid,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('IPFS_HTTP_'+r.status);
 const data=Buffer.from(await r.arrayBuffer());if(data.length>2000000)throw Error('IPFS_SIZE');return data;
}
(async()=>{
 const bytes=await cat(report.cid),manifest=yaml.load(bytes.toString());
 if(manifest.network.chainId!=='testnet'||manifest.dataSources.length!==1||manifest.dataSources[0].startBlock!==277012602||manifest.runner.node.name!=='@subql/node-near'||manifest.runner.node.version!=='6.0.2')throw Error('MANIFEST_BINDING');
 const checks=[];
 for(const [field,file] of [[manifest.schema.file,'schema.graphql'],[manifest.dataSources[0].mapping.file,'dist/index.js']]){
  if(!field.startsWith('ipfs://'))throw Error('ASSET_NOT_CONTENT_ADDRESSED');
  const data=await cat(field.slice(7)),digest=sha(data);
  if(digest!==sha(readFileSync(join(project,file)))||digest!==report.sources[file])throw Error('ASSET_MISMATCH');
  checks.push({file,cid:field.slice(7),sha256:digest});
 }
 report.public_fetch_verified=true;report.manifest_sha256=sha(bytes);report.assets=checks;
 writeFileSync(path,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({cid:report.cid,public_fetch_verified:true,network:'testnet',assets:checks.length,cutover_allowed:false}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
