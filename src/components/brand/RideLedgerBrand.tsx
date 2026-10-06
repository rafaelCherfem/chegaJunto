import { cn } from "@/lib/utils";

export function RideLedgerBrand({ className }: { className?: string }) {
  return (
    <span className={cn("rideledger-brand wordmark", className)}>
      <svg
        viewBox="0 0 32 32"
        className="rideledger-brand__mark"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M5 26h6a5 5 0 0 0 5-5v-6a5 5 0 0 1 5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="5" cy="26" r="2" fill="currentColor" />
        <path
          d="M25 17c-1.5-2-5-5-5-8a5 5 0 1 1 10 0c0 3-3.5 6-5 8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="25" cy="9" r="1.5" fill="currentColor" />
      </svg>
      <span className="rideledger-brand__name">
        Ride<span>Ledger</span>
      </span>
    </span>
  );
}
