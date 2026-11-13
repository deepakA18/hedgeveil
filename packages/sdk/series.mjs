// The caller must bind view() to ONE finalized block for the entire snapshot.
// Layout 1 has eight rows; layout 2 has up to 32 retained rows. Archives have
// zero claims and MUST NOT be joined to account positions by their former slot.
export async function retainedSeries(view) {
    const rows = [], ids = new Set(), slots = new Set();
    for (let from_index = 0; from_index <= 32; from_index += 16) {
        const page = await view('list_series', { from_index, limit: 16 });
        if (!Array.isArray(page) || page.length > 16 || rows.length + page.length > 32)
            throw Error('SERIES_PAGE_INVALID');
        for (const row of page) {
            const id = row?.config?.series_id, slot = row?.slot;
            if (typeof id !== 'string' || !id || ids.has(id) || !Number.isInteger(slot) || slot < 0 || slot >= 32 || slots.has(slot))
                throw Error('SERIES_PAGE_CONFLICT');
            ids.add(id); slots.add(slot); rows.push(row);
        }
        if (page.length < 16) return rows;
    }
    throw Error('SERIES_PAGE_INVALID');
}
