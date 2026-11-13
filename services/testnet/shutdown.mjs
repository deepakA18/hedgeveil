import {asyncExitHook} from '../indexer/node_modules/exit-hook/index.js';

// EmbeddedPostgres registers its own signal hook. Route that hook through the
// service drain so it cannot stop PostgreSQL underneath an in-flight sync.
// A forced/crashed exit still retains the ownership lock for operator review.
export function coordinatedDatabaseStop(pg,drain){
 const stopDatabase=pg.stop.bind(pg);
 let stopping;
 const stop=()=>stopping??=Promise.resolve().then(()=>drain(stopDatabase));
 pg.stop=stop;
 const remove=asyncExitHook(stop,{wait:120000});
 return {stopDatabase,release:remove};
}
