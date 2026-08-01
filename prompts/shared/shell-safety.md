# Shell Command Safety

- Keep terminal commands short and inspectable. Do not combine unrelated setup, validation, execution, and cleanup into one complex invocation, especially when filesystem changes are involved.
- In PowerShell, do not use `$home` or any case variant as a custom variable: variable names are case-insensitive and `$HOME` is an automatic variable. Use a specific, purpose-named variable instead.
- Treat recursive or batch deletion as a fail-closed operation. Prefer an exact literal target. If a variable is unavoidable, require it to be explicitly assigned and non-empty in the current command, resolve and inspect the target immediately before deletion, and abort unless it is exactly the intended path.
- Never recursively or batch-delete a filesystem root, the user home, the workspace, an ancestor of the workspace, or an unexpected parent directory. Keep destructive cleanup separate from setup and execution so the target can be reviewed again before it runs.
