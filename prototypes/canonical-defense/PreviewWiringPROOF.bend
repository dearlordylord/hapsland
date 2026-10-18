# Approved preview boundary laws.
import Base
import ./PreviewWiringLAWS.bend as Laws

def Laws.render_annotations(world, choice, tower, rest): {==}
def Laws.scene_consumes_preview(world, preview, rest): {==}
def Laws.body_position(key, x, y): {==}

def Laws.coverage_uses_source_world(world, choice, tower): {==}
def Laws.live_entity_position(actor, world, rest): {==}
def Laws.every_live_entity_drawn(actor, tail, world, rest): {==}

def Laws.beam_tracks_current_body(fx, fy, oldX, oldY, before, after, ttl, point, tail, rest): {==}
