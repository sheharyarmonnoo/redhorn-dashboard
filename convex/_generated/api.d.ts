/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actionItems from "../actionItems.js";
import type * as activityLog from "../activityLog.js";
import type * as agingRecords from "../agingRecords.js";
import type * as alerts from "../alerts.js";
import type * as deals from "../deals.js";
import type * as delinquentCases from "../delinquentCases.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as incomeLines from "../incomeLines.js";
import type * as monthlyRevenue from "../monthlyRevenue.js";
import type * as properties from "../properties.js";
import type * as seed from "../seed.js";
import type * as syncJobs from "../syncJobs.js";
import type * as tenants from "../tenants.js";
import type * as unitNotes from "../unitNotes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actionItems: typeof actionItems;
  activityLog: typeof activityLog;
  agingRecords: typeof agingRecords;
  alerts: typeof alerts;
  deals: typeof deals;
  delinquentCases: typeof delinquentCases;
  files: typeof files;
  http: typeof http;
  incomeLines: typeof incomeLines;
  monthlyRevenue: typeof monthlyRevenue;
  properties: typeof properties;
  seed: typeof seed;
  syncJobs: typeof syncJobs;
  tenants: typeof tenants;
  unitNotes: typeof unitNotes;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
