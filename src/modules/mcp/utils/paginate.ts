/**
 * MCP Module — Portable Pagination Helper
 *
 * Standardized pagination metadata shared by all MCP list tools.
 *
 * PORTABLE LAYER — no imports from src/lib/freedcamp/ or any app code.
 * This module is framework-agnostic and must stay that way.
 */

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/**
 * Build pagination metadata from the total record count, requested page,
 * and page size.
 */
export function paginate(total: number, page: number, pageSize: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}