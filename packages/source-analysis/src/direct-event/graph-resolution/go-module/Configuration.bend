import Base
import ./RawText.bend as Raw

# Raw Go analysis configuration shared by input transport and preparation.
# Validation and snapshot policy remain in BuildContext.
type Configuration is Data:
  Configuration{goos: String, goarch: String, tags: List<&2, Raw.Text>}

def main() -> Unit:
  Unit{}
