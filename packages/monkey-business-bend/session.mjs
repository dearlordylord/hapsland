import Engine from "./engine.mjs";
export default {
 initial: Engine.session_initial, next: Engine.session_next, sample_delay: Engine.session_delay,
 finish_state: Engine.session_finish,
 on_finish: (config, state, continuation) => Engine.session_next(config, Engine.session_finish(state, continuation)),
 on_advice: Engine.session_advice,
 transition_state: transition => transition.state,
 transition_events: transition => transition.events,
 state_generation: Engine.session_generation,
 set_interval: Engine.session_interval, rewind: Engine.session_rewind,
 sizes: Engine.session_sizes, suspend: Engine.session_suspend, burst: Engine.session_burst,
};
