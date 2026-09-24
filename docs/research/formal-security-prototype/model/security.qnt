// Throwaway finite authorization model for the proposed Hapsland prototype contract.
// IDs: repositories 0/1; path 0 eligible at revision 0, path 1 excluded;
// revision 1 excludes both. Fragments: 0 root, 1 reachable reference,
// 2 unrelated. Destination 0 is the approved Jev endpoint, 1 is wrong.
module security {
  type Phase = Idle | Observed | Prepared | Queued | Sent | Denied | Done | Rejected
  type EffectKind = SourceRead | ProviderSend | MetadataWrite
  type Job = {
    phase: Phase,
    repo: int,
    path: int,
    supported: bool,
    capturedRev: int,
    allowed: Set[int],
    destination: int,
  }
  type Effect = {
    kind: EffectKind,
    job: int,
    repo: int,
    path: int,
    fragments: Set[int],
    destination: int,
    policyRev: int,
    consent: bool,
    credential: bool,
    supported: bool,
  }
  type State = {
    policyRev: int,
    consent: int -> bool,
    credential: bool,
    jobs: int -> Job,
    effects: Set[Effect],
  }
  var s: State

  pure val repos = Set(0, 1)
  pure val jobIds = Set(0, 1)
  pure val permittedFragments = Set(0, 1)
  pure def eligible(rev: int, path: int): bool = rev == 0 and path == 0
  pure val idleJob: Job = {
    phase: Idle, repo: 0, path: 0, supported: true, capturedRev: 0,
    allowed: Set(), destination: 0,
  }
  pure def event(kind: EffectKind, id: int, j: Job, st: State, fragments: Set[int]): Effect = {
    kind: kind, job: id, repo: j.repo, path: j.path,
    fragments: fragments, destination: j.destination, policyRev: st.policyRev,
    consent: st.consent.get(j.repo), credential: st.credential,
    supported: j.supported,
  }
  pure def canDispatch(st: State, j: Job): bool = and {
    j.phase == Queued,
    repos.contains(j.repo),
    eligible(st.policyRev, j.path),
    j.supported,
    j.allowed == permittedFragments,
    st.consent.get(j.repo),
    st.credential,
    j.destination == 0,
  }

