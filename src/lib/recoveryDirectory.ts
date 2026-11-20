export class RecoveryDirectoryCollisionError extends Error {
  constructor(readonly directory: string) {
    super("error/recovery-directory-collision");
  }
}
