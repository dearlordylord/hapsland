import Base
import ./WorkspaceSizingLaws.bend as Laws
import ./WorkspaceSizing.bend as Workspace

# Bound only after actual emitted independent differential and raw-fault chronology pass.

def Laws.capture_entry_exact():
  {==}

def Laws.analysis_entry_exact():
  {==}

def Laws.capture_recipe_exact():
  {==}

def Laws.analysis_recipe_exact():
  {==}

def Laws.next_empty_exact(result):
  {==}

def Laws.next_nonempty_exact(operation, remaining, result):
  {==}

def Laws.branch_true_exact(primitive, arguments, yes, no, remaining, result):
  {==}

def Laws.branch_false_exact(primitive, arguments, yes, no, remaining, result):
  {==}

def Laws.branch_rejects_ack(primitive, arguments, yes, no, remaining, result):
  {==}

def Laws.done_refuses(result, reply):
  {==}

def Laws.rejected_refuses(reply):
  {==}

def Laws.constant_ack_exact(target, value, remaining, result):
  {==}

def Laws.constant_rejects_flag(target, value, flag, remaining, result):
  {==}

def Laws.optional_ack_exact(target, source, field, remaining, result):
  {==}

def Laws.optional_rejects_flag(target, source, field, flag, remaining, result):
  {==}

def Laws.call_ack_exact(target, primitive, arguments, remaining, result):
  {==}

def Laws.call_rejects_flag(target, primitive, arguments, flag, remaining, result):
  {==}

def Laws.invalid_source_refuses(remaining, result, reply):
  {==}

def main() -> IO(Unit):
  IO.print("Workspace sizing laws bound")
