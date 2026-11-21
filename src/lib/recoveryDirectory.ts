export class RecoveryDirectoryCollisionError extends Error {
  constructor(
    readonly directory: string,
    readonly canRelease = true,
  ) {
    super("error/recovery-directory-collision");
  }
}
