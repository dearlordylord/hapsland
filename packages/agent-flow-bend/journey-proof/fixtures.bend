import Base
import ../Canonical.bend as Canonical
import ../Admission.bend as Admission
import ../CollectionState.bend as CollectionState
import ../Dispatch.bend as Dispatch
import ../Ledger.bend as Ledger
import ../EditHistory.bend as EditHistory
import ../Handoff.bend as Handoff
import ../Delivery.bend as Delivery
import ../DeliveryState.bend as DeliveryState
import ../SubmissionState.bend as SubmissionState
import ../RevisionState.bend as RevisionState
import ../ReuseState.bend as ReuseState
import ../NoticeState.bend as NoticeState

# Expected snapshots of one actual checked journey; no transition implementation.
def initial(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.initial(limits),
    Nil{},
    Nil{},
    1n,
    1n,
    Nil{},
    Dispatch.State{Nil{}, Nil{}, 0n, False{}, Nil{}},
    CollectionState.initial(),
    EditHistory.initial()
  }

def permitted(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.initial(limits),
    Nil{},
    Nil{},
    1n,
    1n,
    Admission.AdmissionState{
      (1n + partition : Nat),
      1n,
      0n,
      False{},
      0n,
      2n,
      Admission.Permit{1n, 1n, 1n, 1n, 10n} <> Nil{}
    } <> Nil{},
    Dispatch.State{Nil{}, Nil{}, 0n, False{}, Nil{}},
    CollectionState.initial(),
    EditHistory.initial()
  }

def accepted(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.initial(limits),
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Nil{},
    2n,
    1n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{Nil{}, Nil{}, 0n, False{}, Nil{}},
    CollectionState.initial(),
    EditHistory.initial()
  }

def admitted(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.initial(limits),
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{
      (1n + partition : Nat),
      1n,
      1n,
      1n,
      0n,
      Canonical.AwaitingSourceRead{},
      0n
    } <> Nil{},
    2n,
    2n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{Nil{}, Nil{}, 0n, False{}, Nil{}},
    CollectionState.initial(),
    EditHistory.initial()
  }

def queued_source(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.initial(limits),
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{
      (1n + partition : Nat),
      1n,
      1n,
      1n,
      0n,
      Canonical.AwaitingSourceRead{},
      0n
    } <> Nil{},
    2n,
    2n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{
      Nil{},
      Dispatch.Entry{(1n + partition : Nat), 1n, 1n, 1n, 0n, False{}, True{}} <> Nil{},
      1n,
      False{},
      Nil{}
    },
    CollectionState.initial(),
    EditHistory.initial()
  }

def reading(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.initial(limits),
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{(1n + partition : Nat), 1n, 1n, 1n, 0n, Canonical.SourceReading{}, 0n} <> Nil{},
    2n,
    2n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{
      Nil{},
      Dispatch.Entry{(1n + partition : Nat), 1n, 1n, 1n, 0n, False{}, True{}} <> Nil{},
      1n,
      False{},
      Nil{}
    },
    CollectionState.initial(),
    EditHistory.initial()
  }

