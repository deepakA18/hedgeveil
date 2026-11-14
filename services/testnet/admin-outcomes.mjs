import {terminal} from '../../packages/sdk/journal.mjs';
// Service journals only. User operations still require actual final receipts.
export const adminTerminal = state => terminal(state) || state === 'EXPIRED_NOT_INCLUDED';
