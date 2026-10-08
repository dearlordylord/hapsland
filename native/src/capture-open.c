#define _DARWIN_C_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#define MAX_SOURCE_BYTES 2097152

/* Source-free closed failure protocol; no pathname or strerror is emitted. */
static int refuse(const char *code) {
  fprintf(stderr, "%s\n", code);
  return 72;
}

static int unavailable(void) {
  if (errno == ENOENT) return refuse("missing");
  if (errno == EACCES || errno == EPERM) return refuse("access");
  if (errno == ELOOP || errno == ENOTDIR) return refuse("file-kind");
  return refuse("io");
}

static int matches_identity(int fd, const char *device, const char *inode) {
  if (strcmp(device, "-") == 0 && strcmp(inode, "-") == 0) return 1;
  struct stat status;
  if (fstat(fd, &status) != 0) return -1;
  return (uint64_t)status.st_dev == strtoull(device, NULL, 10) &&
    (uint64_t)status.st_ino == strtoull(inode, NULL, 10);
}

static int same_stat(const struct stat *left, const struct stat *right) {
  return left->st_dev == right->st_dev && left->st_ino == right->st_ino &&
    left->st_mode == right->st_mode && left->st_size == right->st_size &&
    left->st_mtimespec.tv_sec == right->st_mtimespec.tv_sec &&
    left->st_mtimespec.tv_nsec == right->st_mtimespec.tv_nsec &&
    left->st_ctimespec.tv_sec == right->st_ctimespec.tv_sec &&
    left->st_ctimespec.tv_nsec == right->st_ctimespec.tv_nsec;
}

int main(int argc, char **argv) {
  if (argc != 9) return refuse("budget-argument");
  if (argv[8][0] == '\0') return refuse("budget-argument");
  for (const char *digit = argv[8]; *digit != '\0'; digit++) {
    if (*digit < '0' || *digit > '9') return refuse("budget-argument");
  }
  errno = 0;
  char *cap_end = NULL;
  unsigned long requested_cap = strtoul(argv[8], &cap_end, 10);
  if (errno != 0 || *cap_end != '\0' || requested_cap < 1 || requested_cap > MAX_SOURCE_BYTES) return refuse("budget-argument");
  size_t source_cap = (size_t)requested_cap;
  int root = open(argv[1], O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (root < 0) return unavailable();
  int root_matches = matches_identity(root, argv[3], argv[4]);
  if (root_matches < 0) return unavailable();
  if (!root_matches) return refuse("root-identity");
  if (strcmp(argv[5], "-") != 0) {
    int git = open(argv[5], O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (git < 0) return unavailable();
    int git_matches = matches_identity(git, argv[6], argv[7]);
    if (git_matches < 0) return unavailable();
    if (!git_matches) return refuse("git-identity");
    close(git);
  }

  char *relative = strdup(argv[2]);
  if (relative == NULL) return refuse("io");
  char *save = NULL;
  char *segment = strtok_r(relative, "/", &save);
  if (segment == NULL) return refuse("path-binding");
  int parent = root;
  while (1) {
    char *next = strtok_r(NULL, "/", &save);
    if (strcmp(segment, ".") == 0 || strcmp(segment, "..") == 0 || segment[0] == '\0') return refuse("path-binding");
    if (next == NULL) break;
    int child = openat(parent, segment, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    int open_error = errno;
    if (parent != root) close(parent);
    if (child < 0) { errno = open_error; return unavailable(); }
    parent = child;
    segment = next;
  }
  int file = openat(parent, segment, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC);
  int open_error = errno;
  if (parent != root) close(parent);
  close(root);
  if (file < 0) { errno = open_error; return unavailable(); }
  struct stat before;
  struct stat after;
  if (fstat(file, &before) != 0) return unavailable();
  if (!S_ISREG(before.st_mode)) return refuse("file-kind");
  if (before.st_size > (off_t)source_cap) {
    fprintf(stderr, "size-limit %lld %zu\n", (long long)before.st_size, source_cap);
    return 72;
  }
  unsigned char *bytes = malloc(source_cap);
  if (bytes == NULL) return refuse("io");
  ssize_t total = 0;
  while ((size_t)total < source_cap) {
    ssize_t amount = read(file, bytes + total, source_cap - (size_t)total);
    if (amount < 0) return unavailable();
    if (amount == 0) break;
    total += amount;
  }
  if (fstat(file, &after) != 0) return unavailable();
  if ((size_t)total > source_cap || total != after.st_size || !same_stat(&before, &after)) return refuse("unstable");
  close(file);
  free(relative);
  if (printf("%llu:%llu:%llu:%llu:%lld:%ld:%lld:%ld\n",
      (unsigned long long)after.st_dev, (unsigned long long)after.st_ino,
      (unsigned long long)after.st_mode, (unsigned long long)after.st_size,
      (long long)after.st_mtimespec.tv_sec, after.st_mtimespec.tv_nsec,
      (long long)after.st_ctimespec.tv_sec, after.st_ctimespec.tv_nsec) < 0) return refuse("io");
  if (fwrite(bytes, 1, (size_t)total, stdout) != (size_t)total) return refuse("io");
  free(bytes);
  return 0;
}
