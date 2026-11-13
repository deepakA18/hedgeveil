"use client";
import { useEffect } from "react";
import { Toast } from "@base-ui/react/toast";
import { explorerUrl } from "../../lib/market-display";
import {
  receiptFeedback,
  type ReceiptResult,
} from "../../lib/operation-feedback";

type ToastData = { hash?: string; recovery?: boolean };
const manager = Toast.createToastManager<ToastData>();
const seen = new Map<string, string>();
export function transactionToast(
  id: string,
  result: ReceiptResult,
  hash?: string,
) {
  const feedback = receiptFeedback(result);
  const tx = result.hash ?? hash;
  const signature = `${result.state}:${tx ?? ""}`;
  if (seen.get(id) === signature) return;
  seen.set(id, signature);
  manager.add({
    id,
    ...feedback,
    data: { hash: tx, recovery: feedback.type === "warning" },
  });
}
export function errorToast(description: string) {
  manager.add({
    id: "action-error",
    title: "Action unavailable",
    description,
    type: "error",
    timeout: 10000,
  });
}
export function Spinner() {
  return <span className="desk-spinner" aria-hidden="true" />;
}
function Notifications() {
  const { toasts } = Toast.useToastManager<ToastData>();
  return (
    <Toast.Portal>
      <Toast.Viewport className="desk-toasts" aria-label="Notifications">
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className="desk-toast"
            data-kind={toast.type}
          >
            <Toast.Content>
              <Toast.Title className="desk-toast-title">
                {toast.type === "loading" && <Spinner />}
                {toast.title}
              </Toast.Title>
              <Toast.Description className="desk-toast-description" />
              <div className="desk-toast-links">
                {toast.data?.hash && explorerUrl(toast.data.hash) && (
                  <a
                    href={explorerUrl(toast.data.hash)!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction
                  </a>
                )}
                {toast.data?.recovery && (
                  <a href="/activity">Recover in Activity</a>
                )}
              </div>
            </Toast.Content>
            <Toast.Close
              className="desk-toast-close"
              aria-label="Dismiss notification"
            >
              ×
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
export function Feedback({
  error,
  notice,
  processing,
}: {
  error: string;
  notice: string;
  processing: string;
}) {
  useEffect(() => {
    if (error)
      manager.add({
        id: "desk-error",
        title: "Action unavailable",
        description: error,
        type: "error",
        timeout: 10000,
      });
  }, [error]);
  useEffect(() => {
    if (notice)
      manager.add({
        id: "desk-notice",
        title: notice,
        type: "info",
        timeout: 8000,
      });
  }, [notice]);
  return (
    <Toast.Provider toastManager={manager} limit={4}>
      <Notifications />
      {processing && (
        <div className="desk-processing" role="status">
          <Spinner />
          {processing}
        </div>
      )}
    </Toast.Provider>
  );
}
