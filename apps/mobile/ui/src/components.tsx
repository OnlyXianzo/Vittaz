import type { Dispatch, ReactNode } from "react";
import { Bell, ChevronLeft, ChevronRight } from "lucide-react";
import type { Action, Transaction } from "./types";
import { formatPaise } from "./money";

export type DispatchAction = Dispatch<Action>;

export function Avatar({
  transaction,
  size = 44,
}: {
  transaction: Transaction;
  size?: number;
}) {
  return (
    <span
      className="lg"
      style={{
        background: transaction.color,
        color: transaction.textColor ?? "#fff",
        width: size,
        height: size,
        borderRadius: size >= 56 ? 18 : 14,
      }}
      aria-hidden="true"
    >
      {transaction.title.charAt(0).toUpperCase()}
    </span>
  );
}

export function StatusPill({ transaction }: { transaction: Transaction }) {
  if (transaction.status === "user_confirmed") return null;
  return <span className="u">Unverified</span>;
}

export function TransactionRow({
  transaction,
  onClick,
  showStatus = true,
}: {
  transaction: Transaction;
  onClick?: () => void;
  showStatus?: boolean;
}) {
  const amount = `${transaction.direction === "received" ? "+" : ""}${formatPaise(transaction.amountPaise)}`;
  const body = (
    <>
      <div className="row" style={{ gap: 12, justifyContent: "flex-start" }}>
        <Avatar transaction={transaction} />
        <div>
          <div className="b" style={{ fontSize: 15 }}>
            {transaction.title}
          </div>
          <div className="m" style={{ fontSize: 12 }}>
            {[transaction.category, transaction.mode, transaction.time]
              .filter(Boolean)
              .join(", ")}
          </div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div
          className="b"
          style={
            transaction.direction === "received"
              ? { color: "var(--lime)" }
              : undefined
          }
        >
          {amount}
        </div>
        {showStatus && <StatusPill transaction={transaction} />}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button className="row txn-row" onClick={onClick} type="button">
        {body}
      </button>
    );
  }
  return <div className="row txn-row">{body}</div>;
}

export function PageHeader({
  title,
  onBack,
  right,
  large = false,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  large?: boolean;
}) {
  return (
    <div className="row" style={{ height: 44 }}>
      <div className="row" style={{ gap: 6, justifyContent: "flex-start" }}>
        {onBack && (
          <button
            className="ic"
            aria-label="Back"
            onClick={onBack}
            type="button"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <h1
          className={large ? "page-title" : "h"}
          style={{ margin: 0 }}
          tabIndex={-1}
        >
          {title}
        </h1>
      </div>
      {right}
    </div>
  );
}

export function Toast({
  message,
  onDone,
}: {
  message: string;
  onDone: () => void;
}) {
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      <button aria-label="Dismiss" onClick={onDone} type="button">
        ×
      </button>
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  className = "",
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      className={`ic ${className}`}
      aria-label={label}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function NotificationsButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Notifications" onClick={onClick}>
      <Bell size={22} />
    </IconButton>
  );
}

export function SettingRow({
  title,
  subtitle,
  right,
  onClick,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div style={{ flex: 1 }}>
        <div className="b" style={{ fontSize: 15 }}>
          {title}
        </div>
        <div
          className="m"
          style={{ fontSize: 12, marginTop: 2, lineHeight: 1.35 }}
        >
          {subtitle}
        </div>
      </div>
      {right}
      {onClick && <ChevronRight size={18} color="#6f866c" aria-hidden="true" />}
    </>
  );
  if (onClick) {
    return (
      <button className="mr setting-button" onClick={onClick} type="button">
        {content}
      </button>
    );
  }
  return <div className="mr">{content}</div>;
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      className={`sw ${checked ? "on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      type="button"
    >
      <i />
    </button>
  );
}
