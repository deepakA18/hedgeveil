// Explicit opt-in local signer bridge. Parent owns ephemeral keys; this module never loads keys.
export async function sign(request, onHash) {
    if (!process.send)
        throw Error('IPC_SIGNER_UNAVAILABLE');
    const response = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(Error('IPC_TIMEOUT')); }, 30000);
        const cleanup = () => { clearTimeout(timer); process.off('message', receive); process.off('disconnect', disconnected); };
        const disconnected = () => { cleanup(); reject(Error('IPC_DISCONNECTED')); };
        const receive = message => {
            if (message?.operationId !== request.operationId)
                return;
            cleanup();
            resolve(message);
        };
        process.on('message', receive);
        process.once('disconnect', disconnected);
        process.send(request);
    });
    if (response.hash) {
        await onHash(response.hash);
        return { hash: response.hash };
    }
    if (response.cancelled_before_submission === true)
        return { cancelled_before_submission: true };
    throw Error('IPC_RESPONSE_UNKNOWN');
}
