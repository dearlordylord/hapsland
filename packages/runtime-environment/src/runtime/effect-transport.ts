/** Failure shared by Bend effect consumers; dispatch and lifecycle stay with their owners. */
export class TransportFailure extends Error {
  constructor(public code: string) {
    super("Bend effect transport: " + code)
  }
}
