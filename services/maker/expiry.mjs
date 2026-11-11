export function quoteExpiry(now,maturities,network='sandbox'){
 if(!['sandbox','testnet'].includes(network)||!maturities.length)throw Error('QUOTE_EXPIRY_DOMAIN');
 let expiry=BigInt(now)+(network==='testnet'?90n:15n)*1000000000n;
 for(const maturity of maturities){const end=BigInt(maturity)-1n;if(end<expiry)expiry=end;}
 if(expiry<=BigInt(now))throw Error('SERIES_UNAVAILABLE');
 return expiry;
}
