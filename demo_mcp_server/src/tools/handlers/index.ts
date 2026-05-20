import { executeGetMyAccounts, executeGetAccountBalance, executeGetSensitiveAccountDetails } from './accountHandlers';
import { executeGetMyTransactions, executeCreateDeposit, executeCreateWithdrawal, executeCreateTransfer } from './transactionHandlers';
import { executeQueryUserByEmail } from './identityHandlers';
import { executeSequentialThink } from './reasoningHandlers';
import {
  executeLookupCustomer,
  executeGetCustomerProfile,
  executeGetCustomerAccounts,
  executeGetCustomerTransactions,
  executeFreezeAccount,
  executeResetCustomerPassword,
  executeAdjustBalance,
  executeDeleteCustomer,
} from '../adminToolHandlers';
import type { HandlerFn } from './types';

export const handlerMap: Record<string, HandlerFn> = {
  executeGetMyAccounts,
  executeGetAccountBalance,
  executeGetMyTransactions,
  executeCreateDeposit,
  executeCreateWithdrawal,
  executeCreateTransfer,
  executeQueryUserByEmail,
  executeGetSensitiveAccountDetails,
  executeSequentialThink,
  executeLookupCustomer,
  executeGetCustomerProfile,
  executeGetCustomerAccounts,
  executeGetCustomerTransactions,
  executeFreezeAccount,
  executeResetCustomerPassword,
  executeAdjustBalance,
  executeDeleteCustomer,
};

export type { HandlerFn, HandlerDeps } from './types';
