import { EventEmitter } from "events";

export interface TxEvent {
  timestamp: Date;
  intent: string;
  provider: string;
  serviceId: string;
  url: string;
  method: string;
  amount: number | null;
  savedVsNext: number | null;
  status: "success" | "payment_error" | "service_error";
  latencyMs: number;
  responsePreview?: string;
}

const MAX_LOG = 1000;

export class PaymentTracker extends EventEmitter {
  private log: TxEvent[] = [];
  private totalSpent = 0;
  private totalSaved = 0;
  private budget: number | null = null;

  record(event: TxEvent) {
    this.log.push(event);
    if (this.log.length > MAX_LOG) {
      this.log.shift();
    }

    if (event.amount != null && event.status === "success") {
      this.totalSpent += event.amount;
    }
    if (event.savedVsNext != null && event.savedVsNext > 0) {
      this.totalSaved += event.savedVsNext;
    }

    this.emit("transaction", event);
  }

  getTotalSpent(): number {
    return this.totalSpent;
  }

  getTotalSaved(): number {
    return this.totalSaved;
  }

  getTransactionCount(): number {
    return this.log.length;
  }

  getTransactions(limit?: number): TxEvent[] {
    if (limit) {
      return this.log.slice(-limit);
    }
    return [...this.log];
  }

  setBudget(max: number) {
    this.budget = max;
  }

  isOverBudget(): boolean {
    if (this.budget === null) return false;
    return this.totalSpent >= this.budget;
  }

  getRemainingBudget(): number | null {
    if (this.budget === null) return null;
    return Math.max(0, this.budget - this.totalSpent);
  }

  getSavingsPercent(): number {
    const wouldHaveSpent = this.totalSpent + this.totalSaved;
    if (wouldHaveSpent === 0) return 0;
    return (this.totalSaved / wouldHaveSpent) * 100;
  }
}
