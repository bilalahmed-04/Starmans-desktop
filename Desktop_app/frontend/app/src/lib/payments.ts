import { callIpc } from '@/lib/api';
import type { Payment } from '@/types';

export function getPayments(): Promise<Payment[]> {
  return callIpc<Payment[]>(window.api.payments.list());
}

export interface CreatePaymentPayload {
  clientName: string;
  clientPhone: string;
  method: 'Cash' | 'Cheque' | 'Online' | 'Slip';
  amount: number;
  desc?: string;
  chequeDate?: string;
}

export function createPayment(payload: CreatePaymentPayload): Promise<Payment> {
  return callIpc<Payment>(window.api.payments.create(payload));
}
