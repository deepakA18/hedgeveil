export function WalletLogo({ id }: { id: string }) {
  const src =
    id === "meteor-wallet"
      ? "/wallets/meteor.svg"
      : id === "intear-wallet"
        ? "/wallets/intear.svg"
        : null;
  return src ? (
    <img className="wallet-logo" src={src} width={40} height={40} alt="" />
  ) : (
    <span className="wallet-logo wallet-logo-fallback" aria-hidden="true">
      W
    </span>
  );
}
