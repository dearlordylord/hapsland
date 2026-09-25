#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static uint64_t monotonic_ns(void) {
  struct timespec value;
  if (clock_gettime(CLOCK_MONOTONIC, &value) != 0) return 0;
  return (uint64_t)value.tv_sec * 1000000000ULL + (uint64_t)value.tv_nsec;
}

int main(int argc, char **argv) {
  const int post_tool = argc > 1 && strcmp(argv[1], "post-tool") == 0;
  const uint64_t started = monotonic_ns();
  const char *node = getenv("HAPSLAND_NODE_BINARY");
  const char *script = post_tool ? getenv("HAPSLAND_CLI") : getenv("HAPSLAND_STOP_HOOK_SCRIPT");
  const char *events = getenv("HAPSLAND_PROBE_EVENTS");
  if (node == NULL || script == NULL || events == NULL) return 0;
  struct timespec wall_started;
  const long long started_wall_ms = clock_gettime(CLOCK_REALTIME, &wall_started) == 0
    ? (long long)wall_started.tv_sec * 1000LL + (long long)wall_started.tv_nsec / 1000000LL
    : -1;

  pid_t child = fork();
  if (child == 0) {
    if (post_tool) {
      execl(node, node, "--experimental-strip-types", script,
        "--codex-hook", "--controlled-writer", "--controlled", "--codex-version=0.155.1", (char *)NULL);
    } else {
      execl(node, node, "--experimental-strip-types", script, (char *)NULL);
    }
    _exit(127);
  }
  int status = 255;
  if (child > 0) {
    while (waitpid(child, &status, 0) < 0 && errno == EINTR) {}
  }
  const uint64_t ended = monotonic_ns();
  const uint64_t elapsed_us = ended >= started ? (ended - started) / 1000ULL : 0;
  struct timespec wall;
  long long at_ms = -1;
  long long entry_at_ms = -1;
  const char *run_started = getenv("HAPSLAND_PROBE_STARTED_AT_MS");
  if (clock_gettime(CLOCK_REALTIME, &wall) == 0 && run_started != NULL) {
    at_ms = (long long)wall.tv_sec * 1000LL + (long long)wall.tv_nsec / 1000000LL - atoll(run_started);
    if (started_wall_ms >= 0) entry_at_ms = started_wall_ms - atoll(run_started);
  }
  const int fd = open(events, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0600);
  if (fd >= 0) {
    char record[320];
    int exit_code = WIFEXITED(status) ? WEXITSTATUS(status) : -1;
    int signal_number = WIFSIGNALED(status) ? WTERMSIG(status) : 0;
    int length = snprintf(record, sizeof(record),
      "{\"kind\":\"%s-command-return\",\"entryAt\":%lld,\"at\":%lld,\"elapsedUs\":%llu,\"exitCode\":%d,\"signal\":%d}\n",
      post_tool ? "post-tool" : "stop", entry_at_ms, at_ms, (unsigned long long)elapsed_us, exit_code, signal_number);
    if (length > 0 && (size_t)length < sizeof(record)) (void)write(fd, record, (size_t)length);
    (void)close(fd);
  }
  return child > 0 && WIFEXITED(status) ? WEXITSTATUS(status) : 0;
}
