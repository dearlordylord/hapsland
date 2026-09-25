#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ptrace.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

extern char **environ;

typedef struct {
  pid_t pid;
  uint64_t started_ns;
  long long launch_at;
  int active;
} ChildStart;

static uint64_t monotonic_ns(void) {
  struct timespec value;
  if (clock_gettime(CLOCK_MONOTONIC, &value) != 0) return 0;
  return (uint64_t)value.tv_sec * 1000000000ULL + (uint64_t)value.tv_nsec;
}

static long long wall_ms(void) {
  struct timespec value;
  if (clock_gettime(CLOCK_REALTIME, &value) != 0) return -1;
  return (long long)value.tv_sec * 1000LL + (long long)value.tv_nsec / 1000000LL;
}

static int read_command_line(pid_t pid, char *buffer, size_t capacity) {
  char path[64];
  int length = snprintf(path, sizeof(path), "/proc/%ld/cmdline", (long)pid);
  if (length < 0 || (size_t)length >= sizeof(path)) return 0;
  int fd = open(path, O_RDONLY | O_CLOEXEC);
  if (fd < 0) return 0;
  ssize_t count = read(fd, buffer, capacity - 1);
  close(fd);
  if (count <= 0) return 0;
  buffer[count] = '\0';
  return (int)count;
}

static int command_matches(pid_t pid, const char *target, const char *mode) {
  char line[16384];
  int length = read_command_line(pid, line, sizeof(line));
  if (length == 0) return 0;
  int has_target = 0;
  int has_mode = 0;
  for (int offset = 0; offset < length;) {
    char *arg = line + offset;
    size_t size = strlen(arg);
    if (strstr(arg, target) != NULL) has_target = 1;
    if (strcmp(arg, mode) == 0) has_mode = 1;
    char *found = strstr(arg, target);
    if (found != NULL && strstr(found + strlen(target), mode) != NULL) has_mode = 1;
    offset += (int)size + 1;
  }
  return has_target && has_mode;
}

static void remember_child(ChildStart *children, size_t capacity, pid_t pid,
                           uint64_t started_ns, long long launch_at) {
  for (size_t index = 0; index < capacity; index++) {
    if (!children[index].active) {
      children[index] = (ChildStart){ pid, started_ns, launch_at, 1 };
      return;
    }
  }
}

static ChildStart *find_child(ChildStart *children, size_t capacity, pid_t pid) {
  for (size_t index = 0; index < capacity; index++) {
    if (children[index].active && children[index].pid == pid) return &children[index];
  }
  return NULL;
}

static void forget_child(ChildStart *children, size_t capacity, pid_t pid) {
  ChildStart *child = find_child(children, capacity, pid);
  if (child != NULL) child->active = 0;
}

static void record_window(const char *events_path, const char *mode,
                          long long launch_at, long long returned_at,
                          uint64_t elapsed_us, int exit_code, int signal_number) {
  int fd = open(events_path, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0600);
  if (fd < 0) return;
  char record[384];
  int length = snprintf(record, sizeof(record),
    "{\"kind\":\"host-command-window\",\"mode\":\"%s\",\"launchAt\":%lld,\"at\":%lld,\"elapsedUs\":%llu,\"exitCode\":%d,\"signal\":%d}\n",
    mode, launch_at, returned_at, (unsigned long long)elapsed_us, exit_code, signal_number);
  if (length > 0 && (size_t)length < sizeof(record)) (void)write(fd, record, (size_t)length);
  (void)close(fd);
}

int main(int argc, char **argv) {
  if (argc < 6 || strcmp(argv[3], "--") != 0) return 125;
  const char *target = argv[1];
  const char *events_path = argv[2];
  const char *codex = argv[4];
  const size_t child_capacity = 16384;
  ChildStart *children = calloc(child_capacity, sizeof(ChildStart));
  if (children == NULL) return 125;

  pid_t root = fork();
  if (root < 0) { free(children); return 125; }
  if (root == 0) {
    if (ptrace(PTRACE_TRACEME, 0, 0, 0) != 0) _exit(125);
    raise(SIGSTOP);
    execvpe(codex, &argv[4], environ);
    _exit(127);
  }

  int status = 0;
  if (waitpid(root, &status, 0) < 0 || !WIFSTOPPED(status)) { free(children); return 125; }
  const char *run_started_value = getenv("HAPSLAND_PROBE_STARTED_AT_MS");
  const long long run_started_at = run_started_value == NULL ? 0 : atoll(run_started_value);
  const long options = PTRACE_O_TRACEFORK | PTRACE_O_TRACEVFORK | PTRACE_O_TRACECLONE |
    PTRACE_O_TRACEEXEC;
  if (ptrace(PTRACE_SETOPTIONS, root, 0, (void *)options) != 0) { free(children); return 125; }
  (void)ptrace(PTRACE_CONT, root, 0, 0);

  pid_t command_pid = -1;
  const char *command_mode = NULL;
  uint64_t command_started = 0;
  long long command_launch_at = -1;
  int root_exit = 0;
  int root_signal = 0;
  int root_finished = 0;

  while (!root_finished) {
    pid_t pid = waitpid(-1, &status, __WALL);
    if (pid < 0) {
      if (errno == EINTR) continue;
      if (errno == ECHILD) break;
      continue;
    }
    if (WIFEXITED(status) || WIFSIGNALED(status)) {
      forget_child(children, child_capacity, pid);
      if (pid == command_pid) {
      const uint64_t ended = monotonic_ns();
      const int exit_code = WIFEXITED(status) ? WEXITSTATUS(status) : -1;
      const int signal_number = WIFSIGNALED(status) ? WTERMSIG(status) : 0;
      const uint64_t elapsed_us = ended >= command_started ? (ended - command_started) / 1000ULL : 0;
        record_window(events_path, command_mode, command_launch_at, wall_ms() - run_started_at, elapsed_us,
          exit_code, signal_number);
        command_pid = -1;
        command_mode = NULL;
      }
      if (pid == root) {
        root_finished = 1;
        root_exit = WIFEXITED(status) ? WEXITSTATUS(status) : 128;
        root_signal = WIFSIGNALED(status) ? WTERMSIG(status) : 0;
      }
      continue;
    }
    if (!WIFSTOPPED(status)) continue;

    const unsigned event = (unsigned)status >> 16;
    if (event == PTRACE_EVENT_FORK || event == PTRACE_EVENT_VFORK || event == PTRACE_EVENT_CLONE) {
      unsigned long child = 0;
      if (ptrace(PTRACE_GETEVENTMSG, pid, 0, &child) == 0 && child > 0) {
        remember_child(children, child_capacity, (pid_t)child, monotonic_ns(), wall_ms() - run_started_at);
      }
    } else if (event == PTRACE_EVENT_EXEC && command_pid < 0) {
      if (command_matches(pid, target, "stop")) {
        command_pid = pid;
        command_mode = "stop";
      } else if (command_matches(pid, target, "post-tool")) {
        command_pid = pid;
        command_mode = "post-tool";
      }
      if (command_pid == pid) {
        ChildStart *child = find_child(children, child_capacity, pid);
        command_started = child == NULL ? monotonic_ns() : child->started_ns;
        command_launch_at = child == NULL ? wall_ms() - run_started_at : child->launch_at;
      }
    }
    int signal_number = WSTOPSIG(status);
    if (event != 0 || signal_number == SIGSTOP || signal_number == SIGTRAP) signal_number = 0;
    (void)ptrace(PTRACE_CONT, pid, 0, (void *)(long)signal_number);
  }

  free(children);
  if (root_signal != 0) return 128 + root_signal;
  return root_exit;
}
