// DCA Agent Service
//
// This service is responsible for executing DCA swaps using MetaMask delegation.
// It fetches due agents from the backend indexer and executes swaps using
// sendTransactionWithDelegation.
//
// Usage:
//   npm run trigger   - Trigger execution of all due agents (one-time)
//
// The trigger can be called by:
// - A cron job (external)
// - A serverless function (AWS Lambda, Vercel, etc.)
// - Manual execution for testing

export { executeDCASwap, reportExecution } from "./executor.js";
