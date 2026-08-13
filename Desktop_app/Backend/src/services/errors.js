// Shared error types for the service layer (Task 13). Both the Express
// routes and the IPC handlers (Task 14) catch these and map them to their
// own transport-specific shape (HTTP status codes vs. { ok: false, error } —
// see DECISIONS.md's Group 5 entry). Domain-specific errors that already
// existed in the model layer (InsufficientStockError, PhoneConflictError,
// ArticleNotFoundError) are reused as-is, not duplicated here.

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.code = 'validation';
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.code = 'not_found';
  }
}