  action init: bool =
    s' = {
      policyRev: 0,
      consent: repos.mapBy(_ => false),
      credential: true,
      jobs: jobIds.mapBy(_ => idleJob),
      effects: Set(),
    }

  action configureStrict: bool = all {
    s.policyRev == 0,
    s' = { ...s, policyRev: 1 },
  }
  action grant(repo: int): bool = all {
    repos.contains(repo),
    s' = { ...s, consent: s.consent.put(repo, true) },
  }
  action revoke(repo: int): bool = all {
    repos.contains(repo),
    s' = { ...s, consent: s.consent.put(repo, false) },
  }
  action removeCredential: bool = s' = { ...s, credential: false }
  // Models a destination change or misrouting after preparation.
  action chooseDestination(id: int, destination: int): bool = {
    val j = s.jobs.get(id)
    all {
      jobIds.contains(id), Set(0, 1).contains(destination),
      j.phase == Prepared or j.phase == Queued,
      s' = { ...s, jobs: s.jobs.put(id, { ...j, destination: destination }) },
    }
  }

  // Observation records host metadata only. Host patch bytes are outside this model.
  action observe(id: int, repo: int, path: int, supported: bool): bool = all {
    jobIds.contains(id), repos.contains(repo), Set(0, 1).contains(path),
    s.jobs.get(id).phase == Idle,
    s' = { ...s, jobs: s.jobs.put(id, {
      ...s.jobs.get(id), phase: Observed, repo: repo, path: path,
      supported: supported,
    }) },
  }
  // A denied candidate completes without an effect; an eligible candidate is read.
  action prepare(id: int): bool = {
    val j = s.jobs.get(id)
    all {
      jobIds.contains(id), j.phase == Observed,
      s' = if (eligible(s.policyRev, j.path))
        { ...s,
          jobs: s.jobs.put(id, { ...j,
            phase: if (j.supported) Prepared else Rejected,
            capturedRev: s.policyRev,
            allowed: if (j.supported) permittedFragments else Set(),
          }),
          effects: s.effects.union(Set(event(SourceRead, id, j, s, Set()))),
        }
      else
        { ...s, jobs: s.jobs.put(id, { ...j, phase: Rejected }) },
    }
  }
  action enqueue(id: int): bool = {
    val j = s.jobs.get(id)
    all {
      jobIds.contains(id), j.phase == Prepared,
      s' = { ...s, jobs: s.jobs.put(id, { ...j, phase: Queued }) },
    }
  }
  // Authority is read at this atomic transition, after a completed config/consent update.
  // The journal captures the same state used for the dispatch decision.
  action dispatchAttempt(id: int): bool = {
    val j = s.jobs.get(id)
    all {
      jobIds.contains(id), j.phase == Queued,
      s' = if (canDispatch(s, j))
        { ...s,
          jobs: s.jobs.put(id, { ...j, phase: Sent }),
          effects: s.effects.union(Set(event(ProviderSend, id, j, s, j.allowed))),
        }
      else
        { ...s, jobs: s.jobs.put(id, { ...j, phase: Denied }) },
    }
  }
  action providerOutcome(id: int): bool = {
    val j = s.jobs.get(id)
    all {
      jobIds.contains(id), j.phase == Sent,
      s' = { ...s, jobs: s.jobs.put(id, { ...j, phase: Done }),
        effects: s.effects.union(Set(event(MetadataWrite, id, j, s, Set()))) },
    }
  }
  action collect(id: int): bool = {
    val j = s.jobs.get(id)
    all {
      jobIds.contains(id), Set(Done, Denied, Rejected).contains(j.phase),
      s' = { ...s, jobs: s.jobs.put(id, idleJob) },
    }
  }
  action restart: bool = s' = { ...s, jobs: jobIds.mapBy(_ => idleJob) }

  // Named wrappers make the mandatory queued-policy trace replayable from ITF
  // without guessing parameters from state differences.
  action grantRepo0: bool = grant(0)
  action observeAllowedRepo0Job0: bool = observe(0, 0, 0, true)
  action prepareJob0: bool = prepare(0)
  action enqueueJob0: bool = enqueue(0)
  action dispatchJob0: bool = dispatchAttempt(0)

  action step: bool = any {
    configureStrict,
    grantRepo0, grant(1), revoke(0), revoke(1), removeCredential,
    chooseDestination(0, 1), chooseDestination(1, 1),
    observeAllowedRepo0Job0, observe(0, 0, 1, true),
    observe(0, 1, 0, true), observe(0, 0, 0, false),
    observe(1, 1, 0, true), observe(1, 1, 1, true),
    prepareJob0, prepare(1), enqueueJob0, enqueue(1),
    dispatchJob0, dispatchAttempt(1),
    providerOutcome(0), providerOutcome(1),
    collect(0), collect(1), restart,
  }

  // A narrow action set for connector replay and positive effect coverage.
  // The general `step` above remains the broader security sampler.
  action replayStep: bool = any {
    grantRepo0, observeAllowedRepo0Job0, prepareJob0, enqueueJob0,
    dispatchJob0, configureStrict,
  }

  // These inspect observed effects, not merely job phases.
  val secRead: bool = s.effects.forall(e =>
    e.kind != SourceRead or eligible(e.policyRev, e.path))
  val secFragments: bool = s.effects.forall(e =>
    e.kind != ProviderSend or e.fragments == permittedFragments)
  val secFailClosed: bool = s.effects.forall(e =>
    e.kind != ProviderSend or e.supported)
  val secWire: bool = s.effects.forall(e =>
    e.kind != ProviderSend or e.destination == 0)
  val secAuthority: bool = s.effects.forall(e =>
    e.kind != ProviderSend or and {
      eligible(e.policyRev, e.path), e.consent, e.credential,
      e.destination == 0,
    })
  val secSinks: bool = s.effects.forall(e =>
    e.kind != MetadataWrite or e.fragments == Set())
  val security: bool = and {
    secRead, secFragments, secFailClosed, secWire, secAuthority, secSinks,
  }
  val sentWitness: bool = s.effects.exists(e => e.kind == ProviderSend)
  val deniedWitness: bool = s.jobs.keys().exists(id => s.jobs.get(id).phase == Denied)
}
