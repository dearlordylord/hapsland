import Base

# Exact Astra-approved supporting reflexivity statement.
law bool_reflexive:
  for +flag: Bool
  {flag == flag : Bool}

def bool_reflexive(flag):
  {==}