def preparing(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      2n,
      Ledger.Charge{1n, (1n + partition : Nat), (1n + size : Nat), Ledger.Preparation{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{
      (1n + partition : Nat),
      1n,
      1n,
      1n,
      0n,
      Canonical.SourceReading{},
      0n
    } <> Canonical.Work{(1n + partition : Nat), 1n, 1n, 2n, 1n, Canonical.Preparing{}, 1n} <> Nil{},
    2n,
    3n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{
      Nil{},
      Dispatch.Entry{(1n + partition : Nat), 1n, 1n, 1n, 0n, False{}, True{}} <> Nil{},
      1n,
      False{},
      Nil{}
    },
    CollectionState.initial(),
    EditHistory.initial()
  }

def prepared(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.ReviewUnit{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{
      (1n + partition : Nat),
      1n,
      1n,
      1n,
      0n,
      Canonical.SourceReading{},
      0n
    } <> Canonical.Work{(1n + partition : Nat), 1n, 1n, 3n, 2n, Canonical.Reviewing{}, 1n} <> Nil{},
    2n,
    4n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{
      Nil{},
      Dispatch.Entry{(1n + partition : Nat), 1n, 1n, 1n, 0n, False{}, True{}} <> Nil{},
      1n,
      False{},
      Nil{}
    },
    CollectionState.initial(),
    EditHistory.initial()
  }

def source_done(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.ReviewUnit{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{(1n + partition : Nat), 1n, 1n, 3n, 2n, Canonical.Reviewing{}, 1n} <> Nil{},
    2n,
    4n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{
      Nil{},
      Dispatch.Entry{(1n + partition : Nat), 1n, 1n, 1n, 0n, False{}, True{}} <> Nil{},
      1n,
      False{},
      Nil{}
    },
    CollectionState.initial(),
    EditHistory.initial()
  }

def source_settled(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.ReviewUnit{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{(1n + partition : Nat), 1n, 1n, 3n, 2n, Canonical.Reviewing{}, 1n} <> Nil{},
    2n,
    4n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{Nil{}, Nil{}, 1n, False{}, Nil{}},
    CollectionState.initial(),
    EditHistory.initial()
  }

def queued_review(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.ReviewUnit{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{(1n + partition : Nat), 1n, 1n, 3n, 2n, Canonical.Reviewing{}, 1n} <> Nil{},
    2n,
    4n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{
      Nil{},
      Dispatch.Entry{(1n + partition : Nat), 1n, 1n, 3n, 1n, False{}, False{}} <> Nil{},
      2n,
      False{},
      Nil{}
    },
    CollectionState.initial(),
    EditHistory.initial()
  }

def request_ready(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.ReviewUnit{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{(1n + partition : Nat), 1n, 1n, 3n, 2n, Canonical.AtJev{}, 1n} <> Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{
      Nil{},
      Dispatch.Entry{(1n + partition : Nat), 1n, 1n, 3n, 1n, False{}, False{}} <> Nil{},
      2n,
      False{},
      Dispatch.Request{(1n + partition : Nat), 1n, 1n, 3n, 4n, False{}, False{}} <> Nil{}
    },
    CollectionState.initial(),
    EditHistory.initial()
  }

def request_started(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.ReviewUnit{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{(1n + partition : Nat), 1n, 1n, 3n, 2n, Canonical.AtJev{}, 1n} <> Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{
      Nil{},
      Dispatch.Entry{(1n + partition : Nat), 1n, 1n, 3n, 1n, False{}, False{}} <> Nil{},
      2n,
      False{},
      Dispatch.Request{(1n + partition : Nat), 1n, 1n, 3n, 4n, True{}, False{}} <> Nil{}
    },
    CollectionState.initial(),
    EditHistory.initial()
  }

def request_interrupted(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.ReviewUnit{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{(1n + partition : Nat), 1n, 1n, 3n, 2n, Canonical.AtJev{}, 1n} <> Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{
      Nil{},
      Dispatch.Entry{(1n + partition : Nat), 1n, 1n, 3n, 1n, False{}, False{}} <> Nil{},
      2n,
      False{},
      Dispatch.Request{(1n + partition : Nat), 1n, 1n, 3n, 4n, True{}, True{}} <> Nil{}
    },
    CollectionState.initial(),
    EditHistory.initial()
  }

def finding(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.StoredResult{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      2n,
      Canonical.PendingFinding{1n},
      1n
    } <> Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{
      Nil{},
      Dispatch.Entry{(1n + partition : Nat), 1n, 1n, 3n, 1n, False{}, False{}} <> Nil{},
      2n,
      False{},
      Nil{}
    },
    CollectionState.initial(),
    EditHistory.initial()
  }

def nonfinding(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{limits, 3n, Nil{}},
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{
      Nil{},
      Dispatch.Entry{(1n + partition : Nat), 1n, 1n, 3n, 1n, False{}, False{}} <> Nil{},
      2n,
      False{},
      Nil{}
    },
    CollectionState.initial(),
    EditHistory.initial()
  }

def resolved_nonfinding(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{limits, 3n, Nil{}},
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{Nil{}, Nil{}, 2n, False{}, Nil{}},
    CollectionState.initial(),
    EditHistory.initial()
  }

def resolved_finding(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.StoredResult{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      2n,
      Canonical.PendingFinding{1n},
      1n
    } <> Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{Nil{}, Nil{}, 2n, False{}, Nil{}},
    CollectionState.initial(),
    EditHistory.initial()
  }

def collectible(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.StoredResult{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      2n,
      Canonical.PendingFinding{1n},
      1n
    } <> Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{Nil{}, Nil{}, 2n, False{}, Nil{}},
    CollectionState.State{
      3n <> Nil{},
      Nil{},
      Nil{},
      DeliveryState.initial(),
      RevisionState.initial(),
      ReuseState.initial(),
      NoticeState.initial()
    },
    EditHistory.initial()
  }

def leased(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.StoredResult{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      2n,
      Canonical.PendingFinding{1n},
      1n
    } <> Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{Nil{}, Nil{}, 2n, False{}, Nil{}},
    CollectionState.State{
      3n <> Nil{},
      CollectionState.Lease{3n, 1n} <> Nil{},
      Nil{},
      DeliveryState.initial(),
      RevisionState.initial(),
      ReuseState.initial(),
      NoticeState.initial()
    },
    EditHistory.initial()
  }

def offered(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.StoredResult{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      2n,
      Canonical.PendingFinding{1n},
      1n
    } <> Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{Nil{}, Nil{}, 2n, False{}, Nil{}},
    CollectionState.State{
      3n <> Nil{},
      CollectionState.Lease{3n, 1n} <> Nil{},
      Nil{},
      DeliveryState.State{
        Nil{},
        Nil{},
        SubmissionState.State{
          SubmissionState.LeaseRecord{
            3n,
            (1n + fingerprint : Nat),
            Handoff.Lease{
              (1n + fingerprint : Nat),
              1n,
              False{},
              False{},
              Handoff.Reserved{1n, Handoff.Edit{}}
            },
            None{}
          } <> Nil{},
          SubmissionState.Batch{
            3n,
            (1n + partition : Nat),
            1n,
            1n,
            Handoff.Edit{},
            Delivery.Reserved{},
            (1n + fingerprint : Nat) <> Nil{},
            3n <> Nil{}
          } <> Nil{}
        }
      },
      RevisionState.initial(),
      ReuseState.initial(),
      NoticeState.initial()
    },
    EditHistory.initial()
  }

def authorized(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.StoredResult{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      2n,
      Canonical.PendingFinding{1n},
      1n
    } <> Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{Nil{}, Nil{}, 2n, False{}, Nil{}},
    CollectionState.State{
      3n <> Nil{},
      CollectionState.Lease{3n, 1n} <> Nil{},
      Nil{},
      DeliveryState.State{
        Nil{},
        Nil{},
        SubmissionState.State{
          SubmissionState.LeaseRecord{
            3n,
            (1n + fingerprint : Nat),
            Handoff.Lease{
              (1n + fingerprint : Nat),
              1n,
              False{},
              False{},
              Handoff.Authorized{1n, Handoff.Edit{}}
            },
            None{}
          } <> Nil{},
          SubmissionState.Batch{
            3n,
            (1n + partition : Nat),
            1n,
            1n,
            Handoff.Edit{},
            Delivery.Authorized{},
            (1n + fingerprint : Nat) <> Nil{},
            3n <> Nil{}
          } <> Nil{}
        }
      },
      RevisionState.initial(),
      ReuseState.initial(),
      NoticeState.initial()
    },
    EditHistory.initial()
  }

def submitted(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.StoredResult{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      2n,
      Canonical.PendingFinding{1n},
      1n
    } <> Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{Nil{}, Nil{}, 2n, False{}, Nil{}},
    CollectionState.State{
      3n <> Nil{},
      CollectionState.Lease{3n, 1n} <> Nil{},
      Nil{},
      DeliveryState.State{
        Nil{},
        Nil{},
        SubmissionState.State{
          SubmissionState.LeaseRecord{
            3n,
            (1n + fingerprint : Nat),
            Handoff.Lease{
              (1n + fingerprint : Nat),
              1n,
              False{},
              False{},
              Handoff.Submitted{Handoff.Edit{}}
            },
            None{}
          } <> Nil{},
          SubmissionState.Batch{
            3n,
            (1n + partition : Nat),
            1n,
            1n,
            Handoff.Edit{},
            Delivery.Submitted{},
            (1n + fingerprint : Nat) <> Nil{},
            3n <> Nil{}
          } <> Nil{}
        }
      },
      RevisionState.initial(),
      ReuseState.initial(),
      NoticeState.initial()
    },
    EditHistory.initial()
  }

def final_finding(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> Canonical.State:
  Canonical.State{
    Ledger.Ledger{
      limits,
      3n,
      Ledger.Charge{2n, (1n + partition : Nat), (1n + size : Nat), Ledger.StoredResult{}} <> Nil{}
    },
    Canonical.Round{
      (1n + partition : Nat),
      1n,
      1n,
      False{},
      False{},
      None{},
      False{},
      None{}
    } <> Nil{},
    Canonical.Work{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      2n,
      Canonical.PendingFinding{1n},
      1n
    } <> Nil{},
    2n,
    5n,
    Admission.AdmissionState{(1n + partition : Nat), 1n, 1n, True{}, 0n, 2n, Nil{}} <> Nil{},
    Dispatch.State{Nil{}, Nil{}, 2n, False{}, Nil{}},
    CollectionState.State{
      3n <> Nil{},
      Nil{},
      Nil{},
      DeliveryState.State{
        Nil{},
        Nil{},
        SubmissionState.State{
          SubmissionState.LeaseRecord{
            3n,
            (1n + fingerprint : Nat),
            Handoff.Lease{
              (1n + fingerprint : Nat),
              1n,
              False{},
              False{},
              Handoff.Submitted{Handoff.Edit{}}
            },
            None{}
          } <> Nil{},
          SubmissionState.Batch{
            3n,
            (1n + partition : Nat),
            1n,
            1n,
            Handoff.Edit{},
            Delivery.Submitted{},
            (1n + fingerprint : Nat) <> Nil{},
            3n <> Nil{}
          } <> Nil{}
        }
      },
      RevisionState.initial(),
      ReuseState.initial(),
      NoticeState.initial()
    },
    EditHistory.initial()
  }

