module security_test {
  import security.* from "./security"

  run queuedExclusionTest =
    init
      .then(grant(0))
      .then(observe(0, 0, 0, true))
      .then(prepare(0))
      .then(enqueue(0))
      .then(configureStrict)
      .then(dispatchAttempt(0))
      .expect(s.jobs.get(0).phase == Denied and
        s.effects.exists(e => e.kind == SourceRead) and
        not(s.effects.exists(e => e.kind == ProviderSend)))

  run revokedConsentTest =
    init
      .then(grant(0))
      .then(observe(0, 0, 0, true))
      .then(prepare(0))
      .then(enqueue(0))
      .then(revoke(0))
      .then(dispatchAttempt(0))
      .expect(s.jobs.get(0).phase == Denied and
        not(s.effects.exists(e => e.kind == ProviderSend)))

  run excludedBeforeReadTest =
    init
      .then(grant(0))
      .then(observe(0, 0, 1, true))
      .then(prepare(0))
      .expect(s.jobs.get(0).phase == Rejected and s.effects == Set())

  run unsupportedExtractionTest =
    init
      .then(grant(0))
      .then(observe(0, 0, 0, false))
      .then(prepare(0))
      .expect(s.jobs.get(0).phase == Rejected and
        not(s.effects.exists(e => e.kind == ProviderSend)))

  run successfulDispatchTest =
    init
      .then(grant(0))
      .then(observe(0, 0, 0, true))
      .then(prepare(0))
      .then(enqueue(0))
      .then(dispatchAttempt(0))
      .then(providerOutcome(0))
      .expect(s.jobs.get(0).phase == Done and
        s.effects.exists(e => e.kind == ProviderSend and
          e.fragments == Set(0, 1) and e.destination == 0) and
        s.effects.exists(e => e.kind == MetadataWrite and e.fragments == Set()))

  run crossRepositoryConsentTest =
    init
      .then(grant(0))
      .then(observe(1, 1, 0, true))
      .then(prepare(1))
      .then(enqueue(1))
      .then(dispatchAttempt(1))
      .expect(s.jobs.get(1).phase == Denied and
        not(s.effects.exists(e => e.kind == ProviderSend)))

  run wrongDestinationTest =
    init
      .then(grant(0))
      .then(observe(0, 0, 0, true))
      .then(prepare(0))
      .then(enqueue(0))
      .then(chooseDestination(0, 1))
      .then(dispatchAttempt(0))
      .expect(s.jobs.get(0).phase == Denied and
        not(s.effects.exists(e => e.kind == ProviderSend)))

  run removedCredentialTest =
    init
      .then(grant(0))
      .then(observe(0, 0, 0, true))
      .then(prepare(0))
      .then(enqueue(0))
      .then(removeCredential)
      .then(dispatchAttempt(0))
      .expect(s.jobs.get(0).phase == Denied and
        not(s.effects.exists(e => e.kind == ProviderSend)))
}
