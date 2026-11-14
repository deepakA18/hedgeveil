"use client";
import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { transactionToast, Spinner, errorToast } from "./Feedback";
import type { ReceiptResult } from "../../lib/operation-feedback";
import type { SignRequest } from "../../../../packages/sdk/index.mjs";
import type { NearConnector } from "@hot-labs/near-connect";
import { nearConnectSigner } from "../../../../packages/sdk/near-connect.mjs";
import { walletReturn } from "../../../../packages/sdk/wallet.mjs";
import { account as validateAccount } from "../../../../packages/sdk/intent.mjs";
import {
  api,
  formatNear,
  message,
  claimName,
  actionName,
} from "../../lib/desk-api";
import type {
  Session,
  IndexState,
  LiveState,
  Operation,
  Preview,
  ActionInput,
  Leg,
  Series,
} from "../../lib/desk-types";
import { terminalState } from "../../lib/market-display";
import type { Spot } from "../../lib/market-display";
import { Modal } from "./Modal";
import { WalletLogo } from "./WalletLogo";

type Wallet = Awaited<ReturnType<NearConnector["wallet"]>>;
interface Context {
  clock: { serverMs: number; receivedAt: number } | null;
  spot: Spot | null;
  session: Session | null;
  state: IndexState | null;
  live: LiveState | null;
  records: Operation[];
  series: Series[];
  account: string;
  accounts: string[];
  walletInfo: { id: string; name: string } | null;
  connecting: string;
  loading: boolean;
  lastChecked: number | null;
  checkedAtMono: number;
  receiptCheck: string;
  busy: boolean;
  error: string;
  notice: string;
  ready: boolean;
  connect: () => void;
  disconnect: () => Promise<void>;
  selectAccount: (a: string) => void;
  refresh: () => Promise<void>;
  review: (input: ActionInput) => Promise<void>;
  recover: (id: string, hash?: string) => Promise<void>;
  setError: (s: string) => void;
}
const Desk = createContext<Context | null>(null);
export function useDesk() {
  const value = useContext(Desk);
  if (!value) throw Error("Desk provider missing");
  return value;
}
export function LegList({ legs }: { legs: Leg[] }) {
  return (
    <div className="review-legs">
      {legs.length ? (
        legs.map((l, i) => (
          <div key={i}>
            <span>
              {claimName(l.asset.kind)}
              {l.asset.series_id ? ", " + l.asset.series_id : ""}
            </span>
            <strong>{formatNear(l.amount)}</strong>
            {l.shortfall && l.shortfall !== "0" && (
              <small className="desk-danger">
                Shortfall: {formatNear(l.shortfall)}
              </small>
            )}
          </div>
        ))
      ) : (
        <p>No balance required.</p>
      )}
    </div>
  );
}
export function DeskProvider({
  nonce,
  children,
}: {
  nonce: string;
  children: ReactNode;
}) {
  const [clock, setClock] = useState<{
    serverMs: number;
    receivedAt: number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function sync() {
      try {
        const r = await fetch("/api/clock", {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        const v = await r.json();
        if (active && r.ok && Number.isSafeInteger(v.now))
          setClock({ serverMs: v.now, receivedAt: performance.now() });
      } catch {
        if (active) setClock(null);
      }
      if (active) timer = setTimeout(sync, 30000);
    }
    void sync();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  const [receiptCheck, setReceiptCheck] = useState("");
  const [spot, setSpot] = useState<Spot | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function poll() {
      if (document.visibilityState !== "hidden") {
        try {
          const r = await fetch("/api/spot", {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!r.ok) throw Error();
          const value = await r.json();
          if (active) setSpot(value);
        } catch {
          if (active) setSpot(null);
        }
      }
      if (active) timer = setTimeout(poll, 5000);
    }
    let timer: ReturnType<typeof setTimeout>;
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
  const [session, setSession] = useState<Session | null>(null),
    [state, setState] = useState<IndexState | null>(null),
    [live, setLive] = useState<LiveState | null>(null),
    [records, setRecords] = useState<Operation[]>([]);
  const [account, setAccount] = useState(""),
    [accounts, setAccounts] = useState<string[]>([]),
    [walletInfo, setWalletInfo] = useState<{ id: string; name: string } | null>(
      null,
    ),
    [connecting, setConnecting] = useState(""),
    [connectionError, setConnectionError] = useState(""),
    [loading, setLoading] = useState(true),
    [lastChecked, setLastChecked] = useState<number | null>(null),
    [checkedAtMono, setCheckedAtMono] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice] = useState(""),
    [picker, setPicker] = useState(false),
    [verification, setVerification] = useState(false),
    [verificationError, setVerificationError] = useState(""),
    [verifiedAccount, setVerifiedAccount] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [attempted, setAttempted] = useState(false),
    [reviewError, setReviewError] = useState("");
  const connector = useRef<NearConnector | null>(null),
    wallet = useRef<Wallet | null>(null),
    selected = useRef(""),
    revision = useRef(0),
    busyRef = useRef(false),
    generation = useRef(0),
    sessionRef = useRef<Session | null>(null),
    mounted = useRef(true);
  const lock = (value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  };
  const selectAccount = useCallback((value: string) => {
    revision.current++;
    selected.current = value;
    setAccount(value);
    setVerifiedAccount("");
    setLive(null);
    setRecords([]);
    setReceiptCheck("");
    setPreview(null);
    setError("");
  }, []);
  function persist(id: string, phase: string) {
    const s = sessionRef.current;
    if (!s) throw Error("DEPLOYMENT_NOT_CONFIGURED");
    const key = `hedgeveil:${s.genesis_hash}:${s.contract_id}:operations`;
    try {
      const values = JSON.parse(localStorage.getItem(key) ?? "{}");
      values[id] = phase;
      localStorage.setItem(key, JSON.stringify(values));
      if (JSON.parse(localStorage.getItem(key) ?? "{}")[id] !== phase)
        throw Error();
    } catch {
      throw Error("BROWSER_STORAGE_UNAVAILABLE");
    }
  }
  const refresh = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    const id = selected.current,
      run = ++generation.current;
    setLoading(true);
    if (s.auth_required && id) {
      try {
        const access = await api<{ account: string | null }>("auth/session");
        if (selected.current !== id || run !== generation.current) return;
        setVerifiedAccount(access.account === id ? id : "");
        if (access.account !== id) setVerification(true);
      } catch {
        /* Protected endpoints independently fail closed. */
      }
    }
    const results = await Promise.allSettled([
      api<IndexState>("state"),
      ...(id && s.configured
        ? [
            api<LiveState>("live?account=" + encodeURIComponent(id)),
            api<{ items: Operation[] }>("operations"),
          ]
        : []),
    ]);
    if (
      !mounted.current ||
      run !== generation.current ||
      id !== selected.current
    )
      return;
    setState(
      results[0].status === "fulfilled"
        ? (results[0].value as IndexState)
        : null,
    );
    if (id && s.configured) {
      setLive(
        results[1].status === "fulfilled"
          ? (results[1].value as LiveState)
          : null,
      );
      setRecords((previous) =>
        results[2].status === "fulfilled"
          ? (results[2].value as { items: Operation[] }).items.filter(
              (r) => r.intent.signer_id === id,
            )
          : previous,
      );
    }
    setCheckedAtMono(performance.now());
    setLastChecked(results[0].status === "fulfilled" ? Date.now() : null);
    const failure = results.find((r) => r.status === "rejected");
    setError(failure?.status === "rejected" ? message(failure.reason) : "");
    setLoading(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let created: NearConnector | null = null;
    async function init() {
      try {
        const s = await api<Session>("session");
        if (!active) return;
        if (!s.wallet || s.network !== "testnet")
          throw Error("NETWORK_DISABLED");
        sessionRef.current = s;
        setSession(s);
        const { NearConnector } = await import("@hot-labs/near-connect");
        if (!active) return;
        const c = new NearConnector({
          network: "testnet",
          autoConnect: false,
          manifest: s.manifest,
          cspNonce: nonce,
          footerBranding: null,
          features: {
            testnet: true,
            signInWithoutAddKey: true,
            signAndSendTransaction: true,
          },
          storage: {
            get: async (k) =>
              localStorage.getItem("hedgeveil:testnet:connect:" + k),
            set: async (k, v) =>
              localStorage.setItem("hedgeveil:testnet:connect:" + k, v),
            remove: async (k) =>
              localStorage.removeItem("hedgeveil:testnet:connect:" + k),
          },
        });
        created = c;
        connector.current = c;
        const accept = (w: Wallet, ids: string[]) => {
          if (!active) return;
          if (
            !s.manifest.wallets.includes(w.manifest) ||
            w.manifest.type !== "sandbox"
          )
            throw Error("WALLET_CHANGED");
          const valid = [
            ...new Set(ids.map((id) => validateAccount(id) as string)),
          ];
          if (!valid.length) throw Error("WALLET_ACCOUNT");
          wallet.current = w;
          setWalletInfo({ id: w.manifest.id, name: w.manifest.name });
          setAccounts(valid);
          selectAccount(valid.length === 1 ? valid[0] : "");
        };
        c.on("wallet:signIn", ({ wallet: w, accounts: a }) => {
          try {
            accept(
              w,
              a.map((x) => x.accountId),
            );
          } catch {
            wallet.current = null;
            setWalletInfo(null);
            setAccounts([]);
            selectAccount("");
            setError(message(Error("WALLET_CONNECTION_FAILED")));
          }
        });
        c.on("wallet:signOut", () => {
          wallet.current = null;
          setWalletInfo(null);
          setAccounts([]);
          selectAccount("");
        });
        try {
          const connected = await c.getConnectedWallet();
          accept(
            connected.wallet,
            connected.accounts.map((a) => a.accountId),
          );
        } catch {
          /* Explicit connection remains available. */
        }
        const u = new URL(location.href);
        if (!s.auth_required && u.searchParams.has("hv_operation")) {
          const id = u.searchParams.get("hv_operation")!;
          history.replaceState(null, "", location.pathname);
          try {
            const hint = walletReturn(u.href, id);
            await api("remember-hash", { id, hash: hint.hash });
            const result = await api<ReceiptResult>("recover", { id });
            transactionToast(id, result, hint.hash);
          } catch {
            transactionToast(id, { state: "UNKNOWN" });
          }
        }
        await refresh();
      } catch {
        if (active) {
          setLoading(false);
          setError(
            "The wallet service is unavailable. Start or reconnect the local backend, then reload this page.",
          );
        }
      }
    }
    void init();
    return () => {
      active = false;
      mounted.current = false;
      generation.current++;
      created?.removeAllListeners();
    };
  }, [nonce, refresh, selectAccount]);
  useEffect(() => {
    if (session) void refresh();
  }, [account, session, refresh]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (active && document.visibilityState !== "hidden" && !busyRef.current)
        await refresh();
      if (active) timer = setTimeout(tick, 30000);
    }
    timer = setTimeout(tick, 30000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const reviewOpen = useRef(false);
  reviewOpen.current = !!preview;
  useEffect(() => {
    let active = true,
      timer: ReturnType<typeof setTimeout>,
      cursor = 0;
    async function poll() {
      if (
        active &&
        account &&
        document.visibilityState !== "hidden" &&
        !busyRef.current &&
        !reviewOpen.current
      ) {
        const waiting = recordsRef.current.filter(
          (r) =>
            r.intent.signer_id === account &&
            r.attempted &&
            !terminalState(r.result?.state),
        );
        if (waiting.length) {
          const r = waiting[cursor++ % waiting.length];
          try {
            const result = await api<ReceiptResult>("recover", {
              id: r.intent.operation_id,
            });
            if (active && selected.current === account) {
              transactionToast(r.intent.operation_id, result, r.hash);
              setReceiptCheck("Receipts checked automatically.");
              await refresh();
            }
          } catch {
            if (active)
              setReceiptCheck(
                "Automatic receipt check unavailable. Retry from Advanced when the service returns.",
              );
          }
        }
      }
      if (active) timer = setTimeout(poll, 15000);
    }
    if (account) timer = setTimeout(poll, 15000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [account, refresh]);
  useEffect(() => {
    const request = () => {
      if (selected.current && sessionRef.current?.auth_required)
        setVerification(true);
    };
    window.addEventListener("hedgeveil:verify-wallet", request);
    return () => window.removeEventListener("hedgeveil:verify-wallet", request);
  }, []);
  // Keep wallet-return evidence in the URL until the authenticated owner can retain it.
  const returnBusy = useRef(false);
  useEffect(() => {
    if (
      !session?.auth_required ||
      !account ||
      verifiedAccount !== account ||
      returnBusy.current
    )
      return;
    const u = new URL(location.href),
      id = u.searchParams.get("hv_operation");
    if (!id) return;
    returnBusy.current = true;
    void (async () => {
      try {
        const hint = walletReturn(u.href, id);
        await api("remember-hash", { id, hash: hint.hash });
        history.replaceState(null, "", location.pathname);
        const result = await api<ReceiptResult>("recover", { id });
        transactionToast(id, result, hint.hash);
        await refresh();
      } catch (e) {
        setError(message(e));
      } finally {
        returnBusy.current = false;
      }
    })();
  }, [account, verifiedAccount, session, refresh]);
  async function verifyWallet() {
    if (busyRef.current || !wallet.current || !selected.current) return;
    const id = selected.current,
      w = wallet.current,
      before = revision.current;
    lock(true);
    setVerificationError("");
    try {
      const challenge = await api<{
        message: string;
        recipient: string;
        nonce: number[];
      }>("auth/challenge", { account: id });
      if (before !== revision.current) throw Error("WALLET_CHANGED");
      const signed = await w.signMessage({
        ...challenge,
        nonce: new Uint8Array(challenge.nonce),
      });
      if (before !== revision.current || signed?.accountId !== id)
        throw Error("WALLET_CHANGED");
      await api("auth/verify", signed);
      setVerifiedAccount(id);
      setVerification(false);
      await refresh();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setVerificationError(
        code === "WALLET_CHANGED"
          ? "Your account changed. Reconnect the account you want to verify."
          : code === "RATE_LIMITED"
            ? "Too many sign-in attempts. Wait a minute, then try again."
            : "Wallet verification didn’t finish. Try again and approve the sign-in message in your wallet.",
      );
    } finally {
      lock(false);
    }
  }
  async function connect(id: string) {
    if (busyRef.current || !connector.current) return;
    setPicker(false);
    setConnecting(
      sessionRef.current?.manifest.wallets.find((w) => w.id === id)?.name ??
        "your wallet",
    );
    setConnectionError("");
    lock(true);
    setError("");
    try {
      const c = connector.current;
      const w = await c.wallet(id);
      if (
        !sessionRef.current?.manifest.wallets.includes(w.manifest) ||
        w.manifest.type !== "sandbox"
      )
        throw Error();
      await c.connect({ walletId: id });
      const a = await w.getAccounts({ network: "testnet" });
      const valid = [
        ...new Set(a.map((x) => validateAccount(x.accountId) as string)),
      ];
      if (!valid.length) throw Error("WALLET_ACCOUNT");
      wallet.current = w;
      setWalletInfo({ id: w.manifest.id, name: w.manifest.name });
      setAccounts(valid);
      lock(false);
      selectAccount(valid.length === 1 ? valid[0] : "");
    } catch {
      wallet.current = null;
      setWalletInfo(null);
      setAccounts([]);
      selectAccount("");
      setConnectionError(
        "Connection wasn’t completed. Try your wallet again, or choose another.",
      );
      errorToast(
        "Wallet connection was not completed. Try again or choose another wallet.",
      );
      setPicker(true);
    } finally {
      setConnecting("");
      lock(false);
    }
  }
  async function disconnect() {
    if (busyRef.current) return;
    const old = wallet.current;
    wallet.current = null;
    setWalletInfo(null);
    selectAccount("");
    setAccounts([]);
    lock(true);
    try {
      if (sessionRef.current?.auth_required) await api("auth/logout", {});
      setVerification(false);
      localStorage.removeItem("hedgeveil:testnet:connect:selected-wallet");
      if (old) await connector.current?.disconnect(old);
    } catch {
      setError(
        "Disconnected locally. The wallet could not confirm its sign-out.",
      );
    } finally {
      lock(false);
    }
  }
  async function review(input: ActionInput) {
    if (busyRef.current) throw Error("WALLET_CHANGED");
    if (!selected.current || !wallet.current || !session?.configured)
      throw Error("WALLET_ACCOUNT");
    lock(true);
    const before = revision.current;
    setError("");
    try {
      const id =
        input.operation_id ??
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
      persist(id, "preparing");
      const p = await api<Preview>("prepare", {
        ...input,
        operation_id: id,
        signer_id: selected.current,
      });
      if (before !== revision.current) throw Error("WALLET_CHANGED");
      persist(id, "prepared");
      setAttempted(false);
      setReviewError("");
      setPreview(p);
    } finally {
      lock(false);
    }
  }
  async function recover(id: string, hash?: string) {
    if (busyRef.current) return;
    lock(true);
    try {
      const result = await api<ReceiptResult>("recover", {
        id,
        ...(hash ? { hash } : {}),
      });
      transactionToast(
        id,
        result,
        hash ?? records.find((r) => r.intent.operation_id === id)?.hash,
      );
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      lock(false);
    }
  }
  async function submit() {
    if (!preview || busyRef.current || attempted || preview.blockers.length)
      return;
    lock(true);
    setAttempted(true);
    const id = preview.intent.operation_id,
      before = revision.current;
    let submittedHash: string | undefined;
    transactionToast(id, { state: "PENDING" });
    try {
      persist(id, "attempting");
      const request = await api<SignRequest>("handoff", { id });
      if (
        before !== revision.current ||
        request.signerId !== selected.current ||
        !connector.current
      )
        throw Error("WALLET_CHANGED");
      const sign = nearConnectSigner({
        connector: connector.current,
        selected: () => ({
          wallet: wallet.current?.manifest.id,
          account: selected.current,
        }),
        allowedWallets: session!.manifest.wallets.map((w) => w.id),
        returnUrl: location.origin + location.pathname + location.search,
      });
      const result = await sign(request, async (hash: string) => {
        submittedHash = hash;
        transactionToast(id, { state: "PENDING", hash });
        await api("remember-hash", { id, hash });
      });
      if (result && "hash" in result && result.hash) {
        submittedHash = result.hash;
        transactionToast(id, { state: "PENDING", hash: result.hash });
        await api("remember-hash", { id, hash: result.hash });
      }
      const receipt = await api<ReceiptResult>("recover", { id });
      transactionToast(id, receipt, submittedHash);
      setPreview(null);
      await refresh();
    } catch (e) {
      transactionToast(id, { state: "UNKNOWN" }, submittedHash);
      setReviewError(
        message(e) + " The outcome needs verification; do not resend.",
      );
    } finally {
      lock(false);
    }
  }
  async function closeReview() {
    if (busyRef.current) return;
    if (!preview) return;
    if (attempted) {
      setPreview(null);
      void refresh();
      return;
    }
    lock(true);
    try {
      await api("cancel", { id: preview.intent.operation_id });
      persist(preview.intent.operation_id, "cancelled");
      setPreview(null);
      void refresh();
    } catch (e) {
      setReviewError(message(e));
      errorToast(message(e));
    } finally {
      lock(false);
    }
  }
  const snapshot = state?.items.find(
    (x) => x.contract === session?.contract_id,
  )?.body;
  const series = live?.series ?? snapshot?.series ?? [];
  const ready = !!account && !!live && !!session?.configured;
  return (
    <Desk.Provider
      value={{
        clock,
        spot,
        session,
        state,
        live,
        records,
        series,
        account,
        accounts,
        walletInfo,
        connecting,
        loading,
        lastChecked,
        checkedAtMono,
        receiptCheck,
        busy,
        error,
        notice,
        ready,
        connect: () => {
          if (!busyRef.current) {
            setConnectionError("");
            setPicker(true);
          }
        },
        disconnect,
        selectAccount,
        refresh,
        review,
        recover,
        setError,
      }}
    >
      {children}
      {verification && account && session?.auth_required && (
        <Modal
          className="wallet-dialog wallet-verification"
          title="Verify your wallet"
          locked={busy}
          onClose={() => {
            if (!busy) setVerification(false);
          }}
        >
          <p className="wallet-intro">
            Confirm this account is yours to access your activity and trade.
          </p>
          <div className="verification-account">
            <span>Account</span>
            <strong>{account}</strong>
          </div>
          <p className="verification-note">
            A free sign-in message. No gas, transfers or access keys.
          </p>
          {verificationError && (
            <p className="wallet-error" role="alert">
              {verificationError}
            </p>
          )}
          <button
            type="button"
            className="desk-button lime verification-action"
            aria-busy={busy}
            disabled={busy}
            onClick={() => void verifyWallet()}
          >
            {busy ? (
              <>
                <Spinner /> Waiting for your wallet…
              </>
            ) : verificationError ? (
              "Try verification again"
            ) : (
              "Verify wallet"
            )}
          </button>
        </Modal>
      )}
      {picker && (
        <Modal
          className="wallet-dialog"
          title="Connect your wallet"
          onClose={() => setPicker(false)}
        >
          <p className="wallet-intro">Your wallet. Your positions.</p>
          <div className="wallet-network">
            <span className="status-dot good" /> NEAR <span>Testnet</span>
          </div>
          {connectionError && (
            <p className="wallet-error" role="alert">
              {connectionError}
            </p>
          )}
          <div className="wallet-choices">
            {session?.manifest.wallets.map((w) => (
              <button
                key={w.id}
                aria-label={w.name}
                disabled={busy}
                onClick={() => void connect(w.id)}
              >
                <WalletLogo id={w.id} />
                <span>
                  <strong>{w.name}</strong>
                  <small>
                    {w.id === "meteor-wallet"
                      ? "Browser extension or web wallet"
                      : "Connect with your web wallet"}
                  </small>
                </span>
                <span className="wallet-choice-action" aria-hidden="true">
                  Connect
                </span>
              </button>
            ))}
          </div>
          <p className="wallet-footnote">
            You approve every transaction in your wallet.
          </p>
          <div className="wallet-provider">Powered by NEAR Connect</div>
        </Modal>
      )}
      {preview && (
        <Modal
          title="Review your action"
          onClose={() => void closeReview()}
          locked={busy}
        >
          <p className="desk-label">{actionName(preview.intent.method)}</p>
          <dl className="desk-facts">
            <div>
              <dt>Account</dt>
              <dd>{preview.intent.signer_id}</dd>
            </div>
            <div>
              <dt>Attached NEAR</dt>
              <dd>{formatNear(preview.intent.attached_deposit)}</dd>
            </div>
            {preview.intent.storage_deposit && (
              <>
                <div>
                  <dt>Trading funds</dt>
                  <dd>
                    {formatNear(
                      String(
                        BigInt(preview.intent.attached_deposit) -
                          BigInt(preview.intent.storage_deposit),
                      ),
                    )}{" "}
                    NEAR
                  </dd>
                </div>
                <div>
                  <dt>Account storage</dt>
                  <dd>{formatNear(preview.intent.storage_deposit)} NEAR</dd>
                </div>
              </>
            )}
            <div>
              <dt>Gas allowance</dt>
              <dd>{formatNear(preview.gas_allowance)} NEAR</dd>
            </div>
          </dl>
          <h3>You pay</h3>
          <LegList legs={preview.required} />
          {preview.intent.method === "request_withdrawal" && (
            <dl className="desk-facts">
              <div>
                <dt>Receiving account</dt>
                <dd>{String(preview.intent.args.receiver)}</dd>
              </div>
              <div>
                <dt>Withdrawal amount</dt>
                <dd>{formatNear(String(preview.intent.args.amount))} NEAR</dd>
              </div>
            </dl>
          )}
          <h3>Expected app balance changes</h3>
          <LegList legs={preview.outputs} />
          <p className="desk-muted">
            Gas is charged separately; actual charge varies. A review is not a
            receipt.
          </p>
          {preview.blockers.map((code) => (
            <p className="desk-alert" key={code}>
              {message(Error(code))}
            </p>
          ))}
          {reviewError && (
            <p className="desk-alert" role="alert">
              {reviewError}
            </p>
          )}
          <details className="desk-details">
            <summary>Contract and exact amounts</summary>
            <pre>{JSON.stringify(preview, null, 2)}</pre>
          </details>
          <div className="desk-actions">
            <button
              className="desk-button"
              disabled={busy}
              onClick={() => void closeReview()}
            >
              {attempted ? "Close" : "Cancel"}
            </button>
            <button
              className="desk-button lime"
              disabled={busy || attempted || !!preview.blockers.length}
              onClick={() => void submit()}
            >
              {busy && <Spinner />}
              {busy ? "Waiting…" : "Continue in wallet"}
            </button>
          </div>
        </Modal>
      )}
    </Desk.Provider>
  );
}
