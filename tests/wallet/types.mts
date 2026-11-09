import type {WalletSelector} from '@near-wallet-selector/core';
import {actionCreators} from '@near-wallet-selector/core';
import {walletSelectorSigner} from '../../packages/sdk/wallet.mjs';
declare const selector: WalletSelector;
// Compile against the actual pinned vendor interface, not only a local declaration.
const sign = walletSelectorSigner({selector,actionCreators});
void sign;
// @ts-expect-error Real vendor declarations must reject a non-Action factory.
walletSelectorSigner({selector,actionCreators:{functionCall:()=>0}});

import type {NearConnector} from '../../apps/web/node_modules/@hot-labs/near-connect/build/index.js';
import {nearConnectSigner} from '../../packages/sdk/near-connect.mjs';
declare const connector: NearConnector;
nearConnectSigner({connector,selected:()=>({wallet:'meteor-wallet',account:'alice.testnet'}),allowedWallets:['meteor-wallet']});
