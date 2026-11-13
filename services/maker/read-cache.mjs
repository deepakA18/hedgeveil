// Short-lived, coalesced immutable read snapshots. No stale-on-error fallback.
export class ReadCache {
 constructor({ttlMs=2000,clock=()=>performance.now()}={}){this.ttl=ttlMs;this.clock=clock;this.entry=null;this.pending=null;this.generation=0;}
 clear(){this.generation++;this.entry=null;this.pending=null;}
 async get(load){
  if(this.entry&&this.clock()-this.entry.at<this.ttl)return this.entry.value;
  if(this.pending)return this.pending;
  const generation=this.generation;
  const pending=Promise.resolve().then(load).then(value=>{if(generation===this.generation)this.entry={at:this.clock(),value};return value;}).finally(()=>{if(this.pending===pending)this.pending=null;});
  this.pending=pending;return pending;
 }
}
