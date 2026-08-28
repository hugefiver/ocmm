export function throwAfterCleanup(primaryError, cleanupErrors, message) {
  if (primaryError === undefined) {
    if (cleanupErrors.length === 0) return;
    throw new AggregateError(cleanupErrors, message);
  }
  if (cleanupErrors.length === 0) throw primaryError;
  throw new AggregateError([primaryError, ...cleanupErrors], message, { cause: primaryError });
}
