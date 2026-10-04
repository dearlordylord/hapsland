# Concrete configuration agreement checks, not universally quantified product laws.
# The independently authored conformance literals must match the maintained game input.
import Base
import ./DefenseConsumer.bend as Consumer
import ./DefenseConsumerConformance.bend as Fixture
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
law config_matches_fixture:
  {Consumer.config() == Fixture.consumer_config() : T.Config}
law seed_matches_fixture:
  {Consumer.seed() == Fixture.consumer_seed() : Nat}
def config_matches_fixture(): {==}
def seed_matches_fixture(): {==}
