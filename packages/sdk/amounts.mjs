// Portable exact units shared by the Node SDK and browser. No floating-point amounts.
export const Q = 10n ** 24n;
export class ClientError extends Error {
    constructor(code) { super(code); this.code = code; }
}
export function fail(code) { throw new ClientError(code); }
export function uint(value, bits = 128, positive = false) {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || value.length > 39) fail('INVALID_INTEGER');
    const n = BigInt(value);
    if (n >= (1n << BigInt(bits)) || (positive && n === 0n)) fail('INTEGER_BOUNDS');
    return n;
}
export function parseNear(text) {
    if (typeof text !== 'string' || text.length > 64 || !/^(0|[1-9][0-9]*)(\.[0-9]{1,24})?$/.test(text)) fail('INVALID_NEAR_AMOUNT');
    const [whole, fraction = ''] = text.split('.');
    const n = BigInt(whole) * Q + BigInt(fraction.padEnd(24, '0'));
    uint(String(n));
    return String(n);
}
export function formatNear(amount) {
    const n = uint(amount), fraction = String(n % Q).padStart(24, '0').replace(/0+$/, '');
    return `${n / Q}${fraction ? '.' + fraction : ''}`;
}
